/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Language, OcrResult } from "./runtime";
import { OcrSessionManager } from "./session";

const IMAGE = new Uint8Array([1]);
const SUCCESS: OcrResult = { ok: true, text: "fixture", confidence: 99, elapsed: 1, truncated: false };

class Runtime {
    hasResources = false;
    calls: Array<{ owner: number; id: string; }> = [];
    active?: { owner: number; id: string; cancelled: boolean; resolve(result: OcrResult): void; };

    async recognize(owner: number, id: string, image: Uint8Array, _language: Language): Promise<OcrResult> {
        if (this.active) return { ok: false, error: "busy" };
        if (!/^[a-zA-Z0-9-]+$/.test(id)) return { ok: false, error: "invalid-request" };
        if (!image.length) return { ok: false, error: "invalid-image" };
        this.calls.push({ owner, id });
        this.hasResources = true;
        return new Promise(resolve => { this.active = { owner, id, resolve, cancelled: false }; });
    }

    finish(result: OcrResult = SUCCESS) {
        const previous = this.active;
        this.active = undefined;
        this.hasResources = result.ok;
        previous?.resolve(result);
    }

    cancel(owner: number, id?: string) {
        if (this.active && (this.active.owner !== owner || id && this.active.id !== id)) return false;
        if (!this.active) { this.hasResources = false; return true; }
        if (!this.active.cancelled) {
            this.active.cancelled = true;
            queueMicrotask(() => this.finish({ ok: false, error: "cancelled" }));
        }
        return true;
    }
}

async function nextTurn() { await new Promise(resolve => setTimeout(resolve, 0)); }

test("invalid request/image on a fresh runtime does not retain window ownership", async () => {
    for (const [id, image, error] of [["invalid/id", IMAGE, "invalid-request"], ["valid-id", new Uint8Array(), "invalid-image"]] as const) {
        const runtime = new Runtime();
        const sessions = new OcrSessionManager(runtime);
        assert.deepEqual(await sessions.recognize(1, "first", id, image, "eng"), { ok: false, error });
        const job = sessions.recognize(2, "second", "valid", IMAGE, "eng");
        assert.equal(sessions.cancel(2, "second", "valid"), true);
        assert.deepEqual(await job, { ok: false, error: "cancelled" });
    }
});

test("invalid request preserves an already useful warm worker for its current session", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    const first = sessions.recognize(1, "first", "job", IMAGE, "eng");
    runtime.finish();
    assert.equal((await first).ok, true);
    assert.deepEqual(await sessions.recognize(1, "first", "bad/id", IMAGE, "eng"), { ok: false, error: "invalid-request" });
    assert.deepEqual(await sessions.recognize(2, "second", "job", IMAGE, "eng"), { ok: false, error: "busy" });
    assert.equal(sessions.release(1, "first"), true);
    const second = sessions.recognize(2, "second", "job", IMAGE, "eng");
    runtime.finish();
    assert.equal((await second).ok, true);
    sessions.release(2, "second");
});

test("release during a job lets another window proceed without allowing cross-owner cancellation", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    const first = sessions.recognize(1, "first", "job-one", IMAGE, "eng");
    assert.equal(sessions.release(1, "first"), true);
    const second = sessions.recognize(2, "second", "job-two", IMAGE, "fra");
    assert.equal(sessions.cancel(1, "first", "job-one"), false);
    assert.equal(sessions.releaseOwner(1), false);
    assert.deepEqual(await first, { ok: false, error: "cancelled" });
    await nextTurn();
    assert.equal(runtime.active?.owner, 2);
    assert.equal(sessions.cancel(1, "second", "job-two"), false);
    runtime.finish();
    assert.equal((await second).ok, true);
    sessions.releaseOwner(2);
});

test("a late unmount/release from the old modal cannot kill a new modal in the same window", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    const first = sessions.recognize(1, "old-modal", "old-job", IMAGE, "eng");
    const second = sessions.recognize(1, "new-modal", "new-job", IMAGE, "eng");
    assert.equal(sessions.release(1, "old-modal"), false);
    assert.equal(sessions.cancel(1, "old-modal", "old-job"), false);
    assert.deepEqual(await first, { ok: false, error: "cancelled" });
    await nextTurn();
    assert.equal(runtime.active?.id, "new-job");
    assert.equal(sessions.release(1, "old-modal"), false);
    runtime.finish();
    assert.equal((await second).ok, true);
    sessions.release(1, "new-modal");
});

test("only the newest of several overlapping modal sessions may start its queued job", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    const first = sessions.recognize(1, "one", "job-one", IMAGE, "eng");
    const second = sessions.recognize(1, "two", "job-two", IMAGE, "eng");
    const third = sessions.recognize(1, "three", "job-three", IMAGE, "eng");
    assert.deepEqual(await first, { ok: false, error: "cancelled" });
    assert.deepEqual(await second, { ok: false, error: "cancelled" });
    await nextTurn();
    assert.deepEqual(runtime.calls.map(call => call.id), ["job-one", "job-three"]);
    assert.equal(sessions.release(1, "two"), false);
    runtime.finish();
    assert.equal((await third).ok, true);
    sessions.release(1, "three");
});

test("expired idle worker ownership can transfer without a late former-owner release affecting it", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    const first = sessions.recognize(1, "first", "job", IMAGE, "eng");
    runtime.finish();
    await first;
    runtime.hasResources = false;
    const second = sessions.recognize(2, "second", "job", IMAGE, "eng");
    assert.equal(sessions.releaseOwner(1), false);
    runtime.finish();
    assert.equal((await second).ok, true);
    sessions.releaseOwner(2);
});

test("a resolved result is discarded when its session closes before delivery", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    const result = sessions.recognize(1, "closing", "job", IMAGE, "eng");
    runtime.finish();
    sessions.release(1, "closing");
    assert.deepEqual(await result, { ok: false, error: "cancelled" });
});

test("busy and malformed session requests do not replace the legitimate active owner", async () => {
    const runtime = new Runtime();
    const sessions = new OcrSessionManager(runtime);
    assert.deepEqual(await sessions.recognize(1, "bad/session", "job", IMAGE, "eng"), { ok: false, error: "invalid-request" });
    assert.equal(runtime.calls.length, 0);
    const first = sessions.recognize(1, "session", "first", IMAGE, "eng");
    assert.deepEqual(await sessions.recognize(1, "session", "second", IMAGE, "eng"), { ok: false, error: "busy" });
    assert.deepEqual(await sessions.recognize(2, "other", "third", IMAGE, "eng"), { ok: false, error: "busy" });
    assert.equal(sessions.cancel(1, "session", "second"), false);
    assert.equal(runtime.active?.id, "first");
    runtime.finish();
    assert.equal((await first).ok, true);
    sessions.releaseOwner(1);
});
