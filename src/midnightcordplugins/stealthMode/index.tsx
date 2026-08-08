/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isStealthModeEnabled, syncStealthBodyClass, toggleStealthMode } from "@api/HeaderBar";
import definePlugin from "@utils/types";

import style from "./style.css?managed";

export { toggleStealthMode as doToggle };

export function isStealthEnabled(): boolean {
    return isStealthModeEnabled();
}

export default definePlugin({
    name: "StealthMode",
    enabledByDefault: true,
    description: "Hides all plugin buttons without disabling them. Shortcut: Ctrl+Shift+H. The toggle is in Midnightcord Settings.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    required: true,
    managedStyle: style,

    start() {
        syncStealthBodyClass();
    },

    stop() {
        document.body.classList.remove("midnightcord-stealth");
    },
});
