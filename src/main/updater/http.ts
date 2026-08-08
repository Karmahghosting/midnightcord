/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { app, ipcMain } from "electron";
import { unzipSync } from "fflate";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "original-fs";
import { dirname, join, resolve, sep } from "path";

import { serializeErrors } from "./common";

const REPOSITORY = "Karmahghosting/midnightcord";
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`;
const REPO_URL = `https://github.com/${REPOSITORY}`;
const MAX_ARCHIVE_SIZE = 150 * 1024 * 1024;
const MAX_EXTRACTED_SIZE = 300 * 1024 * 1024;

declare const VERSION: string;
const CURRENT_VERSION = `v${VERSION}`;

export const PENDING_UPDATE_MARKER = join(__dirname, "midnightcord-pending-update.json");
const STAGING_DIR = join(app.getPath("temp"), "midnightcord-pending-update");

let pendingDownloadUrl: string | null = null;
let pendingChecksumUrl: string | null = null;
let pendingVersion: string | null = null;
let isApplying = false;

function requestHeaders() {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": `Midnightcord-Updater/${VERSION}`,
        "X-GitHub-Api-Version": "2022-11-28"
    };

    const token = process.env.MIDNIGHTCORD_GITHUB_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function githubGet<T = any>(endpoint: string): Promise<T> {
    return fetchJson<T>(API_BASE + endpoint, { headers: requestHeaders() });
}

function isNewer(current: string, candidate: string): boolean {
    const parse = (version: string) => version.replace(/^v/, "").split(".").map(part => Number.parseInt(part, 10) || 0);
    const currentParts = parse(current);
    const candidateParts = parse(candidate);

    for (let index = 0; index < Math.max(currentParts.length, candidateParts.length); index++) {
        if ((candidateParts[index] ?? 0) > (currentParts[index] ?? 0)) return true;
        if ((candidateParts[index] ?? 0) < (currentParts[index] ?? 0)) return false;
    }
    return false;
}

function assertReleaseAssetUrl(value: string): string {
    const url = new URL(value);
    const expectedPrefix = `/${REPOSITORY}/releases/download/`;
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(expectedPrefix)) {
        throw new Error("GitHub returned an unexpected update asset URL");
    }
    return url.toString();
}

async function fetchUpdates(): Promise<boolean> {
    const release = await githubGet<any>("/releases/latest");
    const latestTag = String(release.tag_name ?? "");

    if (!/^v?\d+\.\d+\.\d+$/.test(latestTag) || !isNewer(CURRENT_VERSION, latestTag)) return false;

    const version = latestTag.replace(/^v/, "");
    const archiveName = `Midnightcord-Update-${version}.zip`;
    const checksumName = archiveName + ".sha256";
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const archive = assets.find((asset: any) => asset.name === archiveName);
    const checksum = assets.find((asset: any) => asset.name === checksumName);

    if (!archive?.browser_download_url || !checksum?.browser_download_url) {
        throw new Error(`Release ${latestTag} has no verified native update payload`);
    }
    if (Number(archive.size) <= 0 || Number(archive.size) > MAX_ARCHIVE_SIZE) {
        throw new Error("Native update payload has an invalid size");
    }

    pendingDownloadUrl = assertReleaseAssetUrl(archive.browser_download_url);
    pendingChecksumUrl = assertReleaseAssetUrl(checksum.browser_download_url);
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

function extractVerifiedUpdate(data: Buffer) {
    const files = unzipSync(data);
    const entries = Object.entries(files);
    const extractedSize = entries.reduce((total, [, content]) => total + content.byteLength, 0);
    if (extractedSize <= 0 || extractedSize > MAX_EXTRACTED_SIZE) {
        throw new Error("Native update payload expands to an invalid size");
    }

    rmSync(STAGING_DIR, { recursive: true, force: true });
    mkdirSync(STAGING_DIR, { recursive: true });
    const stagingRoot = resolve(STAGING_DIR) + sep;

    for (const [archivePath, content] of entries) {
        const normalized = archivePath.replaceAll("\\", "/");
        if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
            throw new Error("Native update payload contains an invalid path");
        }

        const outputPath = resolve(STAGING_DIR, normalized);
        if (!outputPath.startsWith(stagingRoot)) {
            throw new Error("Native update payload contains a path traversal");
        }
        if (normalized.endsWith("/")) {
            mkdirSync(outputPath, { recursive: true });
            continue;
        }

        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, content, { flush: true });
    }

    for (const required of ["patcher.js", "preload.js", "renderer.js", "package.json", "midnightcord-update.json"]) {
        if (!existsSync(join(STAGING_DIR, required))) {
            throw new Error(`Native update payload is missing ${required}`);
        }
    }

    const manifest = JSON.parse(readFileSync(join(STAGING_DIR, "midnightcord-update.json"), "utf8"));
    if (`v${manifest.version}` !== pendingVersion) {
        throw new Error("Native update payload version does not match the GitHub release");
    }
}

async function stageUpdate(): Promise<boolean> {
    if (!pendingDownloadUrl || !pendingChecksumUrl || !pendingVersion || isApplying) return false;
    isApplying = true;

    try {
        const headers = requestHeaders();
        const [data, checksumData] = await Promise.all([
            fetchBuffer(pendingDownloadUrl, { headers }),
            fetchBuffer(pendingChecksumUrl, { headers })
        ]);
        if (data.byteLength <= 0 || data.byteLength > MAX_ARCHIVE_SIZE) {
            throw new Error("Downloaded native update has an invalid size");
        }

        const expectedHash = checksumData.toString("utf8").trim().split(/\s+/)[0]?.toLowerCase();
        const actualHash = createHash("sha256").update(data).digest("hex");
        if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash) || actualHash !== expectedHash) {
            throw new Error("Native update SHA256 verification failed");
        }

        extractVerifiedUpdate(data);
        writeFileSync(PENDING_UPDATE_MARKER, JSON.stringify({
            version: pendingVersion,
            stagingDir: STAGING_DIR,
            destDir: __dirname,
            createdAt: Date.now()
        }), { flush: true });

        pendingDownloadUrl = null;
        pendingChecksumUrl = null;
        pendingVersion = null;
        return true;
    } catch (error) {
        rmSync(STAGING_DIR, { recursive: true, force: true });
        throw error;
    } finally {
        isApplying = false;
    }
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => REPO_URL));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(getUpdates));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(stageUpdate));
