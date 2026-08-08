/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "main/constants";
import { join } from "path";

export const STATIC_DIR = /* @__PURE__ */ join(__dirname, "..", "..", "static");
export const BADGE_DIR = /* @__PURE__ */ join(STATIC_DIR, "badges");
export const ICONS_DIR = /* @__PURE__ */ join(DATA_DIR, "TrayIcons");
