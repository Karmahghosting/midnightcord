/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, net } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";

import { isPathInDirectory } from "./utils/isPathInDirectory";

const STATIC_DIR = join(__dirname, "..", "..", "static");

export async function handleVesktopStaticProtocol(path: string, req: Request) {
    const fullPath = join(STATIC_DIR, path);
    if (!isPathInDirectory(fullPath, STATIC_DIR)) {
        return new Response(null, { status: 404 });
    }

    return net.fetch(pathToFileURL(fullPath).href);
}

export function loadView(browserWindow: BrowserWindow, view: string, params?: URLSearchParams) {
    const url = new URL(`midnightcord://static/views/${view}`);
    if (params) {
        url.search = params.toString();
    }

    return browserWindow.loadURL(url.toString());
}
