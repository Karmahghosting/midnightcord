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

const { code } = transformSync(readFileSync(new URL("../src/midnightcordplugins/discordAPI/lifecycle.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" });
const module = { exports: {} };
runInNewContext(code, { module, exports: module.exports, Date, setTimeout, clearTimeout });
const { BridgeLifecycle } = module.exports;
const accountId = "111111111111111111";
const otherAccount = "111111111111111112";
const guildId = "211111111111111111";
const turn = () => new Promise(resolve => setImmediate(resolve));
async function flush() { await turn(); await turn(); }
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fixture() {
    const state = { account: accountId, starts: [], stops: 0, polls: [], queued: [], active: new Set(),
        executions: [], responses: [], effects: [], maxPolls: 0, activeChecks: 0, hasNative: true,
        scope: { allowAllGuilds: false, allowedGuildIds: [guildId], allowedChannelIds: [], allowWrites: false } };
    const transport = {
        startServer: async config => { state.starts.push(config); await state.onStart?.(config); },
        stopServer: async () => {
            state.stops++;
            state.active.clear();
            state.queued = [];
            for (const poll of state.polls.splice(0)) poll.resolve(null);
            await state.onStop?.();
        },
        nextRequest: () => {
            if (state.nextError) return Promise.reject(state.nextError);
            if (state.queued.length) return Promise.resolve(state.queued.shift());
            const pending = deferred();
            state.polls.push(pending);
            state.maxPolls = Math.max(state.maxPolls, state.polls.length);
            return pending.promise;
        },
        isRequestActive: async id => {
            state.activeChecks++;
            await state.onActive?.(id);
            return state.active.has(id);
        },
        sendResponse: async (id, status, body) => {
            state.responses.push({ id, status, body });
            state.active.delete(id);
        }
    };
    const bridge = new BridgeLifecycle({
        native: () => state.hasNative ? transport : undefined,
        account: () => state.account,
        config: () => ({ port: 3737, policy: { accountId: state.account, ...state.scope, allowedGuildIds: [...state.scope.allowedGuildIds], allowedChannelIds: [...state.scope.allowedChannelIds] } }),
        execute: async (request, policy, assertActive) => {
            state.executions.push({ request, policy });
            if (state.execute) return state.execute(request, policy, assertActive);
            await assertActive();
            return { status: 200, body: { ok: request.id } };
        }
    });
    const enqueue = (id = "request-1", extra = {}) => {
        const req = { id, method: "GET", path: "/api/status", query: {}, body: {}, expiresAt: Date.now() + 10000, ...extra };
        state.active.add(id);
        const poll = state.polls.shift();
        if (poll) poll.resolve(req);
        else state.queued.push(req);
        return req;
    };
    return { bridge, state, enqueue };
}

test("start establishes one poll and processes each request serially", async () => {
    const f = fixture();
    const hold = deferred();
    f.state.execute = async request => {
        if (request.id === "first") await hold.promise;
        return { status: 200, body: { id: request.id } };
    };
    await f.bridge.start();
    assert.equal(f.bridge.running, true);
    assert.equal(f.state.polls.length, 1);
    f.enqueue("first");
    f.enqueue("second");
    await flush();
    assert.equal(f.state.executions.length, 1);
    assert.equal(f.state.polls.length, 0, "No second poll while a request executes");
    hold.resolve();
    await flush();
    assert.deepEqual(f.state.responses.map(item => item.id), ["first", "second"]);
    assert.equal(f.state.polls.length, 1);
    assert.equal(f.state.maxPolls, 1);
    await f.bridge.stop();
});

test("a Discord call that never settles pauses at the deadline and cannot publish a late result", async () => {
    const f = fixture();
    const hold = deferred();
    f.state.execute = async (_request, _policy, assertActive) => {
        await hold.promise;
        await assertActive();
        f.state.effects.push("late-effect");
        return { status: 200, body: { private: "must-not-escape" } };
    };
    await f.bridge.start();
    f.enqueue("hung", { expiresAt: Date.now() + 30 });
    await flush();
    assert.equal(f.state.executions.length, 1);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(f.bridge.running, false);
    assert.equal(f.bridge.paused, true);
    assert.equal(f.bridge.policy, undefined);
    assert.match(f.bridge.error, /pas répondu à temps/);
    assert.equal(f.state.polls.length, 0);
    hold.resolve();
    await flush();
    assert.deepEqual(f.state.effects, []);
    assert.deepEqual(f.state.responses, []);
    assert.equal(f.state.starts.length, 1, "No automatic restart or duplicate Discord call");
    await f.bridge.stop();
});

test("start immediately followed by stop never starts superseded native service", async () => {
    const f = fixture();
    const started = f.bridge.start();
    const stopped = f.bridge.stop();
    await Promise.all([started, stopped]);
    assert.equal(f.state.starts.length, 0);
    assert.equal(f.bridge.enabled, false);
    assert.equal(f.bridge.running, false);
    assert.equal(f.state.polls.length, 0);
});

test("stop during native startup invalidates renderer synchronously and cleans late startup", async () => {
    const f = fixture();
    const hold = deferred();
    f.state.onStart = () => hold.promise;
    const starting = f.bridge.start();
    await flush();
    assert.equal(f.state.starts.length, 1);
    const stopping = f.bridge.stop();
    assert.equal(f.bridge.running, false);
    assert.equal(f.bridge.policy, undefined);
    hold.resolve();
    await Promise.all([starting, stopping]);
    assert.equal(f.state.polls.length, 0);
    assert.equal(f.bridge.running, false);
    assert(f.state.stops >= 2);
});

test("rapid scope changes start only the latest policy and never duplicate a poll", async () => {
    const f = fixture();
    await f.bridge.start();
    f.state.scope.allowedGuildIds = [];
    const first = f.bridge.refresh();
    f.state.scope.allowedChannelIds = ["311111111111111111"];
    const second = f.bridge.refresh();
    assert.equal(f.bridge.policy, undefined, "Old scope is synchronously removed from event exposure");
    await Promise.all([first, second]);
    await flush();
    assert.equal(f.state.starts.length, 2, "Only one restart for the newest configuration");
    assert.equal(f.bridge.policy.allowedGuildIds.length, 0);
    assert.deepEqual(Array.from(f.bridge.policy.allowedChannelIds), ["311111111111111111"]);
    assert.equal(f.state.polls.length, 1);
    assert.equal(f.state.maxPolls, 1);
    await f.bridge.stop();
});

test("account change pauses and clears old grants until explicit resume", async () => {
    const f = fixture();
    await f.bridge.start();
    f.state.account = otherAccount;
    const observing = f.bridge.observeAccount();
    assert.equal(f.bridge.paused, true);
    assert.equal(f.bridge.running, false);
    assert.equal(f.bridge.policy, undefined);
    await observing;
    await f.bridge.observeAccount();
    assert.equal(f.state.starts.length, 1);
    assert.equal(f.state.polls.length, 0);
    await f.bridge.resume();
    assert.equal(f.state.starts.length, 2);
    assert.equal(f.bridge.policy.accountId, otherAccount);
    await f.bridge.stop();
});

test("initially logged out start waits for first account, then logout pauses subsequent login", async () => {
    const f = fixture();
    f.state.account = "";
    await f.bridge.start();
    assert.equal(f.state.starts.length, 0);
    f.state.account = accountId;
    await f.bridge.observeAccount();
    assert.equal(f.bridge.running, true);
    f.state.account = "";
    await f.bridge.observeAccount();
    assert.equal(f.bridge.paused, true);
    f.state.account = otherAccount;
    await f.bridge.observeAccount();
    assert.equal(f.bridge.running, false);
    assert.equal(f.state.starts.length, 1);
    await f.bridge.stop();
});

test("account switch while starting prevents establishing a poll", async () => {
    const f = fixture();
    const hold = deferred();
    f.state.onStart = () => hold.promise;
    const starting = f.bridge.start();
    await flush();
    f.state.account = otherAccount;
    hold.resolve();
    await starting;
    assert.equal(f.bridge.running, false);
    assert.equal(f.bridge.policy, undefined);
    assert.equal(f.state.polls.length, 0);
    await f.bridge.stop();
});

test("expired and cancelled queued requests never enter the handler", async () => {
    const f = fixture();
    await f.bridge.start();
    f.enqueue("expired", { expiresAt: Date.now() - 1 });
    await flush();
    f.enqueue("cancelled");
    f.state.active.delete("cancelled");
    await flush();
    assert.equal(f.state.executions.length, 0);
    assert(f.state.responses.every(response => response.status === 503));
    await f.bridge.stop();
});

test("cancellation and expiration during handler guard prevent a side effect", async () => {
    for (const reason of ["cancelled", "expired"]) {
        const f = fixture();
        const hold = deferred();
        f.state.execute = async (request, _policy, active) => {
            await hold.promise;
            await active();
            f.state.effects.push(request.id);
            return { status: 200, body: { ok: true } };
        };
        await f.bridge.start();
        const req = f.enqueue(reason);
        await flush();
        if (reason === "cancelled") f.state.active.delete(req.id);
        else req.expiresAt = Date.now() - 1;
        hold.resolve();
        await flush();
        assert.equal(f.state.effects.length, 0, reason);
        assert(f.state.responses.every(response => response.status !== 200), reason);
        await f.bridge.stop();
    }
});

test("account change while native active check is pending is checked again before effect", async () => {
    const f = fixture();
    const hold = deferred();
    f.state.onActive = async () => {
        if (f.state.activeChecks === 2) await hold.promise;
    };
    f.state.execute = async (request, _policy, active) => {
        await active();
        f.state.effects.push(request.id);
        return { status: 200, body: { secret: "do not expose" } };
    };
    await f.bridge.start();
    f.enqueue();
    await flush();
    f.state.account = otherAccount;
    hold.resolve();
    await flush();
    assert.equal(f.state.effects.length, 0);
    assert.equal(f.state.responses.length, 0);
    await f.bridge.stop();
});

test("late handler results after stop, scope refresh or account change are discarded", async () => {
    for (const reason of ["stop", "scope", "account"]) {
        const f = fixture();
        const hold = deferred();
        f.state.execute = () => hold.promise;
        await f.bridge.start();
        f.enqueue("late");
        await flush();
        if (reason === "stop") await f.bridge.stop();
        if (reason === "scope") { f.state.scope.allowedGuildIds = []; await f.bridge.refresh(); }
        if (reason === "account") { f.state.account = otherAccount; await f.bridge.observeAccount(); }
        hold.resolve({ status: 200, body: { private: "late data" } });
        await flush();
        assert.equal(f.state.responses.length, 0, reason);
        assert(f.state.maxPolls <= 1);
        await f.bridge.stop();
    }
});

test("request expired after handler returns never emits a success response", async () => {
    const f = fixture();
    f.state.execute = async request => {
        request.expiresAt = Date.now() - 1;
        return { status: 200, body: { private: "late data" } };
    };
    await f.bridge.start();
    f.enqueue();
    await flush();
    assert.equal(f.state.responses.length, 1);
    assert.equal(f.state.responses[0].status, 503);
    assert.equal(f.state.responses[0].body.private, undefined);
    await f.bridge.stop();
});

test("a polling failure pauses the service and does not spin or restart automatically", async () => {
    const f = fixture();
    await f.bridge.start();
    f.state.polls.shift().reject(new Error("transport offline"));
    await flush();
    assert.equal(f.bridge.running, false);
    assert.equal(f.bridge.paused, true);
    assert.equal(f.bridge.policy, undefined);
    assert(f.bridge.error.length > 0);
    assert.equal(f.state.starts.length, 1);
    assert.equal(f.state.polls.length, 0);
    await f.bridge.stop();
});

test("missing native helpers and failed startup leave no running bridge or leaked details", async () => {
    const f = fixture();
    f.state.hasNative = false;
    await f.bridge.start();
    assert.equal(f.bridge.running, false);
    f.state.hasNative = true;
    f.state.onStart = () => { throw new Error("secret native error"); };
    await f.bridge.refresh();
    assert.equal(f.bridge.running, false);
    assert.equal(f.bridge.policy, undefined);
    assert.equal(f.bridge.error.includes("secret"), false);
    assert(f.bridge.error.length > 0);
    assert.equal(f.state.polls.length, 0);
    await f.bridge.stop();
});
