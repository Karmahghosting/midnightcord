/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { OcrResult, OcrRuntime } from "./runtime";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8bkAAAAASUVORK5CYII=", "base64"));

async function within(operation: Promise<OcrResult>) {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error("Operation remained stuck on assets")), 500);
        })]);
    } finally { clearTimeout(deadline); }
}

test("cancel during asset preparation settles immediately and releases the active slot", async () => {
    let resolveAssets!: (directory: string) => void;
    const assets = new Promise<string>(resolve => { resolveAssets = resolve; });
    const runtime = new OcrRuntime(() => assets);
    const first = runtime.recognize(1, "first", PNG, "eng");
    assert.equal(runtime.cancel(2, "first"), false);
    assert.equal(runtime.cancel(1, "first"), true);
    assert.deepEqual(await within(first), { ok: false, error: "cancelled" });
    const second = runtime.recognize(2, "second", PNG, "eng");
    assert.equal(runtime.cancel(1, "second"), false);
    assert.equal(runtime.cancel(2, "second"), true);
    assert.deepEqual(await within(second), { ok: false, error: "cancelled" });
    resolveAssets("late-assets-must-not-start-a-worker");
    await new Promise(resolve => setTimeout(resolve, 20));
});

test("timeout during stalled asset preparation settles and permits a later request", async () => {
    const runtime = new OcrRuntime(() => new Promise<string>(() => { }), 60_000, 10);
    assert.deepEqual(await within(runtime.recognize(1, "timeout", PNG, "eng")), { ok: false, error: "timeout" });
    const next = runtime.recognize(1, "retry", PNG, "fra");
    runtime.cancel(1, "retry");
    assert.deepEqual(await within(next), { ok: false, error: "cancelled" });
});
