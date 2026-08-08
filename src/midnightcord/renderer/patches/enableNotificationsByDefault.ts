/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: '"NotificationSettingsStore',
            replacement: {
                match: /\.isPlatformEmbedded(?=\?\i\.\i\.ALL)/g,
                replace: "$&||true"
            }
        }
    ]
});
