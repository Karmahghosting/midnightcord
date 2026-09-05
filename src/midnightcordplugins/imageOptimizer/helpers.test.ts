/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { discordImageUrl, inspectBytes, MAX_INPUT_BYTES, outputFormat, outputName, planSize } from "./helpers";

function png(width: number, height: number, extra: string[] = []) {
    const chunks = ["IHDR", ...extra, "IEND"].map(type => {
        const length = type === "IHDR" ? 13 : 0;
        const chunk = new Uint8Array(length + 12);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, length);
        chunk.set(new TextEncoder().encode(type), 4);
        if (type === "IHDR") { view.setUint32(8, width); view.setUint32(12, height); chunk[16] = 8; chunk[17] = 6; }
        return chunk;
    });
    const bytes = new Uint8Array(8 + chunks.reduce((size, chunk) => size + chunk.length, 0));
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    let offset = 8;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
}

function webp(flags: number, width = 320, height = 240) {
    const bytes = new Uint8Array(30);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode("RIFF"));
    view.setUint32(4, 22, true);
    bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
    view.setUint32(16, 10, true);
    bytes[20] = flags;
    for (let i = 0; i < 3; i++) { bytes[24 + i] = (width - 1) >> (8 * i); bytes[27 + i] = (height - 1) >> (8 * i); }
    return bytes;
}

test("planning bounds the long side, preserves portrait shape and never upscales", () => {
    assert.deepEqual(planSize(4000, 3000, 1920), { width: 1920, height: 1440 });
    assert.deepEqual(planSize(1000, 2000, 1000), { width: 500, height: 1000 });
    assert.deepEqual(planSize(100, 80, 1920), { width: 100, height: 80 });
    assert.deepEqual(planSize(1, 16000, 64), { width: 1, height: 64 });
    assert.throws(() => planSize(5000, 5000, 1920), /image-too-large/);
    for (const maximum of [NaN, Infinity, 0, 12, 64.5, 4097]) assert.throws(() => planSize(100, 100, maximum), /invalid-size/);
});

test("static PNG dimensions, transparency and source metadata are identified before decode", () => {
    assert.deepEqual(inspectBytes(png(640, 480, ["eXIf", "iTXt"])), { mime: "image/png", width: 640, height: 480, alpha: true, sourceMetadata: true });
    assert.equal(inspectBytes(png(1, 1)).sourceMetadata, false);
});

test("animation is rejected rather than silently flattened", () => {
    assert.throws(() => inspectBytes(png(1, 1, ["acTL"])), /animation-unsupported/);
    assert.throws(() => inspectBytes(webp(2)), /animation-unsupported/);
    assert.throws(() => inspectBytes(new TextEncoder().encode("GIF89a1234567890")), /animation-unsupported/);
});

test("oversized, truncated and unsupported input fails before browser decoding", () => {
    assert.throws(() => inspectBytes(png(4001, 4000)), /image-too-large/);
    assert.throws(() => inspectBytes(png(640, 480).slice(0, 30)), /invalid-image/);
    assert.throws(() => inspectBytes(new Uint8Array(MAX_INPUT_BYTES + 1)), /file-too-large/);
    assert.throws(() => inspectBytes(new TextEncoder().encode("<svg>anything</svg>")), /unsupported-format/);
    const malformed = webp(0);
    malformed[16] = 255;
    assert.throws(() => inspectBytes(malformed), /invalid-image/);
    assert.throws(() => inspectBytes(png(1, 1, Array(8193).fill("tEXt"))), /invalid-image/);
});

test("extended WebP canvas cannot conceal an oversized encoded frame", () => {
    const bytes = new Uint8Array(48);
    bytes.set(webp(0, 320, 240));
    const view = new DataView(bytes.buffer);
    view.setUint32(4, 40, true);
    bytes.set(new TextEncoder().encode("VP8 "), 30);
    view.setUint32(34, 10, true);
    bytes.set([0x9d, 1, 0x2a], 41);
    view.setUint16(44, 5000, true);
    view.setUint16(46, 5000, true);
    assert.throws(() => inspectBytes(bytes), /image-too-large/);
});

test("JPEG size and EXIF presence are read without decoding the image", () => {
    const bytes = Uint8Array.from([255, 216, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, 255, 192, 0, 8, 8, 1, 224, 2, 128, 3, 255, 218, 0, 2]);
    assert.deepEqual(inspectBytes(bytes), { mime: "image/jpeg", width: 640, height: 480, alpha: false, sourceMetadata: true });
});

test("unsupported encoder format fallback keeps the actual MIME and file extension", () => {
    assert.deepEqual(outputFormat("image/png", "image/webp"), { mime: "image/png", extension: "png", fallback: true });
    assert.equal(outputName("photo.jpeg", "image/webp"), "photo-optimisee.webp");
    assert.equal(outputName("photo.jpeg", "image/png"), "photo-optimisee.png");
    assert.throws(() => outputFormat("image/gif", "image/jpeg"), /encode-failed/);
});

test("remote sources are exact Discord CDN HTTPS URLs without credentials or redirects", () => {
    assert.equal(discordImageUrl("https://cdn.discordapp.com/attachments/1/2/photo.png?ex=abc"), "https://cdn.discordapp.com/attachments/1/2/photo.png?ex=abc");
    for (const url of ["http://cdn.discordapp.com/attachments/x", "https://cdn.discordapp.com.evil.test/attachments/x", "https://user:secret@cdn.discordapp.com/attachments/x", "https://cdn.discordapp.com:8443/attachments/x", "https://media.discordapp.net/external/x/https/private.test/a.png", "file:///C:/secret.png", "https://127.0.0.1/image.png"]) assert.equal(discordImageUrl(url), null);
});
