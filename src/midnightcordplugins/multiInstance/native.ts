/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain,screen, session } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

import { registerMediaPermissionsForSession } from "../../midnightcord/main/mediaPermissions";

const openWindows = new Map<string, BrowserWindow>();

// ─────────────────────────────────────────────────────────────────────────────
// Réglages partagés (thème, audio, zoom, etc.) entre toutes les instances
//
// Chaque instance tourne dans sa propre session Electron (persist:midnightcord-mi-{userId}),
// donc son localStorage est totalement vide au premier lancement : Discord démarre
// avec ses réglages par défaut (pas de device audio choisi, thème par défaut, etc.),
// ce qui donne l'impression d'une fenêtre "vide" tant que l'utilisateur n'a pas tout
// reconfiguré à la main.
//
// On capture donc le localStorage de la fenêtre qui déclenche l'ouverture (le plus
// souvent la fenêtre principale) et on le sauvegarde sur disque. Ce cache est ensuite
// injecté dans chaque nouvelle instance via le preload, mais UNIQUEMENT pour les clés
// qui n'existent pas encore dans le profil ciblé — on ne touche jamais à un réglage
// déjà personnalisé pour ne rien casser.
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_SETTINGS_FILE = join(app.getPath("userData"), "midnightcord-mi-shared-settings.json");

// Clés qu'on ne veut jamais copier d'une fenêtre à l'autre (identité du compte / session)
const SHARED_SETTINGS_BLOCKLIST = new Set([
    "token",
    "default_token",
    "multiaccount_tokens",
    "tokens",
    "user_id_cache",
    "MultiAccountStore",
    "AuthenticationStore",
    "UserProfileStore",
    "UserStore",
    "login_token",
    "email_cache"
]);

const DUMP_LOCAL_STORAGE_SCRIPT = `
(function() {
    try {
        const block = ["token", "default_token", "multiaccount_tokens", "tokens", "user_id_cache", "MultiAccountStore", "AuthenticationStore", "login_token"];
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || block.includes(k)) continue;
            out[k] = localStorage.getItem(k);
        }
        return JSON.stringify(out);
    } catch (e) {
        return "{}";
    }
})();
`;

function loadSharedSettings(): Record<string, string> {
    try {
        if (!existsSync(SHARED_SETTINGS_FILE)) return {};
        const raw = readFileSync(SHARED_SETTINGS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function saveSharedSettings(settings: Record<string, string>): void {
    try {
        writeFileSync(SHARED_SETTINGS_FILE, JSON.stringify(settings), "utf-8");
    } catch (e) {
        console.warn("[MidnightcordMI] Failed to save shared settings:", e);
    }
}

/**
 * Capture le localStorage de la fenêtre qui a déclenché l'action (event.sender)
 * et le fusionne avec le cache déjà présent sur disque. Ne lève jamais d'erreur :
 * en cas de souci on retombe simplement sur le cache existant.
 */
async function captureAndMergeSharedSettings(sourceEvent: any): Promise<Record<string, string>> {
    const existing = loadSharedSettings();
    try {
        const sourceWc = sourceEvent?.sender;
        if (!sourceWc || sourceWc.isDestroyed?.()) return existing;
        const dump = await sourceWc.executeJavaScript(DUMP_LOCAL_STORAGE_SCRIPT);
        const captured = JSON.parse(dump || "{}");
        const filtered: Record<string, string> = {};
        for (const [key, value] of Object.entries(captured)) {
            if (SHARED_SETTINGS_BLOCKLIST.has(key)) continue;
            if (typeof value === "string") filtered[key] = value;
        }
        const merged = { ...existing, ...filtered };
        saveSharedSettings(merged);
        return merged;
    } catch {
        return existing;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercepte les IPC de contrôle de fenêtre pour une instance multi.
//
// Discord natif utilise ipcMain.handle("DISCORD_WINDOW_CLOSE" | "DISCORD_WINDOW_MINIMIZE" | ...)
// Ces handlers sont enregistrés GLOBALEMENT par Discord sur ipcMain, donc ils
// attrapent tous les événements de toutes les fenêtres et appellent injectedGetWindow(key)
// qui retourne toujours la fenêtre principale.
//
// Pour contourner ça, on utilise webContents.ipc.handle sur le webContents
// de chaque fenêtre multi-instance — ces handlers sont LOCAUX à ce webContents
// et ont priorité sur les handlers globaux ipcMain pour ce sender.
// ─────────────────────────────────────────────────────────────────────────────

let isAppQuitting = false;
app.on("before-quit", () => {
    isAppQuitting = true;
});

function registerWindowControlIpc(win: BrowserWindow): () => void {
    const wc = win.webContents as any; // webContents.ipc existe depuis Electron 20

    // Canaux Discord natif (découverts dans _core_extracted/bundle.js)
    const CLOSE = "DISCORD_WINDOW_CLOSE";
    const MINIMIZE = "DISCORD_WINDOW_MINIMIZE";
    const MAXIMIZE = "DISCORD_WINDOW_MAXIMIZE";
    const RESTORE = "DISCORD_WINDOW_RESTORE";
    const FULLSCREEN = "DISCORD_WINDOW_TOGGLE_FULLSCREEN";

    // webContents.ipc.handle est prioritaire sur ipcMain.handle pour ce sender
    const handleClose = () => {
        if (!win.isDestroyed()) {
            (win as any)._userRequestedClose = true;
            win.close();
        }
    };
    const handleMinimize = () => { if (!win.isDestroyed()) win.minimize(); };
    const handleMaximize = () => {
        if (win.isDestroyed()) return;
        if (win.isMaximized()) win.unmaximize(); else win.maximize();
    };
    const handleRestore = () => { if (!win.isDestroyed()) win.restore(); };
    const handleFullscreen = () => { if (!win.isDestroyed()) win.setFullScreen(!win.isFullScreen()); };

    try {
        // webContents.ipc.handle (Electron 20+)
        wc.ipc.handle(CLOSE, handleClose);
        wc.ipc.handle(MINIMIZE, handleMinimize);
        wc.ipc.handle(MAXIMIZE, handleMaximize);
        wc.ipc.handle(RESTORE, handleRestore);
        wc.ipc.handle(FULLSCREEN, handleFullscreen);
    } catch {
        // Fallback : ipcMain.handle global avec filtre sur sender
        // (moins propre mais fonctionne sur Electron < 20)
        //
        // IMPORTANT: DISCORD_WINDOW_TOGGLE_FULLSCREEN est deja enregistre globalement
        // par le patcher principal. On ne le re-enregistre PAS ici pour eviter
        // "Attempted to register a second handler" qui crashe Discord au demarrage.
        const guardedHandle = (fn: () => void) => (event: Electron.IpcMainInvokeEvent) => {
            if (BrowserWindow.fromWebContents(event.sender) !== win) return;
            fn();
        };
        // removeHandler d'abord pour eviter le crash en cas de double appel
        ipcMain.removeHandler(CLOSE);
        ipcMain.removeHandler(MINIMIZE);
        ipcMain.removeHandler(MAXIMIZE);
        ipcMain.removeHandler(RESTORE);
        // NE PAS enregistrer FULLSCREEN - gere globalement par le patcher
        ipcMain.handle(CLOSE, guardedHandle(handleClose));
        ipcMain.handle(MINIMIZE, guardedHandle(handleMinimize));
        ipcMain.handle(MAXIMIZE, guardedHandle(handleMaximize));
        ipcMain.handle(RESTORE, guardedHandle(handleRestore));
        return () => {
            ipcMain.removeHandler(CLOSE);
            ipcMain.removeHandler(MINIMIZE);
            ipcMain.removeHandler(MAXIMIZE);
            ipcMain.removeHandler(RESTORE);
        };
    }

    // Retourne le nettoyage pour webContents.ipc
    return () => {
        try {
            wc.ipc.removeHandler(CLOSE);
            wc.ipc.removeHandler(MINIMIZE);
            wc.ipc.removeHandler(MAXIMIZE);
            wc.ipc.removeHandler(RESTORE);
            wc.ipc.removeHandler(FULLSCREEN);
        } catch { }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercepte les IPC de badge/notification Discord pour une instance multi.
//
// Discord natif émet DISCORD_SET_BADGE_COUNT (et d'autres canaux de badge) via
// ipcRenderer → ipcMain de façon globale. Le handler global de Discord appelle
// injectedGetWindow() qui retourne toujours la fenêtre principale. Résultat :
// le badge rouge (ping) s'affiche sur l'icône Discord principal, jamais sur
// l'icône de la fenêtre multi-instance.
//
// On surcharge ces canaux sur le webContents local de chaque instance (via
// webContents.ipc.on) pour intercepter les messages avant qu'ils n'atteignent
// le handler global, et on applique flashFrame + setOverlayIcon directement
// sur la bonne BrowserWindow.
// ─────────────────────────────────────────────────────────────────────────────

import { setBadgeCount } from "../../midnightcord/main/appBadge";

// Canaux IPC connus pour la gestion des badges / notifications Discord
const BADGE_IPC_CHANNELS = [
    "DISCORD_SET_BADGE_COUNT",
    "SET_BADGE_COUNT",
    "DISCORD_APP_BADGE",
    "APP_BADGE",
    "BADGE_COUNT",
    "DISCORD_BADGE_COUNT",
    "VCD_SET_BADGE_COUNT"
];

const NOTIFICATION_IPC_CHANNELS = [
    "DISCORD_NOTIFICATION",
    "SEND_NOTIFICATION",
    "DISPATCH_NOTIFICATION",
    "FLASH_FRAME"
];

function registerNotificationIpc(win: BrowserWindow): () => void {
    if (win.isDestroyed()) return () => {};

    const wc = win.webContents as any;
    const cleanups: Array<() => void> = [];

    // ── Badge count handler ──────────────────────────────────────────────────
    const handleBadge = (_event: any, count?: number) => {
        if (win.isDestroyed()) return;
        try {
            const n = typeof count === "number" ? count : 0;
            setBadgeCount(n, win);
            if (process.platform === "win32") {
                win.flashFrame(n > 0);
            }
        } catch { }
    };

    // ── Notification handler ─────────────────────────────────────────────────
    const handleNotification = (_event: any) => {
        if (win.isDestroyed()) return;
        try {
            if (process.platform === "win32") {
                win.flashFrame(true);
            }
        } catch { }
    };

    // Utilise webContents.ipc.on (prioritaire sur ipcMain pour ce sender)
    try {
        for (const channel of BADGE_IPC_CHANNELS) {
            wc.ipc.on(channel, handleBadge);
            cleanups.push(() => { try { wc.ipc.removeListener(channel, handleBadge); } catch { } });
        }
        for (const channel of NOTIFICATION_IPC_CHANNELS) {
            wc.ipc.on(channel, handleNotification);
            cleanups.push(() => { try { wc.ipc.removeListener(channel, handleNotification); } catch { } });
        }
    } catch {
        // Fallback Electron <20 : ipcMain avec filtre par sender
        const guardedBadge = (event: Electron.IpcMainEvent, count?: number) => {
            const senderWin = BrowserWindow.fromWebContents(event.sender);
            if (senderWin !== win) return;
            handleBadge(event, count);
            // Empêche la propagation au handler global de Discord
            event.returnValue = undefined;
        };
        const guardedNotif = (event: Electron.IpcMainEvent) => {
            const senderWin = BrowserWindow.fromWebContents(event.sender);
            if (senderWin !== win) return;
            handleNotification(event);
        };
        for (const channel of BADGE_IPC_CHANNELS) {
            ipcMain.on(channel, guardedBadge);
            cleanups.push(() => ipcMain.removeListener(channel, guardedBadge));
        }
        for (const channel of NOTIFICATION_IPC_CHANNELS) {
            ipcMain.on(channel, guardedNotif);
            cleanups.push(() => ipcMain.removeListener(channel, guardedNotif));
        }
    }

    return () => { for (const fn of cleanups) fn(); };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crée le script de préchargement qui injecte le token
// ─────────────────────────────────────────────────────────────────────────────

function createTokenPreload(token: string, sharedSettings: Record<string, string> = {}): string {
    const dir = join(app.getPath("userData"), "midnightcord-mi-preloads");
    mkdirSync(dir, { recursive: true });

    const cleanToken = String(token || "").trim().replace(/^"+|"+$/g, "");

    // Serialize values to JS string literals safe to embed via JSON.stringify
    const tokenLiteral = JSON.stringify(cleanToken);
    const settingsLiteral = JSON.stringify(JSON.stringify(sharedSettings ?? {}));

    // Inner script: runs in main world via webFrame.executeJavaScript.
    // Must be plain JavaScript — no TypeScript syntax, no template literals.
    const innerLines = [
        "(function() {",
        "  var RAW_TOKEN = " + tokenLiteral + ";",
        "  var SETTINGS_JSON = " + settingsLiteral + ";",
        "  var CONFLICT = ['token','default_token','multiaccount_tokens','tokens','user_id_cache','MultiAccountStore','AuthenticationStore','login_token'];",
        "  try { localStorage.removeItem('multiaccount_tokens'); localStorage.removeItem('user_id_cache'); } catch(e) {}",
        "  try {",
        "    var sh = JSON.parse(SETTINGS_JSON || '{}');",
        "    for (var k in sh) { if (CONFLICT.indexOf(k) >= 0) continue; if (localStorage.getItem(k) === null) localStorage.setItem(k, sh[k]); }",
        "  } catch(e) {}",
        "  if (RAW_TOKEN && RAW_TOKEN !== 'undefined') {",
        "    var qt = JSON.stringify(RAW_TOKEN);",
        "    try { localStorage.setItem('token', qt); } catch(e) {}",
        "    try { localStorage.setItem('default_token', qt); } catch(e) {}",
        "    try {",
        "      if ((location.pathname.indexOf('/login') >= 0 || location.pathname === '/') && !window.__mi_redirected) {",
        "        window.__mi_redirected = true;",
        "        location.href = 'https://discord.com/channels/@me';",
        "      }",
        "    } catch(e) {}",
        "  }",
        "  try { Object.defineProperty(window, '__midnightcord_token', { value: RAW_TOKEN, writable: false, configurable: true }); } catch(e) {}",
        "  (function() {",
        "    var lastUI = 0;",
        "    window.addEventListener('pointerdown', function(e) { if (e.isTrusted) lastUI = Date.now(); }, true);",
        "    window.addEventListener('keydown', function(e) { if (e.isTrusted) lastUI = Date.now(); }, true);",
        "    function patchClose() {",
        "      var dn = window.DiscordNative;",
        "      if (dn && dn.window && dn.window.close && !dn.window._miPatched) {",
        "        var orig = dn.window.close;",
        "        dn.window.close = function() { if (Date.now() - lastUI < 2000) orig.apply(this, arguments); };",
        "        dn.window._miPatched = true;",
        "      }",
        "    }",
        "    patchClose();",
        "    document.addEventListener('DOMContentLoaded', patchClose);",
        "    setInterval(patchClose, 1000);",
        "  })();",
        "  console.log('[MidnightcordMI] token preload active');",
        "})();"
    ].join("\n");

    // The preload file runs in the isolated Node/Electron world.
    // innerLines is embedded as a JSON string literal so it is never misinterpreted.
    const innerLiteralForNode = JSON.stringify(innerLines);

    const script = [
        "// Midnightcord MultiInstance — token preload",
        "(function() {",
        "  try {",
        "    var wf = null;",
        "    try { wf = require('electron').webFrame; } catch(e) {}",
        "    if (!wf) { try { wf = require('electron/renderer').webFrame; } catch(e) {} }",
        "    if (wf) {",
        "      wf.executeJavaScript(" + innerLiteralForNode + ")",
        "        .catch(function(err) { console.warn('[MidnightcordMI] mainWorld error:', err); });",
        "    }",
        "  } catch(e) { console.warn('[MidnightcordMI] preload error:', e); }",
        "})();"
    ].join("\n");

    const filePath = join(dir, "token-preload-" + Date.now() + ".js");
    writeFileSync(filePath, script, "utf-8");
    return filePath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ouvre une nouvelle fenêtre Discord isolée
// ─────────────────────────────────────────────────────────────────────────────

// Compteur d'icones detached : tourne de 1 a 5
let iconCounter = 1;

// Chemin vers le dossier d'icones detached (multi-instance-icons/ dans le dist)
function getDetachedIconDir(): string {
    // En production : {app_dir}/multi-instance-icons/
    // En dev : Desktop/lolll/
    const exeDir = join(process.execPath, "..");
    const prodDir = join(exeDir, "multi-instance-icons");
    if (existsSync(prodDir)) return prodDir;
    // Fallback dev : Desktop/lolll
    const desktopDir = join(app.getPath("desktop"), "lolll");
    if (existsSync(desktopDir)) return desktopDir;
    return prodDir;
}

export async function openInstanceWindow(
    _: any,
    token: string,
    userId: string,
    detached = false,
    username = "",
    domain = "discord.com",
    blockExternalTokenAccess = false,
    performanceMode = false
): Promise<{ ok: boolean; error?: string; }> {
    try {
        // Fenetre deja ouverte -> focus
        const existing = openWindows.get(userId);
        if (existing && !existing.isDestroyed()) {
            existing.show();
            existing.focus();
            return { ok: true };
        }

        // ID unique par instance - Windows groupe les fenetres par AppUserModelId
        // En donnant un ID different a chaque fenetre, elles ne se regroupent pas
        const uniqueAppId = `midnightcord.instance.${userId}.${Date.now()}`;

        // Icone : rotation 1→2→3→4→5→1→... depuis multi-instance-icons/
        let currentIconPath = "";
        const iconDir = getDetachedIconDir();
        currentIconPath = join(iconDir, `${iconCounter}.ico`);
        if (!existsSync(currentIconPath)) currentIconPath = "";
        iconCounter = iconCounter >= 5 ? 1 : iconCounter + 1;

        // Session Electron isolee par userId
        const savedPartition = `persist:midnightcord-mi-${userId}`;
        if (blockExternalTokenAccess) {
            try {
                const savedSes = session.fromPartition(savedPartition, { cache: true });
                await savedSes.clearStorageData();
                await savedSes.clearCache();
            } catch {}
        }

        const partition = blockExternalTokenAccess
            ? `midnightcord-mi-${userId}-${Date.now()}`
            : savedPartition;
        const ses = session.fromPartition(partition, { cache: !blockExternalTokenAccess });

        ses.webRequest.onBeforeRequest({ urls: ["*://*.discord.com/handoff*", "*://discord.com/handoff*"] }, (details, callback) => {
            callback({ cancel: true });
        });

        ses.webRequest.onHeadersReceived((details, callback) => {
            const headers = { ...details.responseHeaders };
            for (const key of Object.keys(headers)) {
                const low = key.toLowerCase();
                if (low === "content-security-policy" || low === "permissions-policy" || low === "feature-policy") {
                    delete headers[key];
                }
            }
            callback({ responseHeaders: headers });
        });

        registerMediaPermissionsForSession(ses);

        const sharedSettings = await captureAndMergeSharedSettings(_);
        const preloadPath = createTokenPreload(token, sharedSettings);
        ses.setPreloads([preloadPath]);

        const win = new BrowserWindow({
            width: 1280,
            height: 800,
            minWidth: 940,
            minHeight: 500,
            parent: undefined,
            skipTaskbar: false,
            frame: false,
            transparent: false,
            titleBarStyle: "hidden",
            autoHideMenuBar: true,
            darkTheme: true,
            backgroundColor: "#313338",
            title: `Midnightcord [${username || userId}]`,
            icon: currentIconPath || undefined,
            webPreferences: {
                preload: join(__dirname, "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                session: ses,
                webSecurity: false,
                backgroundThrottling: performanceMode,
            },
        });

        // CRITIQUE : setAppDetails DOIT etre appele immediatement apres new BrowserWindow,
        // avant que la fenetre soit affichee. C'est ce qui empeche Windows de grouper
        // les fenetres ensemble dans la barre des taches.
        if (process.platform === "win32") {
            try {
                win.setAppDetails({
                    appId: uniqueAppId,
                    appIconPath: currentIconPath || undefined,
                    relaunchDisplayName: `Midnightcord [${username || userId}]`,
                });
            } catch (err) {
                console.warn("[MidnightcordMI] setAppDetails failed:", err);
            }
        }

        openWindows.set(userId, win);

        win.on("enter-html-full-screen", () => {
            win.setFullScreen(true);
        });
        win.on("leave-html-full-screen", () => {
            win.setFullScreen(false);
        });

        // Avant fermeture : désinscrit les service workers et coupe le gateway
        // pour stopper toutes les notifications push
        win.on("close", () => {
            wc.executeJavaScript(`
                (async () => {
                    try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (const r of regs) await r.unregister();
                    } catch(e) {}
                    try {
                        // Coupe la connexion gateway Discord
                        const ws = window.__MIDNIGHTCORD_GW_WS__;
                        if (ws && ws.readyState <= 1) ws.close(4000, 'window_close');
                    } catch(e) {}
                })();
            `).catch(() => {});
        });

        // Enregistre les handlers IPC de contrôle de fenêtre (DISCORD_WINDOW_*) sur ce webContents
        // Doit être fait AVANT que Discord charge son JS (dom-ready)
        const wc = win.webContents;
        const cleanupIpc = registerWindowControlIpc(win);
        // Redirige les IPC de badge/notification vers CETTE fenêtre (pas la fenêtre principale)
        const cleanupNotifIpc = registerNotificationIpc(win);

        win.once("closed", () => {
            cleanupIpc();
            cleanupNotifIpc();
            openWindows.delete(userId);
            // Nettoie les service workers de la session pour couper définitivement les notifs
            ses.clearStorageData({ storages: ["serviceworkers"] }).catch(() => {});
            // Supprime le fichier de preload temporaire pour éviter qu'ils s'accumulent sur disque
            try { unlinkSync(preloadPath); } catch {}
        });

        // Flash quand il y a des notifs
        wc.on("page-title-updated", (e, title) => {
            if (process.platform === "win32") {
                if (/^\(\d+\)/.test(title)) win.flashFrame(true);
                else win.flashFrame(false);
            }
        });

        // Injection du token
        const cleanTok = String(token || "").trim().replace(/^"+|"+$/g, "");
        const safeTokenStr = JSON.stringify(cleanTok);
        const injectJs = `(function(){
            try {
                const raw = ${safeTokenStr};
                if (!raw || raw === "undefined") return;
                const q = JSON.stringify(raw);
                localStorage.setItem("token", q);
                localStorage.setItem("default_token", q);
                localStorage.removeItem("multiaccount_tokens");
                if ((window.location.pathname.includes("/login") || window.location.pathname === "/") && !window.__mi_auto_redirected) {
                    window.__mi_auto_redirected = true;
                    window.location.href = "https://discord.com/channels/@me";
                }
            } catch(e) {}
        })();`;
        wc.on("dom-ready", () => wc.executeJavaScript(injectJs).catch(() => { }));
        wc.on("did-finish-load", () => wc.executeJavaScript(injectJs).catch(() => { }));
        wc.on("did-navigate", () => wc.executeJavaScript(injectJs).catch(() => { }));

        // Titre de la fenetre
        wc.on("page-title-updated", (e, title) => {
            const cleanTitle = title.replace(/^\(\d+\)\s*/, "").replace(/\s*\[.*\]$/, "");
            win.setTitle(`${cleanTitle} [${username || userId}]`);
            e.preventDefault();
        });

        wc.on("will-navigate", (e, url) => {
            if (url.includes("/handoff")) {
                e.preventDefault();
                return;
            }
            if (!/^https:\/\/(ptb\.|canary\.)?discord\.com/.test(url)) e.preventDefault();
        });

        wc.setWindowOpenHandler(({ url }) => {
            if (url.includes("/handoff")) return { action: "deny" };
            if (url.startsWith("http")) require("electron").shell.openExternal(url);
            return { action: "deny" };
        });

        const validDomains = ["discord.com", "ptb.discord.com", "canary.discord.com"];
        const targetDomain = validDomains.includes(domain) ? domain : "discord.com";
        await win.loadURL(`https://${targetDomain}/channels/@me`);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fenetres « groupées » — meme groupe que Midnightcord dans la barre des taches
// Principe : on ne touche PAS a setAppDetails => la fenetre herite de l'AppId
// du processus principal (com.midnightcord.app), Windows la groupe automatiquement
// ─────────────────────────────────────────────────────────────────────────────

const openGroupedWindows = new Map<string, BrowserWindow>();

export async function openInstanceWindowGrouped(
    _: any,
    token: string,
    userId: string,
    username = "",
    domain = "discord.com",
    blockExternalTokenAccess = false,
    performanceMode = false
): Promise<{ ok: boolean; error?: string; }> {
    try {
        // Focus si deja ouverte
        const existing = openGroupedWindows.get(userId);
        if (existing && !existing.isDestroyed()) {
            existing.show();
            existing.focus();
            return { ok: true };
        }

        // Session isolee par userId
        const savedPartition = `persist:midnightcord-mi-${userId}`;
        if (blockExternalTokenAccess) {
            try {
                const savedSes = session.fromPartition(savedPartition, { cache: true });
                await savedSes.clearStorageData();
                await savedSes.clearCache();
            } catch {}
        }

        const partition = blockExternalTokenAccess
            ? `midnightcord-mi-${userId}-${Date.now()}`
            : savedPartition;
        const ses = session.fromPartition(partition, { cache: !blockExternalTokenAccess });

        ses.webRequest.onBeforeRequest({ urls: ["*://*.discord.com/handoff*", "*://discord.com/handoff*"] }, (details, callback) => {
            callback({ cancel: true });
        });

        ses.webRequest.onHeadersReceived((details, callback) => {
            const headers = { ...details.responseHeaders };
            for (const key of Object.keys(headers)) {
                const low = key.toLowerCase();
                if (low === "content-security-policy" || low === "permissions-policy" || low === "feature-policy") {
                    delete headers[key];
                }
            }
            callback({ responseHeaders: headers });
        });

        registerMediaPermissionsForSession(ses);

        const sharedSettings = await captureAndMergeSharedSettings(_);
        const preloadPath = createTokenPreload(token, sharedSettings);
        ses.setPreloads([preloadPath]);

        const win = new BrowserWindow({
            width: 1280,
            height: 800,
            minWidth: 940,
            minHeight: 500,
            parent: undefined,
            skipTaskbar: false,
            frame: false,
            transparent: false,
            titleBarStyle: "hidden",
            autoHideMenuBar: true,
            darkTheme: true,
            backgroundColor: "#313338",
            title: `Midnightcord [${username || userId}]`,
            webPreferences: {
                preload: join(__dirname, "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                session: ses,
                webSecurity: false,
                backgroundThrottling: performanceMode,
            },
        });

        openGroupedWindows.set(userId, win);

        win.on("enter-html-full-screen", () => {
            win.setFullScreen(true);
        });
        win.on("leave-html-full-screen", () => {
            win.setFullScreen(false);
        });

        // Avant fermeture : désinscrit les service workers et coupe le gateway
        win.on("close", () => {
            wc.executeJavaScript(`
                (async () => {
                    try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (const r of regs) await r.unregister();
                    } catch(e) {}
                    try {
                        const ws = window.__MIDNIGHTCORD_GW_WS__;
                        if (ws && ws.readyState <= 1) ws.close(4000, 'window_close');
                    } catch(e) {}
                })();
            `).catch(() => {});
        });

        // Enregistre les handlers IPC de contrôle de fenêtre pour cette instance groupée
        const wc = win.webContents;
        const cleanupIpc = registerWindowControlIpc(win);
        // Redirige les IPC de badge/notification vers CETTE fenêtre (pas la fenêtre principale)
        const cleanupNotifIpc = registerNotificationIpc(win);

        win.once("closed", () => {
            cleanupIpc();
            cleanupNotifIpc();
            openGroupedWindows.delete(userId);
            ses.clearStorageData({ storages: ["serviceworkers"] }).catch(() => {});
            try { unlinkSync(preloadPath); } catch {}
        });

        wc.on("page-title-updated", (e, title) => {
            if (process.platform === "win32") {
                if (/^\(\d+\)/.test(title)) win.flashFrame(true);
                else win.flashFrame(false);
            }
        });

        const cleanTok = String(token || "").trim().replace(/^"+|"+$/g, "");
        const safeTokenStr = JSON.stringify(cleanTok);
        const injectJs = `(function(){
            try {
                const raw = ${safeTokenStr};
                if (!raw || raw === "undefined") return;
                const q = JSON.stringify(raw);
                localStorage.setItem("token", q);
                localStorage.setItem("default_token", q);
                localStorage.removeItem("multiaccount_tokens");
                if ((window.location.pathname.includes("/login") || window.location.pathname === "/") && !window.__mi_auto_redirected) {
                    window.__mi_auto_redirected = true;
                    window.location.href = "https://discord.com/channels/@me";
                }
            } catch(e) {}
        })();`;
        wc.on("dom-ready", () => wc.executeJavaScript(injectJs).catch(() => {}));
        wc.on("did-finish-load", () => wc.executeJavaScript(injectJs).catch(() => {}));
        wc.on("did-navigate", () => wc.executeJavaScript(injectJs).catch(() => {}));

        wc.on("page-title-updated", (e, title) => {
            const cleanTitle = title.replace(/^\(\d+\)\s*/, "").replace(/\s*\[.*\]$/, "");
            win.setTitle(`${cleanTitle} [${username || userId}]`);
            e.preventDefault();
        });

        wc.on("will-navigate", (e, url) => {
            if (url.includes("/handoff")) {
                e.preventDefault();
                return;
            }
            if (!/^https:\/\/(ptb\.|canary\.)?discord\.com/.test(url)) e.preventDefault();
        });

        wc.setWindowOpenHandler(({ url }) => {
            if (url.includes("/handoff")) return { action: "deny" };
            if (url.startsWith("http")) require("electron").shell.openExternal(url);
            return { action: "deny" };
        });

        const validDomains = ["discord.com", "ptb.discord.com", "canary.discord.com"];
        const targetDomain = validDomains.includes(domain) ? domain : "discord.com";
        await win.loadURL(`https://${targetDomain}/channels/@me`);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Split screen : positionne les deux fenêtres côte à côte
// ─────────────────────────────────────────────────────────────────────────────

export async function arrangeSplit(_: any, userId: string): Promise<void> {
    try {
        const secondWin = openWindows.get(userId);
        if (!secondWin || secondWin.isDestroyed()) return;

        const allWins = BrowserWindow.getAllWindows();
        const mainWin = allWins.find(w => w !== secondWin && !w.isDestroyed());
        if (!mainWin) return;

        const display = screen.getDisplayMatching(mainWin.getBounds());
        const { x, y, width, height } = display.workArea;
        const half = Math.floor(width / 2);

        mainWin.setBounds({ x, y, width: half, height }, true);
        secondWin.setBounds({ x: x + half, y, width: width - half, height }, true);
        secondWin.show();
        secondWin.focus();
    } catch (e) {
        console.error("[MidnightcordMI] arrangeSplit error:", e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Liste / ferme les instances
// ─────────────────────────────────────────────────────────────────────────────

export async function getOpenInstances(_: any): Promise<string[]> {
    return [...openWindows.entries(), ...openGroupedWindows.entries()]
        .filter(([, w]) => !w.isDestroyed())
        .map(([id]) => id);
}

export async function closeInstance(_: any, userId: string): Promise<void> {
    const win = openWindows.get(userId) || openGroupedWindows.get(userId);
    if (win && !win.isDestroyed()) {
        (win as any)._userRequestedClose = true;
        win.close();
    }
}
