/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";
import { join } from "path";
import { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";
import { STATIC_DIR } from "shared/paths";
import { Millis } from "shared/utils/millis";

import { State } from "./settings";
import { handle } from "./utils/ipcWrappers";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { loadView } from "./vesktopStatic";

const REPOSITORY = { owner: "Karmahghosting", repo: "midnightcord" } as const;
const updatesEnabled = app.isPackaged;
const MIDNIGHTCORD_PREFS = { defaultPlugins: true, autoUpdate: updatesEnabled } as const;

export const installerPrefs = MIDNIGHTCORD_PREFS;

handle(IpcEvents.GET_INSTALLER_PREFS, () => MIDNIGHTCORD_PREFS);

let updaterWindow: BrowserWindow | null = null;

if (updatesEnabled) {
    autoUpdater.setFeedURL({ provider: "github", ...REPOSITORY });
    const token = process.env.MIDNIGHTCORD_GITHUB_TOKEN?.trim();
    if (token) autoUpdater.requestHeaders = { Authorization: `Bearer ${token}` };
}

autoUpdater.on("update-available", update => {
    if (State.store.updater?.ignoredVersion === update.version) return;
    if ((State.store.updater?.snoozeUntil ?? 0) > Date.now()) return;
    if (update.version === app.getVersion()) return;
    if (updaterWindow && !updaterWindow.isDestroyed()) return;

    openUpdater(update);
});

autoUpdater.on("update-downloaded", () => {
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, 100);
});

autoUpdater.on("download-progress", p =>
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, p.percent)
);
autoUpdater.on("error", err => updaterWindow?.webContents.send(UpdaterIpcEvents.ERROR, err.message));

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.fullChangelog = true;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;

const isOutdated: Promise<boolean> = !updatesEnabled ? Promise.resolve(false) : new Promise(resolve => {
    app.whenReady().then(() => {
        setTimeout(() => {
            autoUpdater.checkForUpdates()
                .then(res => {
                    if (!res?.isUpdateAvailable) return resolve(false);
                    if (res.updateInfo?.version === app.getVersion()) return resolve(false);
                    resolve(true);
                })
                .catch(() => resolve(false));
        }, 5000);
    });
});

handle(IpcEvents.UPDATER_IS_OUTDATED, () => isOutdated);
handle(IpcEvents.UPDATER_OPEN, async () => {
    if (!updatesEnabled) return;
    const res = await autoUpdater.checkForUpdates();
    if (res?.isUpdateAvailable && res.updateInfo) openUpdater(res.updateInfo);
});

function openUpdater(update: UpdateInfo) {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
        updaterWindow.focus();
        return;
    }

    ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
    ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
    ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
    ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);

    updaterWindow = new BrowserWindow({
        title: "Midnightcord Updater",
        autoHideMenuBar: true,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
              ? { icon: join(STATIC_DIR, "icon.png") }
              : {}),
        webPreferences: {
            preload: join(__dirname, "updaterPreload.js")
        },
        minHeight: 400,
        minWidth: 750
    });
    makeLinksOpenExternally(updaterWindow);

    handle(UpdaterIpcEvents.GET_DATA, () => ({
        update,
        version: app.getVersion(),
        autoUpdate: updatesEnabled
    }));
    handle(UpdaterIpcEvents.INSTALL, async () => {
        await autoUpdater.downloadUpdate();
        autoUpdater.quitAndInstall(false, true);
    });
    handle(UpdaterIpcEvents.SNOOZE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.snoozeUntil = Date.now() + 1 * Millis.DAY;
        updaterWindow?.close();
    });
    handle(UpdaterIpcEvents.IGNORE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.ignoredVersion = update.version;
        updaterWindow?.close();
    });

    updaterWindow.on("closed", () => {
        ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
        ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
        ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
        ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);
        updaterWindow = null;
    });

    loadView(updaterWindow, "updater/index.html");
}
