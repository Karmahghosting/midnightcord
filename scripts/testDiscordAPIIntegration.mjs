/* Full bridge wiring with mocked Discord stores/REST, real IPC handlers and loopback HTTP. SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
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
const require = createRequire(import.meta.url);
const ids = { me: "111111111111111111", other: "111111111111111112", guild: "211111111111111111", foreign: "211111111111111112", channel: "311111111111111111", otherChannel: "311111111111111112", dm: "311111111111111113", message: "411111111111111111" };
const bits = { VIEW_CHANNEL: 1n, READ_MESSAGE_HISTORY: 2n, SEND_MESSAGES: 4n, SEND_MESSAGES_IN_THREADS: 8n };
const message = (changes = {}) => ({ id: ids.message, channel_id: ids.channel, content: "Hello from a mock", author: { id: ids.other, username: "Friend", token: "never-export-this", email: "private@example.test" }, timestamp: "2026-10-24T00:00:00Z", ...changes });
async function until(predicate) {
    for (let attempt = 0; attempt < 300; attempt++) { if (await predicate()) return; await delay(5); }
    assert.fail("Integration condition timed out");
}

const rendererBuild = await build({ entryPoints: [join(root, "src/midnightcordplugins/discordAPI/index.tsx")], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "discord-mocks", setup(builder) {
        builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, external: true }));
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    } }]
});

async function fixture(t, settings = {}) {
    const directory = await mkdtemp(join(tmpdir(), "midnight-api-wiring-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const nativeBuild = await build({ entryPoints: [join(root, "src/midnightcordplugins/discordAPI/native.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron"], write: false,
        plugins: [{ name: "native-constants", setup(builder) {
            builder.onResolve({ filter: /^@main\/utils\/constants$/ }, () => ({ path: "constants", namespace: "native-constants" }));
            builder.onLoad({ filter: /.*/, namespace: "native-constants" }, () => ({ contents: `export const DATA_DIR = ${JSON.stringify(directory)};` }));
        } }]
    });
    const app = new EventEmitter();
    const nativeModule = { exports: {} };
    const timers = { setTimeout, clearTimeout, setInterval, clearInterval };
    vm.runInNewContext(nativeBuild.outputFiles[0].text, { module: nativeModule, exports: nativeModule.exports, require: name => name === "electron" ? { app } : require(name), process: new EventEmitter(), Buffer, URL, ...timers });
    const native = nativeModule.exports;
    const sender = Object.assign(new EventEmitter(), { id: 1, mainFrame: { url: "https://discord.com/channels/@me" } });
    const event = { sender, senderFrame: sender.mainFrame };
    const state = { account: ids.me, calls: [], denied: new Set(), polls: 0, maxPolls: 0, hold: undefined, posted: [] };
    const guilds = { [ids.guild]: { id: ids.guild, name: "Approved" }, [ids.foreign]: { id: ids.foreign, name: "Private project" } };
    const channels = { [ids.channel]: { id: ids.channel, guild_id: ids.guild, name: "general", type: 0 }, [ids.otherChannel]: { id: ids.otherChannel, guild_id: ids.foreign, name: "secret", type: 0 }, [ids.dm]: { id: ids.dm, type: 1 } };
    const common = {
        React: { createElement: () => null }, useEffect: () => {}, useState: () => {},
        UserStore: { getCurrentUser: () => state.account ? { id: state.account, username: "Owner" } : undefined },
        SelectedChannelStore: { getChannelId: () => ids.channel }, SelectedGuildStore: { getGuildId: () => ids.guild },
        GuildStore: { getGuilds: () => guilds, getGuild: id => guilds[id] },
        ChannelStore: { getChannel: id => channels[id], getMutableGuildChannelsForGuild: id => Object.fromEntries(Object.entries(channels).filter(([, channel]) => channel.guild_id === id)) },
        MessageStore: { getMessages: () => ({ _array: [message()] }) }, PermissionsBits: bits,
        PermissionStore: { can: (bit, channel) => !state.denied.has(`${channel.id}:${bit}`) },
        RestAPI: {
            get: async options => {
                state.calls.push({ method: "GET", ...options });
                if (state.hold) await state.hold;
                return { body: options.url.endsWith("/messages") ? [message(), message({ id: "411111111111111112", channel_id: ids.otherChannel })] : message() };
            },
            post: async options => { state.calls.push({ method: "POST", ...options }); state.posted.push(options); return { body: message({ content: options.body.content, author: { id: state.account, username: "Owner" } }) }; }
        }
    };
    const transport = Object.fromEntries(Object.keys(native).map(name => [name, (...args) => Promise.resolve().then(async () => {
        if (name === "nextRequest") { state.polls++; state.maxPolls = Math.max(state.maxPolls, state.polls); }
        try { return await native[name](event, ...args); }
        finally { if (name === "nextRequest") state.polls--; }
    })]));
    const renderer = { exports: {} };
    let defs;
    const definePluginSettings = definitions => {
        defs = definitions;
        const raw = Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name, definition.default]));
        const store = new Proxy(raw, { set(target, key, value) { target[key] = value; definitions[key]?.onChange?.(); return true; } });
        return { def: definitions, store, use: () => store };
    };
    const aliases = {
        "@api/Settings": { definePluginSettings }, "@utils/discord": { copyWithToast: () => {} },
        "@utils/types": { __esModule: true, default: value => value, OptionType: { NUMBER: 1, BOOLEAN: 2, STRING: 3 } },
        "@components/Button": { Button: () => null }, "@components/Heading": { Heading: () => null }, "@webpack/common": common
    };
    vm.runInNewContext(rendererBuild.outputFiles[0].text, { module: renderer, exports: renderer.exports, require: name => {
        assert.ok(name in aliases, `Unexpected renderer dependency ${name}`);
        return aliases[name];
    }, VencordNative: { pluginHelpers: { DiscordBridge: transport } }, Date, BigInt, ...timers });
    const plugin = renderer.exports.default;
    t.after(async () => { plugin.stop(); app.emit("before-quit"); await delay(15); });
    const reservation = http.createServer();
    await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    plugin.settings.store.port = port;
    plugin.settings.store.allowedGuildIds = ids.guild;
    Object.assign(plugin.settings.store, settings);
    plugin.start();
    await until(() => { const status = native.getStatus(event); return status.running && !status.preparing && state.polls === 1; });
    const connection = () => native.getConnection(event);
    return { plugin, native, event, state, common, connection, defs };
}

async function call(fixture, path, method = "GET", body) {
    const connection = fixture.connection();
    const response = await fetch(`${connection.apiUrl}${path}`, { method, headers: { Authorization: `Bearer ${connection.apiKey}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

function openEvents(fixture) {
    const connection = fixture.connection();
    return new Promise((resolve, reject) => {
        const req = http.get(`${connection.apiUrl}/api/events`, { agent: false, headers: { Authorization: `Bearer ${connection.apiKey}` } }, response => {
            const state = { text: "", closed: false, response };
            response.on("data", chunk => { state.text += chunk.toString(); });
            response.on("end", () => { state.closed = true; });
            response.on("error", () => { state.closed = true; });
            response.on("close", () => { state.closed = true; });
            resolve(state);
        });
        req.on("error", reject);
    });
}

test("renderer to native HTTP and MCP wiring enforces channel scope and sanitizes responses", async t => {
    const f = await fixture(t);
    assert.equal((await call(f, "/api/status")).status, 200);
    assert.deepEqual((await call(f, "/api/guilds")).body.guilds.map(guild => guild.id), [ids.guild]);
    assert.equal((await call(f, `/api/channels/${ids.otherChannel}/messages`)).status, 403);
    assert.equal((await call(f, `/api/channels/${ids.dm}/messages`)).status, 403);
    const read = await call(f, "/mcp", "POST", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_messages", arguments: { channel_id: ids.channel, limit: 5 } } });
    assert.equal(read.status, 200);
    const payload = JSON.parse(read.body.result.content[0].text);
    assert.equal(payload.status, 200);
    assert.equal(payload.data.messages.length, 1);
    assert.equal(payload.data.messages[0].channel_id, ids.channel);
    assert.equal(JSON.stringify(read).includes("never-export-this"), false);
    assert.equal(f.state.maxPolls, 1);
    assert.equal((await call(f, `/api/channels/${ids.channel}/messages`, "POST", { content: "must not send" })).status, 403);
    assert.equal(f.state.posted.length, 0);
});

test("SSE passes only authorized channel events and reacts to permission revocation", async t => {
    const f = await fixture(t);
    const events = await openEvents(f);
    t.after(() => events.response.destroy());
    f.plugin.flux.MESSAGE_CREATE({ message: message() });
    f.plugin.flux.MESSAGE_CREATE({ message: message({ channel_id: ids.otherChannel, content: "unapproved" }) });
    f.plugin.flux.MESSAGE_CREATE({ message: message({ channel_id: ids.dm, content: "private dm" }) });
    f.plugin.flux.MESSAGE_CREATE({ message: message({ deleted: true, content: "deleted" }) });
    f.plugin.flux.MESSAGE_CREATE({ optimistic: true, message: message({ content: "optimistic pending" }) });
    await until(() => events.text.includes("MESSAGE_CREATE"));
    assert.ok(!events.text.includes("unapproved") && !events.text.includes("private dm") && !events.text.includes("deleted") && !events.text.includes("never-export-this") && !events.text.includes("optimistic pending"));
    f.state.denied.add(`${ids.channel}:${bits.READ_MESSAGE_HISTORY}`);
    f.plugin.flux.MESSAGE_UPDATE({ message: message({ content: "permission revoked" }) });
    await delay(20);
    assert.ok(!events.text.includes("permission revoked"));
    assert.equal((await call(f, `/api/channels/${ids.channel}/messages`)).status, 403);
});

test("scope changes invalidate pending REST replies, close SSE and rotate credentials", async t => {
    const f = await fixture(t);
    const oldKey = f.connection().apiKey;
    const events = await openEvents(f);
    let release;
    f.state.hold = new Promise(resolve => { release = resolve; });
    const pending = call(f, `/api/channels/${ids.channel}/messages`).catch(error => error);
    await until(() => f.state.calls.length === 1);
    f.plugin.settings.store.allowedGuildIds = "";
    f.plugin.flux.MESSAGE_CREATE({ message: message({ content: "after revocation" }) });
    release();
    const result = await pending;
    assert.ok(result instanceof Error || result.status !== 200);
    await until(() => { const status = f.native.getStatus(f.event); return status.running && !status.preparing && f.connection().apiKey !== oldKey; });
    assert.ok(!events.text.includes("after revocation"));
    await until(() => events.closed);
    assert.deepEqual((await call(f, "/api/guilds")).body.guilds, []);
    assert.equal(f.state.maxPolls, 1);
});

test("write opt-in reaches only mocked Discord send with mentions disabled and switching account pauses", async t => {
    const f = await fixture(t, { allowWrites: true });
    const sent = await call(f, "/mcp", "POST", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "send_message", arguments: { channel_id: ids.channel, content: "@everyone mock send" } } });
    assert.equal(sent.body.result.isError, false);
    assert.equal(f.state.posted.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.state.posted[0].body.allowed_mentions)), { parse: [], replied_user: false });
    const events = await openEvents(f);
    f.state.account = ids.other;
    f.plugin.flux.CURRENT_USER_UPDATE({});
    f.plugin.flux.MESSAGE_CREATE({ message: message({ content: "new account private" }) });
    await until(() => !f.native.getStatus(f.event).running);
    await until(() => events.closed);
    assert.ok(!events.text.includes("new account private"));
    assert.throws(() => f.connection(), /not-running/);
    assert.equal(f.state.posted.length, 1);
});

test("logout and plugin disable close live transport and a key renewal keeps the renderer poll working", async t => {
    const f = await fixture(t);
    const oldKey = f.connection().apiKey;
    await f.native.rotateKey(f.event);
    assert.notEqual(f.connection().apiKey, oldKey);
    assert.equal((await call(f, "/api/status")).status, 200);
    f.plugin.flux.LOGOUT({});
    await until(() => !f.native.getStatus(f.event).running);
    f.plugin.start();
    await until(() => { const status = f.native.getStatus(f.event); return status.running && !status.preparing; });
    assert.equal((await call(f, "/api/status")).status, 200);
    f.plugin.stop();
    await until(() => !f.native.getStatus(f.event).running);
    assert.equal(f.state.maxPolls, 1);
});

test("rotation and account switches revoke in-flight results before they reach the client", async t => {
    for (const action of ["rotation", "account"]) {
        const f = await fixture(t);
        let release;
        f.state.hold = new Promise(resolve => { release = resolve; });
        const pending = call(f, `/api/channels/${ids.channel}/messages`).catch(error => error);
        await until(() => f.state.calls.length === 1);
        if (action === "rotation") await f.native.rotateKey(f.event);
        else { f.state.account = ids.other; f.plugin.flux.CONNECTION_OPEN({}); }
        const result = await pending;
        assert.ok(result instanceof Error || result.status !== 200);
        assert.ok(!JSON.stringify(result).includes("Hello from a mock"));
        release();
        f.state.hold = undefined;
        if (action === "rotation") assert.equal((await call(f, "/api/status")).status, 200);
        else await until(() => !f.native.getStatus(f.event).running);
        assert.equal(f.state.maxPolls, 1);
    }
});
