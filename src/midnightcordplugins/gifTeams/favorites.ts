/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { insertTextIntoChatInputBox } from "@utils/discord";
import { onceReady } from "@webpack";
import { UserSettingsActionCreators, UserSettingsProtoStore, UserStore } from "@webpack/common";

import type { GifInput } from "./types";

const PREVIEW_HOSTS = new Set(["media.tenor.com", "c.tenor.com", "giphy.com", "cdn.discordapp.com", "media.discordapp.net", "i.imgur.com"]);

export function publicGifUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value || value.length > 2048) return null;
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/\.$/, "");
        if (url.protocol !== "https:" || url.username || url.password || url.port
            || !host.includes(".") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("[")
            || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)
            || host.endsWith(".home.arpa")) return null;
        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

/** The map also contains FavouriteAnything files (format 0), which are not GIFs. */
export function normalizeFavorites(value: unknown): GifInput[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const seen = new Set<string>();
    return Object.entries(value)
        .filter(([, entry]) => entry && typeof entry === "object" && (entry.format === 1 || entry.format === 2))
        .sort(([, a], [, b]) => (Number(b.order) || 0) - (Number(a.order) || 0))
        .flatMap(([key, entry]) => {
            const url = publicGifUrl(key);
            if (!url || seen.has(url)) return [];
            seen.add(url);
            const preview = publicGifUrl(entry.src);
            const host = preview ? new URL(preview).hostname.toLowerCase() : "";
            const src = preview && (PREVIEW_HOSTS.has(host) || host.endsWith(".giphy.com")) ? preview : "";
            const dimension = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 16384 ? Math.round(n) : 0;
            const title = typeof entry.title === "string" ? entry.title.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "";
            return [{ url, src, format: entry.format, width: dimension(entry.width), height: dimension(entry.height), title }];
        });
}

export function getCurrentUser(): { id: string; displayName: string; } | null {
    const user = UserStore?.getCurrentUser();
    return user ? { id: user.id, displayName: user.globalName || user.username || "Utilisateur Midnightcord" } : null;
}

export async function loadFavorites(): Promise<GifInput[]> {
    const user = getCurrentUser();
    if (!user) throw new Error("Connectez-vous à Discord pour lire vos GIF favoris.");
    const actions = UserSettingsActionCreators.FrecencyUserSettingsActionCreators;
    await actions.loadIfNecessary();
    if (getCurrentUser()?.id !== user.id) throw new Error("Le compte Discord a changé.");
    // Loading can already be in progress: loadIfNecessary then resolves early.
    // Never erase a remote collection using an unfinished local snapshot.
    if (!UserSettingsProtoStore?.hasLoaded(actions.type)) throw new Error("Vos favoris Discord sont encore en cours de chargement.");
    const favorites = UserSettingsProtoStore.frecencyWithoutFetchingLatest.favoriteGifs?.gifs;
    if (favorites !== undefined && (!favorites || typeof favorites !== "object" || Array.isArray(favorites))) {
        throw new Error("Le format de vos favoris Discord n’est pas reconnu. Votre partage est conservé.");
    }
    return normalizeFavorites(favorites ?? {});
}

interface ChangeStore {
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
}

function subscribeStore(getStore: () => ChangeStore | undefined, callback: () => void): () => void {
    let stopped = false;
    let subscribed: ChangeStore | undefined;
    const attach = () => {
        if (stopped || subscribed) return;
        subscribed = getStore();
        if (!subscribed) return;
        subscribed.addChangeListener(callback);
        callback();
    };
    attach();
    if (!subscribed) void onceReady.then(attach);
    return () => {
        stopped = true;
        subscribed?.removeChangeListener(callback);
    };
}

export const subscribeFavorites = (callback: () => void) => subscribeStore(() => UserSettingsProtoStore, callback);
export const subscribeUser = (callback: () => void) => subscribeStore(() => UserStore, callback);

export function insertGif(url: string): void {
    const safeUrl = publicGifUrl(url);
    if (!safeUrl) throw new Error("Ce lien GIF n’est pas valide.");
    insertTextIntoChatInputBox(`${safeUrl} `);
}
