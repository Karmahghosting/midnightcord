/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchDiscordImage, optimizeImage } from "./engine";
import { MAX_INPUT_BYTES } from "./helpers";

test("untrusted remote URLs are rejected without any request", async () => {
    const originalFetch = globalThis.fetch;
    let requested = false;
    globalThis.fetch = async () => { requested = true; throw new Error("unexpected"); };
    try {
        await assert.rejects(fetchDiscordImage("https://example.com/image.png", new AbortController().signal), /unsupported-url/);
        assert.equal(requested, false);
    } finally { globalThis.fetch = originalFetch; }
});

test("download refuses oversized declarations and omits credentials and redirects", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
        assert.equal(options?.credentials, "omit");
        assert.equal(options?.redirect, "error");
        assert.equal(options?.referrerPolicy, "no-referrer");
        return new Response("data", { headers: { "Content-Length": String(MAX_INPUT_BYTES + 1) } });
    };
    try {
        await assert.rejects(fetchDiscordImage("https://cdn.discordapp.com/attachments/1/2/image.png", new AbortController().signal), /file-too-large/);
    } finally { globalThis.fetch = originalFetch; }
});

test("download caps streams even when Content-Length is missing", async () => {
    const originalFetch = globalThis.fetch;
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(MAX_INPUT_BYTES)); controller.enqueue(new Uint8Array(1)); },
        cancel() { cancelled = true; }
    }));
    try {
        await assert.rejects(fetchDiscordImage("https://cdn.discordapp.com/attachments/1/2/image.png", new AbortController().signal), /file-too-large/);
        assert.equal(cancelled, true);
    } finally { globalThis.fetch = originalFetch; }
});

test("cancelled queued jobs never decode an image", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(optimizeImage(new Blob(["unused"]), { maximum: 1920, quality: 0.85, format: "image/webp", background: "#ffffff" }, controller.signal), error => error instanceof DOMException && error.name === "AbortError");
});
