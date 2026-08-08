/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { gitHashShort } from "@shared/vencordUserAgent";
import { app, BrowserWindow, ipcMain, Menu, MenuItem, MenuItemConstructorOptions, shell } from "electron";
import aboutHtml from "file://about.html?minify";

import { SETTINGS_DIR, THEMES_DIR } from "./utils/constants";

let cachedUpdateAvailable = false;
let trayMenuPatched = false;

ipcMain.on(IpcEvents.SET_TRAY_UPDATE_STATE, (_, available: boolean) => {
    cachedUpdateAvailable = available;
});

function getMainWindow(): BrowserWindow | undefined {
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed());
    return BrowserWindow.getFocusedWindow()
        ?? windows.find(window => window.getTitle() === "Discord")
        ?? windows.find(window => window.isVisible())
        ?? windows[0];
}

function openMainWindow(): void {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
}

function restartApp(): void {
    app.relaunch();
    app.quit();
}

function sendToRenderer(event: IpcEvents): void {
    getMainWindow()?.webContents.send(event);
}

function findInsertIndex(template: Array<MenuItemConstructorOptions | MenuItem>): number {
    const openIndex = template.findIndex(item => {
        const label = item.label?.toLowerCase() ?? "";
        return /open|show|ouvrir|afficher/.test(label);
    });
    return openIndex !== -1 ? openIndex + 1 : 0;
}

function isTrayMenu(template: Array<MenuItemConstructorOptions | MenuItem>): boolean {
    if (!template.length || template.length > 20) return false;

    const hasOpenOrShow = template.some(item => {
        const label = item.label?.toLowerCase() ?? "";
        return /open|show|ouvrir|afficher/.test(label);
    });

    const hasQuit = template.some(item => {
        const label = item.label?.toLowerCase() ?? "";
        return item.role === "quit" || /quit|exit|quitter/.test(label);
    });

    const isNotAppMenu = !template.some(item => {
        const label = item.label?.replace("&", "").toLowerCase() ?? "";
        return ["file", "edit", "view", "window", "help"].includes(label);
    });

    return hasOpenOrShow && hasQuit && isNotAppMenu;
}

let aboutWindow: BrowserWindow | null = null;

function openAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus();
        return;
    }

    const height = 750;
    const width = height * (4 / 3);

    aboutWindow = new BrowserWindow({
        center: true,
        autoHideMenuBar: true,
        height,
        width
    });

    aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    aboutWindow.webContents.on("will-navigate", (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    const aboutParams = aboutHtml
        .replaceAll("{{VERSION}}", VERSION)
        .replaceAll("{{GIT_HASH}}", gitHashShort);
    const base64Html = Buffer.from(aboutParams).toString("base64");
    aboutWindow.loadURL(`data:text/html;base64,${base64Html}`);
    aboutWindow.on("closed", () => {
        aboutWindow = null;
    });
}

function createMidnightcordMenuItems(): MenuItemConstructorOptions[] {
    return [
        {
            label: "Midnightcord",
            submenu: [
                {
                    label: "Open Midnightcord",
                    click: openMainWindow
                },
                {
                    label: cachedUpdateAvailable ? "Update Midnightcord" : "Check for Updates",
                    click: () => sendToRenderer(IpcEvents.TRAY_CHECK_UPDATES)
                },
                {
                    label: "Repair Midnightcord",
                    click: () => sendToRenderer(IpcEvents.TRAY_REPAIR)
                },
                { type: "separator" },
                {
                    label: "Restart Midnightcord",
                    click: restartApp
                },
                {
                    label: "Quit Midnightcord",
                    click: () => app.quit()
                },
                { type: "separator" },
                {
                    label: "Open Settings Folder",
                    click: () => shell.openPath(SETTINGS_DIR)
                },
                {
                    label: "Open Themes Folder",
                    click: () => shell.openPath(THEMES_DIR)
                },
                {
                    label: "About Midnightcord",
                    click: openAboutWindow
                }
            ]
        },
        { type: "separator" }
    ];
}

export function patchTrayMenu(): void {
    if (trayMenuPatched) return;
    trayMenuPatched = true;

    const originalBuildFromTemplate = Menu.buildFromTemplate.bind(Menu);
    Menu.buildFromTemplate = (template => {
        if (!isTrayMenu(template) || template.some(item => item.label?.includes("Midnightcord"))) {
            return originalBuildFromTemplate(template);
        }

        const patchedTemplate = [...template];
        patchedTemplate.splice(findInsertIndex(patchedTemplate), 0, ...createMidnightcordMenuItems());
        console.log("[Midnightcord] Native tray menu patched");
        return originalBuildFromTemplate(patchedTemplate);
    }) as typeof Menu.buildFromTemplate;
}
