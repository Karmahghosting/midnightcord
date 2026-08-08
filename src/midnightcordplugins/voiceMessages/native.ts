/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { readFile, rm } from "fs/promises";
import { basename, normalize, sep } from "path";

export async function readRecording(_: any, filePath: string) {
    filePath = normalize(filePath);
    const filename = basename(filePath);

    // Some versions of Discord voice module may generate files with unexpected names.
    // We check for common extensions, but don't strictly return null if it fails,
    // to ensure compatibility across different Discord host environments.
    if (!/\.(ogg|wav|webm|mp4)$/i.test(filename)) {
        console.warn("[VoiceMessages] readRecording: unexpected extension for", filename);
    }

    try {
        const buf = await readFile(filePath);
        // Clean up the temporary recording file
        rm(filePath).catch(() => { });
        // Return an array so Electron IPC contextBridge serializes it perfectly
        return Array.from(buf);
    } catch (e) {
        console.error("[VoiceMessages] readRecording error:", e);
        return null;
    }
}