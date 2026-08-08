/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Les patches HeaderBarAPI sont dans src/plugins/_api/headerBar.ts
// Ce fichier existe uniquement pour satisfaire le système de build d'equicordplugins/_api

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "HeaderBarAPIEquicord",
    description: "Equicord extension stub for HeaderBarAPI",
    authors: [Devs.prism],
    hidden: true,
    patches: []
});
