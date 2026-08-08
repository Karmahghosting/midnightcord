/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PluginLikeData {
    likes: number;
    likedByMe: boolean;
}

export interface PluginRatings {
    [pluginName: string]: PluginLikeData;
}

export async function fetchPluginRatings(_forceRefresh = false): Promise<PluginRatings> {
    return {};
}

export async function togglePluginLike(_pluginName: string): Promise<null> {
    return null;
}

export function invalidateRatingsCache() { }
