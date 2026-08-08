/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { API_BASE, getStoredToken } from "./OAuth2";

export interface PluginLikeData {
    likes: number;
    likedByMe: boolean;
}

export interface PluginRatings {
    [pluginName: string]: PluginLikeData;
}

let ratingsCache: PluginRatings | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Fetch all plugin like counts + whether the current user liked each one.
 * Results are cached for CACHE_TTL ms.
 */
export async function fetchPluginRatings(forceRefresh = false): Promise<PluginRatings> {
    if (!forceRefresh && ratingsCache && Date.now() - cacheTime < CACHE_TTL) {
        return ratingsCache;
    }

    try {
        const token = await getStoredToken();
        const url = new URL(`${API_BASE}/api/plugins/ratings`);
        if (token) url.searchParams.set("token", token);

        const res = await fetch(url.toString());
        if (!res.ok) return ratingsCache ?? {};

        const data = await res.json();
        ratingsCache = data;
        cacheTime = Date.now();
        return data;
    } catch (e) {
        console.error("[PluginLikes] fetchPluginRatings failed:", e);
        return ratingsCache ?? {};
    }
}

/**
 * Toggle like for a plugin (like if not liked, unlike if already liked).
 * Returns updated like data, or null on failure.
 */
export async function togglePluginLike(pluginName: string): Promise<PluginLikeData | null> {
    const token = await getStoredToken();
    if (!token) return null;

    try {
        const res = await fetch(`${API_BASE}/api/plugins/${encodeURIComponent(pluginName)}/like`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        });

        if (!res.ok) return null;

        const data: PluginLikeData = await res.json();

        // Update cache immediately so UI feels instant
        if (ratingsCache) {
            ratingsCache[pluginName] = data;
        }

        return data;
    } catch (e) {
        console.error("[PluginLikes] togglePluginLike failed:", e);
        return null;
    }
}

export function invalidateRatingsCache() {
    ratingsCache = null;
    cacheTime = 0;
}
