/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const executablePath = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
].find(path => path && existsSync(path));
assert(executablePath, "Chrome/Edge/Chromium missing. Set CHROME_PATH to its executable.");

const workRoot = resolve(root, "..", "work", "image-optimizer-browser");
const { outputFiles } = await build({
    stdin: {
        contents: 'export * from "./engine"; export * from "./helpers"; export { prepareImage } from "../localOCR/prepare";',
        resolveDir: join(root, "src", "midnightcordplugins", "imageOptimizer"),
        loader: "ts"
    },
    bundle: true,
    format: "iife",
    globalName: "ImageOptimizerTest",
    platform: "browser",
    target: "chrome120",
    write: false
});
await mkdir(workRoot, { recursive: true });
const profileDirectory = await mkdtemp(join(workRoot, "profile-"));

let browser;
try {
    browser = await puppeteer.launch({
        executablePath,
        headless: true,
        userDataDir: profileDirectory,
        args: ["--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync", "--no-first-run"]
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const networkRequests = [];
    page.on("request", request => {
        const url = request.url();
        if (!/^https?:/.test(url)) { void request.continue(); return; }
        networkRequests.push(url);
        if (url === "https://cdn.discordapp.com/attachments/test/oversize.png") {
            void request.respond({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Length": String(20 * 1024 * 1024 + 1), "Content-Type": "image/png" }, body: "oversized declaration" });
        } else if (url === "https://cdn.discordapp.com/attachments/test/redirect.png") {
            void request.respond({ status: 302, headers: { "Access-Control-Allow-Origin": "*", Location: "https://example.invalid/not-allowed.png" } });
        } else {
            void request.abort("blockedbyclient");
        }
    });
    await page.setContent("<!doctype html><meta charset=utf-8><title>ImageOptimizer browser regression</title>");
    await page.addScriptTag({ content: outputFiles[0].text });
    const results = await page.evaluate(async () => {
        const { optimizeImage, inspectFile, inspectBytes, fetchDiscordImage, prepareImage, MAX_INPUT_PIXELS } = globalThis.ImageOptimizerTest;
        const results = [];
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const defaults = { maximum: 64, quality: 0.9, format: "image/png", background: "#ffffff" };
        const signal = () => new AbortController().signal;
        const encode = (canvas, mime = "image/png") => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Fixture encoding failed")), mime, 0.98));
        const ascii = value => new TextEncoder().encode(value);
        const concat = (...values) => {
            const output = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
            let offset = 0;
            for (const value of values) { output.set(value, offset); offset += value.length; }
            return output;
        };
        const crc32 = bytes => {
            let crc = 0xffffffff;
            for (const byte of bytes) {
                crc ^= byte;
                for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
            }
            return (crc ^ 0xffffffff) >>> 0;
        };
        const pngChunk = (type, data) => {
            const output = new Uint8Array(data.length + 12);
            const view = new DataView(output.buffer);
            view.setUint32(0, data.length);
            output.set(ascii(type), 4);
            output.set(data, 8);
            view.setUint32(output.length - 4, crc32(output.subarray(4, output.length - 4)));
            return output;
        };
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 48;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f02632";
        context.fillRect(0, 0, 48, 48);
        context.fillStyle = "#1735e0";
        context.fillRect(48, 0, 48, 48);
        const png = await encode(canvas);
        const jpeg = await encode(canvas, "image/jpeg");
        const makeOrientedJpeg = async () => {
            const exif = new Uint8Array(32);
            exif.set(ascii("Exif\0\0II"));
            const view = new DataView(exif.buffer);
            view.setUint16(8, 42, true);
            view.setUint32(10, 8, true);
            view.setUint16(14, 1, true);
            view.setUint16(16, 0x112, true);
            view.setUint16(18, 3, true);
            view.setUint32(20, 1, true);
            view.setUint16(24, 6, true);
            const segment = new Uint8Array(exif.length + 4);
            segment.set([255, 225]);
            new DataView(segment.buffer).setUint16(2, exif.length + 2);
            segment.set(exif, 4);
            const bytes = new Uint8Array(await jpeg.arrayBuffer());
            return concat(bytes.subarray(0, 2), segment, bytes.subarray(2));
        };
        const originalCreateBitmap = globalThis.createImageBitmap.bind(globalThis);
        const liveBitmaps = new Set();
        let decoded = 0;
        let peakBitmaps = 0;
        globalThis.createImageBitmap = async (...args) => {
            const bitmap = await originalCreateBitmap(...args);
            decoded++;
            liveBitmaps.add(bitmap);
            peakBitmaps = Math.max(peakBitmaps, liveBitmaps.size);
            const close = bitmap.close.bind(bitmap);
            bitmap.close = () => { liveBitmaps.delete(bitmap); close(); };
            return bitmap;
        };
        const pixel = async (blob, x, y) => {
            const bitmap = await originalCreateBitmap(blob);
            const sample = document.createElement("canvas");
            sample.width = bitmap.width;
            sample.height = bitmap.height;
            const context = sample.getContext("2d");
            context.drawImage(bitmap, 0, 0);
            const result = [...context.getImageData(x, y, 1, 1).data];
            bitmap.close();
            sample.width = sample.height = 0;
            return result;
        };
        async function test(name, action) {
            const started = performance.now();
            try {
                await action();
                check(liveBitmaps.size === 0, "Leaked ImageBitmap");
                results.push({ name, passed: true, ms: Math.round(performance.now() - started) });
            } catch (error) {
                results.push({ name, passed: false, error: String(error?.stack || error) });
            }
        }

        await test("real PNG/JPEG/WebP encoders produce declared MIME, dimensions and valid images", async () => {
            for (const format of ["image/png", "image/jpeg", "image/webp"]) {
                const result = await optimizeImage(png, { ...defaults, format }, signal());
                check(result.mime === format && result.blob.type === format && !result.fallback, `Wrong encoder format: ${format}`);
                check(result.width === 64 && result.height === 32 && result.blob.size > 0, "Wrong output dimensions or empty file");
                const info = await inspectFile(result.blob, signal());
                check(info.width === 64 && info.height === 32 && info.mime === format, "Encoded header disagrees with result");
                check((await pixel(result.blob, 8, 8))[0] > 180, "Encoded image pixels differ unexpectedly");
            }
        });

        await test("small images are never upscaled", async () => {
            const result = await optimizeImage(png, { ...defaults, maximum: 1920 }, signal());
            check(result.width === 96 && result.height === 48, "Small image was enlarged");
        });

        await test("a real 12-megapixel image is reduced to the requested 1920px bound", async () => {
            const large = document.createElement("canvas");
            large.width = 4000;
            large.height = 3000;
            const context = large.getContext("2d");
            const gradient = context.createLinearGradient(0, 0, 4000, 3000);
            gradient.addColorStop(0, "#cf263b");
            gradient.addColorStop(1, "#2940d2");
            context.fillStyle = gradient;
            context.fillRect(0, 0, 4000, 3000);
            const file = await encode(large, "image/jpeg");
            large.width = large.height = 0;
            const result = await optimizeImage(file, { ...defaults, maximum: 1920, format: "image/webp" }, signal());
            check(result.originalWidth === 4000 && result.originalHeight === 3000 && result.width === 1920 && result.height === 1440, "Large image bounds incorrect");
            check(result.blob.size > 0, "Large image output is empty");
        });

        await test("concurrent optimization requests keep only one engine bitmap alive", async () => {
            peakBitmaps = 0;
            const outputs = await Promise.all([optimizeImage(png, defaults, signal()), optimizeImage(jpeg, { ...defaults, format: "image/webp" }, signal())]);
            check(outputs.every(output => output.width === 64), "Concurrent queue returned invalid outputs");
            check(peakBitmaps === 1, "Concurrent requests overlapped image decodes");
        });

        await test("PNG/WebP retain alpha and JPEG uses the selected white or black background", async () => {
            const transparent = document.createElement("canvas");
            transparent.width = transparent.height = 32;
            transparent.getContext("2d").fillRect(0, 0, 8, 8);
            const file = await encode(transparent);
            for (const format of ["image/png", "image/webp"]) {
                const result = await optimizeImage(file, { ...defaults, format }, signal());
                check((await pixel(result.blob, 24, 24))[3] === 0, `${format} lost transparency`);
            }
            for (const background of ["#ffffff", "#000000"]) {
                const result = await optimizeImage(file, { ...defaults, format: "image/jpeg", background }, signal());
                const rgba = await pixel(result.blob, 24, 24);
                check(rgba[3] === 255, "JPEG should be opaque");
                check(background === "#ffffff" ? rgba.slice(0, 3).every(v => v > 240) : rgba.slice(0, 3).every(v => v < 15), "JPEG background differs from requested color");
            }
        });

        await test("actual source PNG text metadata is not copied by canvas", async () => {
            const bytes = new Uint8Array(await png.arrayBuffer());
            const sentinel = "PRIVATE-LOCATION-TEST-ONLY";
            const withText = concat(bytes.subarray(0, 33), pngChunk("tEXt", ascii(`Comment\0${sentinel}`)), bytes.subarray(33));
            check(inspectBytes(withText).sourceMetadata, "Metadata fixture not detected");
            const result = await optimizeImage(new Blob([withText], { type: "image/png" }), defaults, signal());
            const output = new Uint8Array(await result.blob.arrayBuffer());
            check(!inspectBytes(output).sourceMetadata, "Source text metadata survived encoding");
            check(!new TextDecoder().decode(output).includes(sentinel), "Private metadata marker survived encoding");
        });

        await test("JPEG EXIF orientation is applied to pixels and EXIF is not copied", async () => {
            const source = await makeOrientedJpeg();
            check(inspectBytes(source).sourceMetadata, "EXIF fixture not detected");
            const result = await optimizeImage(new Blob([source], { type: "image/jpeg" }), { ...defaults, format: "image/jpeg" }, signal());
            check(result.originalWidth === 48 && result.originalHeight === 96 && result.width === 32 && result.height === 64, "EXIF rotation was not honored");
            check(!inspectBytes(new Uint8Array(await result.blob.arrayBuffer())).sourceMetadata, "EXIF survived re-encoding");
            const top = await pixel(result.blob, 16, 8);
            const bottom = await pixel(result.blob, 16, 56);
            check(top[0] > top[2] && bottom[2] > bottom[0], "EXIF rotation pixel order is incorrect");
        });

        await test("animated PNG and oversized dimensions are rejected before decoding", async () => {
            const bytes = new Uint8Array(await png.arrayBuffer());
            const animated = concat(bytes.subarray(0, 33), pngChunk("acTL", new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0])), bytes.subarray(33));
            const large = bytes.slice();
            new DataView(large.buffer).setUint32(16, MAX_INPUT_PIXELS + 1);
            const before = decoded;
            for (const [data, expected] of [[animated, "animation-unsupported"], [large, "image-too-large"]]) {
                let error;
                try { await optimizeImage(new Blob([data], { type: "image/png" }), defaults, signal()); } catch (reason) { error = reason; }
                check(error?.message === expected, `Expected ${expected}, received ${String(error)}`);
            }
            check(decoded === before, "Rejected headers reached browser decoder");
        });

        await test("a corrupt compressed image rejects cleanly and leaves the queue usable", async () => {
            const bytes = new Uint8Array(await png.arrayBuffer());
            const view = new DataView(bytes.buffer);
            for (let offset = 8; offset + 12 <= bytes.length;) {
                const length = view.getUint32(offset);
                const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
                if (type === "IDAT") {
                    bytes.fill(0, offset + 8, offset + 8 + length);
                    view.setUint32(offset + 8 + length, crc32(bytes.subarray(offset + 4, offset + 8 + length)));
                }
                offset += length + 12;
            }
            let rejected = false;
            try { await optimizeImage(new Blob([bytes], { type: "image/png" }), defaults, signal()); } catch { rejected = true; }
            check(rejected, "Corrupt compressed pixels were accepted");
            check((await optimizeImage(png, defaults, signal())).width === 64, "Queue did not recover from failed decode");
        });

        await test("cancellation before decode and during encoding releases ImageBitmaps", async () => {
            const controller = new AbortController();
            controller.abort();
            const before = decoded;
            let firstError;
            try { await optimizeImage(png, defaults, controller.signal); } catch (error) { firstError = error; }
            check(firstError?.name === "AbortError" && decoded === before, "Cancelled job was decoded");
            const during = new AbortController();
            const original = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
                return original.call(this, blob => { during.abort(); callback(blob); }, ...args);
            };
            try {
                let error;
                try { await optimizeImage(png, defaults, during.signal); } catch (reason) { error = reason; }
                check(error?.name === "AbortError", "Mid-encode cancellation was ignored");
            } finally { HTMLCanvasElement.prototype.toBlob = original; }
        });

        await test("encoder failure closes its bitmap and requested MIME fallback remains truthful", async () => {
            const original = HTMLCanvasElement.prototype.toBlob;
            try {
                HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
                let failure;
                try { await optimizeImage(png, defaults, signal()); } catch (error) { failure = error; }
                check(failure?.message === "encode-failed", "Null encoder output was accepted");
                check(liveBitmaps.size === 0, "Failed encode leaked bitmap");
                HTMLCanvasElement.prototype.toBlob = function (callback) { return original.call(this, callback, "image/png"); };
                const result = await optimizeImage(png, { ...defaults, format: "image/webp" }, signal());
                check(result.mime === "image/png" && result.extension === "png" && result.fallback, "PNG fallback was mislabeled as requested WebP");
            } finally { HTMLCanvasElement.prototype.toBlob = original; }
        });

        await test("actual fetch refuses oversized CDN response headers and redirects", async () => {
            let oversized;
            try { await fetchDiscordImage("https://cdn.discordapp.com/attachments/test/oversize.png", signal()); } catch (error) { oversized = error; }
            check(oversized?.message === "file-too-large", `Oversized response was not rejected: ${String(oversized)}`);
            let redirected = false;
            try { await fetchDiscordImage("https://cdn.discordapp.com/attachments/test/redirect.png", signal()); } catch { redirected = true; }
            check(redirected, "Remote redirect was followed");
        });

        await test("OCR prepares bounded PNG bytes, white transparency and a maximum 4096px edge", async () => {
            const transparent = document.createElement("canvas");
            transparent.width = transparent.height = 32;
            const bytes = await prepareImage(await encode(transparent), signal());
            const info = inspectBytes(bytes);
            check(bytes instanceof Uint8Array && bytes.byteLength <= 12 * 1024 * 1024 && info.mime === "image/png", "OCR did not return bounded PNG bytes");
            check(info.width === 32 && info.height === 32, "OCR upscaled a small image");
            check((await pixel(new Blob([bytes], { type: "image/png" }), 16, 16)).every(value => value === 255), "OCR transparency was not flattened to white");
            transparent.width = 5000;
            transparent.height = 1000;
            transparent.getContext("2d").fillRect(0, 0, 5000, 1000);
            const resized = inspectBytes(await prepareImage(await encode(transparent), signal()));
            check(resized.width === 4096 && resized.height === 819, "OCR long-edge limit or aspect ratio is incorrect");
            transparent.width = transparent.height = 0;
        });

        await test("OCR normalizes JPEG EXIF orientation into correctly ordered PNG pixels", async () => {
            const bytes = await prepareImage(new Blob([await makeOrientedJpeg()], { type: "image/jpeg" }), signal());
            const info = inspectBytes(bytes);
            check(info.mime === "image/png" && info.width === 48 && info.height === 96 && !info.sourceMetadata, "OCR EXIF orientation or PNG normalization failed");
            const file = new Blob([bytes], { type: "image/png" });
            const top = await pixel(file, 24, 8);
            const bottom = await pixel(file, 24, 88);
            check(top[0] > top[2] && bottom[2] > bottom[0], "OCR normalized image has incorrect orientation");
        });

        await test("OCR rejects 12MiB/12MP limits before decode and releases bitmaps on cancellation", async () => {
            const oversizedDimensions = new Uint8Array(await png.arrayBuffer());
            const view = new DataView(oversizedDimensions.buffer);
            view.setUint32(16, 4000);
            view.setUint32(20, 3001);
            const before = decoded;
            for (const blob of [new Blob([new Uint8Array(12 * 1024 * 1024 + 1)]), new Blob([oversizedDimensions], { type: "image/png" })]) {
                let failure;
                try { await prepareImage(blob, signal()); } catch (error) { failure = error; }
                check(failure?.message === "ocr-image-limit", "OCR pre-decode limit did not reject the image");
            }
            const cancelled = new AbortController();
            cancelled.abort();
            let preCancelled;
            try { await prepareImage(png, cancelled.signal); } catch (error) { preCancelled = error; }
            check(preCancelled?.name === "AbortError" && decoded === before, "OCR cancelled or oversized job reached the decoder");
            const during = new AbortController();
            const original = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
                return original.call(this, blob => { during.abort(); callback(blob); }, ...args);
            };
            try {
                let error;
                try { await prepareImage(png, during.signal); } catch (reason) { error = reason; }
                check(error?.name === "AbortError", "OCR mid-encode cancellation was ignored");
            } finally { HTMLCanvasElement.prototype.toBlob = original; }
        });

        globalThis.createImageBitmap = originalCreateBitmap;
        canvas.width = canvas.height = 0;
        return results;
    });
    console.log(`Browser: ${await browser.version()}`);
    for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.passed ? ` (${result.ms} ms)` : `\n${result.error}`}`);
    assert(networkRequests.every(url => url.startsWith("https://cdn.discordapp.com/attachments/test/")), "An unexpected network request was attempted");
    assert.equal(networkRequests.length, 2, "Expected only the two intercepted CDN mock requests");
    assert(results.every(result => result.passed), "ImageOptimizer browser regression failed");
    console.log(`ImageOptimizer + OCR preparation: ${results.length}/${results.length} real-browser checks passed. No external request was sent.`);
} finally {
    await browser?.close();
    const base = await realpath(workRoot);
    const target = await realpath(profileDirectory);
    assert(target.startsWith(base + sep) && dirname(target) === base, "Refusing to remove a profile outside the test workspace");
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
