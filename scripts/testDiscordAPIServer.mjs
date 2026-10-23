/* Offline regression tests for the opt-in loopback bridge. SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundle = await build({ entryPoints: [join(root, "src/midnightcordplugins/discordAPI/server.ts")], bundle: true, platform: "node", format: "esm", write: false });
const { DiscordApiServer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

async function fixture(t, options = {}, allowWrites = false) {
    const server = new DiscordApiServer({ pollTimeoutMs: 35, requestTimeoutMs: 1500, ...options });
    t.after(() => server.stop());
    const token = randomBytes(32).toString("hex");
    const port = await server.start(0, token, allowWrites);
    return { server, token, port };
}

function request(fixture, path = "/api/status", options = {}) {
    let req;
    const result = new Promise((resolve, reject) => {
        req = http.request({ host: "127.0.0.1", port: fixture.port, path, method: options.method ?? "GET", agent: false,
            headers: { Authorization: `Bearer ${fixture.token}`, ...options.headers } }, response => {
            const chunks = [];
            response.on("data", chunk => chunks.push(chunk));
            response.on("error", reject);
            response.on("end", () => {
                const body = Buffer.concat(chunks).toString();
                resolve({ status: response.statusCode, headers: response.headers, body: body ? JSON.parse(body) : null });
            });
        });
        req.on("error", reject);
        req.end(options.body);
    });
    return { result, cancel: () => req.destroy() };
}

async function until(predicate) {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(5); }
    assert.fail("Condition was not reached");
}

test("loopback bridge rejects browser origins, rebinding hosts and missing credentials before queueing", async t => {
    const f = await fixture(t);
    for (const [headers, status] of [
        [{ Authorization: "" }, 401], [{ Authorization: `Bearer ${"a".repeat(64)}` }, 401],
        [{ Host: `localhost:${f.port}` }, 403], [{ Host: `evil.example:${f.port}` }, 403],
        [{ Origin: "https://discord.com" }, 403], [{ Origin: "null" }, 403],
        [{ "Sec-Fetch-Site": "cross-site" }, 403], [{ "Sec-Fetch-Site": "same-origin" }, 403]
    ]) {
        const response = await request(f, "/api/status", { headers }).result;
        assert.equal(response.status, status);
        assert.equal(response.headers["access-control-allow-origin"], undefined);
    }
    assert.equal(f.server.status().activeResponses, 0);
});

test("authenticated requests cross the bounded renderer queue and writes default off", async t => {
    const f = await fixture(t);
    const pending = request(f, "/api/channels/12345678901234567/messages?limit=5");
    const work = await f.server.nextRequest();
    assert.equal(work.method, "GET");
    assert.equal(work.query.limit, "5");
    assert.equal(f.server.isRequestActive(work.id), true);
    assert.equal(f.server.sendResponse(work.id, 200, { messages: ["hello"] }), true);
    assert.deepEqual((await pending.result).body, { messages: ["hello"] });
    assert.equal(f.server.isRequestActive(work.id), false);
    assert.equal((await request(f, "/api/channels/12345678901234567/messages", { method: "POST", body: '{}' }).result).status, 403);
});

test("invalid and oversized JSON are rejected without a renderer request", async t => {
    const f = await fixture(t, {}, true);
    assert.equal((await request(f, "/api/status", { method: "POST", body: "{broken" }).result).status, 400);
    assert.equal((await request(f, "/api/status", { method: "POST", body: "[]" }).result).status, 400);
    assert.equal((await request(f, "/api/status", { method: "POST", body: JSON.stringify({ data: "x".repeat(32768) }) }).result).status, 413);
    assert.equal((await request(f, "/api/status", { method: "OPTIONS" }).result).status, 405);
    assert.equal((await request(f, "http://example.invalid/api/status").result).status, 400);
    assert.equal((await request(f, "/unknown").result).status, 404);
    assert.equal(f.server.status().activeResponses, 0);
});

test("write capability and response size are enforced natively", async t => {
    const f = await fixture(t, {}, true);
    const pending = request(f, "/api/navigate", { method: "POST", body: JSON.stringify({ channel_id: "12345678901234567" }) });
    const work = await f.server.nextRequest();
    assert.equal(work.body.channel_id, "12345678901234567");
    f.server.sendResponse(work.id, 200, { text: "x".repeat(2 * 1024 * 1024) });
    const response = await pending.result;
    assert.equal(response.status, 502);
    assert.equal(response.body.error, "bridge-response-too-large");
});

test("queue caps apply to queued and in-flight work, with only one renderer long poll", async t => {
    const f = await fixture(t, { maxPending: 2 });
    const first = request(f);
    const work1 = await f.server.nextRequest();
    const second = request(f);
    await until(() => f.server.status().activeResponses === 2);
    assert.equal((await request(f).result).status, 429);
    const work2 = await f.server.nextRequest();
    f.server.sendResponse(work1.id, 200, {}); f.server.sendResponse(work2.id, 200, {});
    await Promise.all([first.result, second.result]);
    const poll = f.server.nextRequest();
    await assert.rejects(f.server.nextRequest(), /already-pending/);
    assert.equal(await poll, null);
});

test("expired and disconnected requests cannot later dispatch or respond", async t => {
    const f = await fixture(t, { requestTimeoutMs: 60 });
    const expired = request(f);
    assert.equal((await expired.result).status, 504);
    assert.equal(await f.server.nextRequest(), null);
    const dispatched = request(f);
    const work = await f.server.nextRequest();
    assert.equal((await dispatched.result).status, 504);
    assert.equal(f.server.isRequestActive(work.id), false);
    assert.equal(f.server.sendResponse(work.id, 200, {}), false);
    const disconnected = request(f);
    const rejection = disconnected.result.catch(error => error);
    await until(() => f.server.status().activeResponses === 1);
    disconnected.cancel();
    await rejection;
    await until(() => f.server.status().activeResponses === 0);
    assert.equal(await f.server.nextRequest(), null);
});

test("key rotation cancels queued work and revokes the old token", async t => {
    const f = await fixture(t);
    const pending = request(f);
    const work = await f.server.nextRequest();
    const nextKey = randomBytes(32).toString("hex");
    f.server.rotateKey(nextKey);
    assert.equal((await pending.result).status, 401);
    assert.equal(f.server.isRequestActive(work.id), false);
    assert.equal((await request(f).result).status, 401);
    f.token = nextKey;
    const next = request(f);
    f.server.sendResponse((await f.server.nextRequest()).id, 200, { rotated: true });
    assert.deepEqual((await next.result).body, { rotated: true });
});

test("authenticated rate limit does not allocate extra queue entries", async t => {
    const f = await fixture(t, { rateLimit: 2 });
    assert.equal((await request(f, "/mcp").result).status, 405);
    assert.equal((await request(f, "/mcp").result).status, 405);
    const response = await request(f, "/mcp").result;
    assert.equal(response.status, 429);
    assert.equal(response.headers["retry-after"], "60");
    assert.equal(f.server.status().activeResponses, 0);
});

function openEvents(fixture) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port: fixture.port, path: "/api/events", agent: false, headers: { Authorization: `Bearer ${fixture.token}` } }, response => {
            const state = { response, text: "" };
            response.on("data", chunk => { state.text += chunk.toString(); });
            response.on("error", () => {});
            resolve(state);
        });
        req.on("error", reject);
    });
}

test("SSE is authenticated, capped, heartbeat-driven, bounded and closed on rotation", async t => {
    const f = await fixture(t, { heartbeatMs: 20 });
    const streams = [];
    t.after(() => streams.forEach(stream => stream.response.destroy()));
    for (let i = 0; i < 4; i++) streams.push(await openEvents(f));
    assert.equal((await request(f, "/api/events").result).status, 429);
    f.server.pushEvent("MESSAGE_CREATE", { channel_id: "12345678901234567" });
    f.server.pushEvent("BAD\nevent: injection", { bad: true });
    f.server.pushEvent("HUGE", { text: "x".repeat(40_000) });
    await until(() => streams.every(stream => stream.text.includes(": heartbeat")));
    assert.ok(streams.every(stream => stream.text.includes("MESSAGE_CREATE") && !stream.text.includes("HUGE") && !stream.text.includes("injection")));
    f.server.rotateKey(randomBytes(32).toString("hex"));
    assert.equal(f.server.status().sseClients, 0);
});

test("MCP initialization, notifications and tool calls use the same authenticated queue", async t => {
    const f = await fixture(t);
    const call = message => request(f, "/mcp", { method: "POST", body: JSON.stringify(message) }).result;
    const initialize = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    assert.equal(initialize.status, 200);
    assert.ok(initialize.body.result.serverInfo);
    assert.equal((await call({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
    const tool = call({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_status", arguments: {} } });
    const work = await f.server.nextRequest();
    assert.equal(work.path, "/api/status");
    f.server.sendResponse(work.id, 200, { ready: true });
    assert.equal((await tool).body.id, 2);
    const malformed = await request(f, "/mcp", { method: "POST", body: "{" }).result;
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, -32700);
    assert.equal((await request(f, "/mcp", { method: "POST", headers: { "MCP-Protocol-Version": "invalid" }, body: '{}' }).result).status, 400);
});

test("stop cancels long polls and start/stop races do not leave a listening socket", async t => {
    const f = await fixture(t);
    const poll = f.server.nextRequest();
    f.server.stop();
    assert.equal(await poll, null);
    assert.equal(f.server.status().running, false);
    const starting = f.server.start(0, f.token, false);
    f.server.stop();
    await assert.rejects(starting, /cancelled/);
    await delay(20);
    assert.equal(f.server.status().running, false);
    f.port = await f.server.start(0, f.token, false);
    const pending = request(f);
    const rejection = pending.result.catch(error => error);
    await f.server.nextRequest();
    f.server.stop();
    assert.ok((await rejection) instanceof Error);
    assert.equal(f.server.status().activeResponses, 0);
});

test("bind failure clears running state and cannot stop another bridge instance", async t => {
    const f = await fixture(t);
    const second = new DiscordApiServer();
    t.after(() => second.stop());
    await assert.rejects(second.start(f.port, randomBytes(32).toString("hex"), false), /listen-failed/);
    assert.equal(second.status().running, false);
    assert.equal(f.server.status().running, true);
    assert.equal((await request(f, "/mcp").result).status, 405);
});

async function nativeFixture(t) {
    const directory = await mkdtemp(join(tmpdir(), "midnight-discordapi-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const result = await build({ entryPoints: [join(root, "src/midnightcordplugins/discordAPI/native.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron"], write: false,
        plugins: [{ name: "native-fixture", setup(builder) {
            builder.onResolve({ filter: /^@main\/utils\/constants$/ }, () => ({ path: "constants", namespace: "native-fixture" }));
            builder.onLoad({ filter: /.*/, namespace: "native-fixture" }, () => ({ contents: `export const DATA_DIR = ${JSON.stringify(directory)};` }));
        } }]
    });
    const nativeRequire = createRequire(import.meta.url);
    const app = new EventEmitter();
    const processMock = new EventEmitter();
    const module = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: name => name === "electron" ? { app } : nativeRequire(name), process: processMock,
        Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval });
    t.after(() => app.emit("before-quit"));
    const sender = Object.assign(new EventEmitter(), { id: 42, mainFrame: { url: "https://discord.com/channels/@me" } });
    const event = { sender, senderFrame: sender.mainFrame };
    const reservation = http.createServer();
    await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    return { native: module.exports, event, directory, port, app };
}

test("native IPC only exposes guarded functions and creates credentials on explicit start", async t => {
    const f = await nativeFixture(t);
    assert.ok(Object.values(f.native).every(value => typeof value === "function"));
    assert.equal(f.native.getStatus(f.event).running, false);
    await assert.rejects(stat(join(f.directory, "discord-api")), { code: "ENOENT" });
    for (const url of ["http://discord.com/", "https://evil.example/", "https://discord.com.evil.example/", "file:///x"]) {
        const sender = Object.assign(new EventEmitter(), { id: 42, mainFrame: { url } });
        assert.throws(() => f.native.getStatus({ sender, senderFrame: sender.mainFrame }), /unauthorized-origin/);
    }
    assert.throws(() => f.native.getStatus({ ...f.event, senderFrame: { url: "https://discord.com/" } }), /unauthorized-origin/);
    await assert.rejects(f.native.startServer(f.event, { port: 0, accountId: "12345678901234567", allowWrites: false }), /invalid-config/);
    const started = await f.native.startServer(f.event, { port: f.port, accountId: "12345678901234567", allowWrites: false });
    assert.equal(started.running, true);
    const connection = f.native.getConnection(f.event);
    assert.match(connection.apiKey, /^[a-f\d]{64}$/);
    assert.equal(connection.mcpConfig.mcpServers.midnightcord.command, "node");
    assert.equal(connection.mcpConfig.mcpServers.midnightcord.args[1], "--config");
    const file = JSON.parse(await readFile(connection.configPath, "utf8"));
    assert.equal(file.token, connection.apiKey);
    assert.equal(file.url, connection.mcpUrl);
    assert.match(await readFile(connection.mcpConfig.mcpServers.midnightcord.args[0], "utf8"), /--config/);
    const different = Object.assign(new EventEmitter(), { id: 99, mainFrame: { url: "https://discord.com/" } });
    assert.throws(() => f.native.getConnection({ sender: different, senderFrame: different.mainFrame }), /another-window/);
    const rotated = await f.native.rotateKey(f.event);
    assert.notEqual(rotated.apiKey, connection.apiKey);
    assert.equal(JSON.parse(await readFile(connection.configPath, "utf8")).token, rotated.apiKey);
    const firstRotation = f.native.rotateKey(f.event).catch(error => error);
    const finalRotation = await f.native.rotateKey(f.event);
    assert.match((await firstRotation).message, /cancelled/);
    assert.equal(JSON.parse(await readFile(connection.configPath, "utf8")).token, finalRotation.apiKey);
    f.native.stopServer(f.event);
    assert.throws(() => f.native.getConnection(f.event), /not-running/);
});

test("native lifecycle closes on main navigation, crashes, owner destruction and quit", async t => {
    for (const lifecycle of ["navigate", "render-process-gone", "destroyed", "before-quit"]) {
        const f = await nativeFixture(t);
        await f.native.startServer(f.event, { port: f.port, accountId: "12345678901234567", allowWrites: false });
        if (lifecycle === "navigate") f.event.sender.emit("did-start-navigation", {}, "https://example.com", false, true);
        else if (lifecycle === "before-quit") f.app.emit("before-quit");
        else f.event.sender.emit(lifecycle);
        assert.equal(f.native.getStatus(f.event).running, false);
        assert.throws(() => f.native.getConnection(f.event), /not-running/);
    }
});

test("native stop during asynchronous startup prevents listener resurrection", async t => {
    const f = await nativeFixture(t);
    const starting = f.native.startServer(f.event, { port: f.port, accountId: "12345678901234567", allowWrites: false });
    f.native.stopServer(f.event);
    await assert.rejects(starting, /cancelled/);
    assert.equal(f.native.getStatus(f.event).running, false);
    const restarted = await f.native.startServer(f.event, { port: f.port, accountId: "22345678901234567", allowWrites: false });
    assert.equal(restarted.accountId, "22345678901234567");
    assert.equal(restarted.running, true);
});
