/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { exec } from "child_process";
import { app, ipcMain } from "electron";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "original-fs";
import { join } from "path";
import { domain } from "../../../DOMAIN.json";
import { serializeErrors } from "./common";

const GITEA_BASE = `https://source.${domain}`;
const API_BASE = `${GITEA_BASE}/api/v1/repos/nightcord/nightcord`;
const REPO_URL = `${GITEA_BASE}/nightcord/nightcord`;
declare const VERSION: string;
const CURRENT_VERSION = `v${VERSION}`;
const ZIP_FILE = "midnightcord-dist.zip";

/**
 * Marker file written into __dirname when an update has been staged.
 * midnightcord-index.js reads this on next startup (before any file is locked)
 * and performs the actual file-swap then.
 */
export const PENDING_UPDATE_MARKER = join(__dirname, "midnightcord-pending-update.json");
const STAGING_DIR = join(app.getPath("temp"), "midnightcord-pending-update");

let pendingDownloadUrl: string | null = null;
let pendingVersion: string | null = null;
let isApplying = false;

async function githubGet<T = any>(endpoint: string): Promise<T> {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/json",
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

function isNewer(a: string, b: string): boolean {
    const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    const av = parse(a), bv = parse(b);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        if ((bv[i] ?? 0) > (av[i] ?? 0)) return true;
        if ((bv[i] ?? 0) < (av[i] ?? 0)) return false;
    }
    return false;
}

async function fetchUpdates(): Promise<boolean> {
    const data = await githubGet("/releases/latest");
    const latestTag: string = data.tag_name ?? "";

    if (!latestTag || !isNewer(CURRENT_VERSION, latestTag)) return false;

    const asset = (data.assets as any[])?.find(
        (a: any) => a.name === ZIP_FILE
    );
    if (!asset) return false;

    pendingDownloadUrl = asset.browser_download_url;
    pendingVersion = latestTag;
    return true;
}

async function getUpdates() {
    const outdated = await fetchUpdates();
    if (!outdated) return [];
    return [{
        hash: pendingVersion ?? "new",
        author: "Midnightcord",
        message: `Nouvelle version disponible : ${pendingVersion}`
    }];
}

/**
 * Step 1 — download the zip and stage it to a temp folder.
 * Does NOT touch any running files. Returns true when the zip is staged.
 */
async function stageUpdate(): Promise<boolean> {
    if (!pendingDownloadUrl) return false;
    if (isApplying) return false;
    isApplying = true;

    try {
        const data = await fetchBuffer(pendingDownloadUrl);

        // Save zip to temp
        const zipPath = join(app.getPath("temp"), `midnightcord-update-${Date.now()}.zip`);
        writeFileSync(zipPath, data, { flush: true });

        // Clean any stale staging dir first
        try { rmSync(STAGING_DIR, { recursive: true, force: true }); } catch { }
        mkdirSync(STAGING_DIR, { recursive: true });

        // Extract zip into STAGING_DIR (no running files touched)
        const psExtract = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${STAGING_DIR}' -Force`;

        return await new Promise<boolean>((resolve, reject) => {
            exec(`powershell -NoProfile -NonInteractive -Command "${psExtract}"`, err => {
                // Cleanup zip regardless
                try { rmSync(zipPath, { force: true }); } catch { }

                if (err) {
                    return reject(new Error("ZIP extraction failed: " + err.message));
                }

                // Write marker so midnightcord-index.js knows to apply on next boot
                writeFileSync(PENDING_UPDATE_MARKER, JSON.stringify({
                    version: pendingVersion,
                    stagingDir: STAGING_DIR,
                    destDir: __dirname,
                    createdAt: Date.now()
                }));

                pendingDownloadUrl = null;
                pendingVersion = null;
                resolve(true);
            });
        });
    } finally {
        isApplying = false;
    }
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => REPO_URL));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(getUpdates));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
// BUILD is now "stage update" — actual file swap happens on next startup via midnightcord-index.js
ipcMain.handle(IpcEvents.BUILD, serializeErrors(stageUpdate));
