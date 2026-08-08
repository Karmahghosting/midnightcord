/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "original-fs";
import { dirname, join } from "path";

import { USER_AGENT } from "../constants";
import { VENCORD_DIR } from "../vencordDir";
import { fetchie } from "./http";

const RELEASE_BASE = "https://github.com/Karmahghosting/midnightcord/releases/latest/download";
const ASAR_URL = `${RELEASE_BASE}/Midnightcord-Standalone.asar`;
const CHECKSUM_URL = ASAR_URL + ".sha256";
const MAX_ASAR_SIZE = 200 * 1024 * 1024;

function requestHeaders() {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    const token = process.env.MIDNIGHTCORD_GITHUB_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

export async function downloadVencordAsar() {
    const headers = requestHeaders();
    const [asarResponse, checksumResponse] = await Promise.all([
        fetchie(ASAR_URL, { headers }, { retryOnNetworkError: true }),
        fetchie(CHECKSUM_URL, { headers }, { retryOnNetworkError: true })
    ]);
    const [asarBuffer, checksumText] = await Promise.all([
        asarResponse.arrayBuffer().then(value => Buffer.from(value)),
        checksumResponse.text()
    ]);

    if (asarBuffer.byteLength <= 0 || asarBuffer.byteLength > MAX_ASAR_SIZE) {
        throw new Error("Standalone repair payload has an invalid size");
    }

    const expectedHash = checksumText.trim().split(/\s+/)[0]?.toLowerCase();
    const actualHash = createHash("sha256").update(asarBuffer).digest("hex");
    if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash) || actualHash !== expectedHash) {
        throw new Error("Standalone repair payload SHA256 verification failed");
    }

    mkdirSync(dirname(VENCORD_DIR), { recursive: true });
    const temporaryPath = VENCORD_DIR + ".download";
    rmSync(temporaryPath, { force: true });
    writeFileSync(temporaryPath, asarBuffer, { flush: true });
    renameSync(temporaryPath, VENCORD_DIR);
}

export function isValidVencordInstall(dir: string) {
    return existsSync(join(dir, "Midnightcord/main.js"));
}

export async function ensureVencordFiles() {
    if (!existsSync(VENCORD_DIR)) {
        console.error("Bundled midnightcord.asar not found at", VENCORD_DIR);
    }
}
