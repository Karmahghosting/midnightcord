/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, dialog, IpcMainInvokeEvent } from "electron";
import { createWriteStream, WriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import fixWebmDuration from "fix-webm-duration";

// Polyfill FileReader side-effect for Node.js main process environment
if (typeof globalThis.FileReader === "undefined") {
    (globalThis as any).FileReader = class {
        onloadend: any = null;
        result: any = null;
        readAsArrayBuffer(blob: Blob) {
            blob.arrayBuffer().then(buf => {
                this.result = buf;
                if (this.onloadend) this.onloadend();
            }).catch(() => {});
        }
    };
}

let activeStream: WriteStream | null = null;
let activeTempPath: string | null = null;

/**
 * Opens a native folder picker via Electron dialog.
 */
export async function pickDirectory(_event: IpcMainInvokeEvent): Promise<string | null> {
    const res = await dialog.showOpenDialog({
        title: "Choose Save Folder",
        properties: ["openDirectory", "createDirectory"]
    });

    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
}

/**
 * Initializes a chunked stream recording directly to temp file on disk.
 */
export async function initStreamRecording(_event: IpcMainInvokeEvent, filename: string): Promise<boolean> {
    try {
        if (activeStream) {
            try { activeStream.destroy(); } catch { }
            activeStream = null;
        }
        const tempDir = path.join(app.getPath("temp"), "midnightcord-call-recordings");
        await mkdir(tempDir, { recursive: true });
        activeTempPath = path.join(tempDir, filename);
        activeStream = createWriteStream(activeTempPath, { flags: "w" });
        return true;
    } catch (e) {
        console.error("[AutoCallRecorder] Failed to init stream recording:", e);
        activeStream = null;
        activeTempPath = null;
        return false;
    }
}

/**
 * Appends a binary chunk directly to disk without holding it in JS heap.
 */
export async function appendRecordingChunk(_event: IpcMainInvokeEvent, chunk: Uint8Array): Promise<boolean> {
    try {
        if (activeStream && !activeStream.destroyed) {
            const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            // Respect WriteStream backpressure: await drain if write() returns false
            const canContinue = activeStream.write(buf);
            if (!canContinue) {
                await new Promise<void>(resolve => {
                    if (!activeStream || activeStream.destroyed) return resolve();
                    activeStream.once("drain", resolve);
                });
            }
            return true;
        }
        return false;
    } catch (e) {
        console.error("[AutoCallRecorder] Failed to write chunk:", e);
        return false;
    }
}

/**
 * Closes stream, patches EBML duration metadata with fixWebmDuration so the file is seekable,
 * then moves the recording to the target destination folder.
 */
export async function finalizeStreamRecording(
    _event: IpcMainInvokeEvent,
    folderPath: string | null,
    filename: string,
    durationMs = 0
): Promise<boolean> {
    try {
        if (activeStream) {
            await new Promise<void>(resolve => {
                if (!activeStream || activeStream.destroyed) return resolve();
                activeStream.end(() => resolve());
            });
            activeStream = null;
        }

        if (!activeTempPath) return false;
        const sourcePath = activeTempPath;
        activeTempPath = null;

        // Patche la durée EBML avec fixWebmDuration AVANT de déplacer le fichier
        if (durationMs > 0 && /\.(webm|mkv)$/i.test(filename)) {
            try {
                const rawBuf = await readFile(sourcePath);
                const blob = new Blob([rawBuf], { type: "video/webm" });
                const fixedBlob = await fixWebmDuration(blob, durationMs);
                const arrayBuffer = await fixedBlob.arrayBuffer();
                await writeFile(sourcePath, Buffer.from(arrayBuffer));
            } catch (err) {
                console.warn("[AutoCallRecorder] fixWebmDuration failed:", err);
            }
        }

        const defaultFolder = app.getPath("downloads");
        const targetFolder = folderPath && folderPath.trim() ? folderPath.trim() : defaultFolder;
        await mkdir(targetFolder, { recursive: true });

        const destPath = path.join(targetFolder, filename);
        try {
            await rename(sourcePath, destPath);
        } catch {
            await copyFile(sourcePath, destPath);
            await unlink(sourcePath).catch(() => { });
        }
        return true;
    } catch (e) {
        console.error("[AutoCallRecorder] Failed to finalize stream recording:", e);
        if (activeTempPath) {
            try { await unlink(activeTempPath); } catch { }
            activeTempPath = null;
        }
        return false;
    }
}

/**
 * Saves the recording buffer directly to the specified folder.
 */
export async function saveRecording(_event: IpcMainInvokeEvent, buffer: Uint8Array, folderPath: string, filename: string): Promise<boolean> {
    try {
        const defaultFolder = app.getPath("downloads");
        const targetFolder = folderPath && folderPath.trim() ? folderPath.trim() : defaultFolder;
        await mkdir(targetFolder, { recursive: true });
        const dest = path.join(targetFolder, filename);
        await writeFile(dest, buffer);
        return true;
    } catch (e) {
        console.error("Failed to save recording natively:", e);
        return false;
    }
}

/**
 * Prompts the user with a Save As dialog, then saves the buffer.
 */
export async function promptSaveRecording(_event: IpcMainInvokeEvent, buffer: Uint8Array, defaultFilename: string): Promise<boolean> {
    try {
        const res = await dialog.showSaveDialog({
            title: "Save Call Recording",
            defaultPath: defaultFilename,
            filters: [
                { name: "Video/Audio", extensions: ["webm", "mkv", "ogg"] },
                { name: "All Files", extensions: ["*"] }
            ]
        });

        if (res.canceled || !res.filePath) return false;
        
        await writeFile(res.filePath, buffer);
        return true;
    } catch (e) {
        console.error("Failed to prompt save recording natively:", e);
        return false;
    }
}
