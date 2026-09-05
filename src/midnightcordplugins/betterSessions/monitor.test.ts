/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkIntervalMs, parseSessions, readStoredSessions, sessionKey, SessionMonitor } from "./monitor";

function session(id: string) {
    return { id_hash: id, approx_last_used_time: "2026-09-05T12:00:00Z", client_info: { os: "Windows", platform: "Discord Client", location: "Paris" } };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

function fixture() {
    const storage = new Map<string, unknown>();
    const notices: [string, number][] = [];
    let sessions = [session("desktop")];
    const monitor = new SessionMonitor({
        read: async key => structuredClone(storage.get(key)),
        write: async (key, data) => { storage.set(key, structuredClone(data)); },
        fetch: async () => sessions,
        notify: (account, count) => { notices.push([account, count]); }
    });
    return { monitor, storage, notices, setSessions: (next: typeof sessions) => { sessions = next; } };
}

test("first successful snapshot is silent, subsequent new sessions alert once", async () => {
    const f = fixture();
    await f.monitor.activate("account-a");
    assert.deepEqual(f.notices, []);
    f.setSessions([session("desktop"), session("phone")]);
    await f.monitor.refresh();
    await f.monitor.refresh();
    assert.deepEqual(f.notices, [["account-a", 1]]);
    assert.equal(f.monitor.getSnapshot().saved.get("phone")?.isNew, true);
    await f.monitor.markSeen("account-a");
    assert.equal(f.monitor.getSnapshot().saved.get("phone")?.isNew, false);
});

test("saved names survive restart, removed sessions are pruned, missed logins alert", async () => {
    const f = fixture();
    await f.monitor.activate("account-a");
    assert.equal(await f.monitor.rename("account-a", "desktop", " Mon PC "), true);
    f.monitor.stop();
    f.setSessions([session("desktop"), session("phone")]);
    await f.monitor.activate("account-a");
    assert.equal(f.monitor.getSnapshot().saved.get("desktop")?.name, "Mon PC");
    assert.deepEqual(f.notices, [["account-a", 1]]);
    f.setSessions([session("desktop")]);
    await f.monitor.refresh();
    assert.equal(f.monitor.getSnapshot().saved.has("phone"), false);
});

test("names and rename operations are isolated by account", async () => {
    const f = fixture();
    await f.monitor.activate("account-a");
    await f.monitor.rename("account-a", "desktop", "Personal computer");
    await f.monitor.activate("account-b");
    assert.equal(f.monitor.getSnapshot().saved.get("desktop")?.name, "");
    assert.equal(await f.monitor.rename("account-a", "desktop", "stale modal"), false);
    await f.monitor.activate("account-a");
    assert.equal(f.monitor.getSnapshot().saved.get("desktop")?.name, "Personal computer");
});

test("late API response from a previous account cannot overwrite or notify", async () => {
    const pending = deferred<unknown>();
    const started = deferred<void>();
    const notices: string[] = [];
    let calls = 0;
    const monitor = new SessionMonitor({
        read: async () => ({ version: 1, initialized: true, sessions: new Map() }),
        write: async () => { },
        fetch: () => { if (++calls === 1) { started.resolve(); return pending.promise; } return Promise.resolve([session("b")]); },
        notify: account => { notices.push(account); }
    });
    const old = monitor.activate("a");
    await started.promise;
    await monitor.activate("b");
    pending.resolve([session("a")]);
    await old;
    assert.equal(monitor.getSnapshot().accountId, "b");
    assert.deepEqual(monitor.getSnapshot().sessions.map(s => s.id_hash), ["b"]);
    assert.deepEqual(notices, ["b"]);
});

test("stopping while storage loads prevents API calls and cache repopulation", async () => {
    const pending = deferred<unknown>();
    const started = deferred<void>();
    let fetched = false;
    const monitor = new SessionMonitor({
        read: () => { started.resolve(); return pending.promise; },
        write: async () => { },
        fetch: async () => { fetched = true; return []; },
        notify: () => assert.fail("stopped monitor notified")
    });
    const activation = monitor.activate("a");
    await started.promise;
    monitor.stop();
    pending.resolve(new Map([["desktop", { name: "private", isNew: true }]]));
    await activation;
    assert.equal(fetched, false);
    assert.equal(monitor.getSnapshot().saved.size, 0);
    assert.equal(monitor.getSnapshot().accountId, null);
});

test("malformed API responses do not erase saved names", async () => {
    let invalid = false;
    const monitor = new SessionMonitor({
        read: async () => new Map([["desktop", { name: "My PC", isNew: false }]]),
        write: async () => { },
        fetch: async () => invalid ? { error: "no sessions" } : [session("desktop")],
        notify: () => { }
    });
    await monitor.activate("a");
    invalid = true;
    await monitor.refresh();
    assert.equal(monitor.getSnapshot().saved.get("desktop")?.name, "My PC");
    assert.ok(monitor.getSnapshot().error);
    assert.equal(monitor.getSnapshot().loading, false);
});

test("pending writes preserve their account key during switching", async () => {
    const pending = deferred<void>();
    const started = deferred<void>();
    const writes: string[] = [];
    let count = 0;
    const monitor = new SessionMonitor({
        read: async () => undefined,
        write: async key => { writes.push(key); if (++count === 2) { started.resolve(); await pending.promise; } },
        fetch: async () => [session("desktop")],
        notify: () => { }
    });
    await monitor.activate("a");
    const rename = monitor.rename("a", "desktop", "A");
    await started.promise;
    const activation = monitor.activate("b");
    pending.resolve();
    assert.equal(await rename, false);
    await activation;
    assert.deepEqual(writes, [sessionKey("a"), sessionKey("a"), sessionKey("b")]);
});

test("legacy/corrupt storage is bounded and intervals cannot flood Discord", () => {
    const saved = readStoredSessions(new Map([["ok", { name: "a".repeat(200), isNew: true }], ["bad", null]]));
    assert.equal(saved.sessions.size, 1);
    assert.equal(saved.sessions.get("ok")?.name.length, 80);
    assert.equal(readStoredSessions({ sessions: [], version: 42 }).initialized, false);
    assert.equal(parseSessions([session("a"), session("a")]).length, 1);
    assert.equal(checkIntervalMs(-10), 300_000);
    assert.equal(checkIntervalMs(NaN), 1_200_000);
    assert.equal(checkIntervalMs(Infinity), 1_200_000);
});

test("a partially malformed response preserves known sessions and names", async () => {
    let sessions: unknown = [session("desktop"), session("phone")];
    const notices: number[] = [];
    const monitor = new SessionMonitor({
        read: async () => undefined,
        write: async () => { },
        fetch: async () => sessions,
        notify: (_, count) => { notices.push(count); }
    });
    await monitor.activate("a");
    await monitor.rename("a", "phone", "My phone");
    sessions = [session("desktop"), { id_hash: "phone" }];
    await monitor.refresh();
    assert.ok(monitor.getSnapshot().error);
    assert.equal(monitor.getSnapshot().saved.get("phone")?.name, "My phone");
    sessions = [session("desktop"), session("phone")];
    await monitor.refresh();
    assert.deepEqual(notices, []);
});

test("temporary storage failure does not lose a new-session alert or repeat it", async () => {
    let sessions = [session("desktop")];
    let failWrite = false;
    const notices: number[] = [];
    const monitor = new SessionMonitor({
        read: async () => undefined,
        write: async () => { if (failWrite) throw new Error("disk unavailable"); },
        fetch: async () => sessions,
        notify: (_, count) => { notices.push(count); }
    });
    await monitor.activate("a");
    sessions = [session("desktop"), session("phone")];
    failWrite = true;
    await monitor.refresh();
    assert.ok(monitor.getSnapshot().error);
    failWrite = false;
    await monitor.refresh();
    assert.deepEqual(notices, [1]);
});

test("actual account changes invalidate responses before the next Flux sync", async () => {
    let account = "a";
    const pending = deferred<unknown>();
    const started = deferred<void>();
    const monitor = new SessionMonitor({
        currentAccount: () => account,
        read: async () => ({ version: 1, initialized: true, sessions: new Map() }),
        write: async () => assert.fail("stale response wrote to storage"),
        fetch: () => { started.resolve(); return pending.promise; },
        notify: () => assert.fail("stale response notified")
    });
    const activation = monitor.activate("a");
    await started.promise;
    account = "b";
    pending.resolve([session("private-session")]);
    await activation;
    assert.equal(monitor.getSnapshot().sessions.length, 0);
    assert.equal(await monitor.rename("a", "private-session", "wrong account"), false);
});
