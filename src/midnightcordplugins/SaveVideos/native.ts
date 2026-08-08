/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dialog, IpcMainInvokeEvent } from "electron";

/**
 * Opens a native folder picker via Electron dialog (no browser API needed).
 * Returns the chosen directory path, or null if cancelled.
 */
export async function pickDirectory(_event: IpcMainInvokeEvent): Promise<string | null> {
    const res = await dialog.showOpenDialog({
        title: "Choose Download Folder",
        properties: ["openDirectory", "createDirectory"]
    });

    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
}

/**
 * Downloads a single file from `url` and saves it as `filename` inside `dir`.
 * Runs in main process — no CORS/CSP restrictions.
 */
export async function downloadFile(
    _event: IpcMainInvokeEvent,
    url: string,
    dir: string,
    filename: string
): Promise<{ ok: boolean; error?: string }> {
    try {
        await mkdir(dir, { recursive: true });

        const res = await fetch(url);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

        const buffer = Buffer.from(await res.arrayBuffer());
        const dest = path.join(dir, filename);
        await writeFile(dest, buffer);

        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
    }
}
