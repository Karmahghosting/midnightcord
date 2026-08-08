/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export async function getOwnPluginConfig(_pluginName: string, _token: string) {
    return null;
}

export async function saveOwnPluginConfig(_pluginName: string, _token: string, _settings: Record<string, unknown>) {
    return null;
}

export async function getPublicPluginConfig(_pluginName: string, _userId: string) {
    return null;
}

export function clearPublicProfileCache() { }
