/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync } from "fs";
import { join } from "path";

import { USER_AGENT } from "../constants";
import { VENCORD_DIR } from "../vencordDir";
import { downloadFile, fetchie } from "./http";
import { domain } from "../../../../DOMAIN.json";

const API_BASE = `https://git.${domain}/api/v1`;

export interface ReleaseData {
    name: string;
    tag_name: string;
    html_url: string;
    assets: Array<{
        name: string;
        browser_download_url: string;
    }>;
}

export async function githubGet(endpoint: string) {
    const opts: RequestInit = {
        headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT
        }
    };

    return fetchie(API_BASE + endpoint, opts, { retryOnNetworkError: true });
}

export async function downloadVencordAsar() {
    const asarUrl = process.env.MIDNIGHTCORD_ASAR_URL?.trim();
    if (!asarUrl) {
        throw new Error("No Midnightcord repair feed is configured. Reinstall the current package instead.");
    }

    await downloadFile(
        asarUrl,
        VENCORD_DIR,
        {},
        { retryOnNetworkError: true }
    );
}

export function isValidVencordInstall(dir: string) {
    return existsSync(join(dir, "Midnightcord/main.js"));
}

export async function ensureVencordFiles() {
    if (!existsSync(VENCORD_DIR)) {
        console.error("Bundled midnightcord.asar not found at", VENCORD_DIR);
    }
}
