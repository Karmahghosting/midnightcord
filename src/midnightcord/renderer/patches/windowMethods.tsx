/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: ",setSystemTrayApplications",
            replacement: [
                {
                    match: /\i\.window\.(close|minimize|maximize)/g,
                    replace: "VesktopNative.win.$1"
                },
                {
                    match: /(focus(\(\i\)){).{0,150}?\.focus\(\i,\i\)/,
                    replace: "$1VesktopNative.win.focus$2"
                },
                {
                    match: /,getEnableHardwareAcceleration/,
                    replace: "$&:VesktopNative.app.getEnableHardwareAcceleration,_oldGetEnableHardwareAcceleration"
                }
            ]
        }
    ]
});
