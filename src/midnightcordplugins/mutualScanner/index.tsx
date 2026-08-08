/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MagnifyingGlassIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";

import {
    mountKamidereRuntimeActivity,
    unmountKamidereRuntimeActivity,
} from "../_kamidereCompat/runtimeActivity";
import MutualScannerTab from "./MutualScannerTab";
import { resetMutualScannerRuntime } from "./runtime";

import { t } from "../autoTranslateMidnightcord";

const MUTUAL_SCANNER_SETTINGS_KEY = "kamidere_mutual_scanner";

function unregisterMutualScannerSettingsTab() {
    while (SettingsPlugin.customEntries.some(entry => entry.key === MUTUAL_SCANNER_SETTINGS_KEY)) {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === MUTUAL_SCANNER_SETTINGS_KEY);
    }
}

function registerMutualScannerSettingsTab() {
    unregisterMutualScannerSettingsTab();

    SettingsPlugin.customEntries.push({
        key: MUTUAL_SCANNER_SETTINGS_KEY,
        title: t("Mutual Scanner"),
        Component: MutualScannerTab,
        Icon: MagnifyingGlassIcon,
    });
}

export default definePlugin({
    name: "MutualScanner",
    enabledByDefault: false,
    description: "Scans selected servers for members that share at least one mutual friend with your account and saves the results locally.",
    authors: [Devs.clrxxo],
    dependencies: ["Settings"],
    tags: ["Friends", "Utility"],
    requiresRestart: false,

    start() {
        mountKamidereRuntimeActivity();
        registerMutualScannerSettingsTab();
    },

    stop() {
        resetMutualScannerRuntime();
        unmountKamidereRuntimeActivity();
        unregisterMutualScannerSettingsTab();
    },
});
