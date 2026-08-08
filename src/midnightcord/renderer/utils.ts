/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord deletes this from the window so we need to capture it in a variable
export const { localStorage } = window;

export const isFirstRun = (() => {
    const key = "VCD_FIRST_RUN";
    if (localStorage.getItem(key) !== null) return false;
    localStorage.setItem(key, "false");
    return true;
})();

function getPlatform() {
    const platform = VesktopNative.app.getPlatformSpoofInfo().originalPlatform.toLowerCase();
    if (platform.startsWith("win")) return "windows";
    if (platform.startsWith("mac")) return "macos";
    if (platform.startsWith("linux")) return "linux";
    return "unknown";
}

export const isWindows = getPlatform() === "windows";
export const isMac = getPlatform() === "macos";
export const isLinux = getPlatform() === "linux";
