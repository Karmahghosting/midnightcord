/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "node:path";

import {
    app,
    BrowserWindow,
    type BrowserWindowConstructorOptions,
    Menu,
    type MenuItemConstructorOptions,
    nativeTheme,
    type Rectangle,
    screen,
    session
} from "electron";
import { IpcCommands, IpcEvents } from "shared/IpcEvents";
import { STATIC_DIR } from "shared/paths";
import { isTruthy } from "shared/utils/guards";
import { once } from "shared/utils/once";
import type { SettingsStore } from "shared/utils/SettingsStore";

import { createAboutWindow } from "./about";
import { destroyAppBadge, setAppBadgeWindow } from "./appBadge";
import { cleanupArRPC, initArRPC, setupArRPC } from "./arrpc";
import { CommandLine } from "./cli";
import { BrowserUserAgent, DEFAULT_HEIGHT, DEFAULT_WIDTH, isLinux, MIN_HEIGHT, MIN_WIDTH } from "./constants";
import { AppEvents } from "./events";
import { spoofGnu } from "./gnuSpoofing";
import { sendRendererCommand } from "./ipcCommands";
import { initKeybinds } from "./keybinds";
import { Settings, State, VencordSettings } from "./settings";
import { addSplashLog, createSplashWindow, updateSplashMessage } from "./splash";
import { darwinURL } from "./startup";
import { destroyTray, initTray } from "./tray";
import { clearData } from "./utils/clearData";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { applyDeckKeyboardFix, askToApplySteamLayout, isDeckGameMode } from "./utils/steamOS";
import { downloadVencordAsar, ensureVencordFiles } from "./utils/vencordLoader";
import { VENCORD_DIR } from "./vencordDir";

let isQuitting = false;

applyDeckKeyboardFix();

app.on("before-quit", async () => {
    isQuitting = true;
    destroyTray();
    destroyAppBadge();
    await cleanupArRPC();
});

export let mainWin: BrowserWindow;

function makeSettingsListenerHelpers<O extends object>(o: SettingsStore<O>) {
    const listeners = new Map<(data: any) => void, PropertyKey>();

    const addListener: typeof o.addChangeListener = (path, cb) => {
        listeners.set(cb, path);
        o.addChangeListener(path, cb);
    };
    const removeAllListeners = () => {
        for (const [listener, path] of listeners) {
            o.removeChangeListener(path as any, listener);
        }

        listeners.clear();
    };

    return [addListener, removeAllListeners] as const;
}

const [addSettingsListener, removeSettingsListeners] = makeSettingsListenerHelpers(Settings);
const [addVencordSettingsListener, removeVencordSettingsListeners] = makeSettingsListenerHelpers(VencordSettings);

type MenuItemList = Array<MenuItemConstructorOptions | false>;

function initMenuBar(win: BrowserWindow) {
    const isWindows = process.platform === "win32";
    const isDarwin = process.platform === "darwin";
    const wantCtrlQ = !isWindows || VencordSettings.store.winCtrlQ;

    const subMenu = [
        {
            label: "About Midnightcord",
            click: createAboutWindow
        },
        {
            label: "Force Update Midnightcord",
            async click() {
                await downloadVencordAsar();
                destroyTray();
                app.relaunch();
                app.quit();
            },
            toolTip: "Midnightcord will automatically restart after this operation"
        },
        {
            label: "Reset Midnightcord",
            async click() {
                await clearData(win);
            },
            toolTip: "Midnightcord will automatically restart after this operation"
        },
        {
            label: "Relaunch",
            accelerator: "CmdOrCtrl+Shift+R",
            click() {
                destroyTray();
                app.relaunch();
                app.quit();
            }
        },
        ...(!isDarwin
            ? []
            : ([
                {
                    type: "separator"
                },
                {
                    label: "Settings",
                    accelerator: "CmdOrCtrl+,",
                    async click() {
                        sendRendererCommand(IpcCommands.NAVIGATE_SETTINGS);
                    }
                },
                {
                    type: "separator"
                },
                {
                    role: "hide"
                },
                {
                    role: "hideOthers"
                },
                {
                    role: "unhide"
                },
                {
                    type: "separator"
                }
            ] satisfies MenuItemList)),
        {
            label: "Quit",
            accelerator: wantCtrlQ ? "CmdOrCtrl+Q" : void 0,
            visible: !isWindows,
            role: "quit",
            click() {
                app.quit();
            }
        },
        isWindows && {
            label: "Quit",
            accelerator: "Alt+F4",
            role: "quit",
            click() {
                app.quit();
            }
        },
        // See https://github.com/electron/electron/issues/14742 and https://github.com/electron/electron/issues/5256
        {
            label: "Zoom in (hidden, hack for Qwertz and others)",
            accelerator: "CmdOrCtrl+=",
            role: "zoomIn",
            visible: false
        }
    ] satisfies MenuItemList;

    const menuItems = [
        {
            label: "Midnightcord",
            role: "appMenu",
            submenu: subMenu.filter(isTruthy)
        },
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        isDarwin && { role: "windowMenu" }
    ] satisfies MenuItemList;

    const menu = Menu.buildFromTemplate(menuItems.filter(isTruthy));

    Menu.setApplicationMenu(menu);
}

function initWindowBoundsListeners(win: BrowserWindow) {
    const saveState = () => {
        State.store.maximized = win.isMaximized();
        State.store.minimized = win.isMinimized();
    };

    win.on("maximize", saveState);
    win.on("minimize", saveState);
    win.on("unmaximize", saveState);

    const saveBounds = () => {
        State.store.windowBounds = win.getBounds();
    };

    win.on("resize", saveBounds);
    win.on("move", saveBounds);
}

function initSettingsListeners(win: BrowserWindow) {
    addSettingsListener("tray", enable => {
        if (enable) initTray(win, q => (isQuitting = q));
        else destroyTray();
    });

    addSettingsListener("disableMinSize", disable => {
        if (disable) {
            // 0 no work
            win.setMinimumSize(1, 1);
        } else {
            win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);

            const { width, height } = win.getBounds();
            win.setBounds({
                width: Math.max(width, MIN_WIDTH),
                height: Math.max(height, MIN_HEIGHT)
            });
        }
    });

    addVencordSettingsListener("macosTranslucency", enabled => {
        if (enabled) {
            win.setVibrancy("sidebar");
            win.setBackgroundColor("#ffffff00");
        } else {
            win.setVibrancy(null);
            win.setBackgroundColor("#ffffff");
        }
    });

    addSettingsListener("enableMenu", enabled => {
        win.setAutoHideMenuBar(enabled ?? false);
    });

    addSettingsListener("spellCheckLanguages", languages => initSpellCheckLanguages(win, languages));
}

async function initSpellCheckLanguages(_win: BrowserWindow, languages?: string[]) {
    languages ??= await sendRendererCommand(IpcCommands.GET_LANGUAGES);
    if (!languages) return;

    const ses = session.defaultSession;

    const available = ses.availableSpellCheckerLanguages;
    const applicable = languages.filter(l => available.includes(l)).slice(0, 5);
    if (applicable.length) ses.setSpellCheckerLanguages(applicable);
}

function initSpellCheck(win: BrowserWindow) {
    win.webContents.on("context-menu", (_, data) => {
        win.webContents.send(IpcEvents.SPELLCHECK_RESULT, data.misspelledWord, data.dictionarySuggestions);
    });

    initSpellCheckLanguages(win, Settings.store.spellCheckLanguages);
}

function initDevtoolsListeners(win: BrowserWindow) {
    win.webContents.on("devtools-opened", () => {
        win.webContents.send(IpcEvents.DEVTOOLS_OPENED);
    });
    win.webContents.on("devtools-closed", () => {
        win.webContents.send(IpcEvents.DEVTOOLS_CLOSED);
    });
}

function initStaticTitle(win: BrowserWindow) {
    const listener = (e: { preventDefault: Function; }) => e.preventDefault();

    if (Settings.store.staticTitle) win.on("page-title-updated", listener);

    addSettingsListener("staticTitle", enabled => {
        if (enabled) {
            win.setTitle("Midnightcord");
            win.on("page-title-updated", listener);
        } else {
            win.off("page-title-updated", listener);
        }
    });
}

function getWindowBoundsOptions(): BrowserWindowConstructorOptions {
    addSplashLog();

    // We want the default window behaviour to apply in game mode since it expects everything to be fullscreen and maximized.
    if (isDeckGameMode) return {};

    const { x, y, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = State.store.windowBounds ?? {};

    const options = { width, height } as BrowserWindowConstructorOptions;

    if (x != null && y != null) {
        function isInBounds(rect: Rectangle, display: Rectangle) {
            return !(
                rect.x + rect.width < display.x ||
                rect.x > display.x + display.width ||
                rect.y + rect.height < display.y ||
                rect.y > display.y + display.height
            );
        }

        const inBounds = screen.getAllDisplays().some(d => isInBounds({ x, y, width, height }, d.bounds));
        if (inBounds) {
            options.x = x;
            options.y = y;
        }
    }

    if (!Settings.store.disableMinSize) {
        options.minWidth = MIN_WIDTH;
        options.minHeight = MIN_HEIGHT;
    }

    return options;
}

function buildBrowserWindowOptions(): BrowserWindowConstructorOptions {
    addSplashLog();

    const { staticTitle, transparencyOption, enableMenu, customTitleBar, splashTheming, splashBackground } =
        Settings.store;

    const { frameless, transparent, macosVibrancyStyle } = VencordSettings.store;

    const noFrame = frameless === true || customTitleBar === true;
    const backgroundColor =
        splashTheming !== false ? splashBackground : nativeTheme.shouldUseDarkColors ? "#313338" : "#ffffff";

    const options: BrowserWindowConstructorOptions = {
        show: Settings.store.enableSplashScreen === false && !CommandLine.values["start-minimized"],
        backgroundColor,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
                ? { icon: join(STATIC_DIR, "icon.png") }
                : {}),
        webPreferences: {
            nodeIntegration: false,
            sandbox: true,
            contextIsolation: true,
            devTools: true,
            preload: join(__dirname, "preload.js"),
            spellcheck: true,
            ...(Settings.store.middleClickAutoscroll && {
                enableBlinkFeatures: "MiddleClickAutoscroll"
            }),
            // disable renderer backgrounding to prevent the app from unloading when in the background
            backgroundThrottling: false
        },
        ...(noFrame && process.platform !== "darwin"
            ? { frame: false, titleBarStyle: "hidden" }
            : { frame: !noFrame }),
        autoHideMenuBar: enableMenu,
        ...getWindowBoundsOptions()
    };

    if (transparent) {
        options.transparent = true;
        options.backgroundColor = "#00000000";
    }

    if (transparencyOption && transparencyOption !== "none") {
        options.backgroundColor = "#00000000";
        options.backgroundMaterial = transparencyOption;

        if (customTitleBar) {
            options.transparent = true;
        }
    }

    if (staticTitle) {
        options.title = "Midnightcord";
    }

    if (process.platform === "darwin") {
        options.titleBarStyle = "hidden";
        options.trafficLightPosition = { x: 10, y: 10 };

        if (macosVibrancyStyle) {
            options.vibrancy = macosVibrancyStyle;
            options.backgroundColor = "#00000000";
        }
    }

    return options;
}

// Helper : maximize la fenetre uniquement si elle ne l'est pas encore et qu'elle n'est pas detruite.
// Utilise un delai pour laisser Discord terminer son initialisation fullscreen IPC avant d'agir.
function safeMaximizeLater(win: BrowserWindow, delayMs = 2500) {
    setTimeout(() => {
        if (!win.isDestroyed() && !win.isMaximized()) {
            win.maximize();
        }
    }, delayMs);
}

function createMainWindow() {
    // Clear up previous settings listeners
    removeSettingsListeners();
    removeVencordSettingsListeners();

    const win = (mainWin = new BrowserWindow(buildBrowserWindowOptions()));
    setAppBadgeWindow(win);

    win.webContents.setMaxListeners(15);
    win.setMenuBarVisibility(false);

    addSplashLog();

    if (process.platform === "darwin" && Settings.store.customTitleBar) win.setWindowButtonVisibility(false);
    if (process.platform !== "win32" && CommandLine.values["windows-spoof"]) {
        spoofGnu(win);
    }

    win.on("close", e => {
        const useTray = !isDeckGameMode && Settings.store.minimizeToTray !== false && Settings.store.tray !== false;
        if (isQuitting || (process.platform !== "darwin" && !useTray)) return;

        e.preventDefault();

        if (process.platform === "darwin") app.hide();
        else win.hide();

        return false;
    });

    win.on("focus", () => {
        win.flashFrame(false);
    });

    initWindowBoundsListeners(win);

    // Ne pas écouter enter-html-full-screen ici — c'est géré dans patcher.ts via
    // les handlers enter/leave-html-full-screen sur la BrowserWindow patchée.
    // On écoute seulement leave-html-full-screen comme filet de sécurité pour s'assurer
    // que le fullscreen natif est bien quitté si Discord sort du mode HTML FS.
    win.on("leave-html-full-screen", () => {
        if (win.isFullScreen()) win.setFullScreen(false);
    });

    if (!isDeckGameMode && (Settings.store.tray ?? true) && process.platform !== "darwin")
        initTray(win, q => (isQuitting = q));

    initMenuBar(win);
    makeLinksOpenExternally(win);
    initSettingsListeners(win);
    initSpellCheck(win);
    initDevtoolsListeners(win);
    initStaticTitle(win);

    addSplashLog();

    win.webContents.setUserAgent(BrowserUserAgent);
    addSplashLog();

    loadUrl(darwinURL || process.argv.find(arg => arg.startsWith("discord://")));
    addSplashLog();

    return win;
}

const runVencordMain = once(() => require(VENCORD_DIR));

export function loadUrl(uri: string | undefined) {
    const branch = Settings.store.discordBranch;
    const subdomain = branch === "canary" || branch === "ptb" ? `${branch}.` : "";

    mainWin
        .loadURL(`https://${subdomain}discord.com/${uri ? new URL(uri).pathname.slice(1) || "app" : "app"}`)
        .then(() => AppEvents.emit("appLoaded"))
        .catch(error => retryUrl(error.url, error.code));
}

const retryDelay = 1000;
function retryUrl(url: string, description: string) {
    console.log(`retrying in ${retryDelay}ms`);
    updateSplashMessage(`Failed to load Discord: ${description}`);
    setTimeout(() => loadUrl(url), retryDelay);
}

export async function createWindows() {
    const startMinimized = CommandLine.values["start-minimized"];

    let splash: BrowserWindow | undefined;
    if (Settings.store.enableSplashScreen === true) {
        splash = await createSplashWindow(startMinimized);

        if (isDeckGameMode) splash.setFullScreen(true);
        addSplashLog();
    }

    addSplashLog();
    await ensureVencordFiles();
    runVencordMain();

    addSplashLog();
    mainWin = createMainWindow();

    AppEvents.on("appLoaded", () => {
        splash?.destroy();

        if (!startMinimized) {
            if (splash) mainWin?.show();

            // FIX PRINCIPAL : maximize() différé de 2.5s.
            //
            // Problème : Discord émet DISCORD_WINDOW_TOGGLE_FULLSCREEN automatiquement
            // pendant son initialisation (~500ms après le chargement de la page) pour
            // synchroniser son état fullscreen interne. Si on appelle maximize() juste
            // après show(), on se retrouve dans cette séquence :
            //   1. maximize() → état "maximized" mais pas fullscreen
            //   2. Discord émet DISCORD_WINDOW_TOGGLE_FULLSCREEN
            //   3. Notre handler : isFullScreen()=false → setFullScreen(true)
            //   4. L'OS met la fenêtre en fullscreen natif
            //   5. L'overlay fullscreen OS capture tous les inputs → app figée
            //   6. Les animations continuent car le renderer tourne normalement
            //   7. F11 sort du fullscreen → inputs restaurés
            //
            // Solution en deux volets :
            // A) Dans patcher.ts : le handler DISCORD_WINDOW_TOGGLE_FULLSCREEN ignore
            //    les appels pendant les 2 premières secondes (_fullscreenReady flag).
            // B) Ici : on diffère maximize() de 2.5s pour être sûr que le guard est
            //    actif AVANT que Discord émette son signal fullscreen IPC.
            //
            // Même fix pour les thèmes : quand un thème est appliqué, Discord recharge
            // partiellement et réémet le signal fullscreen → même blocage → même fix.
            const shouldMaximize = State.store.maximized === true
                && !isDeckGameMode
                && !State.store.windowBounds;
            if (shouldMaximize) {
                safeMaximizeLater(mainWin, 2500);
            }
        }

        if (isDeckGameMode) {
            mainWin?.setFullScreen(true);
            askToApplySteamLayout(mainWin);
        }

        mainWin.once("show", () => {
            const shouldMaximize = State.store.maximized === true
                && !mainWin?.isMaximized()
                && !isDeckGameMode
                && !State.store.windowBounds;
            if (shouldMaximize) {
                safeMaximizeLater(mainWin, 2500);
            }
        });
    });

    mainWin.webContents.on("did-navigate", (_, url: string, responseCode: number) => {
        updateSplashMessage("");

        if (responseCode >= 300 && new URL(url).pathname !== "/app") {
            loadUrl(undefined);
            console.warn(`'did-navigate': Caught bad page response: ${responseCode}, redirecting to main app`);
        }
    });

    setupArRPC();
    initArRPC();
    if (isLinux) initKeybinds();
}
