/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { resolve, sep } from "path";

export function isPathInDirectory(filePath: string, directory: string) {
    const resolvedPath = resolve(filePath);
    const resolvedDirectory = resolve(directory);

    const normalizedDirectory = resolvedDirectory.endsWith(sep) ? resolvedDirectory : resolvedDirectory + sep;

    return resolvedPath.startsWith(normalizedDirectory) || resolvedPath === resolvedDirectory;
}
