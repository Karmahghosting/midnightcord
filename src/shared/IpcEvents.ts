/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

export const enum IpcEvents {
    INIT_FILE_WATCHERS = "VencordInitFileWatchers",
    QUICK_CSS_UPDATE = "VencordQuickCssUpdate",
    OPEN_QUICKCSS = "VencordOpenQuickCss",
    GET_QUICK_CSS = "VencordGetQuickCss",
    SET_QUICK_CSS = "VencordSetQuickCss",
    UPLOAD_THEME = "VencordUploadTheme",
    DELETE_THEME = "VencordDeleteTheme",
    GET_THEMES_DIR = "VencordGetThemesDir",
    GET_THEMES_LIST = "VencordGetThemesList",
    GET_THEME_DATA = "VencordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "VencordGetThemeSystemValues",
    GET_SETTINGS_DIR = "VencordGetSettingsDir",
    GET_SETTINGS = "VencordGetSettings",
    SET_SETTINGS = "VencordSetSettings",
    THEME_UPDATE = "VencordThemeUpdate",
    OPEN_EXTERNAL = "VencordOpenExternal",
    GET_UPDATES = "VencordGetUpdates",
    GET_REPO = "VencordGetRepo",
    UPDATE = "VencordUpdate",
    BUILD = "VencordBuild",
    OPEN_MONACO_EDITOR = "VencordOpenMonacoEditor",
    GET_MONACO_THEME = "VencordGetMonacoTheme",
    GET_INSTALLER_PREFS = "MidnightcordGetInstallerPrefs",

    GET_PLUGIN_IPC_METHOD_MAP = "VencordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "VencordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "VencordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "VencordCspRequestAddOverride",

    OPEN_THEMES_FOLDER = "VencordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "VencordOpenSettingsFolder",
    GET_RENDERER_CSS = "VencordGetRendererCss",
    RENDERER_CSS_UPDATE = "VencordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "VencordPreloadGetRendererJs",

    SET_TRAY_UPDATE_STATE = "VencordSetTrayUpdateState",
    TRAY_REPAIR = "VencordTrayRepair",
    TRAY_CHECK_UPDATES = "VencordTrayCheckUpdates",
    TRAY_ABOUT = "VencordTrayAbout",

    GET_DESKTOP_SOURCES = "VencordGetDesktopSources",

    SET_WINDOW_BACKGROUND_MATERIAL = "MidnightcordSetWindowBackgroundMaterial",

    // SoundCord Player â€” thumbnail toolbar Windows
    SET_THUMBAR_BUTTONS = "SoundCordSetThumbarButtons",
    THUMBAR_BUTTON_CLICK = "SoundCordThumbarButtonClick",

    // Midnightcord Updater â€” tÃ©lÃ©charge un exe depuis une URL et le lance
    MIDNIGHTCORD_DOWNLOAD_AND_RUN = "MidnightcordDownloadAndRun",

    // VB-Audio Virtual Cable (Windows only)
    CHECK_VB_CABLE = "MidnightcordCheckVBCable",
    INSTALL_VB_CABLE = "MidnightcordInstallVBCable",

    // Relaunch de l'app Electron
    RELAUNCH_APP = "MidnightcordRelaunchApp",

    // WorldBomb â€” Simulation Clavier/Souris Native
    WORLD_BOMB_TYPE = "WorldBombType",
    WORLD_BOMB_PRESS_ENTER = "WorldBombPressEnter",
    WORLD_BOMB_PRESS_BACKSPACE = "WorldBombPressBackspace",
    WORLD_BOMB_CLICK = "WorldBombClick",
    // SÃ©quence complÃ¨te en un seul appel systÃ¨me (clic + frappe + enter)
    WORLD_BOMB_SEQUENCE = "WorldBombSequence",
    // Position actuelle du curseur souris (pour calibration)
    WORLD_BOMB_GET_CURSOR_POS = "WorldBombGetCursorPos",
    // Ouvre la fenÃªtre externe Stream Proof
    WORLD_BOMB_OPEN_WINDOW = "WorldBombOpenWindow",
    // Ferme la fenÃªtre externe Stream Proof
    WORLD_BOMB_CLOSE_WINDOW = "WorldBombCloseWindow",
    // Modifie la protection Stream Proof
    WORLD_BOMB_SET_STREAM_PROOF = "WorldBombSetStreamProof",
    // Redimensionne la fenÃªtre externe
    WORLD_BOMB_RESIZE_WINDOW = "WorldBombResizeWindow",
    // Modifie la protection Stream Proof globale
    SET_CONTENT_PROTECTION = "MidnightcordSetContentProtection"
}
