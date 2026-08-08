/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import type { CspRequestResult } from "@main/csp/manager";
import type { PluginIpcMappings } from "@main/ipcPlugins";
import { IpcEvents } from "@shared/IpcEvents";
import type { IpcRes } from "@utils/types";
import { ipcRenderer } from "electron/renderer";

export function invoke<T = any>(event: IpcEvents, ...args: any[]) {
    return ipcRenderer.invoke(event, ...args) as Promise<T>;
}

export function sendSync<T = any>(event: IpcEvents, ...args: any[]) {
    return ipcRenderer.sendSync(event, ...args) as T;
}

const PluginHelpers = {} as Record<string, Record<string, (...args: any[]) => Promise<any>>>;
const pluginIpcMap = sendSync<PluginIpcMappings>(IpcEvents.GET_PLUGIN_IPC_METHOD_MAP);

for (const [plugin, methods] of Object.entries(pluginIpcMap)) {
    const map = PluginHelpers[plugin] = {};
    for (const [methodName, method] of Object.entries(methods)) {
        map[methodName] = (...args: any[]) => invoke(method as IpcEvents, ...args);
    }
}

export default {
    themes: {
        uploadTheme: async (fileName: string, fileData: string): Promise<void> => {
            throw new Error("uploadTheme is WEB only");
        },
        deleteTheme: (fileName: string) => invoke<void>(IpcEvents.DELETE_THEME, fileName),
        getThemesDir: () => invoke<string>(IpcEvents.GET_THEMES_DIR),
        getThemesList: () => invoke<Array<{ fileName: string; content: string; }>>(IpcEvents.GET_THEMES_LIST),
        getThemeData: (fileName: string) => invoke<string | undefined>(IpcEvents.GET_THEME_DATA, fileName),
        getSystemValues: () => invoke<Record<string, string>>(IpcEvents.GET_THEME_SYSTEM_VALUES),
        openFolder: () => invoke<void>(IpcEvents.OPEN_THEMES_FOLDER),
    },

    updater: {
        getUpdates: () => invoke<IpcRes<Record<"hash" | "author" | "message", string>[]>>(IpcEvents.GET_UPDATES),
        update: () => invoke<IpcRes<boolean>>(IpcEvents.UPDATE),
        rebuild: () => invoke<IpcRes<boolean>>(IpcEvents.BUILD),
        getRepo: () => invoke<IpcRes<string>>(IpcEvents.GET_REPO),
    },

    settings: {
        get: () => sendSync<Settings>(IpcEvents.GET_SETTINGS),
        set: (settings: Settings, pathToNotify?: string) => invoke<void>(IpcEvents.SET_SETTINGS, settings, pathToNotify),
        getSettingsDir: () => invoke<string>(IpcEvents.GET_SETTINGS_DIR),
        openFolder: () => invoke<void>(IpcEvents.OPEN_SETTINGS_FOLDER),
    },

    quickCss: {
        get: () => invoke<string>(IpcEvents.GET_QUICK_CSS),
        set: (css: string) => invoke<void>(IpcEvents.SET_QUICK_CSS, css),

        addChangeListener(cb: (newCss: string) => void) {
            ipcRenderer.on(IpcEvents.QUICK_CSS_UPDATE, (_, css) => cb(css));
        },
        addThemeChangeListener(cb: () => void) {
            ipcRenderer.on(IpcEvents.THEME_UPDATE, () => cb());
        },
        openFile: () => invoke<void>(IpcEvents.OPEN_QUICKCSS),
        openEditor: () => invoke<void>(IpcEvents.OPEN_MONACO_EDITOR),
        getEditorTheme: () => sendSync<string>(IpcEvents.GET_MONACO_THEME),
    },

    native: {
        getVersions: () => process.versions as Partial<NodeJS.ProcessVersions>,
        openExternal: (url: string) => invoke<void>(IpcEvents.OPEN_EXTERNAL, url),
        getRendererCss: () => invoke<string>(IpcEvents.GET_RENDERER_CSS),
        onRendererCssUpdate: (cb: (newCss: string) => void) => {
            if (!IS_DEV) return;
            ipcRenderer.on(IpcEvents.RENDERER_CSS_UPDATE, (_e, newCss: string) => cb(newCss));
        }
    },

    csp: {
        isDomainAllowed: (url: string, directives: string[]) => invoke<boolean>(IpcEvents.CSP_IS_DOMAIN_ALLOWED, url, directives),
        removeOverride: (url: string) => invoke<boolean>(IpcEvents.CSP_REMOVE_OVERRIDE, url),
        requestAddOverride: (url: string, directives: string[], callerName: string) =>
            invoke<CspRequestResult>(IpcEvents.CSP_REQUEST_ADD_OVERRIDE, url, directives, callerName),
    },

    tray: {
        setUpdateState: (available: boolean) => ipcRenderer.send(IpcEvents.SET_TRAY_UPDATE_STATE, available),
        onCheckUpdates: (cb: () => void) => { ipcRenderer.on(IpcEvents.TRAY_CHECK_UPDATES, cb); },
        onRepair: (cb: () => void) => { ipcRenderer.on(IpcEvents.TRAY_REPAIR, cb); },
    },

    desktopCapture: {
        getSources: () => invoke<Array<{ id: string; name: string; }>>(IpcEvents.GET_DESKTOP_SOURCES),
    },

    midnightcord: {
        getInstallerPrefs: () => sendSync<{ defaultPlugins: boolean, autoUpdate: boolean }>(IpcEvents.GET_INSTALLER_PREFS),
        checkVBCable: () => invoke<{ installed: boolean; }>(IpcEvents.CHECK_VB_CABLE),
        installVBCable: () => invoke<{ success: boolean; error?: string; }>(IpcEvents.INSTALL_VB_CABLE),

        relaunch: () => invoke<void>(IpcEvents.RELAUNCH_APP),
    },

    pluginHelpers: PluginHelpers,

    window: {
        setBackgroundMaterial: (material: "none" | "acrylic" | "mica" | "tabbed") =>
            invoke<void>(IpcEvents.SET_WINDOW_BACKGROUND_MATERIAL, material),
        setThumbarButtons: (state: "playing" | "paused" | "stopped") =>
            invoke<void>(IpcEvents.SET_THUMBAR_BUTTONS, state),
        onThumbarClick: (cb: (action: "prev" | "play" | "pause" | "next") => void) => {
            ipcRenderer.on(IpcEvents.THUMBAR_BUTTON_CLICK, (_e, action) => cb(action));
        },
        removeThumbarClickListener: () => {
            ipcRenderer.removeAllListeners(IpcEvents.THUMBAR_BUTTON_CLICK);
        },
    },

    worldBomb: {
        type: (text: string, delay: number) => invoke(IpcEvents.WORLD_BOMB_TYPE, text, delay),
        pressEnter: () => invoke(IpcEvents.WORLD_BOMB_PRESS_ENTER),
        pressBackspace: () => invoke(IpcEvents.WORLD_BOMB_PRESS_BACKSPACE),
        // SÃ©quence complÃ¨te en un seul processus PowerShell (clic auto au centre + frappe + enter)
        // targetX/targetY : position calibrÃ©e du clic (-1 = centre de la fenÃªtre par dÃ©faut)
        sequence: (word: string, lps: number, humanChance: number, targetX: number = -1, targetY: number = -1) =>
            invoke(IpcEvents.WORLD_BOMB_SEQUENCE, word, lps, humanChance, targetX, targetY),
        // Ouvre la fenÃªtre externe Stream Proof
        openWindow: (lps: number, humanChance: number, safeMode: boolean, theme: string, playMode: string, noSpace: boolean, groqKey: string, words: string[], streamProof: boolean) => invoke(IpcEvents.WORLD_BOMB_OPEN_WINDOW, lps, humanChance, safeMode, theme, playMode, noSpace, groqKey, words, streamProof),
        // Ferme la fenÃªtre externe Stream Proof
        closeWindow: () => invoke(IpcEvents.WORLD_BOMB_CLOSE_WINDOW),
        // Retourne la position actuelle du curseur (plus utilisÃ© mais gardÃ© au cas oÃ¹)
        getCursorPos: (): Promise<{ x: number; y: number; }> => invoke(IpcEvents.WORLD_BOMB_GET_CURSOR_POS),
    },
    setContentProtection: (enabled: boolean) =>
        invoke<boolean>(IpcEvents.SET_CONTENT_PROTECTION, enabled),
};
