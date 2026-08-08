/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "renderer/settings";
import { isMac } from "renderer/utils";

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: "platform-web",
            replacement: {
                match: '"platform-web"',
                replace: "$self.getPlatformClass()"
            }
        }
    ],

    getPlatformClass() {
        if (Settings.store.customTitleBar) return "platform-win";
        if (isMac) return "platform-osx";
        return "platform-web";
    }
});
