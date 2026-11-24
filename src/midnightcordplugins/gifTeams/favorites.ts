/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { insertTextIntoChatInputBox } from "@utils/discord";
import { findByPropsLazy, findLazy, onceReady } from "@webpack";
import { UserSettingsActionCreators, UserSettingsProtoStore, UserStore } from "@webpack/common";

import type { GifInput } from "./types";

const PREVIEW_HOSTS = new Set(["media.tenor.com", "c.tenor.com", "giphy.com", "cdn.discordapp.com", "media.discordapp.net", "i.imgur.com"]);
const FavoriteGifsProto = findLazy(module => module.typeName === "discord_protos.discord_users.v1.FavoriteGIFs");
const FavoriteGifProto = findLazy(module => module.typeName === "discord_protos.discord_users.v1.FavoriteGIF");
const UserSettingsDelay = findByPropsLazy("INFREQUENT_USER_ACTION");
// Matches Discord's native add-favorite action (FavoriteGIFs protobuf bytes).
const MAX_NATIVE_FAVORITES_BYTES = 762_880;
const MAX_IMPORT_BATCH = 100;
const MAX_NATIVE_ORDER = 0xffffffff;

export interface SharedFavoritesImport {
    addedUrls: string[];
    existingUrls: string[];
    skippedUrls: string[];
    skipped: { url: string; reason: "invalid" | "unsupported_preview" | "capacity" | "batch_limit" | "order_limit" | "unconfirmed"; }[];
}

function safePreview(value: unknown): string | null {
    const url = publicGifUrl(value);
    const host = url ? new URL(url).hostname.toLowerCase() : "";
    return url && (PREVIEW_HOSTS.has(host) || host.endsWith(".giphy.com")) ? url : null;
}

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
            const src = safePreview(entry.src) ?? "";
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

/** Adds to Discord's own store; the result confirms local acceptance, not a server save. */
export async function importSharedFavorites(gifs: GifInput[], userId: string, signal: AbortSignal): Promise<SharedFavoritesImport> {
    const assertAccount = () => {
        if (signal.aborted || !/^\d{17,20}$/.test(userId) || getCurrentUser()?.id !== userId)
            throw new DOMException("L’import des GIF a été annulé : le compte Discord a changé.", "AbortError");
    };
    assertAccount();
    const inputs = gifs.map(gif => ({ ...gif }));
    const actions = UserSettingsActionCreators.FrecencyUserSettingsActionCreators;
    await actions.loadIfNecessary();
    assertAccount();
    if (!UserSettingsProtoStore?.hasLoaded(actions.type)) throw new Error("Vos favoris Discord sont encore en cours de chargement.");
    const result: SharedFavoritesImport = { addedUrls: [], existingUrls: [], skippedUrls: [], skipped: [] };
    const skip = (url: string, reason: SharedFavoritesImport["skipped"][number]["reason"]) => {
        result.skippedUrls.push(url);
        result.skipped.push({ url, reason });
    };
    if (!inputs.length) return result;
    if (typeof FavoriteGifsProto?.toBinary !== "function" || typeof FavoriteGifProto?.create !== "function")
        throw new Error("Le format natif des favoris Discord n’est pas disponible. Aucun favori n’a été modifié.");
    await actions.updateAsync("favoriteGifs", values => {
        // updateAsync awaits its own native load. Recheck inside the synchronous
        // mutator, immediately before Discord commits the updated protobuf.
        assertAccount();
        if (!UserSettingsProtoStore?.hasLoaded(actions.type)) throw new Error("Vos favoris Discord sont encore en cours de chargement.");
        if (!values?.gifs || typeof values.gifs !== "object" || Array.isArray(values.gifs))
            throw new Error("Le format de vos favoris Discord n’est pas reconnu. Aucun favori n’a été modifié.");
        const existing = new Set(Object.keys(values.gifs).map(publicGifUrl).filter((url): url is string => url !== null));
        const seen = new Set<string>();
        let order = Object.values(values.gifs).reduce<number>((highest, entry: any) => Math.max(highest, Number(entry?.order) || 0), 0);
        let count = Object.keys(values.gifs).length;
        for (const input of inputs) {
            const url = publicGifUrl(input.url);
            if (!url) { skip(typeof input.url === "string" ? input.url : "", "invalid"); continue; }
            if (seen.has(url)) continue;
            seen.add(url);
            if (existing.has(url)) { result.existingUrls.push(url); continue; }
            const src = safePreview(input.src);
            if (!src) { skip(url, "unsupported_preview"); continue; }
            const dimension = (value: number) => Number.isFinite(value) && value >= 1 && value <= 16384;
            if (![1, 2].includes(input.format ?? 1) || !dimension(input.width) || !dimension(input.height)) { skip(url, "invalid"); continue; }
            if (result.addedUrls.length >= MAX_IMPORT_BATCH) { skip(url, "batch_limit"); continue; }
            if (!Number.isSafeInteger(order) || order >= MAX_NATIVE_ORDER) { skip(url, "order_limit"); continue; }
            const favorite = FavoriteGifProto.create({
                format: /\.(webp|avif|gif)(\?|$)/i.test(src) ? 1 : input.format ?? 1,
                src, width: Math.round(input.width), height: Math.round(input.height), order: order + 1
            });
            const candidate = { ...values, gifs: { ...values.gifs, [url]: favorite }, hideTooltip: values.hideTooltip || count + 1 > 2 };
            if (FavoriteGifsProto.toBinary(candidate).length > MAX_NATIVE_FAVORITES_BYTES) { skip(url, "capacity"); continue; }
            // Existing entries (including FavouriteAnything files and unknown
            // metadata) are never reconstructed, reordered or removed.
            values.gifs[url] = favorite;
            values.hideTooltip = candidate.hideTooltip;
            existing.add(url);
            result.addedUrls.push(url);
            count++;
            order++;
        }
        return result.addedUrls.length ? undefined : false;
    }, UserSettingsDelay.INFREQUENT_USER_ACTION);
    assertAccount();
    const current = actions.getCurrentValue()?.favoriteGifs?.gifs;
    const acknowledged = new Set(current && typeof current === "object" && !Array.isArray(current)
        ? Object.keys(current).map(publicGifUrl).filter((url): url is string => url !== null) : []);
    result.addedUrls = result.addedUrls.filter(url => {
        if (acknowledged.has(url)) return true;
        skip(url, "unconfirmed");
        return false;
    });
    result.existingUrls = result.existingUrls.filter(url => {
        if (acknowledged.has(url)) return true;
        skip(url, "unconfirmed");
        return false;
    });
    return result;
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
