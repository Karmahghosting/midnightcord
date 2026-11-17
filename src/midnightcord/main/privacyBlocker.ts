/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { session } from "electron";

const TRACKER_PATTERNS = [
    "*://*.discord.com/api/*/science*",
    "*://discord.com/api/*/science*",
    "*://*.discord.com/api/*/track*",
    "*://discord.com/api/*/track*",
    "*://*.discord.com/api/*/sentry*",
    "*://discord.com/api/*/sentry*",
    "*://*.sentry.io/*",
    "*://sentry.io/*",
    "*://*.ingest.sentry.io/*"
];

let installed = false;

export function installPrivacyBlocker() {
    if (installed) return;
    installed = true;

    session.defaultSession.webRequest.onBeforeRequest({ urls: TRACKER_PATTERNS }, (_details, callback) => {
        callback({ cancel: true });
    });
}
