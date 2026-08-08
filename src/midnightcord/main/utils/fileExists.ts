/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { access, constants } from "fs/promises";

export async function fileExistsAsync(path: string) {
    return await access(path, constants.F_OK)
        .then(() => true)
        .catch(() => false);
}
