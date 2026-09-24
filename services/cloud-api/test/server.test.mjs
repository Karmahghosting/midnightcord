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
    const updated = await response.json();
    assert.equal(updated.version, 2);
    const accountId = createHash("sha256").update(`midnightcord-cloud:${token}`).digest("hex");
    const accountFiles = await readdir(join(dataDir, "accounts", accountId));
    assert.equal(accountFiles.filter(file => file.startsWith("settings-") && file.endsWith(".bin")).length, 1, "Only the active payload generation should remain");

    response = await fetch(`${base}/v1/cloud/manifest`, { headers: { Authorization: `Bearer ${token}`, Origin: "https://discord.com" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://discord.com");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);

    response = await fetch(`${base}/v1/cloud/manifest`, { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.deepEqual(await response.json(), { schema: 1, entries: [] });

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
