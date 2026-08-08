/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: "lastOutputSystemDevice.justChanged",
            replacement: {
                match: /(\i)\.\i\.getState\(\).neverShowModal/,
                replace: "$& || $self.shouldIgnoreDevice($1)"
            }
        }
    ],

    shouldIgnoreDevice(state: any) {
        return Object.keys(state?.default?.lastDeviceConnected ?? {})?.[0] === "vencord-screen-share";
    }
});
