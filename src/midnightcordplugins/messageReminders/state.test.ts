/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { deliverReminderNotice } from "./notification";
import { localDateTime, MAX_REMINDERS, readReminders, Reminder, ReminderService, ReminderSource, storageKey, tomorrowMorning } from "./state";

const A = "111111111111111111";
const B = "222222222222222222";
const SOURCE: ReminderSource = { messageId: "333333333333333333", channelId: "444444444444444444", guildId: null, preview: "À lire", author: "Alice" };

function fixture() {
    let account = A;
    let now = 1_800_000_000_000;
    let id = 0;
    const data = new Map<string, unknown>();
    const delivered: { ids: string[]; account: string; }[] = [];
    const storage = {
        async get(key: string) { return structuredClone(data.get(key)); },
        async set(key: string, value: unknown) { data.set(key, structuredClone(value)); }
    };
    const service = new ReminderService(storage, () => account, (records, owner) => delivered.push({ ids: records.map(record => record.id), account: owner }), () => now, () => `test-${++id}`);
    return { service, storage, data, delivered, setAccount: (value: string) => { account = value; }, advance: (milliseconds: number) => { now += milliseconds; }, now: () => now };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

test("a reminder becomes due exactly once; snooze schedules a new delivery and dismiss removes it", async () => {
    const f = fixture();
    await f.service.activate(A);
    await f.service.add(SOURCE, f.now() + 1000);
    await f.service.tick();
    assert.equal(f.delivered.length, 0);
    f.advance(1000);
    await Promise.all([f.service.tick(), f.service.tick()]);
    assert.equal(f.delivered.length, 1);
    const { id } = f.service.snapshot[0];
    await f.service.snooze(id, f.now() + 1000);
    f.advance(1000);
    await f.service.tick();
    assert.equal(f.delivered.length, 2);
    await f.service.dismiss(id);
    assert.deepEqual(readReminders(f.data.get(storageKey(A))), []);
});

test("restart delivers missed pending reminders but does not repeat already delivered reminders", async () => {
    const f = fixture();
    await f.service.activate(A);
    await f.service.add(SOURCE, f.now() + 1000);
    f.service.stop();
    f.advance(60_000);
    await f.service.activate(A);
    await f.service.tick();
    assert.equal(f.delivered.length, 1);
    f.service.stop();
    await f.service.activate(A);
    await f.service.tick();
    assert.equal(f.delivered.length, 1);
    assert.equal(f.service.snapshot.length, 1);
});

test("account switch hides the old account, stores independently, and delivers to the correct account", async () => {
    const f = fixture();
    await f.service.activate(A);
    await f.service.add(SOURCE, f.now() + 1000);
    f.setAccount(B);
    await f.service.activate(B);
    assert.equal(f.service.snapshot.length, 0);
    await f.service.add(SOURCE, f.now() + 2000);
    f.advance(1500);
    await f.service.tick();
    assert.equal(f.delivered.length, 0);
    f.setAccount(A);
    await f.service.activate(A);
    await f.service.tick();
    assert.deepEqual(f.delivered, [{ ids: ["test-1"], account: A }]);
    assert.equal(readReminders(f.data.get(storageKey(B)))[0].id, "test-2");
});

test("late reads cannot repopulate state after stop", async () => {
    const f = fixture();
    const pending = deferred<unknown>();
    const started = deferred<void>();
    f.storage.get = async () => { started.resolve(); return pending.promise; };
    const loading = f.service.activate(A);
    await started.promise;
    f.service.stop();
    pending.resolve({ version: 1, reminders: [] });
    await loading;
    assert.equal(f.service.ready, false);
    assert.equal(f.service.accountId, null);
    assert.deepEqual(f.service.snapshot, []);
});

test("an in-flight write cannot notify or publish into the next account", async () => {
    const f = fixture();
    await f.service.activate(A);
    await f.service.add(SOURCE, f.now() + 1000);
    f.advance(1000);
    const pending = deferred<void>();
    const started = deferred<void>();
    f.storage.set = async (key, value) => {
        started.resolve();
        await pending.promise;
        f.data.set(key, structuredClone(value));
    };
    const ticking = f.service.tick();
    await started.promise;
    f.setAccount(B);
    const loadingB = f.service.activate(B);
    pending.resolve();
    await Promise.all([ticking, loadingB]);
    assert.deepEqual(f.delivered, []);
    assert.deepEqual(f.service.snapshot, []);
    assert.equal(f.data.has(storageKey(B)), false);
    f.setAccount(A);
    await f.service.activate(A);
    await f.service.tick();
    assert.equal(f.delivered.length, 1);
});

test("queued operations are rejected when the active account changes before its store event", async () => {
    const f = fixture();
    await f.service.activate(A);
    f.setAccount(B);
    await assert.rejects(f.service.add(SOURCE, f.now() + 1000), /indisponibles/);
    assert.equal(f.data.size, 0);
});

test("failed persistence does not claim success, notify, or lose a pending reminder", async () => {
    const f = fixture();
    await f.service.activate(A);
    await f.service.add(SOURCE, f.now() + 1000);
    f.advance(1000);
    const { set } = f.storage;
    f.storage.set = async () => { throw new Error("Disk full"); };
    await assert.rejects(f.service.tick(), /Disk full/);
    assert.equal(f.service.snapshot[0].notifiedAt, null);
    assert.equal(f.delivered.length, 0);
    f.storage.set = set;
    await f.service.tick();
    assert.equal(f.delivered.length, 1);
});

test("failed reads and unknown store versions prevent accidental overwrite and permit retry", async () => {
    const f = fixture();
    const { get } = f.storage;
    f.storage.get = async () => { throw new Error("Storage unavailable"); };
    await assert.rejects(f.service.activate(A), /Storage unavailable/);
    assert.ok(f.service.loadError);
    await assert.rejects(f.service.add(SOURCE, f.now() + 1000), /indisponibles/);
    f.storage.get = get;
    const futureFormat = { version: 2, reminders: [SOURCE] };
    f.data.set(storageKey(A), futureFormat);
    await assert.rejects(f.service.activate(A), /Format de rappels/);
    assert.deepEqual(f.data.get(storageKey(A)), futureFormat);
    f.data.delete(storageKey(A));
    await f.service.activate(A);
    assert.equal(f.service.loadError, null);
    assert.equal(f.service.ready, true);
});

test("failed primary delivery restores the entire batch for retry, including after restart", async () => {
    const data = new Map<string, unknown>();
    let fail = true;
    let now = 1_800_000_000_000;
    let id = 0;
    const delivered: string[][] = [];
    const service = new ReminderService({
        async get(key) { return structuredClone(data.get(key)); },
        async set(key, value) { data.set(key, structuredClone(value)); }
    }, () => A, records => {
        if (fail) throw new Error("Modal unavailable");
        delivered.push(records.map(record => record.id));
    }, () => now, () => `batch-${++id}`);
    await service.activate(A);
    await service.add(SOURCE, now + 1000);
    await service.add({ ...SOURCE, messageId: "555555555555555555" }, now + 1000);
    now += 1000;
    await assert.rejects(service.tick(), /Modal unavailable/);
    assert.ok(service.snapshot.every(record => record.notifiedAt === null));
    assert.ok(readReminders(data.get(storageKey(A))).every(record => record.notifiedAt === null));
    await assert.rejects(service.tick(), /Modal unavailable/);
    service.stop();
    await service.activate(A);
    fail = false;
    await service.tick();
    assert.deepEqual(delivered, [["batch-1", "batch-2"]]);
    await service.tick();
    assert.equal(delivered.length, 1);
    assert.ok(readReminders(data.get(storageKey(A))).every(record => record.notifiedAt !== null));
});

test("optional desktop notification failure cannot undo an in-app delivery", () => {
    const calls: string[] = [];
    deliverReminderNotice(() => { calls.push("in-app"); }, () => { throw new Error("Native unavailable"); }, error => {
        assert.match(String(error), /Native unavailable/);
        calls.push("logged");
    });
    assert.deepEqual(calls, ["in-app", "logged"]);
    assert.throws(() => deliverReminderNotice(() => { throw new Error("Modal unavailable"); }, () => { calls.push("native"); }, () => { calls.push("unexpected"); }), /Modal unavailable/);
    assert.deepEqual(calls, ["in-app", "logged"]);
});

test("one reminder per message, finite future dates, bounded preview and total limit", async () => {
    const f = fixture();
    await f.service.activate(A);
    await assert.rejects(f.service.add(SOURCE, NaN), /date future/);
    await assert.rejects(f.service.add(SOURCE, f.now()), /date future/);
    await f.service.add({ ...SOURCE, preview: "x".repeat(1000) }, f.now() + 1000);
    await f.service.add(SOURCE, f.now() + 2000);
    assert.equal(f.service.snapshot.length, 1);
    assert.equal(f.service.snapshot[0].dueAt, f.now() + 2000);
    for (let i = 1; i < MAX_REMINDERS; i++) await f.service.add({ ...SOURCE, messageId: String(100_000 + i) }, f.now() + 1000);
    await assert.rejects(f.service.add({ ...SOURCE, messageId: "999999" }, f.now() + 1000), /200 rappels/);
    assert.equal(f.service.snapshot.length, MAX_REMINDERS);
});

test("corrupt storage is validated, deduplicated and capped without retaining arbitrary fields", () => {
    const record: Reminder = { ...SOURCE, id: "test", createdAt: 1, dueAt: 2, notifiedAt: null };
    assert.deepEqual(readReminders(null), []);
    assert.deepEqual(readReminders({ version: 2, reminders: [record] }), []);
    const records = Array.from({ length: MAX_REMINDERS + 20 }, (_, i) => ({ ...record, id: `id-${i}`, messageId: String(100_000 + i), preview: "x".repeat(1000), arbitrary: "ignored" }));
    const result = readReminders({ version: 1, reminders: [null, { ...record, dueAt: Infinity }, { ...record, channelId: "../../" }, ...records, records[0]] });
    assert.equal(result.length, MAX_REMINDERS);
    assert.equal(result[0].preview.length, 300);
    assert.equal("arbitrary" in result[0], false);
    assert.throws(() => storageKey("../../bad"));
});

test("tomorrow at 9 and datetime input values use local calendar time", () => {
    const now = new Date(2026, 8, 5, 23, 30).getTime();
    const tomorrow = new Date(tomorrowMorning(now));
    assert.equal(tomorrow.getDate(), 6);
    assert.equal(tomorrow.getHours(), 9);
    assert.equal(localDateTime(now), "2026-09-05T23:30");
});
