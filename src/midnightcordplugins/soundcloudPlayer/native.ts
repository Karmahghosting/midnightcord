/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// ─── Environment detection ────────────────────────────────────────────────────
// Works in Electron (Discord desktop) AND browser extensions (Chrome/Firefox)

const IS_ELECTRON = typeof process !== "undefined" && process.versions?.electron;

let _electronNet: typeof import("electron")["net"] | null = null;
let _BrowserWindow: typeof import("electron")["BrowserWindow"] | null = null;

if (IS_ELECTRON) {
    try {
        const electron = require("electron");
        _electronNet = electron.net;
        _BrowserWindow = electron.BrowserWindow;
    } catch { }
}

// ─── Unified fetch (Electron net OR browser fetch) ────────────────────────────

async function netGet(url: string, headers?: Record<string, string>): Promise<string> {
    const defaultHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://soundcloud.com/",
        ...(headers ?? {}),
    };

    if (_electronNet) {
        const resp = await _electronNet.fetch(url, { headers: defaultHeaders });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.text();
    }

    // Browser extension mode: use standard fetch
    // SoundCloud API supports CORS for api-v2.soundcloud.com endpoints
    const resp = await fetch(url, { headers: defaultHeaders });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
}

// ─── Fetch dynamique du client_id SoundCloud ─────────────────────────────────
// Même logique que sc_fetch_client_id / sc_parse_js_for_clientid en C :
//   Étape 1 : GET soundcloud.com → extraire les <script src="...">
//   Étape 2 : GET le dernier bundle JS → chercher client_id:"XXXXXXXX"

export async function fetchSoundCloudClientId(_?: any): Promise<string | null> {
    try {
        // Étape 1 : charger soundcloud.com
        const html = await netGet("https://soundcloud.com/", {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        });

        // Extraire les URLs des bundles JS
        const scriptUrls: string[] = [];
        const re = /<script[^>]+src="(https:\/\/[^"]+\.js[^"]*)"[^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null) {
            const url = m[1];
            if (!url.includes("cookielaw") && !url.includes("analytics") && !url.includes("st-f"))
                scriptUrls.push(url);
        }

        if (scriptUrls.length === 0) return null;

        // Étape 2 : tester les bundles JS (on cherche dans les plus récents)
        for (const jsUrl of scriptUrls.slice(-5).reverse()) {
            try {
                const js = await netGet(jsUrl);

                // Patterns mis à jour pour 2024/2025
                const patterns = [
                    /client_id\s*:\s*"([a-zA-Z0-9]{32})"/,
                    /client_id\s*=\s*"([a-zA-Z0-9]{32})"/,
                    /client_id\s*:\s*'([a-zA-Z0-9]{32})'/,
                    /client_id\s*=\s*'([a-zA-Z0-9]{32})'/,
                    /"client_id"\s*:\s*"([a-zA-Z0-9]{32})"/,
                ];
                for (const pat of patterns) {
                    const match = js.match(pat);
                    if (match?.[1]) return match[1];
                }
            } catch { /* essayer le suivant */ }
        }

        return null;
    } catch (e: any) {
        console.error("[SoundCloudPlayer] fetchClientId error:", e?.message);
        return null;
    }
}

// ─── Recherche de pistes ──────────────────────────────────────────────────────

export async function searchSoundCloud(
    _: any,
    query: string,
    clientId: string
): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=50`;
        return await netGet(url);
    } catch (e: any) {
        // Retourner le code HTTP pour détecter l'expiration du client_id
        throw new Error(e?.message ?? String(e));
    }
}

// ─── Résolution de l'URL de stream ───────────────────────────────────────────

export async function resolveStreamUrl(_: any, url: string, clientId: string): Promise<string | null> {
    try {
        const streamUrl = new URL(url);
        streamUrl.searchParams.set("client_id", clientId);

        const fetchHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": "https://soundcloud.com/",
        };

        let resp: Response;
        if (_electronNet) {
            resp = await _electronNet.fetch(streamUrl.toString(), { redirect: "follow", headers: fetchHeaders });
        } else {
            resp = await fetch(streamUrl.toString(), { redirect: "follow", headers: fetchHeaders });
        }

        if (!resp.ok) {
            console.error(`[SoundCloudNative] Stream resolution failed: ${resp.status}`);
            return null;
        }

        const text = await resp.text();
        try {
            const json = JSON.parse(text);
            return json.url || null;
        } catch {
            return resp.url;
        }
    } catch (e: any) {
        console.error("[SoundCloudNative] resolveStreamUrl error:", e?.message);
        return null;
    }
}

export async function resolveTrack(
    _: any,
    trackId: string,
    clientId: string
): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`;
        return await netGet(url);
    } catch (e: any) {
        throw new Error(e?.message ?? String(e));
    }
}

// ─── Listening Together ─────────────────────────────────────────────────────────────────
// Electron : intercept navigation events on BrowserWindow
// Browser extension : intercept clicks on <a> tags pointing to the local midnightcord listen protocol

const LISTEN_URL_PREFIX = "midnightcord://listen?";

export function setupListeningTogetherHandler(_?: any): void {
    // no-op
}

let _listenerInstalled = false;

function _dispatchListenEvent(url: string) {
    try {
        const params = new URL(url).searchParams;
        const scId = params.get("sc_id") ?? "";
        const start = params.get("start") ?? "";
        const userId = params.get("userId") ?? "";
        window.dispatchEvent(new CustomEvent("soundcord-listen-together", { detail: { scId, start, userId } }));
    } catch { }
}

// Browser extension: intercept anchor clicks
function _browserClickHandler(e: MouseEvent) {
    const target = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
    if (!target) return;
    const href = target.href || "";
    if (!href.startsWith(LISTEN_URL_PREFIX)) return;
    e.preventDefault();
    e.stopPropagation();
    _dispatchListenEvent(href);
}

export function installListeningTogetherIntercept(_?: any): void {
    if (_listenerInstalled) return;
    _listenerInstalled = true;

    if (IS_ELECTRON && _BrowserWindow) {
        const electron = require("electron") as typeof import("electron");

        // Override shell.openExternal to catch profile button link clicks
        const originalOpenExternal = electron.shell.openExternal;
        electron.shell.openExternal = (url: string, options?: any) => {
            if (typeof url === "string" && url.startsWith(LISTEN_URL_PREFIX)) {
                try {
                    const params = new URL(url).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    electron.BrowserWindow.getAllWindows().forEach(w => {
                        try {
                            const safeId = JSON.stringify(scId);
                            const safeStart = JSON.stringify(start);
                            const safeUserId = JSON.stringify(userId);
                            w.webContents.executeJavaScript(
                                `window.dispatchEvent(new CustomEvent('soundcord-listen-together', { detail: { scId: ${safeId}, start: ${safeStart}, userId: ${safeUserId} } }))`
                            ).catch(() => {});
                        } catch { }
                    });
                } catch { }
                return Promise.resolve();
            }
            return originalOpenExternal.call(electron.shell, url, options);
        };

        // Electron mode: hook BrowserWindow navigation events
        const hook = (win: Electron.BrowserWindow) => {
            win.webContents.on("will-navigate" as any, (event: any, url: string) => {
                if (!url.startsWith(LISTEN_URL_PREFIX)) return;
                event.preventDefault();
                try {
                    const params = new URL(url).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    _BrowserWindow!.getAllWindows().forEach(w => {
                        try {
                            const safeId = JSON.stringify(scId);
                            const safeStart = JSON.stringify(start);
                            const safeUserId = JSON.stringify(userId);
                            w.webContents.executeJavaScript(
                                `window.dispatchEvent(new CustomEvent('soundcord-listen-together', { detail: { scId: ${safeId}, start: ${safeStart}, userId: ${safeUserId} } }))`
                            ).catch(() => {});
                        } catch { }
                    });
                } catch { }
            });
            win.webContents.on("new-window" as any, (event: any, url: string) => {
                if (!url.startsWith(LISTEN_URL_PREFIX)) return;
                event.preventDefault();
                try {
                    const params = new URL(url).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    _BrowserWindow!.getAllWindows().forEach(w => {
                        try {
                            const safeId = JSON.stringify(scId);
                            const safeStart = JSON.stringify(start);
                            const safeUserId = JSON.stringify(userId);
                            w.webContents.executeJavaScript(
                                `window.dispatchEvent(new CustomEvent('soundcord-listen-together', { detail: { scId: ${safeId}, start: ${safeStart}, userId: ${safeUserId} } }))`
                            ).catch(() => {});
                        } catch { }
                    });
                } catch { }
            });
        };
        _BrowserWindow.getAllWindows().forEach(hook);
        electron.app.on("browser-window-created" as any, (_e: any, win: Electron.BrowserWindow) => hook(win));
    } else {
        // Browser extension mode: intercept anchor clicks at document level
        document.addEventListener("click", _browserClickHandler, true);
    }
}
