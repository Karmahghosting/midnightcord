/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkDimensions, discordImageUrl, ImageMime, inspectBytes, MAX_INPUT_BYTES, outputFormat, planSize } from "./helpers";

export interface OptimizeOptions {
    maximum: number;
    quality: number;
    format: ImageMime;
    background: "#ffffff" | "#000000";
}

let queue: Promise<unknown> = Promise.resolve();

export function checkAbort(signal: AbortSignal) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
}

export async function inspectFile(file: Blob, signal: AbortSignal) {
    checkAbort(signal);
    if (!file.size || file.size > MAX_INPUT_BYTES) throw new Error("file-too-large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    checkAbort(signal);
    return inspectBytes(bytes);
}

export async function fetchDiscordImage(url: string, signal: AbortSignal): Promise<File> {
    const safeUrl = discordImageUrl(url);
    if (!safeUrl) throw new Error("unsupported-url");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 30_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
        checkAbort(signal);
        const response = await fetch(safeUrl, { signal: controller.signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
        if (!response.ok || !response.body) throw new Error("download-failed");
        const contentLength = Number(response.headers.get("Content-Length"));
        if (contentLength > MAX_INPUT_BYTES) throw new Error("file-too-large");
        reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            checkAbort(signal);
            if (done) break;
            size += value.byteLength;
            if (size > MAX_INPUT_BYTES) throw new Error("file-too-large");
            chunks.push(new Uint8Array(value));
        }
        const file = new File(chunks, decodeURIComponent(new URL(safeUrl).pathname.split("/").pop() || "image"), { type: response.headers.get("Content-Type") || "application/octet-stream" });
        await inspectFile(file, signal);
        return file;
    } finally {
        controller.abort();
        await reader?.cancel().catch(() => { });
        signal.removeEventListener("abort", abort);
        clearTimeout(timer);
    }
}

async function processImage(file: Blob, options: OptimizeOptions, signal: AbortSignal) {
    const info = await inspectFile(file, signal);
    if (!Number.isFinite(options.quality) || options.quality < 0.1 || options.quality > 1) throw new Error("invalid-quality");
    if (!["image/png", "image/jpeg", "image/webp"].includes(options.format)) throw new Error("unsupported-format");
    if (options.background !== "#ffffff" && options.background !== "#000000") throw new Error("invalid-background");
    planSize(info.width, info.height, options.maximum);
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let canvas: HTMLCanvasElement | undefined;
    try {
        checkAbort(signal);
        checkDimensions(bitmap.width, bitmap.height);
        const size = planSize(bitmap.width, bitmap.height, options.maximum);
        canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas-unavailable");
        if (options.format === "image/jpeg") {
            context.fillStyle = options.background;
            context.fillRect(0, 0, size.width, size.height);
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(result => result ? resolve(result) : reject(new Error("encode-failed")), options.format, options.quality));
        checkAbort(signal);
        const format = outputFormat(blob.type, options.format);
        return { blob, ...size, originalWidth: bitmap.width, originalHeight: bitmap.height, ...format };
    } finally {
        bitmap.close();
        if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
}

export function optimizeImage(file: Blob, options: OptimizeOptions, signal: AbortSignal) {
    const configuration = { ...options };
    const job = queue.then(() => { checkAbort(signal); return processImage(file, configuration, signal); });
    queue = job.catch(() => { });
    return job;
}
