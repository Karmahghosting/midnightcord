/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkAbort, inspectFile } from "../imageOptimizer/engine";
import { planSize } from "../imageOptimizer/helpers";

/** Normalize orientation and transparency before passing bounded PNG bytes to native OCR. */
export async function prepareImage(file: Blob, signal: AbortSignal) {
    if (file.size > 12 * 1024 * 1024) throw new Error("ocr-image-limit");
    const info = await inspectFile(file, signal);
    if (info.width * info.height > 12_000_000) throw new Error("ocr-image-limit");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let canvas: HTMLCanvasElement | undefined;
    try {
        checkAbort(signal);
        if (bitmap.width * bitmap.height > 12_000_000) throw new Error("ocr-image-limit");
        const size = planSize(bitmap.width, bitmap.height, 4096);
        canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas-unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size.width, size.height);
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const png = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(result => result ? resolve(result) : reject(new Error("encode-failed")), "image/png"));
        checkAbort(signal);
        if (png.size > 12 * 1024 * 1024) throw new Error("ocr-image-limit");
        const bytes = new Uint8Array(await png.arrayBuffer());
        checkAbort(signal);
        return bytes;
    } finally {
        bitmap.close();
        if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
}
