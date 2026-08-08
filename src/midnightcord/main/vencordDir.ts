/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { join } from "path";

// this is in a separate file to avoid circular dependencies
export const VENCORD_DIR = app.isPackaged
    ? join(process.resourcesPath, "midnightcord.asar")
    : join(__dirname, "..", "..", "..", "dist", "midnightcord.asar");
