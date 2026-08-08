/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: ".STREAMING_AUTO_STREAMER_MODE,",
            replacement: {
                // remove if (platformEmbedded) check from streamer mode toggle
                match: /(?<=usePredicate.{0,20}?return )\i\.\i/g,
                replace: "true"
            }
        }
    ]
});
