/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: 'setSinkId"in',
            replacement: {
                match: /return (\i)\?navigator\.mediaDevices\.enumerateDevices/,
                replace: "return $1 ? $self.filteredDevices"
            }
        }
    ],

    async filteredDevices() {
        const original = await navigator.mediaDevices.enumerateDevices();
        return original.filter(x => x.label !== "vencord-screen-share");
    }
});
