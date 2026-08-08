// Midnightcord entry point
"use strict";
const path = require("path");
const Module = require("module");
const fs = require("fs");
const { app } = require("electron");

// ─────────────────────────────────────────────────────────────────────────────
// PENDING UPDATE CHECK — must run BEFORE any dist/ file is loaded (= locked).
// When the in-app updater stages an update it writes a marker file next to this
// script.  We apply it here (simple file copy) while nothing is locked yet,
// then delete the marker and continue the normal boot.
// This is what prevents the infinite-restart loop.
// ─────────────────────────────────────────────────────────────────────────────
(function applyPendingUpdate() {
    const markerPath = path.join(__dirname, "dist", "midnightcord", "midnightcord-pending-update.json");
    if (!fs.existsSync(markerPath)) return;

    let marker;
    try {
        marker = JSON.parse(fs.readFileSync(markerPath, "utf-8"));
    } catch {
        try { fs.unlinkSync(markerPath); } catch { }
        return;
    }

    const { stagingDir, destDir } = marker;
    if (!stagingDir || !destDir || !fs.existsSync(stagingDir)) {
        try { fs.unlinkSync(markerPath); } catch { }
        return;
    }

    console.log("[Midnightcord] Applying pending update from", stagingDir, "→", destDir);

    function copyDirSync(src, dest) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyDirSync(srcPath, destPath);
            } else {
                try {
                    fs.copyFileSync(srcPath, destPath);
                } catch (e) {
                    console.warn("[Midnightcord] Could not copy", srcPath, ":", e.message);
                }
            }
        }
    }

    try {
        copyDirSync(stagingDir, destDir);
        console.log("[Midnightcord] Pending update applied successfully.");
    } catch (e) {
        console.error("[Midnightcord] Failed to apply pending update:", e.message);
    }

    // Always delete marker and staging dir so we don't loop
    try { fs.unlinkSync(markerPath); } catch { }
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { }
})();
// ─────────────────────────────────────────────────────────────────────────────

// Midnightcord mod data directory is managed by DATA_DIR in constants.ts
const midnightcordData = path.join(app.getPath("appData"), "Midnightcord");


// AppUserModelId unique — Windows reconnaît Midnightcord comme app séparée de Discord
app.setAppUserModelId("com.squirrel.Discord.Discord");

// Flags Chromium utiles uniquement (suppression des flags qui nuisent au démarrage :
// process-per-site, renderer-process-limit, enable-low-end-device-mode forçaient
// des sous-processus et désactivaient l'accélération GPU → freeze sur splash screen)
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disk-cache-size", "104857600");

app.once("ready", () => {
    try {
        // Liste des modules natifs qui causent des erreurs 403 inutiles
        // NB: discord_overlay est intentionnellement ABSENT de cette liste —
        //     il doit pouvoir s'initialiser localement pour que l'overlay en jeu fonctionne.
        //     Seuls les modules vraiment inutiles pour Midnightcord sont bloqués.
        const BLOCKED_MODULES = new Set([
            // "discord_overlay",  // RETIRE — nécessaire pour l'overlay in-game
            "discord_rpc",
            "discord_dispatch",
            "discord_erinn",
        ]);

        const { session, shell } = require("electron");
        const { webContents: webContentsModule } = require("electron");

        // URLs Discord légitimes à ne pas bloquer dans will-navigate
        function isDiscordUrl(url) {
            return url.startsWith("https://discord.com") ||
                url.startsWith("https://canary.discord.com") ||
                url.startsWith("https://ptb.discord.com") ||
                url.startsWith("file://") ||
                url.startsWith("devtools://") ||
                url.startsWith("about:");
        }

        function patchWebContents(wc) {
            if (wc._midnightcordPatched) return;
            wc._midnightcordPatched = true;

            wc.setWindowOpenHandler(({ url, frameName }) => {
                if (frameName && (frameName.includes("Overlay") || frameName.startsWith("DISCORD_"))) {
                    if (frameName.includes("Overlay")) return { action: "deny" };
                }
                if (!url || url === "about:blank" || url.startsWith("devtools://")) {
                    return { action: "allow" };
                }
                if (!isDiscordUrl(url)) {
                    shell.openExternal(url).catch(() => {});
                    console.log("[Midnightcord][LINK] External link opened:", url);
                    return { action: "deny" };
                }
                return { action: "allow" };
            });

            wc.on("did-create-window", (childWin, details) => {
                // Hide immediately to prevent white popup window from rendering on screen
                try { childWin.hide(); } catch {}

                const childWc = childWin.webContents;
                if (childWc._midnightcordPatched) return;
                childWc._midnightcordPatched = true;

                const openUrl = details && details.url;
                if (openUrl && openUrl !== "about:blank" && !openUrl.startsWith("devtools://") && !isDiscordUrl(openUrl)) {
                    shell.openExternal(openUrl).catch(() => {});
                    console.log("[Midnightcord][NEW-WIN-DETAIL] Redirection externe:", openUrl);
                    try { childWin.destroy(); } catch (_) {}
                    return;
                }

                childWc.on("will-navigate", (event, url) => {
                    if (!isDiscordUrl(url)) {
                        event.preventDefault();
                        shell.openExternal(url).catch(() => {});
                        console.log("[Midnightcord][CHILD-NAV] Redirection externe:", url);
                        try { childWin.destroy(); } catch (_) {}
                    }
                });

                childWc.on("did-navigate", (_event, url) => {
                    if (!isDiscordUrl(url)) {
                        shell.openExternal(url).catch(() => {});
                        console.log("[Midnightcord][CHILD-DID-NAV] Redirection externe:", url);
                        try { childWin.destroy(); } catch (_) {}
                    }
                });

                childWc.setWindowOpenHandler(({ url }) => {
                    if (!url || url === "about:blank" || url.startsWith("devtools://")) return { action: "allow" };
                    shell.openExternal(url).catch(() => {});
                    console.log("[Midnightcord][CHILD-LINK] Ouverture externe:", url);
                    return { action: "deny" };
                });

                childWc.on("did-finish-load", () => {
                    const url = childWc.getURL();
                    if (url && url !== "about:blank" && !isDiscordUrl(url)) {
                        shell.openExternal(url).catch(() => {});
                        console.log("[Midnightcord][CHILD-LOAD] Fermeture et redirection:", url);
                        try { childWin.destroy(); } catch (_) {}
                    }
                });

                // Destroy any lingering blank popup after 100ms
                setTimeout(() => {
                    try {
                        if (!childWin.isDestroyed()) {
                            const u = childWc.getURL();
                            const title = childWin.getTitle();
                            if (!u || u === "about:blank" || u.includes("/popup") || title === "discord" || title === "Discord Popup") {
                                try { childWin.destroy(); } catch (_) {}
                            }
                        }
                    } catch (_) {}
                }, 100);
            });

            wc.on("will-navigate", (event, url) => {
                const currentUrl = wc.getURL();
                if (url !== currentUrl && !isDiscordUrl(url)) {
                    event.preventDefault();
                    shell.openExternal(url).catch(() => {});
                    console.log("[Midnightcord][NAV] Redirection externe:", url);
                }
            });
        }

        // Patcher tous les webContents créés (fenêtres ET popups)
        app.on("browser-window-created", (_, win) => {
            patchWebContents(win.webContents);
        });

        // Patcher aussi les webContents créés sans BrowserWindow (popups détachés, etc.)
        app.on("web-contents-created", (_, wc) => {
            patchWebContents(wc);
        });

        // Patcher les webContents déjà existants au moment du ready
        for (const wc of webContentsModule.getAllWebContents()) {
            patchWebContents(wc);
        }

        console.log("[Midnightcord] Patch liens externes activé sur TOUS les webContents (avec did-create-window) ✓");

        app.once("browser-window-created", (_, win) => {

            try {
                const ses = session.defaultSession;
                ses.webRequest.onBeforeRequest(
                    { urls: ["https://discord.com/api/modules/*"] },
                    (details, callback) => {
                        const url = details.url;
                        let isBlocked = false;
                        for (const m of BLOCKED_MODULES) { if (url.includes(m)) { isBlocked = true; break; } }
                        if (isBlocked) {
                            // Bloquer silencieusement — évite le 403 + les logs d'erreur
                            console.log("[Midnightcord] Module bloqué (inutile pour Midnightcord):", url.split("/").slice(-2).join("/"));
                            callback({ cancel: true });
                        } else {
                            callback({});
                        }
                    }
                );
                console.log("[Midnightcord] Filtre modules 403 activé ✓");
            } catch (e) {
                console.warn("[Midnightcord] Impossible d'activer le filtre modules:", e.message);
            }
        });
    } catch (e) {
        console.warn("[Midnightcord] FIX modules 403 failed:", e.message);
    }
});


// Modules bundlés dans midnightcord-dist/modules/
const bundledModulesPath = path.join(path.dirname(process.execPath), "modules");
const moduleDataPath = path.join(app.getPath("appData"), "discord", "module_data");

// ── DÉTECTION AUTOMATIQUE du dossier modules de Discord stable ───────────────
// Les modules natifs (discord_voice, discord_krisp...) sont dans AppData\Local\Discord\app-X.X.XXXX\modules\
// et NON dans AppData\Roaming\discord\module_data\ (qui est souvent vide).
// On détecte automatiquement la version installée pour avoir le bon chemin.
const discordLocalBase = path.join(app.getPath("appData"), "..", "Local", "Discord");
let discordNativeModulesPath = null;
try {
    const entries = fs.readdirSync(discordLocalBase)
        .filter(e => e.startsWith("app-"))
        .map(e => ({ name: e, full: path.join(discordLocalBase, e, "modules") }))
        .filter(e => fs.existsSync(e.full))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    if (entries.length > 0) {
        discordNativeModulesPath = entries[0].full;
        console.log("[Midnightcord] Modules natifs Discord détectés:", discordNativeModulesPath);
    }
} catch (e) {
    console.warn("[Midnightcord] Impossible de détecter les modules natifs Discord:", e.message);
}

// Utilise un Set pour les ajouts O(1) (au lieu de .includes() O(n) en boucle)
const _globalPathsSet = new Set(Module.globalPaths);

function addGlobalPath(p) {
    try {
        if (!_globalPathsSet.has(p) && fs.existsSync(p)) {
            _globalPathsSet.add(p);
            Module.globalPaths.push(p);
        }
    } catch (_) { }
}

// Priorité aux modules bundlés (portables, dans midnightcord-dist/modules/)
addGlobalPath(bundledModulesPath);

// Ajout des modules natifs Discord (discord_voice, discord_krisp, etc.)
if (discordNativeModulesPath) {
    addGlobalPath(discordNativeModulesPath);
    try {
        for (const mod of fs.readdirSync(discordNativeModulesPath)) {
            const modDir = path.join(discordNativeModulesPath, mod);
            try { if (!fs.statSync(modDir).isDirectory()) continue; } catch { continue; }
            addGlobalPath(modDir);
            // Entrer dans le sous-dossier du module (ex: discord_voice-1/discord_voice/)
            try {
                for (const sub of fs.readdirSync(modDir)) {
                    const subDir = path.join(modDir, sub);
                    try { if (fs.statSync(subDir).isDirectory()) addGlobalPath(subDir); } catch { }
                }
            } catch { }
        }
    } catch (e) { console.warn("[Midnightcord] Erreur lors du scan des modules natifs:", e.message); }
}
try {
    for (const mod of fs.readdirSync(bundledModulesPath)) {
        const modDir = path.join(bundledModulesPath, mod);
        try { if (!fs.statSync(modDir).isDirectory()) continue; } catch { continue; }
        addGlobalPath(modDir);
        try {
            for (const ver of fs.readdirSync(modDir)) {
                const verDir = path.join(modDir, ver);
                try { if (fs.statSync(verDir).isDirectory()) addGlobalPath(verDir); } catch { }
            }
        } catch { }
    }
} catch (e) { }

// Fallback : module_data utilisateur
addGlobalPath(moduleDataPath);
try {
    for (const mod of fs.readdirSync(moduleDataPath)) {
        const modDir = path.join(moduleDataPath, mod);
        try { if (!fs.statSync(modDir).isDirectory()) continue; } catch { continue; }
        addGlobalPath(modDir);
        try {
            for (const ver of fs.readdirSync(modDir)) {
                const verDir = path.join(modDir, ver);
                try { if (fs.statSync(verDir).isDirectory()) addGlobalPath(verDir); } catch { }
            }
        } catch { }
    }
} catch (e) { }

// Ce patch garantit que les modules chargés depuis l'asar Discord (qui ont
// parent.paths = []) trouvent quand même les modules natifs Midnightcord.
// Node.js injecte déjà Module.globalPaths nativement dans tous les autres cas.
const _globalPathsArr = Module.globalPaths.slice();
const _origResolve = Module._resolveLookupPaths;
Module._resolveLookupPaths = function (request, parent) {
    // Uniquement pour les contextes asar isolés (paths vide) —
    // dans tous les autres cas, Node gère globalPaths lui-même, on ne touche à rien.
    if (parent && (!parent.paths || parent.paths.length === 0)) {
        parent.paths = _globalPathsArr.slice();
    }
    return _origResolve.call(this, request, parent);
};

// Chercher discord_desktop_core dans cet ordre :
// 1. modules bundlés (portable)
// 2. modules natifs Discord local (AppData\Local\Discord\app-X\modules\)
// 3. module_data Roaming (fallback)
const coreModuleDir = path.join(bundledModulesPath, "discord_desktop_core-1", "discord_desktop_core");
const coreModuleDirNative = discordNativeModulesPath
    ? path.join(discordNativeModulesPath, "discord_desktop_core-1", "discord_desktop_core")
    : null;
global.mainAppDirname = fs.existsSync(coreModuleDir)
    ? coreModuleDir
    : (coreModuleDirNative && fs.existsSync(coreModuleDirNative))
        ? coreModuleDirNative
        : path.join(moduleDataPath, "discord_desktop_core");
console.log("[Midnightcord] mainAppDirname:", global.mainAppDirname);

// Cleanup legacy localModulesRoot in build_info.json so Discord uses its native voice modules and preserves audio settings
try {
    const buildInfoPath = path.join(path.dirname(process.execPath), "resources", "build_info.json");
    if (fs.existsSync(buildInfoPath)) {
        const buildInfoRaw = fs.readFileSync(buildInfoPath, "utf-8");
        if (buildInfoRaw.includes('"localModulesRoot"')) {
            const buildInfo = JSON.parse(buildInfoRaw);
            delete buildInfo.localModulesRoot;
            fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
            console.log("[Midnightcord] Cleaned legacy localModulesRoot from build_info.json");
        }
    }
} catch { }

require(path.join(__dirname, "dist", "desktop", "patcher.js"));
