/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getPublicPluginConfig, saveOwnPluginConfig } from "./PluginSync";
import { beginDiscordOAuth, getStoredToken, storeToken } from "./OAuth2";

export type BadgeSource = "vencord" | "equicord" | "midnightcord" | "globalbadges" | "illegalcord";

const PLUGIN_KEY = "badge-visibility";

interface CacheEntry {
    fetched: boolean;
    hidden: BadgeSource[];
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 1000;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

let myHiddenSources: BadgeSource[] = [];
let myUserId: string | null = null;
let loaded = false;

function setCache(userId: string, entry: CacheEntry) {
    if (cache.size >= MAX_CACHE && !cache.has(userId)) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(userId, entry);
}

/**
 * Returns the hidden badge sources for a given user, fetching from the public
 * sync endpoint if needed. Returns [] immediately while loading (badges will
 * pop in once fetched — consistent with how CustomProfile does it).
 */
export function getHiddenBadgeSources(userId: string): BadgeSource[] {
    if (myUserId && userId === myUserId) {
        return myHiddenSources;
    }

    const existing = cache.get(userId);
    if (existing?.fetched && (Date.now() - existing.timestamp) < CACHE_TTL) {
        return existing.hidden;
    }

    if (!existing) {
        setCache(userId, { fetched: false, hidden: [], timestamp: 0 });
        fetchHiddenBadgeSources(userId);
    }

    return existing?.hidden ?? [];
}

async function fetchHiddenBadgeSources(userId: string) {
    try {
        const result = await getPublicPluginConfig(PLUGIN_KEY, userId);
        const hidden: BadgeSource[] = Array.isArray(result?.settings?.hidden) ? result.settings.hidden : [];
        setCache(userId, { fetched: true, hidden, timestamp: Date.now() });
        emitBadgeVisibilityChange();
    } catch (e) {
        setCache(userId, { fetched: true, hidden: [], timestamp: Date.now() });
    }
}

/**
 * Loads the current user's own hidden badge sources from the cloud and local storage.
 * Call once on startup (after we know our own user id).
 */
export async function loadOwnHiddenBadgeSources(userId: string) {
    myUserId = userId;
    
    // 1. Charge la sauvegarde locale en premier pour éviter que ça clignote ou disparaisse sans compte
    try {
        const localData = localStorage.getItem("midnightcord_hidden_badges");
        if (localData) {
            const parsed = JSON.parse(localData);
            if (Array.isArray(parsed)) {
                myHiddenSources = parsed;
            }
        }
    } catch { }

    try {
        const token = await getStoredToken();
        if (!token) {
            loaded = true;
            return;
        }
        const { getOwnPluginConfig } = await import("./PluginSync");
        const result = await getOwnPluginConfig(PLUGIN_KEY, token);
        const hidden: BadgeSource[] = Array.isArray(result?.config?.settings?.hidden) ? result.config.settings.hidden : [];
        
        // La version cloud a priorité si elle existe (et on met à jour le local)
        if (result?.config?.settings?.hidden !== undefined) {
            myHiddenSources = hidden;
            localStorage.setItem("midnightcord_hidden_badges", JSON.stringify(hidden));
        }
    } catch (e) {
        // no-op — keep defaults or local version
    } finally {
        loaded = true;
        emitBadgeVisibilityChange();
    }
}

/**
 * Toggle a badge source for the current user, and push it to the cloud
 * (public, so the public endpoint can serve it to others).
 */
export async function setOwnHiddenBadgeSources(hidden: BadgeSource[]) {
    myHiddenSources = hidden;
    
    // Sauvegarde locale immédiate
    try {
        localStorage.setItem("midnightcord_hidden_badges", JSON.stringify(hidden));
    } catch { }

    emitBadgeVisibilityChange();

    let token = await getStoredToken();

    if (!token) {
        // Need to sign in first
        try {
            const { openModal } = await import("@utils/modal");
            const { OAuth2AuthorizeModal } = await import("@webpack/common");
            const oauthData = await beginDiscordOAuth();
            const clientId = new URL(oauthData.url).searchParams.get("client_id") ?? "";

            await new Promise<void>((resolve, reject) => {
                openModal((p: any) => (
                    <OAuth2AuthorizeModal
                        {...p}
                        scopes={oauthData.scopes}
                        responseType="code"
                        redirectUri={oauthData.redirectUri}
                        permissions={0n}
                        clientId={clientId}
                        cancelCompletesFlow={false}
                        callback={async ({ location }: { location: string; }) => {
                            try {
                                const res = await fetch(location);
                                const json = await res.json();
                                if (json?.token) {
                                    await storeToken(json.token);
                                    token = json.token;
                                    resolve();
                                } else {
                                    reject(new Error("No token returned"));
                                }
                            } catch (e) {
                                reject(e);
                            }
                        }}
                    />
                ));
            });
        } catch (e) {
            console.error("[BadgeVisibility] OAuth failed:", e);
            return;
        }
    }

    if (!token) return;

    try {
        await saveOwnPluginConfig(PLUGIN_KEY, token, { hidden, private: false });
        if (myUserId) cache.delete(myUserId);
    } catch (e) {
        console.error("[BadgeVisibility] Failed to save to cloud:", e);
    }
}

export function isOwnDataLoaded() {
    return loaded;
}

export function getOwnHiddenBadgeSources(): BadgeSource[] {
    return myHiddenSources;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function addBadgeVisibilityListener(l: Listener) {
    listeners.add(l);
}
export function removeBadgeVisibilityListener(l: Listener) {
    listeners.delete(l);
}
function emitBadgeVisibilityChange() {
    for (const l of listeners) {
        try { l(); } catch { }
    }
}
