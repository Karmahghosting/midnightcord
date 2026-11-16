/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

if (process.platform === "linux") import("./venmic");
import "./soundboardMic";

import { execFile, spawn } from "node:child_process";
import { type FSWatcher, existsSync, mkdirSync, readFileSync, watch } from "node:fs";
import { copyFile, open, readFile, stat } from "node:fs/promises";
import { release } from "node:os";
import { basename, extname, join } from "node:path";

import {
    app,
    BrowserWindow,
    clipboard,
    dialog,
    type IpcMainInvokeEvent,
    nativeImage,
    type RelaunchOptions,
    session,
    shell
} from "electron";
import { STATIC_DIR } from "shared/paths";
import { debounce } from "shared/utils/debounce";

import { IpcEvents } from "../shared/IpcEvents";
import { setBadgeCount } from "./appBadge";
import { createArRPCWindow } from "./arrpcWindow";
import { autoStart } from "./autoStart";
import { DATA_DIR, USERPLUGINS_DIR, VENCORD_QUICKCSS_FILE, VENCORD_THEMES_DIR } from "./constants";
import { AppEvents } from "./events";
import { getPlatformSpoofInfo } from "./gnuSpoofing";
import { mainWin } from "./mainWindow";
import { Settings, State } from "./settings";
import { enableHardwareAcceleration } from "./startup";
import { handle, handleSync } from "./utils/ipcWrappers";
import { PopoutWindows } from "./utils/popout";
import { isDeckGameMode, showGamePage } from "./utils/steamOS";
import { isValidVencordInstall } from "./utils/vencordLoader";
import { VENCORD_DIR } from "./vencordDir";

handleSync(IpcEvents.DEPRECATED_GET_VENCORD_PRELOAD_SCRIPT_PATH, () => join(VENCORD_DIR, "preload.js"));
handleSync(IpcEvents.GET_VENCORD_PRELOAD_SCRIPT, () => readFileSync(join(VENCORD_DIR, "preload.js"), "utf-8"));
handleSync(IpcEvents.GET_VENCORD_RENDERER_SCRIPT, () => readFileSync(join(VENCORD_DIR, "renderer.js"), "utf-8"));

const VESKTOP_RENDERER_JS_PATH = join(__dirname, "renderer.js");
const VESKTOP_RENDERER_CSS_PATH = join(__dirname, "renderer.css");
handleSync(IpcEvents.GET_VESKTOP_RENDERER_SCRIPT, () => readFileSync(VESKTOP_RENDERER_JS_PATH, "utf-8"));
handle(IpcEvents.GET_VESKTOP_RENDERER_CSS, () => readFile(VESKTOP_RENDERER_CSS_PATH, "utf-8"));

if (IS_DEV) {
    watch(VESKTOP_RENDERER_CSS_PATH, { persistent: false }, async () => {
        mainWin?.webContents.postMessage(
            IpcEvents.VESKTOP_RENDERER_CSS_UPDATE,
            await readFile(VESKTOP_RENDERER_CSS_PATH, "utf-8")
        );
    });
}

handleSync(IpcEvents.GET_SETTINGS, () => Settings.plain);
handleSync(IpcEvents.GET_VERSION, () => app.getVersion());
handleSync(IpcEvents.GET_GIT_HASH, () => Midnightcord_GIT_HASH);
handleSync(IpcEvents.GET_ENABLE_HARDWARE_ACCELERATION, () => enableHardwareAcceleration);

handleSync(
    IpcEvents.SUPPORTS_WINDOWS_TRANSPARENCY,
    () => process.platform === "win32" && Number(release().split(".").pop()) >= 22621
);

handleSync(IpcEvents.AUTOSTART_ENABLED, () => autoStart.isEnabled());
handle(IpcEvents.ENABLE_AUTOSTART, autoStart.enable);
handle(IpcEvents.DISABLE_AUTOSTART, autoStart.disable);

handle(IpcEvents.ARRPC_OPEN_SETTINGS, () => {
    createArRPCWindow();
});

handleSync(IpcEvents.GET_PLATFORM_SPOOF_INFO, () => getPlatformSpoofInfo());

handle(IpcEvents.SET_SETTINGS, (_, settings: typeof Settings.store, path?: string) => {
    Settings.setData(settings, path);
});

handle(IpcEvents.RELAUNCH, async () => {
    setBadgeCount(0);

    const options: RelaunchOptions = {
        args: process.argv.slice(1).concat(["--relaunch"])
    };
    if (isDeckGameMode) {
        // We can't properly relaunch when running under gamescope, but we can at least navigate to our page in Steam.
        await showGamePage();
    } else if (app.isPackaged && process.env.APPIMAGE) {
        execFile(process.env.APPIMAGE, options.args);
    } else {
        app.relaunch(options);
    }
    app.exit();
});

// Handler pour VencordNative.midnightcord.relaunch() — utilisé par les boutons Restart dans les settings plugins
handle(IpcEvents.RELAUNCH_APP, async () => {
    setBadgeCount(0);

    if (isDeckGameMode) {
        await showGamePage();
        app.exit();
        return;
    }

    if (process.env.APPIMAGE) {
        execFile(process.env.APPIMAGE, process.argv.slice(1));
        app.exit();
        return;
    }

    // Sur Windows packagé (NSIS/Squirrel), app.relaunch() peut échouer silencieusement
    // car process.execPath pointe vers le binaire Electron interne et non le launcher.
    // On utilise spawn pour relancer directement l'exécutable principal.
    if (app.isPackaged && process.platform === "win32") {
        const { spawn } = await import("node:child_process");
        spawn(process.execPath, [], {
            detached: true,
            stdio: "ignore"
        }).unref();
        app.exit(0);
        return;
    }

    const options: RelaunchOptions = {
        args: process.argv.slice(1).concat(["--relaunch"])
    };
    app.relaunch(options);
    app.exit();
});

handleSync(IpcEvents.IS_USING_CUSTOM_VENCORD_DIR, () => !!State.store.MidnightcordDir);
handle(IpcEvents.SHOW_CUSTOM_VENCORD_DIR, async () => {
    const { MidnightcordDir } = State.store;
    if (!MidnightcordDir) return;

    const stats = await stat(MidnightcordDir);
    if (!stats.isDirectory()) return;

    shell.openPath(MidnightcordDir);
});

function getWindow(e: IpcMainInvokeEvent, key?: string) {
    return key ? PopoutWindows.get(key)! : (BrowserWindow.fromWebContents(e.sender) ?? mainWin);
}

handle(IpcEvents.FOCUS, () => {
    mainWin.show();
    mainWin.setSkipTaskbar(false);
});

handle(IpcEvents.CLOSE, (e, key?: string) => {
    getWindow(e, key).close();
});

handle(IpcEvents.MINIMIZE, (e, key?: string) => {
    getWindow(e, key).minimize();
});

handle(IpcEvents.MAXIMIZE, (e, key?: string) => {
    const win = getWindow(e, key);
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});

handleSync(IpcEvents.SPELLCHECK_GET_AVAILABLE_LANGUAGES, e => {
    e.returnValue = session.defaultSession.availableSpellCheckerLanguages;
});

handle(IpcEvents.SPELLCHECK_REPLACE_MISSPELLING, (e, word: string) => {
    e.sender.replaceMisspelling(word);
});

handle(IpcEvents.SPELLCHECK_ADD_TO_DICTIONARY, (e, word: string) => {
    e.sender.session.addWordToSpellCheckerDictionary(word);
});

handle(IpcEvents.SELECT_VENCORD_DIR, async (_e, value?: null) => {
    if (value === null) {
        delete State.store.MidnightcordDir;
        return "ok";
    }

    const res = await dialog.showOpenDialog(mainWin!, {
        properties: ["openDirectory"]
    });
    if (!res.filePaths.length) return "cancelled";

    const dir = res.filePaths[0];
    if (!isValidVencordInstall(dir)) return "invalid";

    State.store.MidnightcordDir = dir;

    return "ok";
});

handle(IpcEvents.IMPORT_USER_PLUGIN, async () => {
    const result = await dialog.showOpenDialog(mainWin!, {
        title: "Import a Midnightcord user plugin",
        properties: ["openFile"],
        filters: [
            { name: "Midnightcord plugin", extensions: ["tsx", "ts", "jsx", "js", "css"] },
            { name: "All files", extensions: ["*"] }
        ]
    });

    if (result.canceled || !result.filePaths[0]) return { status: "cancelled" as const };

    const source = result.filePaths[0];
    const extension = extname(source).slice(1).toLowerCase();
    if (!["tsx", "ts", "jsx", "js", "css"].includes(extension)) {
        return { status: "invalid" as const, message: "Choose a .tsx, .ts, .jsx, .js or .css file." };
    }

    mkdirSync(USERPLUGINS_DIR, { recursive: true });
    const destination = join(USERPLUGINS_DIR, basename(source));
    await copyFile(source, destination);

    return { status: "ok" as const, name: basename(source), path: destination };
});

handle(IpcEvents.OPEN_USER_PLUGINS_DIR, () => {
    mkdirSync(USERPLUGINS_DIR, { recursive: true });

    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    try {
        spawn(command, [USERPLUGINS_DIR], { detached: true, stdio: "ignore" }).unref();
    } catch {
        shell.showItemInFolder(USERPLUGINS_DIR);
    }
});

handle(IpcEvents.REBUILD_USER_PLUGINS, async () => {
    if (app.isPackaged) {
        return {
            status: "unavailable" as const,
            message: "Automatic rebuild is only available from a local source build. Rebuild Midnightcord manually in your repo."
        };
    }

    const root = app.getAppPath();
    const buildScript = join(root, "scripts", "build", "build.mjs");
    if (!existsSync(buildScript)) {
        return { status: "unavailable" as const, message: "Build script not found next to the application." };
    }

    const nodeBinary = process.env.MIDNIGHTCORD_NODE_BINARY || "node";

    try {
        await new Promise<void>((resolve, reject) => {
            execFile(nodeBinary, [buildScript, "--standalone"], {
                cwd: root,
                env: process.env,
                timeout: 5 * 60 * 1000
            }, (error, _stdout, stderr) => {
                if (error) reject(new Error(stderr?.trim() || error.message));
                else resolve();
            });
        });

        setTimeout(() => {
            app.relaunch();
            app.exit(0);
        }, 400);

        return { status: "ok" as const };
    } catch (error) {
        return { status: "error" as const, message: error instanceof Error ? error.message : String(error) };
    }
});

handle(IpcEvents.SET_BADGE_COUNT, (e, count: number) => {
    const win = getWindow(e);
    setBadgeCount(count, win);
});

handle(IpcEvents.FLASH_FRAME, (e, flag: boolean) => {
    const win = getWindow(e);
    if (!win || win.isDestroyed() || (flag && win.isFocused())) return;
    win.flashFrame(flag);
});

handle(IpcEvents.CLIPBOARD_COPY_IMAGE, async (_, buf: ArrayBuffer, src: string) => {
    clipboard.write({
        html: `<img src="${src.replaceAll('"', '\\"')}">`,
        image: nativeImage.createFromBuffer(Buffer.from(buf))
    });
});

function openDebugPage(page: string) {
    const win = new BrowserWindow({
        autoHideMenuBar: true,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
                ? { icon: join(STATIC_DIR, "icon.png") }
                : {})
    });

    win.loadURL(page);
}

handle(IpcEvents.DEBUG_LAUNCH_GPU, () => openDebugPage("chrome://gpu"));
handle(IpcEvents.DEBUG_LAUNCH_WEBRTC_INTERNALS, () => openDebugPage("chrome://webrtc-internals"));

function readCss() {
    return readFile(VENCORD_QUICKCSS_FILE, "utf-8").catch(() => "");
}

let quickCssWatcher: FSWatcher | null = null;
let themesWatcher: FSWatcher | null = null;

open(VENCORD_QUICKCSS_FILE, "a+")
    .then(fd => {
        fd.close();
        quickCssWatcher = watch(
            VENCORD_QUICKCSS_FILE,
            { persistent: false },
            debounce(async () => {
                mainWin?.webContents.postMessage("VencordQuickCssUpdate", await readCss());
            }, 50)
        );
    })
    .catch(err => {
        console.error("Failed to setup quickCss file watcher:", err);
    });

mkdirSync(VENCORD_THEMES_DIR, { recursive: true });
themesWatcher = watch(
    VENCORD_THEMES_DIR,
    { persistent: false },
    debounce(() => {
        mainWin?.webContents.postMessage("VencordThemeUpdate", void 0);
    })
);

export function cleanupFileWatchers() {
    if (quickCssWatcher) {
        quickCssWatcher.close();
        quickCssWatcher = null;
    }
    if (themesWatcher) {
        themesWatcher.close();
        themesWatcher = null;
    }
}

app.on("quit", cleanupFileWatchers);

handle(IpcEvents.VOICE_STATE_CHANGED, (_, variant: string) => {
    AppEvents.emit("setTrayVariant", variant as any);
});

handle(IpcEvents.VOICE_CALL_STATE_CHANGED, (_, inCall: boolean) => {
    AppEvents.emit("voiceCallStateChanged", inCall);
});
