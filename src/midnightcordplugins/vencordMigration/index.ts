/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

import { VencordMigrationPanel } from "./Panel";

export default definePlugin({
    name: "VencordMigration",
    description: "Preview and safely migrate compatible Vencord settings, plugins, themes and QuickCSS with a local recovery backup.",
    authors: [{ name: "Midnightcord contributors", id: 0n }],
    tags: ["Utility"],
    settingsAboutComponent: VencordMigrationPanel
});
