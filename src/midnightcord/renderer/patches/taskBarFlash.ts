/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "renderer/settings";

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: ".flashFrame(!0)",
            replacement: {
                match: /(\i)&&\i\.\i\.taskbarFlash&&\i\.\i\.flashFrame\(!0\)/,
                replace: "$self.flashFrame()"
            }
        }
    ],

    flashFrame() {
        if (Settings.store.enableTaskbarFlashing) {
            VesktopNative.win.flashFrame(true);
        }
    }
});
