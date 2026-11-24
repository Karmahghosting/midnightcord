/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { digestCloudText } from "@api/SettingsSync/cloudCrypto";

import { getCurrentUser, loadFavorites, publicGifUrl, subscribeFavorites, subscribeUser } from "./favorites";
import type { GifInput } from "./types";

export interface GifFolder { id: string; name: string; urls: string[]; }
export interface GifFolderBinding {
    teamId: string;
    teamName: string;
    folderId: string;
    scope: string;
    revision: number;
    paused: string | null;
}
export interface GifFoldersSnapshot {
    userId: string | null;
    loading: boolean;
    ready: boolean;
    error: string | null;
    folders: GifFolder[];
    favorites: GifInput[];
    favoritesReady: boolean;
    bindings: GifFolderBinding[];
}
interface StoredFolders { version: 1; folders: GifFolder[]; bindings: GifFolderBinding[]; }
interface Dependencies {
    currentUserId(): string | null;
    favorites(): Promise<GifInput[]>;
    subscribeFavorites(listener: () => void): () => void;
    subscribeUser(listener: () => void): () => void;
    read(key: string): Promise<unknown>;
    write(key: string, value: StoredFolders): Promise<unknown>;
    newId(): string;
}

const storageKey = (userId: string) => `midnightcord-gif-folders-v1:${userId}`;
const empty = (userId: string | null = null): GifFoldersSnapshot => ({
    userId, loading: false, ready: false, error: null, folders: [], favorites: [], favoritesReady: false, bindings: []
});
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,128}$/.test(value);
function folderName(value: string) {
    const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!name || name.length > 64) throw new Error("Choisis un nom de dossier entre 1 et 64 caractères.");
    return name;
}

function decode(value: unknown): StoredFolders {
    if (value === undefined) return { version: 1, folders: [], bindings: [] };
    const data = value as StoredFolders;
    const invalid = () => new Error("Les dossiers locaux ne peuvent pas être lus. Ils ont été conservés sans modification.");
    if (!data || data.version !== 1 || !Array.isArray(data.folders) || !Array.isArray(data.bindings) || data.folders.length > 100 || data.bindings.length > 200) throw invalid();
    const ids = new Set<string>();
    const folders = data.folders.map(folder => {
        if (!folder || !validId(folder.id) || ids.has(folder.id) || typeof folder.name !== "string" || !Array.isArray(folder.urls) || folder.urls.length > 1000) throw invalid();
        ids.add(folder.id);
        const urls = folder.urls.map(url => publicGifUrl(url));
        if (urls.some(url => !url)) throw invalid();
        return { id: folder.id, name: folderName(folder.name), urls: [...new Set(urls as string[])] };
    });
    const bindings = data.bindings.map(binding => {
        if (!binding || !validId(binding.teamId) || !validId(binding.folderId) || typeof binding.teamName !== "string"
            || !/^[A-Za-z0-9_-]{43}$/.test(binding.scope) || !Number.isSafeInteger(binding.revision) || binding.revision < 0
            || (binding.paused !== null && typeof binding.paused !== "string")) throw invalid();
        return { ...binding, teamName: binding.teamName.slice(0, 100), paused: binding.paused?.slice(0, 300) ?? null };
    });
    if (new Set(bindings.map(binding => `${binding.scope}:${binding.teamId}`)).size !== bindings.length) throw invalid();
    return { version: 1, folders, bindings };
}

// Persist only a one-way identifier, never the credential used for API requests.
export const folderIdentityScope = (authorization: string) => digestCloudText(`midnightcord-gif-folder-binding-v1:${authorization}`);

export function createGifFolderStore(dependencies: Dependencies) {
    let state = empty();
    let generation = 0;
    let active = false;
    let queue = Promise.resolve();
    let loading: Promise<GifFoldersSnapshot> | undefined;
    let refreshing: Promise<void> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeUser: (() => void) | undefined;
    let unsubscribeFavorites: (() => void) | undefined;
    const listeners = new Set<() => void>();
    const edits = new Set<() => void>();
    function publish(change: Partial<GifFoldersSnapshot>) {
        state = { ...state, ...change };
        for (const listener of listeners) listener();
    }
    function reset(userId: string | null) {
        generation++;
        loading = undefined;
        refreshing = undefined;
        clearTimeout(debounce);
        publish(empty(userId));
    }
    function assertUser(userId: string, expectedGeneration = generation) {
        if (expectedGeneration !== generation || dependencies.currentUserId() !== userId || state.userId !== userId)
            throw new DOMException("Le compte Discord a changé.", "AbortError");
    }
    async function getForUser(userId: string): Promise<GifFoldersSnapshot> {
        if (!/^\d{17,20}$/.test(userId) || dependencies.currentUserId() !== userId) throw new DOMException("Compte Discord indisponible.", "AbortError");
        if (state.userId !== userId) reset(userId);
        if (state.ready) return state;
        if (loading) return loading;
        const expectedGeneration = generation;
        publish({ loading: true });
        loading = (async () => {
            try {
                const data = decode(await dependencies.read(storageKey(userId)));
                assertUser(userId, expectedGeneration);
                publish({ ...data, loading: false, ready: true, error: null });
                return state;
            } catch (error) {
                if (generation === expectedGeneration) publish({ loading: false, error: error instanceof Error ? error.message : "Lecture des dossiers impossible." });
                throw error;
            } finally {
                if (generation === expectedGeneration) loading = undefined;
            }
        })();
        return loading;
    }
    function refresh(): Promise<void> {
        const userId = dependencies.currentUserId();
        if (state.userId !== userId) reset(userId);
        if (!userId) return Promise.resolve();
        if (refreshing) return refreshing;
        const expectedGeneration = generation;
        refreshing = (async () => {
            try {
                await getForUser(userId);
                const favorites = await dependencies.favorites();
                assertUser(userId, expectedGeneration);
                publish({ favorites, favoritesReady: true, error: null });
            } catch (error) {
                if (generation === expectedGeneration) publish({ favoritesReady: false, error: error instanceof Error ? error.message : "Lecture des favoris impossible." });
            } finally {
                if (generation === expectedGeneration) refreshing = undefined;
            }
        })();
        return refreshing;
    }
    function mutate<T>(userId: string, update: (data: StoredFolders) => T, edited = false): Promise<T> {
        const expectedGeneration = generation;
        const next = queue.then(async () => {
            await getForUser(userId);
            assertUser(userId, expectedGeneration);
            const data: StoredFolders = {
                version: 1, folders: state.folders.map(folder => ({ ...folder, urls: [...folder.urls] })),
                bindings: state.bindings.map(binding => ({ ...binding }))
            };
            const result = update(data);
            assertUser(userId, expectedGeneration);
            await dependencies.write(storageKey(userId), data);
            assertUser(userId, expectedGeneration);
            publish({ folders: data.folders, bindings: data.bindings, error: null });
            if (edited) for (const listener of edits) listener();
            return result;
        });
        queue = next.then(() => undefined, () => undefined);
        return next;
    }
    function currentUser() {
        const userId = dependencies.currentUserId();
        if (!userId || state.userId !== userId || !state.ready) throw new Error("Les dossiers de ce compte sont encore en cours de chargement.");
        return userId;
    }
    function selectedUrls(urls: string[]) {
        if (!state.favoritesReady) throw new Error("Attends le chargement de tes favoris avant de modifier ce dossier.");
        if (urls.length > 1000) throw new Error("Un dossier peut contenir au maximum 1 000 GIF.");
        const favorites = new Set(state.favorites.map(gif => gif.url));
        return [...new Set(urls)].filter(url => favorites.has(url));
    }
    function update(id: string, change: { name?: string; urls?: string[]; }) {
        const userId = currentUser();
        const name = change.name === undefined ? undefined : folderName(change.name);
        const urls = change.urls === undefined ? undefined : selectedUrls(change.urls);
        return mutate(userId, data => {
            const folder = data.folders.find(item => item.id === id);
            if (!folder) throw new Error("Ce dossier n’existe plus.");
            if (name !== undefined) folder.name = name;
            if (urls !== undefined) folder.urls = urls;
        }, true);
    }
    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        subscribeEdits(listener: () => void) { edits.add(listener); return () => { edits.delete(listener); }; },
        getForUser,
        refresh,
        start() {
            if (active) return;
            active = true;
            let observedUser = dependencies.currentUserId();
            unsubscribeUser = dependencies.subscribeUser(() => {
                const userId = dependencies.currentUserId();
                if (userId === observedUser) return;
                observedUser = userId;
                reset(userId);
                void refresh();
            });
            unsubscribeFavorites = dependencies.subscribeFavorites(() => {
                if (!active) return;
                clearTimeout(debounce);
                debounce = setTimeout(() => void refresh(), 300);
            });
            void refresh();
        },
        stop() {
            active = false;
            unsubscribeUser?.();
            unsubscribeFavorites?.();
            reset(null);
        },
        create(name: string, urls: string[] = []) {
            const userId = currentUser();
            const folder: GifFolder = { id: dependencies.newId(), name: folderName(name), urls: urls.length ? selectedUrls(urls) : [] };
            return mutate(userId, data => {
                if (data.folders.length >= 100) throw new Error("Tu peux créer jusqu’à 100 dossiers.");
                data.folders.push(folder);
                return folder.id;
            }, true);
        },
        update,
        rename: (id: string, name: string) => update(id, { name }),
        setUrls: (id: string, urls: string[]) => update(id, { urls }),
        remove(id: string) {
            return mutate(currentUser(), data => {
                if (data.bindings.some(binding => binding.folderId === id)) throw new Error("Désactive d’abord le partage de ce dossier dans les teams liées, même si sa synchronisation est en pause.");
                data.folders = data.folders.filter(folder => folder.id !== id);
            }, true);
        },
        saveBinding(userId: string, binding: GifFolderBinding, expectedRevision?: number, expectedFolderId = binding.folderId) {
            return mutate(userId, data => {
                const index = data.bindings.findIndex(item => item.scope === binding.scope && item.teamId === binding.teamId);
                if (expectedRevision !== undefined && (index === -1 || data.bindings[index].revision !== expectedRevision || data.bindings[index].folderId !== expectedFolderId)) return false;
                if (index === -1 && data.bindings.length >= 200) throw new Error("Détache les anciens liens de teams avant d’en ajouter un autre.");
                if (index === -1) data.bindings.push({ ...binding });
                else data.bindings[index] = { ...binding };
                return true;
            });
        },
        detachBinding(teamId: string, scope: string) {
            return mutate(currentUser(), data => {
                data.bindings = data.bindings.filter(binding => binding.scope !== scope || binding.teamId !== teamId);
            }, true);
        },
        removeBinding(userId: string, scope: string, teamId?: string) {
            return mutate(userId, data => {
                data.bindings = data.bindings.filter(binding => binding.scope !== scope || (teamId !== undefined && binding.teamId !== teamId));
            });
        }
    };
}

export type GifFolderStore = ReturnType<typeof createGifFolderStore>;
export const gifFolders = createGifFolderStore({
    currentUserId: () => getCurrentUser()?.id ?? null,
    favorites: loadFavorites, subscribeFavorites, subscribeUser,
    read: DataStore.get, write: DataStore.set, newId: () => crypto.randomUUID()
});
