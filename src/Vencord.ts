/*!
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

// Global console filter to clear normal, expected but noisy startup logs & warnings
try {
    const skipLogs = [
        "Sentry successfully disabled",
        "had no effect (Module id is",
        "errored (Module id is",
        "found no module",
        "Error while filtering or firing callback",
        "Failed to render header bar button",
        "Failed to render channel toolbar button",
        "Starting plugin",
        "Starting plugins",
        "Undoing patch group",
        "Disabling Sentry by erroring its WebpackInstance",
        "Default overlay keybind is unsupported",
        "Spellchecker",
        "NowPlayingViewStore",
        "RPCServer",
        "libdiscore",
        "L.createContext is not a function",
        "webpack.find"
    ];

    const shouldSkip = (args: any[]) => {
        try {
            const str = args.map(a => {
                if (a == null) return "";
                if (a instanceof Error) return a.message + "\n" + a.stack;
                if (typeof a === "object") {
                    try { return JSON.stringify(a); } catch { return String(a); }
                }
                return String(a);
            }).join(" ");
            
            return skipLogs.some(pat => str.includes(pat));
        } catch {
            return false;
        }
    };

    const wrap = (level: "log" | "error" | "warn" | "info" | "debug") => {
        const orig = console[level];
        console[level] = function (...args: any[]) {
            if (shouldSkip(args)) return;
            orig.apply(console, args);
        };
    };

    wrap("log");
    wrap("error");
    wrap("warn");
    wrap("info");
    wrap("debug");

    window.addEventListener("error", (e) => {
        if (e.error?.message?.includes("Sentry successfully disabled") || e.message?.includes("Sentry successfully disabled")) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
} catch { }

// DO NOT REMOVE UNLESS YOU WISH TO FACE THE WRATH OF THE CIRCULAR DEPENDENCY DEMON!!!!!!!
import "~plugins";

export * as Api from "./api";
export * as Plugins from "./api/PluginManager";
export * as Components from "./components";
export * as Util from "./utils";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";
export { PlainSettings, Settings };

import { coreStyleRootNode, initStyles } from "@api/Styles";
import { openSettingsTabModal, UpdaterTab } from "@components/settings";
import { openMellowtelOnboardingModal, shouldShowMellowtelOnboarding } from "@components/MellowtelConsentModal";
import { addHeaderBarButton, HeaderBarButton } from "@api/HeaderBar";
import { debounce } from "@shared/debounce";
import { IS_WINDOWS } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { StartAt } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { get as dsGet } from "./api/DataStore";
import { popNotice, showNotice } from "./api/Notices";
import { showNotification } from "./api/Notifications";
import { initPluginManager, PMLogger, startAllPlugins } from "./api/PluginManager";
import { PlainSettings, Settings, SettingsStore } from "./api/Settings";
import { getCloudSettings, putCloudSettings, shouldCloudSync } from "./api/SettingsSync/cloudSync";
import { localStorage } from "./utils/localStorage";
import { relaunch } from "./utils/native";
import { checkForUpdates, isOutdated as getIsOutdated, rebuild, update, UpdateLogger } from "./utils/updater";
import { onceReady } from "./webpack";
import { patches } from "./webpack/patchWebpack";

if (IS_REPORTER) {
    require("./debug/runReporter");
}

async function syncSettings() {
    // Check if cloud auth exists for current user before attempting sync
    if (localStorage.Vencord_cloudSyncDirection === undefined) {
        // by default, sync bi-directionally
        localStorage.Vencord_cloudSyncDirection = "both";
    }
    const hasCloudAuth = await dsGet("Vencord_cloudSecret");
    if (!hasCloudAuth) {
        if (Settings.cloud.authenticated) {
            // User switched to an account that isn't connected to cloud
            showNotification({
                title: "Cloud Settings",
                body: "Cloud sync was disabled because this account isn't connected to the cloud App. You can enable it again by connecting this account in Cloud Settings. (note: it will store your preferences separately)",
                color: "var(--yellow-360)",
                onClick: () => SettingsRouter.openUserSettings("equicord_cloud_panel")
            });
            // Disable cloud sync globally
            Settings.cloud.authenticated = false;
        }
        return;
    }

    // pre-check for local shared settings
    if (
        Settings.cloud.authenticated &&
        !hasCloudAuth // this has been enabled due to local settings share or some other bug
    ) {
        // show a notification letting them know and tell them how to fix it
        showNotification({
            title: "Cloud Integrations",
            body: "We've noticed you have cloud integrations enabled in another client! Due to limitations, you will " +
                "need to re-authenticate to continue using them. Click here to go to the settings page to do so!",
            color: "var(--yellow-360)",
            onClick: () => SettingsRouter.openUserSettings("equicord_cloud_panel")
        });
        return;
    }

    if (
        Settings.cloud.settingsSync && // if it's enabled
        Settings.cloud.authenticated && // if cloud integrations are enabled
        localStorage.Vencord_cloudSyncDirection !== "manual" // if we're not in manual mode
    ) {
        if (localStorage.Vencord_settingsDirty && shouldCloudSync("push")) {
            await putCloudSettings();
        } else if (shouldCloudSync("pull") && await getCloudSettings(false)) { // if we synchronized something (false means no sync)
            // we show a notification here instead of allowing getCloudSettings() to show one to declutter the amount of
            // potential notifications that might occur. getCloudSettings() will always send a notification regardless if
            // there was an error to notify the user, but besides that we only want to show one notification instead of all
            // of the possible ones it has (such as when your settings are newer).
            showNotification({
                title: "Cloud Settings",
                body: "Your settings have been updated! Click here to restart to fully apply changes!",
                color: "var(--green-360)",
                onClick: relaunch
            });
        }
    }

    const saveSettingsOnFrequentAction = debounce(async () => {
        if (Settings.cloud.settingsSync && Settings.cloud.authenticated && shouldCloudSync("push")) {
            await putCloudSettings();
        }
    }, 60_000);

    SettingsStore.addGlobalChangeListener(() => {
        localStorage.Vencord_settingsDirty = true;
        saveSettingsOnFrequentAction();
    });
}

let stagedThisSession = false;

/**
 * Downloads and stages the update silently in the background.
 * No banner, no user interaction needed.
 * midnightcord-index.js will apply the staged files on the next restart.
 */
async function silentlyStageUpdate() {
    if (stagedThisSession) return;
    stagedThisSession = true;

    try {
        UpdateLogger.info("Silently staging update in background...");
        // checkForUpdates() already set pendingDownloadUrl via IpcEvents.GET_UPDATES → getUpdates() → fetchUpdates()
        // So we call rebuild() (= stageUpdate) directly — no redundant API call needed.
        await rebuild(); // downloads zip to %temp%, extracts to staging dir, writes marker — no locked files touched
        UpdateLogger.info("Update staged successfully. Will be applied on next Discord restart.");
    } catch (e) {
        UpdateLogger.error("Silent update staging failed", e);
        stagedThisSession = false; // allow retry on next check interval
    }
}

async function runUpdateCheck() {
    if (IS_UPDATER_DISABLED || Settings.disableAutoUpdate) return;

    try {
        const isOutdated = await checkForUpdates();
        if (IS_DISCORD_DESKTOP) VencordNative.tray.setUpdateState(isOutdated);
        if (!isOutdated) return;

        // Stage silently — no banner shown, update applies on next restart
        silentlyStageUpdate();
    } catch (err) {
        UpdateLogger.error("Failed to check for updates", err);
    }
}

function initTrayIpc() {
    if (IS_WEB || IS_UPDATER_DISABLED) return;

    VencordNative.tray.onCheckUpdates(async () => {
        try {
            const isOutdated = await checkForUpdates();
            VencordNative.tray.setUpdateState(isOutdated);

            if (isOutdated) {
                showNotice("A Midnightcord update is available!", "View Update", () => openSettingsTabModal(UpdaterTab!));
            } else {
                showNotice("No updates available, you're on the latest version!", "OK", popNotice);
            }
        } catch (err) {
            UpdateLogger.error("Failed to check for updates from tray", err);
            showNotice("Failed to check for updates, check the console for more info", "OK", popNotice);
        }
    });

    VencordNative.tray.onRepair(async () => {
        try {
            await update();
            relaunch();
        } catch (err) {
            UpdateLogger.error("Failed to repair Midnightcord", err);
        }
    });

    VencordNative.tray.setUpdateState(getIsOutdated);
}

import { ReactDOM } from "@webpack/common";

async function init() {
    await onceReady;

    startAllPlugins(StartAt.WebpackReady);

    syncSettings();
    initTrayIpc();

    // Mandatory, one-time (per onboarding version) consent screen for the Mellowtel
    // bandwidth-sharing SDK. It re-appears after major updates by bumping
    // MELLOWTEL_ONBOARDING_VERSION.
    if (shouldShowMellowtelOnboarding()) {
        setTimeout(() => openMellowtelOnboardingModal(), 1500);
    }

    if (!IS_WEB && !IS_UPDATER_DISABLED) {
        runUpdateCheck();
        setInterval(runUpdateCheck, 1000 * 60 * 30); // 30 minutes
    }

    if (IS_DEV) {
        const pendingPatches = patches.filter(p => !p.all && p.predicate?.() !== false);
        if (pendingPatches.length)
            PMLogger.warn(
                "Webpack has finished initialising, but some patches haven't been applied yet.",
                "This might be expected since some Modules are lazy loaded, but please verify",
                "that all plugins are working as intended.",
                "You are seeing this warning because this is a Development build of Midnightcord.",
                "\nThe following patches have not been applied:",
                "\n\n" + pendingPatches.map(p => `${p.plugin}: ${p.find}`).join("\n")
            );
    }
}

initPluginManager();
initStyles();
startAllPlugins(StartAt.Init);
init();

document.addEventListener("DOMContentLoaded", () => {
    startAllPlugins(StartAt.DOMContentLoaded);

    // Reposition Discord's titlebar to the left by default (90px)
    // When stealth mode or compact mode is enabled, it falls back to Discord's default center position.
    createAndAppendStyle("midnightcord-titlebar-position", coreStyleRootNode).textContent = `
        body:not(.midnightcord-stealth):not(.midnightcord-compact) [class*="title_c38"] {
            position: absolute !important;
            left: 90px !important;
            right: auto !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            text-align: left !important;
            margin: 0 !important;
        }
    `;

    // FIXME
    if (IS_DISCORD_DESKTOP && Settings.winNativeTitleBar && IS_WINDOWS) {
        createAndAppendStyle("vencord-native-titlebar-style", coreStyleRootNode).textContent = "[class*=titleBar]{display: none!important}";
    }
}, { once: true });

