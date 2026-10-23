/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const ids = {
    me: "111111111111111111", other: "111111111111111112", guild: "211111111111111111", foreign: "211111111111111112",
    visible: "311111111111111111", hidden: "311111111111111112", unrelated: "311111111111111113",
    dm: "311111111111111114", privateDm: "311111111111111115", noHistory: "311111111111111116", thread: "311111111111111117",
    message: "411111111111111111", second: "411111111111111112", third: "411111111111111113"
};
const bits = { VIEW_CHANNEL: 1n, READ_MESSAGE_HISTORY: 2n, SEND_MESSAGES: 4n, SEND_MESSAGES_IN_THREADS: 8n };
const { code } = transformSync(readFileSync(new URL("../src/midnightcordplugins/discordAPI/api.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" });
const plain = value => JSON.parse(JSON.stringify(value));
const message = (extra = {}) => ({ id: ids.message, channel_id: ids.visible, author: { id: ids.other, username: "Alice", email: "private", token: "secret" }, content: "Hello", timestamp: "2026-10-24T10:00:00Z", ...extra });

function fixture(overrides = {}) {
    const guilds = { [ids.guild]: { id: ids.guild, name: "Approved" }, [ids.foreign]: { id: ids.foreign, name: "Unapproved" } };
    const channels = Object.fromEntries([
        { id: ids.visible, guild_id: ids.guild, name: "general", type: 0 },
        { id: ids.hidden, guild_id: ids.guild, name: "secret", type: 0 },
        { id: ids.unrelated, guild_id: ids.foreign, name: "elsewhere", type: 0 },
        { id: ids.dm, type: 1 }, { id: ids.privateDm, type: 3 },
        { id: ids.noHistory, guild_id: ids.guild, type: 0 }, { id: ids.thread, guild_id: ids.guild, type: 11 }
    ].map(channel => [channel.id, channel]));
    const state = { account: ids.me, active: true, guards: 0, calls: [], messages: [message()], allowed: new Map(), ...overrides };
    const policy = { accountId: ids.me, allowAllGuilds: false, allowedGuildIds: [ids.guild], allowedChannelIds: [], allowWrites: false };
    const common = {
        UserStore: { getCurrentUser: () => ({ id: state.account, username: "Owner", email: "private@example.test", token: "private", connections: [{ secret: true }] }) },
        GuildStore: { getGuild: id => guilds[id], getGuilds: () => guilds },
        ChannelStore: { getChannel: id => channels[id], getMutableGuildChannelsForGuild: id => Object.fromEntries(Object.entries(channels).filter(([, channel]) => channel.guild_id === id)) },
        MessageStore: { getMessages: () => ({ _array: state.messages, deletedMessages: [message()] }) },
        PermissionsBits: bits,
        PermissionStore: { can: (permission, channel) => {
            if (state.allowed.has(`${channel.id}:${permission}`)) return state.allowed.get(`${channel.id}:${permission}`);
            return channel.id !== ids.hidden && !(channel.id === ids.noHistory && permission === bits.READ_MESSAGE_HISTORY);
        } },
        RestAPI: {
            get: async options => {
                state.calls.push({ method: "GET", ...options });
                if (state.get) return state.get(options);
                return { body: options.url.endsWith("/messages") ? [message()] : message() };
            },
            post: async options => {
                state.calls.push({ method: "POST", ...options });
                if (state.post) return state.post(options);
                return { body: message({ content: options.body.content, author: { id: ids.me, username: "Owner" } }) };
            }
        }
    };
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, require: name => {
        assert.equal(name, "@webpack/common");
        return common;
    }, Date, BigInt });
    const api = module.exports;
    const request = (path, extra = {}) => ({ id: "test-request", method: "GET", path, query: {}, body: {}, expiresAt: Date.now() + 10000, ...extra });
    const active = async () => {
        state.guards++;
        await state.onGuard?.(state.guards);
        if (!state.active) throw new Error("STOPPED: private failure details");
    };
    const run = (path, extra = {}) => api.handleDiscordRequest(request(path, extra), policy, active);
    return { api, policy, state, run, request, active, channels };
}

test("status and user expose minimal account data and default to read only", async () => {
    const f = fixture();
    assert.deepEqual(plain((await f.run("/api/status")).body), { connected: true, accountId: ids.me, readOnly: true });
    const user = (await f.run("/api/user")).body.user;
    assert.deepEqual(Object.keys(user).sort(), ["bot", "display_name", "id", "username"]);
    assert.equal(f.state.calls.length, 0);
});

test("guild list and channels contain only granted visible scope", async () => {
    const f = fixture();
    assert.deepEqual(plain((await f.run("/api/guilds")).body.guilds), [{ id: ids.guild, name: "Approved" }]);
    const result = await f.run(`/api/guilds/${ids.guild}/channels`);
    assert.equal(result.status, 200);
    assert.deepEqual(Array.from(result.body.channels, channel => channel.id).sort(), [ids.visible, ids.noHistory, ids.thread].sort());
    assert.equal((await f.run(`/api/guilds/${ids.foreign}/channels`)).status, 403);
});

test("individual channel grants reveal its parent guild but no neighboring channels", async () => {
    const f = fixture();
    f.policy.allowedGuildIds = [];
    f.policy.allowedChannelIds = [ids.visible];
    assert.equal((await f.run("/api/guilds")).body.guilds.length, 1);
    assert.deepEqual(Array.from((await f.run(`/api/guilds/${ids.guild}/channels`)).body.channels, channel => channel.id), [ids.visible]);
    assert.equal((await f.run(`/api/channels/${ids.noHistory}`)).status, 403);
});

test("hidden channels remain blocked even when individually granted", async () => {
    const f = fixture();
    f.policy.allowedChannelIds = [ids.hidden];
    for (const path of [`/api/channels/${ids.hidden}`, `/api/channels/${ids.hidden}/messages`, `/api/channels/${ids.unrelated}/messages`]) {
        assert.equal((await f.run(path)).status, 403);
    }
    assert.equal(f.state.calls.length, 0);
});

test("allow all guilds never exposes DMs; explicitly granted DMs are listed", async () => {
    const f = fixture();
    f.policy.allowAllGuilds = true;
    assert.equal((await f.run(`/api/channels/${ids.dm}/messages`)).status, 403);
    assert.deepEqual(plain((await f.run("/api/dms")).body), { channels: [] });
    f.policy.allowedChannelIds = [ids.dm, ids.visible];
    assert.deepEqual(Array.from((await f.run("/api/dms")).body.channels, channel => channel.id), [ids.dm]);
    assert.equal(f.api.canAccessChannel(ids.privateDm, f.policy), false);
});

test("message access requires history permissions, unlike channel metadata", async () => {
    const f = fixture();
    assert.equal((await f.run(`/api/channels/${ids.noHistory}`)).status, 200);
    assert.equal((await f.run(`/api/channels/${ids.noHistory}/messages`)).status, 403);
    assert.equal((await f.run(`/api/channels/${ids.noHistory}/search`, { query: { content: "hello" } })).status, 403);
    assert.equal(f.state.calls.length, 0);
});

test("all requests refuse switched accounts including event scope checks", async () => {
    const f = fixture({ account: ids.other });
    for (const path of ["/api/status", "/api/user", "/api/guilds", "/api/dms", `/api/channels/${ids.visible}/messages`]) {
        assert.equal((await f.run(path)).status, 409);
    }
    assert.equal(f.api.canAccessChannel(ids.visible, f.policy), false);
    assert.equal(f.state.calls.length, 0);
});

test("expired or stopped requests perform no REST work and leak no error details", async () => {
    const f = fixture();
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, { expiresAt: Date.now() - 1 })).status, 408);
    f.state.active = false;
    const result = await f.run(`/api/channels/${ids.visible}/messages`);
    assert.deepEqual(plain(result), { status: 503, body: { error: "bridge_unavailable" } });
    assert.equal(f.state.calls.length, 0);
});

test("account switch, permission loss, expiry and stop during REST suppress returned data", async () => {
    for (const change of ["account", "permission", "expired", "stop"]) {
        const f = fixture();
        const req = f.request(`/api/channels/${ids.visible}/messages`);
        f.state.get = async () => {
            if (change === "account") f.state.account = ids.other;
            if (change === "permission") f.state.allowed.set(`${ids.visible}:${bits.VIEW_CHANNEL}`, false);
            if (change === "expired") req.expiresAt = Date.now() - 1;
            if (change === "stop") f.state.active = false;
            return { body: [message()] };
        };
        const result = await f.api.handleDiscordRequest(req, f.policy, f.active);
        assert.notEqual(result.status, 200, change);
        assert.equal(result.body.messages, undefined, change);
        assert.equal(f.state.calls.length, 1);
    }
});

test("rechecks account immediately before REST, after the async active guard", async () => {
    const f = fixture();
    f.state.onGuard = count => { if (count === 3) f.state.account = ids.other; };
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages`)).status, 409);
    assert.equal(f.state.calls.length, 0);
});

test("malformed IDs, query limits, cursors and unknown parameters never reach Discord", async () => {
    const f = fixture();
    for (const limit of ["0", "51", "-1", "1.2", "1e1", "01", "Infinity", "", 10]) {
        assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, { query: { limit } })).status, 400, String(limit));
    }
    for (const path of ["/api/channels/123", "/api/channels/%2Fmessages", `/api/channels/${ids.visible}/messages/abc`]) assert.equal((await f.run(path)).status, 400);
    for (const query of [{ before: "bad" }, { before: ids.message, after: ids.second }, { token: "x" }, { around: ids.message }]) {
        assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, { query })).status, 400);
    }
    assert.equal((await f.run("/api/user", { body: { unexpected: true } })).status, 400);
    assert.equal((await f.run("/api/status", { query: { extra: "x" } })).status, 400);
    assert.equal(f.state.calls.length, 0);
});

test("unsupported routes and HTTP mutations remain unavailable", async () => {
    const f = fixture();
    for (const path of ["/api/token", "/api/connections", `/api/guilds/${ids.guild}/search`, `/api/channels/${ids.visible}/messages/bulk-delete`, `/api/channels/${ids.visible}/messages/${ids.message}/download`]) {
        assert.notEqual((await f.run(path)).status, 200);
    }
    for (const method of ["DELETE", "PATCH", "PUT", "HEAD", "post"]) {
        assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, { method })).status, 405);
    }
    assert.equal((await f.run("/api/user", { method: "POST" })).status, 405);
    assert.equal(f.state.calls.length, 0);
});

test("history requests are capped, typed, sanitized and scoped to one channel", async () => {
    const f = fixture({ get: async () => ({ body: [message(), message({ id: ids.second, channel_id: ids.unrelated }), message({ id: ids.third, deleted: true })] }) });
    const result = await f.run(`/api/channels/${ids.visible}/messages`, { query: { limit: "50", before: ids.third } });
    assert.equal(result.status, 200);
    assert.equal(result.body.messages.length, 1);
    assert.equal(result.body.cached, false);
    assert.deepEqual(plain(f.state.calls[0].query), { limit: 50, before: ids.third });
    assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("transient history failure uses explicitly partial cache and filters deleted history", async () => {
    const f = fixture({ get: async () => { throw { status: 503, token: "secret" }; }, messages: [
        message(), message({ id: ids.second, deleted: true }), message({ id: ids.third, editHistory: [{ content: "old secret" }] }), message({ id: ids.third, channel_id: ids.unrelated })
    ] });
    const result = await f.run(`/api/channels/${ids.visible}/messages`, { query: { before: ids.third } });
    assert.equal(result.status, 200);
    assert.equal(result.body.cached, true);
    assert.equal(result.body.partial, true);
    assert.deepEqual(Array.from(result.body.messages, item => item.id), [ids.message]);
    assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("authorization, missing message and rate-limit errors never fall back to cache", async () => {
    for (const status of [401, 403, 404, 429]) {
        const f = fixture({ get: async () => { throw { status, body: { token: "secret" } }; } });
        const result = await f.run(`/api/channels/${ids.visible}/messages`);
        assert.equal(result.status, status);
        assert.equal(result.body.messages, undefined);
        assert.equal(JSON.stringify(result).includes("secret"), false);
    }
});

test("individual-message responses must match both requested IDs", async () => {
    const f = fixture();
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages/${ids.message}`)).status, 200);
    f.state.get = async () => ({ body: message({ channel_id: ids.unrelated }) });
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages/${ids.message}`)).status, 404);
    f.state.get = async () => ({ body: message({ id: ids.second }) });
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages/${ids.message}`)).status, 404);
});

test("guild search sends a single channel filter and excludes neighboring-channel hits and context", async () => {
    const f = fixture({ get: async () => ({ body: { messages: [[message({ hit: true }), message({ id: ids.second, hit: false })], [message({ id: ids.third, channel_id: ids.unrelated, hit: true })]], total_results: 10000 } }) });
    const result = await f.run(`/api/channels/${ids.visible}/search`, { query: { content: "hello", limit: "1" } });
    assert.equal(result.status, 200);
    assert.equal(result.body.messages.length, 1);
    assert.equal(result.body.total_results, undefined);
    assert.equal(f.state.calls[0].url, `/guilds/${ids.guild}/messages/search`);
    assert.deepEqual(plain(f.state.calls[0].query), { content: "hello", channel_id: ids.visible });
});

test("private search requires individual grant and uses only the approved DM endpoint", async () => {
    const f = fixture({ get: async () => ({ body: { messages: [[message({ channel_id: ids.dm, hit: true })]] } }) });
    f.policy.allowedChannelIds = [ids.dm];
    assert.equal((await f.run(`/api/channels/${ids.dm}/search`, { query: { content: "hello" } })).body.messages.length, 1);
    assert.equal(f.state.calls[0].url, `/channels/${ids.dm}/messages/search`);
    assert.equal(f.state.calls[0].query.channel_id, undefined);
    for (const query of [{ content: "" }, { content: "x".repeat(201) }, { content: "hi", author_id: ids.other }]) {
        assert.equal((await f.run(`/api/channels/${ids.dm}/search`, { query })).status, 400);
    }
    assert.equal(f.state.calls.length, 1);
});

test("writes default to disabled and only explicitly enabled writes send messages", async () => {
    const f = fixture();
    const input = { method: "POST", body: { content: "hello" } };
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, input)).status, 403);
    assert.equal(f.state.calls.length, 0);
    f.policy.allowWrites = true;
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, input)).status, 200);
    assert.deepEqual(plain(f.state.calls[0].body.allowed_mentions), { parse: [], replied_user: false });
});

test("send permissions distinguish threads and prevent hidden or foreign writes", async () => {
    const f = fixture();
    f.policy.allowWrites = true;
    f.state.allowed.set(`${ids.visible}:${bits.SEND_MESSAGES}`, false);
    f.state.allowed.set(`${ids.thread}:${bits.SEND_MESSAGES_IN_THREADS}`, false);
    for (const channel of [ids.visible, ids.thread, ids.hidden, ids.unrelated, ids.dm]) {
        assert.equal((await f.run(`/api/channels/${channel}/messages`, { method: "POST", body: { content: "hello" } })).status, 403);
    }
    assert.equal(f.state.calls.length, 0);
});

test("send validates content and rejects user-supplied mentions, attachment or unsupported options", async () => {
    const f = fixture();
    f.policy.allowWrites = true;
    for (const body of [{ content: "" }, { content: "   " }, { content: "x".repeat(2001) }, { content: 123 }, { content: "hey", allowed_mentions: { parse: ["everyone"] } }, { content: "hi", attachments: [] }, { content: "hi", reply: { message_id: ids.message, channel_id: ids.unrelated } }]) {
        assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, { method: "POST", body })).status, 400);
    }
    assert.equal(f.state.calls.length, 0);
});

test("reply verifies the referenced message within the same channel and suppresses reply pings", async () => {
    const f = fixture();
    f.policy.allowWrites = true;
    const result = await f.run(`/api/channels/${ids.visible}/messages`, { method: "POST", body: { content: "@everyone <@111111111111111112>", reply: { message_id: ids.message } } });
    assert.equal(result.status, 200);
    assert.equal(f.state.calls.length, 2);
    assert.equal(f.state.calls[0].url, `/channels/${ids.visible}/messages/${ids.message}`);
    assert.deepEqual(plain(f.state.calls[1].body.message_reference), { message_id: ids.message, channel_id: ids.visible, fail_if_not_exists: true });
    assert.deepEqual(plain(f.state.calls[1].body.allowed_mentions), { parse: [], replied_user: false });
});

test("reply account switch or permission loss during verification prevents POST", async () => {
    for (const change of ["account", "permission", "stop"]) {
        const f = fixture();
        f.policy.allowWrites = true;
        f.state.get = async () => {
            if (change === "account") f.state.account = ids.other;
            if (change === "permission") f.state.allowed.set(`${ids.visible}:${bits.SEND_MESSAGES}`, false);
            if (change === "stop") f.state.active = false;
            return { body: message() };
        };
        assert.notEqual((await f.run(`/api/channels/${ids.visible}/messages`, { method: "POST", body: { content: "reply", reply: { message_id: ids.message } } })).status, 200);
        assert.equal(f.state.calls.length, 1);
        assert.equal(f.state.calls[0].method, "GET");
    }
});

test("invalid cross-channel reply is never submitted", async () => {
    const f = fixture({ get: async () => ({ body: message({ channel_id: ids.unrelated }) }) });
    f.policy.allowWrites = true;
    assert.equal((await f.run(`/api/channels/${ids.visible}/messages`, { method: "POST", body: { content: "reply", reply: { message_id: ids.message } } })).status, 400);
    assert.equal(f.state.calls.length, 1);
});

test("serializer omits secrets, URLs, deleted messages, nested references and historical content", () => {
    const f = fixture();
    for (const deleted of [{ deleted: true }, { mlDeleted: true }, { state: "DELETED" }]) assert.equal(f.api.serializeMessage(message(deleted)), undefined);
    const safe = f.api.serializeMessage(message({ attachments: [{ url: "https://secret", deleted: false }, { deleted: true }], embeds: [{ description: "private" }], token: "secret", editHistory: [{ content: "previous" }], referenced_message: { content: "private" } }));
    assert.equal(safe.attachment_count, 1);
    for (const forbidden of ["https://secret", "previous", "private", "token", "editHistory"]) assert.equal(JSON.stringify(safe).includes(forbidden), false);
});
