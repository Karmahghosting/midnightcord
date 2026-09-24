import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCloudServer } from "../server.mjs";

function credential() {
    return `mc1.${randomBytes(32).toString("base64url")}`;
}

function checksum(body) {
    return createHash("sha256").update(body).digest("base64url");
}

test("Cloud API isolates encrypted, versioned data and deletes the account", async t => {
    const dataDir = await mkdtemp(join(tmpdir(), "midnightcord-cloud-"));
    const server = createCloudServer({ dataDir });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await rm(dataDir, { recursive: true, force: true });
    });

    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const token = credential();
    const otherToken = credential();
    const request = (path, init = {}) => fetch(`${base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "X-Midnightcord-Client": "test", ...init.headers }
    });

    assert.equal((await fetch(`${base}/v1/cloud/health`)).status, 200);
    assert.equal((await fetch(`${base}/v1/cloud/manifest`)).status, 401);

    let response = await request("/v1/cloud/manifest");
    assert.deepEqual(await response.json(), { schema: 1, entries: [] });

    const first = randomBytes(128);
    response = await request("/v1/cloud/data/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "If-Match": "*", "X-Midnightcord-Checksum": checksum(first) },
        body: first
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.version, 1);

    response = await request("/v1/cloud/data/settings");
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), first);

    response = await request("/v1/cloud/data/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "If-Match": "*", "X-Midnightcord-Checksum": checksum(first) },
        body: first
    });
    assert.equal(response.status, 412);

    const second = randomBytes(160);
    response = await request("/v1/cloud/data/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "If-Match": created.etag, "X-Midnightcord-Checksum": checksum(second) },
        body: second
    });
    assert.equal(response.status, 200);
    let updated = await response.json();
    assert.equal(updated.version, 2);

    response = await request("/v1/cloud/history/settings");
    let history = await response.json();
    assert.deepEqual(history.entries.map(entry => entry.version), [1]);
    response = await request("/v1/cloud/history/settings/1");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), first);

    for (let version = 3; version <= 8; version++) {
        const body = randomBytes(128 + version);
        response = await request("/v1/cloud/data/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream", "If-Match": updated.etag, "X-Midnightcord-Checksum": checksum(body) },
            body
        });
        assert.equal(response.status, 200);
        updated = await response.json();
    }

    response = await request("/v1/cloud/history/settings");
    history = await response.json();
    assert.deepEqual(history.entries.map(entry => entry.version), [7, 6, 5, 4, 3], "Only the five latest previous versions should remain");
    assert.equal((await request("/v1/cloud/history/settings/2")).status, 404, "Expired history versions must no longer be downloadable");
    const accountId = createHash("sha256").update(`midnightcord-cloud:${token}`).digest("hex");
    const accountFiles = await readdir(join(dataDir, "accounts", accountId));
    assert.equal(accountFiles.filter(file => file.startsWith("settings-") && file.endsWith(".bin")).length, 6, "The active payload and five retained generations should remain");

    response = await fetch(`${base}/v1/cloud/manifest`, { headers: { Authorization: `Bearer ${token}`, Origin: "https://discord.com" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://discord.com");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);

    response = await fetch(`${base}/v1/cloud/manifest`, { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.deepEqual(await response.json(), { schema: 1, entries: [] });
    response = await fetch(`${base}/v1/cloud/history/settings`, { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.deepEqual(await response.json(), { key: "settings", entries: [] }, "History must be isolated by Cloud identity");

    response = await request("/v1/cloud/data/settings", { method: "DELETE", headers: { "If-Match": updated.etag } });
    assert.equal(response.status, 204);
    assert.deepEqual((await (await request("/v1/cloud/history/settings")).json()).entries, []);
    assert.equal((await readdir(join(dataDir, "accounts", accountId))).some(file => file.startsWith("settings-") && file.endsWith(".bin")), false, "Deleting an item must remove its history files too");

    response = await request("/v1/cloud/account", { method: "DELETE" });
    assert.equal(response.status, 400);
    response = await request("/v1/cloud/account", { method: "DELETE", headers: { "X-Midnightcord-Confirm": "delete-account" } });
    assert.equal(response.status, 204);
    response = await request("/v1/cloud/manifest");
    assert.deepEqual(await response.json(), { schema: 1, entries: [] });

    const files = await readFile(join(dataDir, "accounts", createHash("sha256").update(`midnightcord-cloud:${otherToken}`).digest("hex"), "manifest.json"), "utf8").catch(() => null);
    assert.equal(files, null, "read-only access must not create an account on disk");
});

test("Cloud API validates checksums, keys and request preconditions", async t => {
    const dataDir = await mkdtemp(join(tmpdir(), "midnightcord-cloud-"));
    const server = createCloudServer({ dataDir });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await rm(dataDir, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: `Bearer ${credential()}`, "Content-Type": "application/octet-stream" };
    const body = Buffer.from("opaque ciphertext");

    assert.equal((await fetch(`${base}/v1/cloud/data/unknown`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/v1/cloud/data/settings`, { method: "PUT", headers: { ...headers, "X-Midnightcord-Checksum": checksum(body) }, body })).status, 428);
    assert.equal((await fetch(`${base}/v1/cloud/data/settings`, { method: "PUT", headers: { ...headers, "If-Match": "*", "X-Midnightcord-Checksum": checksum(Buffer.from("wrong")) }, body })).status, 422);
});

test("community join requires a one-time browser authorization and never stores the user token", async t => {
    const dataDir = await mkdtemp(join(tmpdir(), "midnightcord-cloud-community-"));
    const calls = [];
    const env = {
        MIDNIGHTCORD_DISCORD_CLIENT_ID: "12345678901234567",
        MIDNIGHTCORD_DISCORD_CLIENT_SECRET: "test-client-secret",
        MIDNIGHTCORD_DISCORD_BOT_TOKEN: "test-bot-token",
        MIDNIGHTCORD_COMMUNITY_GUILD_ID: "98765432109876543"
    };
    const fetchImpl = async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        if (url.pathname === "/api/v10/oauth2/token") {
            assert.equal(new URLSearchParams(init.body).get("client_secret"), env.MIDNIGHTCORD_DISCORD_CLIENT_SECRET);
            return Response.json({ access_token: "temporary-user-token", scope: "identify guilds.join" });
        }
        if (url.pathname === "/api/v10/users/@me") {
            assert.equal(init.headers.Authorization, "Bearer temporary-user-token");
            return Response.json({ id: "11111111111111111" });
        }
        if (url.pathname === `/api/v10/guilds/${env.MIDNIGHTCORD_COMMUNITY_GUILD_ID}/members/11111111111111111`) {
            assert.equal(init.headers.Authorization, `Bot ${env.MIDNIGHTCORD_DISCORD_BOT_TOKEN}`);
            assert.equal(JSON.parse(init.body).access_token, "temporary-user-token");
            return new Response(null, { status: 201 });
        }
        throw new Error(`Unexpected Discord API request: ${url.pathname}`);
    };
    const server = createCloudServer({ dataDir, env, fetchImpl });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await rm(dataDir, { recursive: true, force: true });
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(await (await fetch(`${base}/v1/community/status`)).json(), { enabled: true, name: "Midnightcord" });
    const start = await fetch(`${base}/v1/community/join`, { redirect: "manual" });
    assert.equal(start.status, 302);
    const authorizeUrl = new URL(start.headers.get("location"));
    assert.equal(authorizeUrl.origin, "https://discord.com");
    assert.equal(authorizeUrl.searchParams.get("scope"), "identify guilds.join");
    const state = authorizeUrl.searchParams.get("state");
    assert.match(state, /^[A-Za-z0-9_-]{43}$/);
    const cookie = start.headers.get("set-cookie").split(";", 1)[0];

    let callback = await fetch(`${base}/v1/community/callback?code=approved&state=${state}`, {
        headers: { Cookie: "midnightcord_community_oauth=incorrect-state" }
    });
    assert.equal(callback.status, 400);
    assert.equal(calls.length, 0, "A mismatched state must not contact Discord or use the authorization code");

    const retry = await fetch(`${base}/v1/community/join`, { redirect: "manual" });
    const retryUrl = new URL(retry.headers.get("location"));
    callback = await fetch(`${base}/v1/community/callback?code=approved&state=${retryUrl.searchParams.get("state")}`, {
        headers: { Cookie: retry.headers.get("set-cookie").split(";", 1)[0] }
    });
    assert.equal(callback.status, 200);
    assert.match(await callback.text(), /Tu as rejoint Midnightcord/);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].init.method, "PUT");
    assert.deepEqual(await (await fetch(`${base}/v1/community/status`)).json(), { enabled: true, name: "Midnightcord" });
    assert.equal(await readFile(join(dataDir, "community-oauth.json"), "utf8").catch(() => null), null);
});
