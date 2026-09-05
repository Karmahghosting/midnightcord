/*
 * Offline smoke tests for the packaged OCR worker and its resource lifecycle
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { deflateSync } from "node:zlib";

import { build } from "esbuild";

import { prepareLocalOcr } from "./build/localOcr.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workRoot = resolve(rootDir, "../work/validation");
await mkdir(workRoot, { recursive: true });
const temporary = await mkdtemp(join(workRoot, "local-ocr-smoke-"));
const sha256 = data => createHash("sha256").update(data).digest("hex");
const runtimes = [];
const workers = [];

function pngFixture() {
    const glyphs = {
        H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
        E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
        L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
        O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"]
    };
    const text = "HELLO";
    const scale = 8;
    const width = text.length * 6 * scale + 40;
    const height = 7 * scale + 40;
    const stride = width * 3 + 1;
    const pixels = Buffer.alloc(stride * height, 255);
    for (let y = 0; y < height; y++) pixels[y * stride] = 0;
    for (let i = 0; i < text.length; i++) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        if (glyphs[text[i]][y][x] !== "1") continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const offset = (20 + y * scale + dy) * stride + 1 + (20 + i * 6 * scale + x * scale + dx) * 3;
            pixels.fill(0, offset, offset + 3);
        }
    }
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        let crc = 0xffffffff;
        for (const byte of body) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        const result = Buffer.alloc(data.length + 12);
        result.writeUInt32BE(data.length);
        body.copy(result, 4);
        result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
        return result;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

async function stopped(worker) {
    if (worker.threadId !== -1) await once(worker, "exit", { signal: AbortSignal.timeout(5000) });
    assert.equal(worker.threadId, -1);
}

try {
    const packaged = await prepareLocalOcr({ outputRoot: temporary });
    const directory = packaged.destinations[0];
    const png = pngFixture();
    const bundled = await build({
        stdin: {
            contents: 'export { OcrRuntime } from "./src/midnightcordplugins/localOCR/runtime.ts"; export { observations } from "node:worker_threads";',
            resolveDir: rootDir,
            sourcefile: "local-ocr-runtime-test.mjs"
        },
        absWorkingDir: rootDir,
        platform: "node",
        format: "esm",
        bundle: true,
        write: false,
        plugins: [{
            name: "observe-real-workers",
            setup(build) {
                build.onResolve({ filter: /^node:worker_threads$/ }, () => ({ path: "worker-observer", namespace: "test-worker" }));
                build.onResolve({ filter: /^test:real-worker_threads$/ }, () => ({ path: "node:worker_threads", external: true }));
                build.onLoad({ filter: /.*/, namespace: "test-worker" }, () => ({ contents: `
                    import { Worker as NativeWorker } from "test:real-worker_threads";
                    export const observations = { workers: [], onCommand: undefined };
                    export class Worker extends NativeWorker {
                        constructor(...args) { super(...args); observations.workers.push(this); }
                        postMessage(packet, ...args) {
                            super.postMessage(packet, ...args);
                            observations.onCommand?.(packet, this);
                        }
                    }
                ` }));
            }
        }]
    });
    const { OcrRuntime, observations } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
    const runtime = (idleMs = 60_000, timeoutMs = 15_000) => {
        const instance = new OcrRuntime(async () => directory, idleMs, timeoutMs);
        runtimes.push(instance);
        return instance;
    };
    const readable = result => {
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.match(result.text, /^HELLO\s*$/);
        assert.ok(result.confidence >= 0 && result.confidence <= 100);
        assert.equal(result.truncated, false);
    };

    await test("packaged assets are identical, hashed and contain no duplicate embedded WASM", async () => {
        const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
        assert.equal(manifest.version, sha256(JSON.stringify(manifest.files)));
        assert.equal(manifest.files.some(file => file.path.endsWith(".wasm.js")), false);
        assert.equal(manifest.files.filter(file => file.path.endsWith(".wasm")).length, 6);
        for (const destination of packaged.destinations) for (const file of manifest.files) {
            assert.equal(sha256(await readFile(join(destination, file.path))), file.sha256, file.path);
        }
        assert.equal(await readFile(join(directory, "manifest.json"), "utf8"), await readFile(join(packaged.destinations[1], "manifest.json"), "utf8"));
    });

    await test("cold and warm PNG recognition reuse one worker, idle frees it, next use restarts it", async () => {
        const ocr = runtime(50);
        const before = observations.workers.length;
        readable(await ocr.recognize(1, "cold", png, "fra+eng"));
        const firstWorker = observations.workers[before];
        readable(await ocr.recognize(1, "warm", png, "fra+eng"));
        assert.equal(observations.workers.length, before + 1);
        await stopped(firstWorker);
        readable(await ocr.recognize(1, "after-idle", png, "fra+eng"));
        assert.equal(observations.workers.length, before + 2);
        ocr.cancel(1);
        await stopped(observations.workers[before + 1]);
    });

    await test("model loading is physically cancellable and concurrent or foreign requests cannot interfere", async () => {
        const ocr = runtime();
        let cancellation;
        let busy;
        const before = observations.workers.length;
        observations.onCommand = packet => {
            if (packet.action !== "loadLanguage") return;
            observations.onCommand = undefined;
            busy = ocr.recognize(2, "competing", png, "eng");
            assert.equal(ocr.cancel(2, "loading"), false);
            assert.equal(ocr.cancel(1, "wrong-id"), false);
            cancellation = ocr.cancel(1, "loading");
        };
        assert.deepEqual(await ocr.recognize(1, "loading", png, "fra+eng"), { ok: false, error: "cancelled" });
        assert.equal(cancellation, true);
        assert.deepEqual(await busy, { ok: false, error: "busy" });
        await stopped(observations.workers[before]);
        readable(await ocr.recognize(1, "recovered", png, "eng"));
        ocr.cancel(1);
        await stopped(observations.workers.at(-1));
    });

    await test("initialization timeout terminates the worker and invalid input starts none", async () => {
        const ocr = runtime(60_000, 1);
        const before = observations.workers.length;
        assert.deepEqual(await ocr.recognize(1, "timeout", png, "eng"), { ok: false, error: "timeout" });
        assert.equal(observations.workers.length, before + 1);
        await stopped(observations.workers[before]);
        assert.deepEqual(await ocr.recognize(1, "invalid", Buffer.from("not a PNG"), "eng"), { ok: false, error: "invalid-image" });
        assert.equal(observations.workers.length, before + 1);
    });

    await test("the packaged worker rejects remote model loading and emits no console output", async () => {
        const worker = new Worker(join(directory, "worker.cjs"), { stdout: true, stderr: true });
        workers.push(worker);
        const output = [];
        worker.stdout.on("data", chunk => output.push(chunk.toString()));
        worker.stderr.on("data", chunk => output.push(chunk.toString()));
        let sequence = 0;
        const command = (action, payload) => new Promise((resolve, reject) => {
            const jobId = String(++sequence);
            const finish = (error, data) => {
                clearTimeout(timeout);
                worker.off("message", receive);
                worker.off("error", fail);
                error ? reject(error) : resolve(data);
            };
            const fail = error => finish(error);
            const receive = message => {
                if (message.jobId !== jobId) return;
                if (message.status === "resolve") finish(null, message.data);
                if (message.status === "reject") finish(new Error(String(message.data)));
            };
            const timeout = setTimeout(() => finish(new Error("Worker response timeout")), 15_000);
            worker.on("message", receive);
            worker.on("error", fail);
            worker.postMessage({ workerId: "offline-test", jobId, action, payload });
        });
        try {
            await command("load", { options: { lstmOnly: true, logging: false } });
            await assert.rejects(command("loadLanguage", { langs: "eng", options: { langPath: "https://local-ocr.invalid", cacheMethod: "none", gzip: true, lstmOnly: true } }), /Network disabled/);
        } finally {
            await worker.terminate();
        }
        assert.deepEqual(output, []);
    });
    workers.push(...observations.workers);
} finally {
    for (const runtime of runtimes) runtime.cancel(1);
    await Promise.all(workers.map(worker => worker.terminate()));
    const child = relative(workRoot, temporary);
    if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`) || !basename(temporary).startsWith("local-ocr-smoke-")) {
        throw new Error("Refusing to remove a test directory outside its workspace.");
    }
    await rm(temporary, { recursive: true, force: true });
}
