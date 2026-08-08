/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, shell } from "electron";
import { DISCORD_HOSTNAMES } from "main/constants";

import { Settings } from "../settings";
import { createOrFocusPopup, setupPopout } from "./popout";
import { execSteamURL, isDeckGameMode, steamOpenURL } from "./steamOS";

// ── Overlay popout flood protection ──────────────────────────────────────────
// When Discord's OOP overlay crashes (always in Midnightcord — we're not discord.exe),
// it enters a retry loop that rapidly fires window.open("/popout") dozens of times,
// opening https://discord.com/popout in the user's browser.
// We block overlay-specific popouts entirely and rate-limit the rest.
const OVERLAY_FRAME_NAMES = new Set([
    "DISCORD_OutOfProcessOverlay",
    "DISCORD_Overlay",
    "DISCORD_GAME_OVERLAY",
]);

const POPOUT_RATE_LIMIT_WINDOW_MS = 5000;
const POPOUT_RATE_LIMIT_MAX = 3;
const popoutTimestamps: number[] = [];
let popoutCounter = 0;

function isPopoutRateLimited(): boolean {
    const now = Date.now();
    // Purge timestamps outside the window
    while (popoutTimestamps.length > 0 && now - popoutTimestamps[0] > POPOUT_RATE_LIMIT_WINDOW_MS) {
        popoutTimestamps.shift();
    }
    if (popoutTimestamps.length >= POPOUT_RATE_LIMIT_MAX) {
        console.warn("[Midnightcord] Popout rate-limited — too many popout requests (overlay crash loop?)");
        return true;
    }
    popoutTimestamps.push(now);
    return false;
}

function stablePopoutKey(frameName: string): string {
    if (frameName.startsWith("DISCORD_")) return frameName;
    if (frameName) return `DISCORD_${frameName}`;
    // Use a stable counter instead of Math.random() so duplicate unnamed popouts
    // get deduplicated by createOrFocusPopup instead of creating N separate windows.
    return `DISCORD_POPOUT_${++popoutCounter}`;
}

export function handleExternalUrl(url: string, protocol?: string): { action: "deny" | "allow" } {
    if (protocol == null) {
        try {
            protocol = new URL(url).protocol;
        } catch {
            return { action: "deny" };
        }
    }

    try {
        const u = new URL(url);
        if (u.pathname.startsWith("/popout") && (u.hostname === "discord.com" || u.hostname.endsWith(".discord.com") || DISCORD_HOSTNAMES.includes(u.hostname))) {
            return { action: "deny" };
        }
    } catch {}

    switch (protocol) {
        case "http:":
        case "https:":
            if (Settings.store.openLinksWithElectron) {
                return { action: "allow" };
            }
        // eslint-disable-next-line no-fallthrough
        case "mailto:":
        case "spotify:":
            if (isDeckGameMode) {
                steamOpenURL(url);
            } else {
                shell.openExternal(url);
            }
            break;
        case "steam:":
            if (isDeckGameMode) {
                execSteamURL(url);
            } else {
                shell.openExternal(url);
            }
            break;
    }

    return { action: "deny" };
}

export function makeLinksOpenExternally(win: BrowserWindow) {
    win.webContents.setWindowOpenHandler(({ url, frameName, features }) => {
        console.log("[Midnightcord][LINK] setWindowOpenHandler url=", url, "frameName=", frameName);
        try {
            var { protocol, hostname, pathname, searchParams } = new URL(url);
        } catch {
            return { action: "deny" };
        }

        if (OVERLAY_FRAME_NAMES.has(frameName) || (frameName && frameName.includes("Overlay"))) {
            console.log("[Midnightcord] Blocked overlay popout (overlay unsupported):", frameName);
            return { action: "deny" };
        }

        const isDiscordPopout = pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname);
        const isDiscordPopup = (pathname === "/popup" || pathname.includes("popup")) && DISCORD_HOSTNAMES.includes(hostname);

        if (isDiscordPopout || (frameName.startsWith("DISCORD_") && pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname))) {
            if (isPopoutRateLimited()) {
                return { action: "deny" };
            }

            const key = stablePopoutKey(frameName);
            const result = createOrFocusPopup(key, features);
            if (result.action === "allow") {
                return {
                    action: "allow",
                    overrideBrowserWindowOptions: {
                        ...result.overrideBrowserWindowOptions,
                        isDiscordPopout: true
                    } as any
                };
            }
            return result;
        }

        if (isDiscordPopup) {
            const targetParam = searchParams.get("target");
            if (targetParam && !isDiscordUrl(targetParam)) {
                handleExternalUrl(targetParam);
                return { action: "deny" };
            }
        }

        if (url === "about:blank") return {
            action: "allow",
            overrideBrowserWindowOptions: {
                show: false,
                skipTaskbar: true,
                frame: false,
                transparent: true,
                backgroundColor: "#00000000"
            }
        };

        // Drop the static temp page Discord web loads for the connections popout
        if (frameName === "authorize" && searchParams.get("loading") === "true") return { action: "deny" };

        // Allow captcha popups to open inside Electron (hCaptcha / reCaptcha)
        if (
            hostname.includes("hcaptcha.com") ||
            hostname.includes("recaptcha.net") ||
            (hostname.includes("google.com") && pathname.startsWith("/recaptcha")) ||
            (hostname.includes("discord.com") && pathname.startsWith("/cdn-cgi/")) ||
            (DISCORD_HOSTNAMES.includes(hostname) && (pathname.includes("captcha") || searchParams.has("captcha")))
        ) {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    width: 500,
                    height: 600,
                    frame: true,
                    autoHideMenuBar: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true,
                    }
                }
            };
        }

        return handleExternalUrl(url, protocol);
    });

    win.webContents.on("did-create-window", (childWin, { frameName, options, url }: any) => {
        console.log("[Midnightcord][LINK] did-create-window url=", url, "frameName=", frameName);

        // Hide immediately to prevent white popup window from rendering on screen
        try { childWin.hide(); } catch {}

        if (OVERLAY_FRAME_NAMES.has(frameName) || (frameName && frameName.includes("Overlay"))) {
            try { childWin.destroy(); } catch {}
            return;
        }

        // Detect captcha windows and handle them gracefully
        let isCaptcha = false;
        if (url) {
            try {
                const { hostname, pathname } = new URL(url);
                isCaptcha =
                    hostname.includes("hcaptcha.com") ||
                    hostname.includes("recaptcha.net") ||
                    (hostname.includes("google.com") && pathname.startsWith("/recaptcha")) ||
                    (hostname.includes("discord.com") && pathname.startsWith("/cdn-cgi/")) ||
                    (DISCORD_HOSTNAMES.includes(hostname) && (pathname.includes("captcha")));
            } catch {}
        }

        if (isCaptcha) {
            childWin.setMenuBarVisibility(false);
            childWin.show();
            childWin.webContents.setWindowOpenHandler(({ url }) => handleExternalUrl(url));
            childWin.once("closed", () => childWin.removeAllListeners());
            return;
        }

        let isPopout = frameName.startsWith("DISCORD_");

        if (!isPopout) {
            if (options && (options as any).isDiscordPopout) {
                isPopout = true;
            } else if (url) {
                try {
                    const { pathname, hostname } = new URL(url);
                    if (pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname)) {
                        isPopout = true;
                    }
                } catch {}
            }
        }

        if (isPopout) {
            childWin.show();
            const key = stablePopoutKey(frameName);
            setupPopout(childWin, key);
        } else {
            // Non-popout window: redirect external URLs and immediately destroy blank child window
            childWin.webContents.on("will-navigate", (e, navUrl) => {
                e.preventDefault();
                try { childWin.destroy(); } catch {}
                if (navUrl && navUrl !== "about:blank" && !navUrl.includes("/popup")) {
                    handleExternalUrl(navUrl);
                }
            });

            // Destroy any unhandled blank/popup child window after 100ms
            setTimeout(() => {
                try {
                    if (!childWin.isDestroyed()) {
                        const currentUrl = childWin.webContents.getURL();
                        const title = childWin.getTitle();
                        if (!currentUrl || currentUrl === "about:blank" || currentUrl.includes("/popup") || title === "discord" || title === "Discord Popup") {
                            childWin.destroy();
                        }
                    }
                } catch {}
            }, 100);
        }
    });
}
