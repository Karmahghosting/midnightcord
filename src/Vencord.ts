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

    window.addEventListener("error", e => {
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
import { IS_WINDOWS } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { StartAt } from "@utils/types";

import { popNotice, showNotice } from "./api/Notices";
import { initPluginManager, PMLogger, startAllPlugins } from "./api/PluginManager";
import { PlainSettings, Settings } from "./api/Settings";
import { relaunch } from "./utils/native";
import { checkForUpdates, isOutdated as getIsOutdated, update, UpdateLogger } from "./utils/updater";
import { onceReady } from "./webpack";
import { patches } from "./webpack/patchWebpack";

if (IS_REPORTER) {
    require("./debug/runReporter");
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

async function init() {
    await onceReady;

    startAllPlugins(StartAt.WebpackReady);

    initTrayIpc();

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
