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

async function communityFixture(t, options = {}) {
    const dataDir = await mkdtemp(join(tmpdir(), "midnightcord-community-state-"));
    const env = {
        MIDNIGHTCORD_DISCORD_CLIENT_ID: "12345678901234567",
        MIDNIGHTCORD_DISCORD_CLIENT_SECRET: "test-client-secret",
        MIDNIGHTCORD_DISCORD_BOT_TOKEN: "test-bot-token",
        MIDNIGHTCORD_COMMUNITY_GUILD_ID: "98765432109876543",
        ...options.env
    };
    const calls = [];
    let server;
    let base;
    let clock = Date.now();
    const fetchImpl = async (input, init) => {
        const pathname = new URL(String(input)).pathname;
        calls.push(pathname);
        const override = await options.fetchImpl?.(pathname, init);
        if (override) return override;
        if (pathname === "/api/v10/oauth2/token") return Response.json({ access_token: "temporary-user-token", scope: "identify guilds.join" });
        if (pathname === "/api/v10/users/@me") return Response.json({ id: "11111111111111111" });
        if (pathname === `/api/v10/guilds/${env.MIDNIGHTCORD_COMMUNITY_GUILD_ID}/members/11111111111111111`) return new Response(null, { status: options.joinStatus ?? 201 });
        throw new Error(`Unexpected Discord request: ${pathname}`);
    };
    const restart = async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        server = createCloudServer({ dataDir, env, fetchImpl, now: () => clock });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    };
    await restart();
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await rm(dataDir, { recursive: true, force: true });
    });
    const request = (token, path, init = {}) => fetch(`${base}${path}`, {
        ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }
    });
    const cloud = (token, action = "", method = "GET") => request(token, `/v1/cloud/community${action}`, { method });
    const browserStart = async token => {
        const result = await cloud(token, "/join", "POST");
        assert.equal(result.status, 200);
        const { url } = await result.json();
        const ticketUrl = new URL(url);
        assert.equal(ticketUrl.origin, "https://api.midnightcord.fr");
        assert.match(ticketUrl.searchParams.get("ticket"), /^[A-Za-z0-9_-]{43}$/);
        const response = await request(null, ticketUrl.pathname + ticketUrl.search, { redirect: "manual" });
        assert.equal(response.status, 302);
        return {
            ticketPath: ticketUrl.pathname + ticketUrl.search,
            state: new URL(response.headers.get("location")).searchParams.get("state"),
            cookie: response.headers.get("set-cookie").split(";", 1)[0]
        };
    };
    const callback = (flow, query = "code=approved") => request(null, `/v1/community/callback?state=${flow.state}&${query}`, { headers: { Cookie: flow.cookie } });
    const manifest = async token => {
        const accountId = createHash("sha256").update(`midnightcord-cloud:${token}`).digest("hex");
        return readFile(join(dataDir, "accounts", accountId, "manifest.json"), "utf8").then(JSON.parse).catch(error => {
            if (error.code === "ENOENT") return null;
            throw error;
        });
    };
    return { env, dataDir, calls, restart, request, cloud, browserStart, callback, manifest, advance: ms => { clock += ms; } };
}

test("community prompt is claimed atomically per account and guild and survives restarts", async t => {
    const f = await communityFixture(t);
    const token = credential();
    const other = credential();
    assert.equal((await (await f.cloud(token)).json()).status, "unseen");
    assert.equal(await f.manifest(token), null, "Reading status must not create account data");
    const claims = await Promise.all(Array.from({ length: 8 }, async () => (await f.cloud(token, "/prompt", "POST")).json()));
    assert.equal(claims.filter(result => result.showPrompt).length, 1, "Only one device may display the prompt");
    assert.ok(claims.every(result => result.status === "offered"));
    assert.equal((await (await f.cloud(other, "/prompt", "POST")).json()).showPrompt, true);
    await f.restart();
    assert.equal((await (await f.cloud(token, "/prompt", "POST")).json()).showPrompt, false);
    f.env.MIDNIGHTCORD_COMMUNITY_GUILD_ID = "55555555555555555";
    assert.equal((await (await f.cloud(token, "/prompt", "POST")).json()).showPrompt, true, "A different guild has independent state");
    f.env.MIDNIGHTCORD_COMMUNITY_GUILD_ID = "98765432109876543";
    assert.equal((await (await f.cloud(token)).json()).status, "offered");
    assert.equal((await (await f.cloud(other)).json()).status, "offered");
});

test("community endpoints require Cloud authentication and disabled configuration never consumes a prompt", async t => {
    const f = await communityFixture(t, { env: { MIDNIGHTCORD_DISCORD_CLIENT_SECRET: "" } });
    const token = credential();
    for (const [action, method] of [["", "GET"], ["/prompt", "POST"], ["/decline", "PUT"], ["/join", "POST"]]) {
        assert.equal((await f.cloud(null, action, method)).status, 401);
    }
    assert.deepEqual(await (await f.cloud(token, "/prompt", "POST")).json(), { enabled: false, name: "Midnightcord", guildId: null, status: "unseen", showPrompt: false });
    assert.equal(await f.manifest(token), null);
    assert.equal((await f.cloud(token, "/join", "POST")).status, 503);
    f.env.MIDNIGHTCORD_DISCORD_CLIENT_SECRET = "configured";
    assert.equal((await (await f.cloud(token, "/prompt", "POST")).json()).showPrompt, true);
    assert.equal((await f.cloud(token, "/join", "GET")).status, 405);
    const preflight = await f.request(null, "/v1/cloud/community/prompt", { method: "OPTIONS", headers: { Origin: "https://discord.com", "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
});

for (const joinStatus of [201, 204]) {
    test(`community records Discord ${joinStatus} success once and never re-adds a joined Cloud account`, async t => {
        const f = await communityFixture(t, { joinStatus });
        const token = credential();
        const flow = await f.browserStart(token);
        assert.equal((await f.request(null, flow.ticketPath, { redirect: "manual" })).status, 400, "The browser ticket cannot be reused");
        assert.equal((await f.callback(flow)).status, 200);
        assert.equal(f.calls.length, 3);
        assert.equal((await (await f.cloud(token)).json()).status, "joined");
        assert.equal((await f.callback(flow)).status, 400, "OAuth callbacks cannot be replayed");
        await f.restart();
        assert.deepEqual(await (await f.cloud(token, "/join", "POST")).json(), { joined: true });
        assert.equal((await (await f.cloud(token, "/decline", "PUT")).json()).status, "joined", "Declining must not erase a completed join");
        assert.equal((await (await f.cloud(token, "/prompt", "POST")).json()).showPrompt, false);
        assert.equal(f.calls.length, 3, "Restarting or clicking again must never issue a second Discord join");
        const stored = JSON.stringify(await f.manifest(token));
        for (const secret of ["temporary-user-token", "11111111111111111", "test-bot-token", "test-client-secret", flow.state, flow.ticketPath]) {
            assert.equal(stored.includes(secret), false, "Only pseudonymous Cloud status may be persisted");
        }
    });
}

test("community refusals suppress future prompts while an explicit retry remains possible", async t => {
    const f = await communityFixture(t);
    const token = credential();
    let flow = await f.browserStart(token);
    assert.equal((await f.callback(flow, "error=access_denied")).status, 200);
    assert.equal((await (await f.cloud(token)).json()).status, "declined");
    assert.equal((await (await f.cloud(token, "/prompt", "POST")).json()).showPrompt, false);
    assert.equal(f.calls.length, 0);
    flow = await f.browserStart(token);
    assert.equal((await (await f.cloud(token, "/decline", "PUT")).json()).status, "declined");
    assert.equal((await f.callback(flow)).status, 400, "Declining invalidates an already opened browser flow");
    assert.equal(f.calls.length, 0);
    const retry = await f.browserStart(token);
    assert.equal((await f.callback(retry)).status, 200);
    assert.equal((await (await f.cloud(token)).json()).status, "joined");
});

test("community tickets and browser authorizations expire and cannot be retargeted by configuration changes", async t => {
    const f = await communityFixture(t);
    const token = credential();
    const ticket = new URL((await (await f.cloud(token, "/join", "POST")).json()).url);
    f.advance(10 * 60_000);
    assert.equal((await f.request(null, ticket.pathname + ticket.search, { redirect: "manual" })).status, 400);
    let flow = await f.browserStart(token);
    f.advance(10 * 60_000);
    assert.equal((await f.callback(flow)).status, 400);
    flow = await f.browserStart(token);
    f.env.MIDNIGHTCORD_COMMUNITY_GUILD_ID = "55555555555555555";
    assert.equal((await f.callback(flow)).status, 400);
    f.env.MIDNIGHTCORD_COMMUNITY_GUILD_ID = "98765432109876543";
    flow = await f.browserStart(token);
    f.env.MIDNIGHTCORD_DISCORD_CLIENT_ID = "44444444444444444";
    assert.equal((await f.callback(flow)).status, 400);
    assert.equal(f.calls.length, 0);
});

test("new community attempts invalidate earlier tickets and browser states without crossing accounts", async t => {
    const f = await communityFixture(t);
    const token = credential();
    const other = credential();
    const ticket = new URL((await (await f.cloud(token, "/join", "POST")).json()).url);
    const old = await f.browserStart(token);
    assert.equal((await f.request(null, ticket.pathname + ticket.search, { redirect: "manual" })).status, 400);
    const otherFlow = await f.browserStart(other);
    const current = await f.browserStart(token);
    assert.equal((await f.callback(old)).status, 400);
    assert.equal((await f.callback(current)).status, 200);
    assert.equal((await (await f.cloud(other)).json()).status, "offered");
    assert.equal((await f.callback(otherFlow)).status, 200);
    assert.equal(f.calls.length, 6);
});

test("deleting a Cloud account invalidates tickets and in-flight authorization without recreating account data", async t => {
    let resolveToken;
    let enteredToken;
    const tokenEntered = new Promise(resolve => { enteredToken = resolve; });
    const heldToken = new Promise(resolve => { resolveToken = resolve; });
    const f = await communityFixture(t, {
        fetchImpl: async pathname => {
            if (pathname === "/api/v10/oauth2/token") {
                enteredToken();
                await heldToken;
            }
        }
    });
    const token = credential();
    const pendingTicket = new URL((await (await f.cloud(token, "/join", "POST")).json()).url);
    const remove = () => f.request(token, "/v1/cloud/account", { method: "DELETE", headers: { "X-Midnightcord-Confirm": "delete-account" } });
    assert.equal((await remove()).status, 204);
    assert.equal((await f.request(null, pendingTicket.pathname + pendingTicket.search, { redirect: "manual" })).status, 400);
    const flow = await f.browserStart(token);
    const pendingCallback = f.callback(flow);
    await tokenEntered;
    try {
        assert.equal((await remove()).status, 204);
    } finally {
        resolveToken();
    }
    assert.equal((await pendingCallback).status, 400);
    assert.deepEqual(f.calls, ["/api/v10/oauth2/token"], "No membership request may follow account deletion");
    assert.equal(await f.manifest(token), null);
});

test("a failed Discord join can be retried manually without another automatic prompt", async t => {
    let failed = true;
    const f = await communityFixture(t, {
        fetchImpl: async pathname => pathname.includes("/members/") && failed ? new Response(null, { status: 403 }) : undefined
    });
    const token = credential();
    const flow = await f.browserStart(token);
    assert.equal((await f.callback(flow)).status, 502);
    assert.equal((await (await f.cloud(token)).json()).status, "offered");
    assert.equal((await (await f.cloud(token, "/prompt", "POST")).json()).showPrompt, false);
    failed = false;
    assert.equal((await f.callback(await f.browserStart(token))).status, 200);
    assert.equal((await (await f.cloud(token)).json()).status, "joined");
});
