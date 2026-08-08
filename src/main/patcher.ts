/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { onceDefined } from "@shared/onceDefined";
import electron, { app, BrowserWindowConstructorOptions, Menu, session } from "electron";
import { existsSync as fsExistsSync, statSync as fsStatSync } from "original-fs";
import { dirname, join } from "path";

import { registerMediaPermissionsForSession } from "../midnightcord/main/mediaPermissions";
import { startNativeUpdateRepair } from "./patchNativeUpdater";
import { RendererSettings } from "./settings";
import { patchTrayMenu } from "./trayMenu";
import { IS_VANILLA } from "./utils/constants";

console.log("[Midnightcord] Starting up...");
if (process.platform === "linux") app.setDesktopName("midnightcord.desktop");

// Our injector file at app/index.js
const injectorPath = require.main!.filename;

// The original app.asar
const _asarFromInjector = join(dirname(injectorPath), "..", "_app.asar");
const _asarFromResources = join(process.resourcesPath, "_app.asar");
const asarPath = (fsExistsSync(_asarFromInjector) && !fsStatSync(_asarFromInjector).isDirectory())
    ? _asarFromInjector
    : _asarFromResources;

const discordPkg = require(join(asarPath, "package.json"));
require.main!.filename = join(asarPath, discordPkg.main);
if (IS_VESKTOP || IS_EQUIBOP) require.main!.filename = join(dirname(injectorPath), "..", "..", "package.json");

// @ts-expect-error Untyped method? Dies from cringe
app.setAppPath(asarPath);

if (!IS_VANILLA) {
    const settings = RendererSettings.store;

    patchTrayMenu();
    startNativeUpdateRepair(injectorPath);

    if (process.platform === "win32") {
        if (settings.winCtrlQ) {
            const originalBuild = Menu.buildFromTemplate;
            Menu.buildFromTemplate = function (template) {
                if (template[0]?.label === "&File") {
                    const { submenu } = template[0];
                    if (Array.isArray(submenu)) {
                        submenu.push({
                            label: "Quit (Hidden)",
                            visible: false,
                            acceleratorWorksWhenHidden: true,
                            accelerator: "Control+Q",
                            click: () => app.quit()
                        });
                    }
                }
                return originalBuild.call(this, template);
            };
        }
    }

    class BrowserWindow extends electron.BrowserWindow {
        constructor(options: BrowserWindowConstructorOptions) {
            const titleLower = (options?.title ?? "").toLowerCase();
            const preloadLower = (options?.webPreferences?.preload ?? "").toLowerCase();
            const isOverlay = titleLower.includes("overlay") || preloadLower.includes("overlay") || (options as any)?.isOverlay;

            if (isOverlay) {
                options.transparent = true;
                options.backgroundColor = "#00000000";
                options.hasShadow = false;
                options.frame = false;
                super(options);
                try {
                    this.setBackgroundColor("#00000000");
                } catch {}
                return;
            }

            // On n'injecte le preload Midnightcord QUE dans les fenêtres Discord/Midnightcord légitimes.
            const ourPreload = join(__dirname, "preload.js");
            const preloadIsOurs = options.webPreferences.preload === ourPreload;
            const KNOWN_TITLES = /^(Discord|Vesktop|Equibop)$|^(Midnightcord|Equicord)|Overlay/i;
            const isTrustedTitle = !!(options.title && KNOWN_TITLES.test(options.title));
            const isVBCable = !!(options.title && options.title.includes("VB-Cable"));

            if (options?.webPreferences?.preload && (isTrustedTitle || isVBCable || preloadIsOurs)) {
                const original = options.webPreferences.preload;
                const isMainWindow = options.title === "Discord";
                options.webPreferences.preload = join(__dirname, "preload.js");
                options.webPreferences.sandbox = false;
                options.webPreferences.backgroundThrottling = false;
                options.webPreferences.webviewTag = true;

                let ses = options.webPreferences.session;
                if (!ses && options.webPreferences.partition) {
                    ses = electron.session.fromPartition(options.webPreferences.partition);
                }
                ses ??= electron.session.defaultSession;
                registerMediaPermissionsForSession(ses);

                if (settings.frameless) {
                    options.frame = false;
                } else if (settings.mainWindowFrameless && isMainWindow) {
                    options.frame = false;
                } else if (process.platform === "win32" && settings.winNativeTitleBar) {
                    delete options.frame;
                }

                if (settings.transparent) {
                    options.transparent = true;
                    options.backgroundColor = "#00000000";
                }

                // Windows 11 acrylic/mica effect
                const winMaterial = settings.windowMaterial as string | undefined;
                if (process.platform === "win32" && winMaterial && winMaterial !== "none") {
                    options.transparent = true;
                    options.backgroundColor = "#00000000";
                }

                if (settings.disableMinSize) {
                    options.minWidth = 0;
                    options.minHeight = 0;
                }

                const needsVibrancy = process.platform === "darwin" && settings.macosVibrancyStyle;

                if (needsVibrancy) {
                    options.backgroundColor = "#00000000";
                    if (settings.macosVibrancyStyle) {
                        options.vibrancy = settings.macosVibrancyStyle;
                    }
                }

                options.fullscreenable = true;

                process.env.DISCORD_PRELOAD = original;

                super(options);

                if (settings.streamProof) {
                    try {
                        this.setContentProtection(true);
                    } catch (e) {
                        console.error("Failed to set content protection on startup:", e);
                    }
                }

                const isTransparent = !!options.transparent;
                let isFakeFullScreen = false;
                let originalBounds: electron.Rectangle | null = null;
                let isMaximizedBefore = false;
                let transitioning = false;

                const superSetFullScreen = this.setFullScreen.bind(this);
                const superIsFullScreen = this.isFullScreen.bind(this);

                this.setFullScreen = (flag: boolean) => {
                    if (transitioning) return;
                    transitioning = true;
                    try {
                        if (isTransparent) {
                            if (flag) {
                                if (isFakeFullScreen) return;
                                isFakeFullScreen = true;
                                originalBounds = this.getBounds();
                                isMaximizedBefore = this.isMaximized();
                                const display = electron.screen.getDisplayMatching(originalBounds).bounds;
                                this.setResizable(false);
                                this.setBounds(display);
                                this.setAlwaysOnTop(true, "screen-saver");
                                this.emit("enter-full-screen");
                            } else {
                                if (!isFakeFullScreen) return;
                                isFakeFullScreen = false;
                                this.setAlwaysOnTop(false);
                                this.setResizable(true);
                                if (isMaximizedBefore) {
                                    this.maximize();
                                } else if (originalBounds) {
                                    this.setBounds(originalBounds);
                                }
                                this.emit("leave-full-screen");
                            }
                        } else {
                            superSetFullScreen(flag);
                        }
                    } finally {
                        transitioning = false;
                    }
                };

                this.isFullScreen = () => {
                    if (isTransparent) return isFakeFullScreen;
                    return superIsFullScreen();
                };

                if (isTransparent) {
                    this.on("enter-html-full-screen", () => {
                        if (!isFakeFullScreen) this.setFullScreen(true);
                    });
                    this.on("leave-html-full-screen", () => {
                        if (isFakeFullScreen) this.setFullScreen(false);
                    });
                } else {
                    this.on("enter-html-full-screen", () => {
                        if (!superIsFullScreen()) superSetFullScreen(true);
                    });
                    this.on("leave-html-full-screen", () => {
                        if (superIsFullScreen()) superSetFullScreen(false);
                    });
                }

                this.webContents.on("before-input-event", (event, input) => {
                    if (input.type === "keyDown" && input.key === "F11" && !input.control && !input.shift && !input.alt && !input.meta) {
                        event.preventDefault();
                        this.setFullScreen(!this.isFullScreen());
                    }
                });

                if (process.platform === "win32" && winMaterial && winMaterial !== "none") {
                    try {
                        let applied = false;
                        if (typeof this.setBackgroundMaterial === "function") {
                            this.setBackgroundMaterial(winMaterial);
                            applied = true;
                        }
                        if (!applied && typeof this.setVibrancy === "function") {
                            this.setVibrancy(winMaterial === "acrylic" ? "acrylic" : "under-window");
                            applied = true;
                        }
                        if (!applied) {
                            console.warn("[Midnightcord] No background material API available on this system");
                        }
                    } catch (e) {
                        console.error("[Midnightcord] setBackgroundMaterial failed:", e);
                    }
                }

                if (settings.disableMinSize) {
                    this.setMinimumSize = (_width: number, _height: number) => { };
                }
            } else {
                if (options && options.title !== "Discord") {
                    options.backgroundColor ??= "#1e1f22";
                }
                super(options);
            }
        }
    }
    Object.assign(BrowserWindow, electron.BrowserWindow);
    Object.defineProperty(BrowserWindow, "name", { value: "BrowserWindow", configurable: true });

    const electronPath = require.resolve("electron");
    delete require.cache[electronPath]!.exports;
    require.cache[electronPath]!.exports = {
        ...electron,
        BrowserWindow
    };

    onceDefined(global, "appSettings", s => {
        s.set("DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", true);
    });

function isInternalAppUrl(rawUrl: string): boolean {
    if (!rawUrl || rawUrl === "about:blank") return true;
    if (rawUrl.startsWith("file://") || rawUrl.startsWith("devtools://") || rawUrl.startsWith("about:")) return true;

    try {
        const u = new URL(rawUrl);
        const host = u.hostname.toLowerCase();
        const path = u.pathname.toLowerCase();

        // Captchas inside Discord
        if (host.includes("hcaptcha.com") || host.includes("recaptcha.net")) return true;
        if (host.includes("google.com") && path.startsWith("/recaptcha")) return true;
        if ((host === "discord.com" || host.endsWith(".discord.com")) && path.startsWith("/cdn-cgi/")) return true;

        // Legitimate Discord App windows (Main Client & Chat/Voice Popouts)
        if (host === "discord.com" || host === "canary.discord.com" || host === "ptb.discord.com") {
            if (path.startsWith("/channels/") || path === "/popout" || path.startsWith("/popout/")) {
                return true;
            }
        }
    } catch {}

    return false;
}

function patchWebContents(wc: electron.WebContents) {
    if ((wc as any)._midnightcordPatched) return;
    (wc as any)._midnightcordPatched = true;

    wc.setWindowOpenHandler(({ url, frameName }) => {
        const isOverlay = frameName && (frameName.toLowerCase().includes("overlay") || frameName.startsWith("DISCORD_"));
        if (isOverlay) {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    transparent: true,
                    backgroundColor: "#00000000",
                    frame: false,
                    hasShadow: false
                }
            };
        }
        if (!url || url === "about:blank" || url.startsWith("devtools://")) {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    show: false,
                    width: 0,
                    height: 0,
                    x: -9999,
                    y: -9999,
                    skipTaskbar: true,
                    frame: false,
                    transparent: true,
                    backgroundColor: "#00000000"
                }
            };
        }
        if (!isInternalAppUrl(url)) {
            electron.shell.openExternal(url).catch(() => {});
            return { action: "deny" };
        }
        return { action: "allow" };
    });

    wc.on("did-create-window", (childWin, details) => {
        const title = childWin.getTitle();
        const isOverlay = title && title.toLowerCase().includes("overlay");

        if (isOverlay) {
            try {
                childWin.setBackgroundColor("#00000000");
            } catch {}
            return;
        }

        try {
            childWin.hide();
            childWin.setOpacity(0);
            childWin.setSkipTaskbar(true);
        } catch {}

        childWin.on("page-title-updated", (_e, t) => {
            if (t && (t === "discord" || t === "Discord Popup")) {
                try { childWin.destroy(); } catch {}
            } else if (t && t.toLowerCase().includes("overlay")) {
                try { childWin.setBackgroundColor("#00000000"); } catch {}
            }
        });

        const childWc = childWin.webContents;
        if ((childWc as any)._midnightcordPatched) return;
        (childWc as any)._midnightcordPatched = true;

        const openUrl = details && details.url;
        if (openUrl && openUrl !== "about:blank" && !openUrl.startsWith("devtools://") && !isInternalAppUrl(openUrl)) {
            electron.shell.openExternal(openUrl).catch(() => {});
            try { childWin.destroy(); } catch (_) {}
            return;
        }

        childWc.once("will-navigate", (event, url) => {
            if (!isInternalAppUrl(url)) {
                event.preventDefault();
                electron.shell.openExternal(url).catch(() => {});
                try { childWin.destroy(); } catch (_) {}
            }
        });

        childWc.once("did-navigate", (_event, url) => {
            if (!isInternalAppUrl(url)) {
                electron.shell.openExternal(url).catch(() => {});
                try { childWin.destroy(); } catch (_) {}
            }
        });

        childWc.setWindowOpenHandler(({ url }) => {
            if (!url || url === "about:blank" || url.startsWith("devtools://")) {
                return {
                    action: "allow",
                    overrideBrowserWindowOptions: {
                        show: false,
                        skipTaskbar: true
                    }
                };
            }
            electron.shell.openExternal(url).catch(() => {});
            return { action: "deny" };
        });

        childWc.once("did-finish-load", () => {
            const url = childWc.getURL();
            if (url && url !== "about:blank" && !isInternalAppUrl(url)) {
                electron.shell.openExternal(url).catch(() => {});
                try { childWin.destroy(); } catch (_) {}
            }
        });

        setImmediate(() => {
            try {
                if (!childWin.isDestroyed()) {
                    const u = childWc.getURL();
                    const t = childWin.getTitle();
                    if (!u || u === "about:blank" || u.includes("/popup") || t === "discord" || t === "Discord Popup") {
                        try { childWin.destroy(); } catch (_) {}
                    }
                }
            } catch (_) {}
        });
    });

    wc.on("will-navigate", (event, url) => {
        const currentUrl = wc.getURL();
        if (url !== currentUrl && !isInternalAppUrl(url)) {
            event.preventDefault();
            electron.shell.openExternal(url).catch(() => {});
        }
    });
}

app.on("browser-window-created", (_, win) => {
    patchWebContents(win.webContents);
});

app.on("web-contents-created", (_, wc) => {
    patchWebContents(wc);
});

process.env.DATA_DIR = join(app.getPath("userData"), "..", "Midnightcord");

app.whenReady().then(() => {
    registerMediaPermissionsForSession(session.defaultSession);
    for (const wc of electron.webContents.getAllWebContents()) {
        patchWebContents(wc);
    }
});

    // ── Neutralisation de DISCORD_WINDOW_TOGGLE_FULLSCREEN ──
    //
    // PROBLÈME RACINE : Discord émet cet IPC automatiquement à chaque démarrage
    // ET à chaque rechargement de thème pour "synchroniser" son état interne.
    // L'ancien handler faisait `win.setFullScreen(!win.isFullScreen())` — un toggle
    // aveugle. Résultat : fenêtre maximisée + isFullScreen()=false → setFullScreen(true)
    // → overlay OS fullscreen → tous les inputs bloqués, app figée. F11 sortait du
    // fullscreen et débloquait. Le fix du délai de 2s ne suffisait pas car les thèmes
    // rechargent Discord après ce délai.
    //
    // SOLUTION : on intercepte le handler Discord et on le remplace par un no-op
    // complet. Le fullscreen utilisateur est désormais géré exclusivement via F11
    // intercepté dans before-input-event ci-dessus — ce qui est à la fois plus propre
    // et impossible à déclencher accidentellement par Discord.
    {
        const _originalHandle = electron.ipcMain.handle.bind(electron.ipcMain);
        const FULLSCREEN_CHANNEL = "DISCORD_WINDOW_TOGGLE_FULLSCREEN";
        let _fullscreenPatched = false;

        (electron.ipcMain as any).handle = function(channel: string, listener: any) {
            if (channel === FULLSCREEN_CHANNEL) {
                if (_fullscreenPatched) return;
                _fullscreenPatched = true;
                try { electron.ipcMain.removeHandler(FULLSCREEN_CHANNEL); } catch {}
                // No-op : on enregistre un handler vide pour que Discord ne crash pas
                // ("no handler registered"), mais on ne fait RIEN — le fullscreen est
                // géré par before-input-event (F11) côté main process.
                _originalHandle(FULLSCREEN_CHANNEL, (_event: electron.IpcMainInvokeEvent) => {
                    // Intentionnellement vide.
                });
                return;
            }
            try {
                electron.ipcMain.removeHandler(channel);
            } catch {}
            try {
                return _originalHandle(channel, listener);
            } catch (e: any) {
                if (e?.message?.includes?.("Attempted to register a second handler")) {
                    console.warn(`[Midnightcord] Ignored duplicate IPC handler for '${channel}'`);
                    return;
                }
                throw e;
            }
        };
    }

    const originalAppend = app.commandLine.appendSwitch;
    const _ncDisabledFeatures = new Set(["WidgetLayering", "UseEcoQoSForBackgroundProcess", "CalculateNativeWinOcclusion"]);
    app.commandLine.appendSwitch = function (...args) {
        if (args[0] === "process-per-site") return;
        if (args[0] === "disable-features") {
            (args[1] ?? "").split(",").filter(Boolean).forEach((f: string) => _ncDisabledFeatures.add(f));
            args[1] = [..._ncDisabledFeatures].join(",");
        }
        return originalAppend.apply(this, args);
    };

    app.commandLine.appendSwitch("disable-renderer-backgrounding");
    app.commandLine.appendSwitch("disable-background-timer-throttling");
    app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
} else {
    console.log("[Midnightcord] Running in vanilla mode. Not loading Midnightcord");
}

console.log("[Midnightcord] Loading original Discord app.asar");
require(require.main!.filename);
