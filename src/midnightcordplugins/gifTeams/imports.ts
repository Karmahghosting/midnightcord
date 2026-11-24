/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { digestCloudText } from "@api/SettingsSync/cloudCrypto";

import { getCurrentUser, publicGifUrl } from "./favorites";
import type { GifInput } from "./types";

interface Entry { seen: boolean; imported: boolean; }
interface Ledger { version: 1; entries: Record<string, Entry>; }
interface Dependencies {
    currentUserId(): string | null;
    read(key: string): Promise<unknown>;
    write(key: string, value: Ledger): Promise<unknown>;
}

const MAX_ENTRIES = 50_000;
const storageKey = (userId: string) => `midnightcord-gif-imports-v1:${userId}`;
const fingerprint = (url: string) => digestCloudText(`midnightcord-gif-import-v1:${url}`);
function decode(value: unknown): Ledger {
    if (value === undefined) return { version: 1, entries: {} };
    const data = value as Ledger;
    if (!data || data.version !== 1 || !data.entries || typeof data.entries !== "object" || Array.isArray(data.entries)
        || Object.keys(data.entries).length > MAX_ENTRIES
        || Object.entries(data.entries).some(([id, entry]) => !/^[A-Za-z0-9_-]{43}$/.test(id) || !entry || typeof entry.seen !== "boolean" || typeof entry.imported !== "boolean"))
        throw new Error("L’historique local des GIF reçus est illisible. L’import et le partage automatique sont suspendus pour le conserver.");
    return data;
}

export function createGifImportStore(dependencies: Dependencies) {
    let cachedUser: string | null = null;
    let cached: Ledger | undefined;
    let queue = Promise.resolve();

    function assertUser(userId: string, signal?: AbortSignal) {
        if (signal?.aborted || dependencies.currentUserId() !== userId || !/^\d{17,20}$/.test(userId))
            throw new DOMException("Session terminée", "AbortError");
    }
    async function read(userId: string, signal?: AbortSignal) {
        assertUser(userId, signal);
        if (cachedUser === userId && cached) return cached;
        const loaded = decode(await dependencies.read(storageKey(userId)));
        assertUser(userId, signal);
        cachedUser = userId;
        cached = loaded;
        return loaded;
    }
    function mutate<T>(userId: string, signal: AbortSignal | undefined, operation: (entries: Record<string, Entry>) => { result: T; changed: boolean; }) {
        const next = queue.then(async () => {
            const data = await read(userId, signal);
            const entries = { ...data.entries };
            const { result, changed } = operation(entries);
            assertUser(userId, signal);
            if (changed) {
                if (Object.keys(entries).length > MAX_ENTRIES)
                    throw new Error("L’historique local a atteint sa limite. L’ajout automatique est arrêté sans oublier les GIF que tu as retirés.");
                const next: Ledger = { version: 1, entries };
                await dependencies.write(storageKey(userId), next);
                assertUser(userId, signal);
                cachedUser = userId;
                cached = next;
            }
            return result;
        });
        queue = next.then(() => undefined, () => undefined);
        return next;
    }

    return {
        async filterAutomatic(userId: string, favorites: GifInput[], signal?: AbortSignal) {
            const data = await read(userId, signal);
            const ids = await Promise.all(favorites.map(gif => fingerprint(gif.url)));
            assertUser(userId, signal);
            return favorites.filter((_, index) => !data.entries[ids[index]]?.imported);
        },
        async prepare(userId: string, incoming: GifInput[], favorites: GifInput[], signal?: AbortSignal) {
            const unique = new Map<string, GifInput>();
            for (const gif of incoming) {
                const url = publicGifUrl(gif.url);
                if (url && !unique.has(url)) unique.set(url, { ...gif, url });
            }
            const gifs = [...unique.values()];
            const ids = await Promise.all(gifs.map(gif => fingerprint(gif.url)));
            const existing = new Set(favorites.map(gif => gif.url));
            return mutate(userId, signal, entries => {
                const result: { gifs: GifInput[]; freshUrls: string[]; } = { gifs: [], freshUrls: [] };
                let changed = false;
                gifs.forEach((gif, index) => {
                    const id = ids[index];
                    const entry = entries[id];
                    if (entry?.seen) return;
                    if (existing.has(gif.url)) {
                        entries[id] = { seen: true, imported: entry?.imported ?? false };
                        changed = true;
                    } else {
                        // Reserve provenance durably before touching Discord. A crash
                        // between native insertion and acknowledgement cannot re-share it.
                        if (!entry?.imported) {
                            entries[id] = { seen: false, imported: true };
                            result.freshUrls.push(gif.url);
                            changed = true;
                        }
                        result.gifs.push(gif);
                    }
                });
                return { result, changed };
            });
        },
        async confirm(userId: string, addedUrls: string[], existingUrls: string[], freshUrls: string[], signal?: AbortSignal) {
            const urls = [...new Set([...addedUrls, ...existingUrls])];
            const ids = await Promise.all(urls.map(fingerprint));
            const ownConcurrent = new Set(existingUrls.filter(url => freshUrls.includes(url)));
            return mutate(userId, signal, entries => {
                let changed = false;
                ids.forEach((id, index) => {
                    const imported = ownConcurrent.has(urls[index]) ? false : entries[id]?.imported ?? true;
                    if (!entries[id]?.seen || entries[id].imported !== imported) {
                        entries[id] = { seen: true, imported };
                        changed = true;
                    }
                });
                return { result: undefined, changed };
            });
        }
    };
}

export type GifImportStore = ReturnType<typeof createGifImportStore>;
export const gifImports = createGifImportStore({
    currentUserId: () => getCurrentUser()?.id ?? null,
    read: DataStore.get,
    write: DataStore.set
});
