/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "renderer/settings";

import { addPatch } from "./shared";

if (Settings.store.customTitleBar)
    addPatch({
        patches: [
            {
                find: ".USE_OSX_NATIVE_TRAFFIC_LIGHTS",
                replacement: [
                    {
                        match: /case \i\.\i\.WINDOWS:/,
                        replace: 'case "WEB":'
                    }
                ]
            },
            // Visual Refresh
            {
                find: '"refresh-title-bar-small"',
                replacement: [
                    {
                        match: /\i===\i\.PlatformTypes\.WINDOWS/g,
                        replace: "true"
                    },
                    {
                        match: /\i===\i\.PlatformTypes\.WEB/g,
                        replace: "false"
                    }
                ]
            }
        ]
    });
