/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createCloudIdentity, getCloudKey } from "@api/SettingsSync/cloudSetup";

import { getCurrentUser, importSharedFavorites, loadFavorites, subscribeFavorites, subscribeUser } from "./favorites";
import { folderIdentityScope, GifFolderBinding, gifFolders,GifFolderStore } from "./folders";
import { gifImports, GifImportStore } from "./imports";
import { createTeamsApi, deriveTeamsAuthorization, TeamsError } from "./service";
import { settings, subscribeImportSettings } from "./settings";
import type { GifInput, GifPage, Invite, Sharing, SharingMode, TeamDetail, TeamsResponse, TeamsSnapshot } from "./types";

interface Identity { userId: string; displayName: string; authorization: string; }
interface Dependencies {
    identity(create: boolean): Promise<Identity | null>;
    currentUserId(): string | null;
    favorites(): Promise<GifInput[]>;
    subscribeFavorites(callback: () => void): () => void;
    subscribeUser(callback: () => void): () => void;
    api: typeof createTeamsApi;
    folders?: GifFolderStore;
    imports?: {
        store: GifImportStore;
        add: typeof importSharedFavorites;
        enabled(): boolean;
        subscribe(listener: () => void): () => void;
    };
    requestDelayMs?: number;
}
interface Session extends Identity {
    abort: AbortController;
    request: ReturnType<typeof createTeamsApi>;
    folderScope?: string;
    requestGate: Promise<void>;
    nextRequestAt: number;
    importAbort: AbortController;
}
interface ImportScan { fingerprint: string; offset: number; total: number | null; finishedAt: number | null; warning: string | null; }
interface OperationOptions {
    background?: boolean;
    onError?: (error: unknown) => void;
    onSuccess?: () => void;
}

const initial = (): TeamsSnapshot => ({
    connected: false, loading: false, busy: false, error: null,
    teams: [], viewerId: null, team: null, page: null, sharing: null, folderBinding: null,
    favorites: [], favoritesReady: false, importing: false, importedCount: 0, importError: null, filterMember: undefined, invite: null
});

function collectionSignature(gifs: GifInput[]) {
    return JSON.stringify(gifs.map(gif => [gif.url, gif.src, gif.width, gif.height, gif.format ?? 1, gif.title ?? ""])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function createGifTeamsController(dependencies: Dependencies) {
    let state = initial();
    const listeners = new Set<() => void>();
    const shares = new Map<string, Sharing>();
    const importScans = new Map<string, ImportScan>();
    let session: Session | null = null;
    let active = false;
    let generation = 0;
    let queue = Promise.resolve();
    let refreshPending = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    let unsubscribeFavorites: (() => void) | undefined;
    let unsubscribeUser: (() => void) | undefined;
    let unsubscribeFolders: (() => void) | undefined;
    let folderEditsPending = false;
    let favoriteSignature: string | null = null;
    let importTimer: ReturnType<typeof setTimeout> | undefined;
    let importPending = false;
    let importBlocked = false;
    let unsubscribeImportSettings: (() => void) | undefined;

    function publish(change: Partial<TeamsSnapshot>) {
        state = { ...state, ...change };
        for (const listener of listeners) listener();
    }

    function reset() {
        generation++;
        session?.abort.abort();
        session?.importAbort.abort();
        session = null;
        shares.clear();
        importScans.clear();
        importBlocked = false;
        clearTimeout(importTimer);
        importTimer = undefined;
        clearTimeout(debounce);
        clearTimeout(retryTimer);
        retryTimer = undefined;
        retryAttempt = 0;
        folderEditsPending = false;
        favoriteSignature = null;
        publish(initial());
    }

    function assertCurrent(current: Session) {
        if (!active || current !== session || current.abort.signal.aborted || dependencies.currentUserId() !== current.userId)
            throw new DOMException("Session terminée", "AbortError");
    }

    async function connect(create = false) {
        const before = generation;
        const identity = await dependencies.identity(create);
        if (!active || before !== generation) throw new DOMException("Session terminée", "AbortError");
        if (!identity) {
            if (session) reset();
            return null;
        }
        if (dependencies.currentUserId() !== identity.userId) throw new DOMException("Session terminée", "AbortError");
        if (session?.authorization !== identity.authorization || session?.userId !== identity.userId) {
            reset();
            const abort = new AbortController();
            session = {
                ...identity, abort, request: dependencies.api(identity.authorization, abort.signal),
                requestGate: Promise.resolve(), nextRequestAt: 0, importAbort: new AbortController()
            };
        } else {
            session.displayName = identity.displayName;
        }
        publish({ connected: true });
        return session;
    }

    async function verifyIdentity(current: Session) {
        const identity = await dependencies.identity(false);
        assertCurrent(current);
        if (identity?.authorization !== current.authorization || identity?.userId !== current.userId) {
            reset();
            void refreshInBackground();
            throw new DOMException("Identité remplacée", "AbortError");
        }
    }

    async function paceRequest(current: Session) {
        const spacing = dependencies.requestDelayMs ?? 0;
        if (!spacing) return;
        const next = current.requestGate.then(async () => {
            assertCurrent(current);
            const delay = current.nextRequestAt - Date.now();
            if (delay > 0) await new Promise<void>((resolve, reject) => {
                const abort = () => { clearTimeout(timer); reject(new DOMException("Session terminée", "AbortError")); };
                const timer = setTimeout(() => { current.abort.signal.removeEventListener("abort", abort); resolve(); }, delay);
                current.abort.signal.addEventListener("abort", abort, { once: true });
            });
            assertCurrent(current);
            current.nextRequestAt = Date.now() + spacing;
        });
        current.requestGate = next.catch(() => undefined);
        await next;
    }

    async function request<T>(current: Session, path = "", method = "GET", body?: unknown, beforeSend?: () => void) {
        assertCurrent(current);
        await paceRequest(current);
        if (method !== "GET" && method !== "HEAD") await verifyIdentity(current);
        beforeSend?.();
        const data = await current.request<T>(path, method, body);
        assertCurrent(current);
        await verifyIdentity(current);
        return data;
    }

    async function folderData(current: Session) {
        if (!dependencies.folders) return null;
        const snapshot = await dependencies.folders.getForUser(current.userId);
        const scope = current.folderScope ?? await folderIdentityScope(current.authorization);
        assertCurrent(current);
        current.folderScope = scope;
        return { snapshot, scope };
    }

    async function folderBinding(current: Session, id: string) {
        const data = await folderData(current);
        return data?.snapshot.bindings.find(binding => binding.scope === data.scope && binding.teamId === id) ?? null;
    }

    function assertBindingUnchanged(current: Session, id: string, expected: GifFolderBinding | null | undefined) {
        assertCurrent(current);
        const snapshot = dependencies.folders!.getSnapshot();
        const binding = snapshot.bindings.find(item => item.scope === current.folderScope && item.teamId === id);
        if (snapshot.userId !== current.userId || binding?.folderId !== expected?.folderId || binding?.revision !== expected?.revision || binding?.paused !== expected?.paused)
            throw new Error("Le suivi de ce dossier a été modifié pendant la préparation. Vérifie-le avant de réessayer.");
    }

    async function saveBinding(current: Session, binding: GifFolderBinding, expectedRevision?: number, expectedFolderId = binding.folderId) {
        assertCurrent(current);
        const saved = await dependencies.folders!.saveBinding(current.userId, binding, expectedRevision, expectedFolderId);
        assertCurrent(current);
        if (state.team?.id === binding.teamId && saved) publish({ folderBinding: { folderId: binding.folderId, paused: binding.paused } });
    }

    async function clearBinding(current: Session, id?: string) {
        const data = await folderData(current);
        if (!data || !data.snapshot.bindings.some(binding => binding.scope === data.scope && (id === undefined || binding.teamId === id))) return;
        await dependencies.folders!.removeBinding(current.userId, data.scope, id);
        assertCurrent(current);
        if (id === undefined || state.team?.id === id) publish({ folderBinding: null });
    }

    async function pauseBinding(current: Session, binding: GifFolderBinding, reason: string) {
        if (!binding.paused) await saveBinding(current, { ...binding, paused: reason }, binding.revision);
    }

    function perform(operation: (current: Session) => Promise<void>, create = false, options: OperationOptions = {}) {
        const requestedGeneration = generation;
        const next = queue.then(async () => {
            if (!active || requestedGeneration !== generation) return;
            if (!options.background) publish({ busy: true, error: null });
            let current: Session | null = null;
            try {
                current = await connect(create);
                if (!current) return;
                if (!options.background) publish({ busy: true });
                await operation(current);
                options.onSuccess?.();
            } catch (error) {
                const cancelled = typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
                    && (!current || current !== session || current.abort.signal.aborted || dependencies.currentUserId() !== current.userId);
                if (!cancelled && active && (!current || current === session)) {
                    const clear = error instanceof TeamsError && (error.status === 404 || error.status === 401)
                        ? { team: null, page: null, sharing: null, folderBinding: null, invite: null } : {};
                    publish({ ...clear, error: error instanceof Error ? error.message : "Connexion au service impossible." });
                    options.onError?.(error);
                }
            } finally {
                if (active && (!current || current === session)) publish({ ...(!options.background ? { busy: false } : {}), loading: false });
            }
        });
        queue = next.catch(() => undefined);
        return next;
    }

    async function readFavorites(current: Session) {
        try {
            const favorites = await dependencies.favorites();
            assertCurrent(current);
            publish({ favorites, favoritesReady: true });
            favoriteSignature = collectionSignature(favorites);
            return favorites;
        } catch (error) {
            assertCurrent(current);
            publish({ favoritesReady: false });
            throw error;
        }
    }

    async function list(current: Session) {
        const data = await request<TeamsResponse>(current);
        publish({ teams: data.teams, viewerId: data.viewerId });
        const ids = new Set(data.teams.map(team => team.id));
        for (const id of shares.keys()) if (!ids.has(id)) shares.delete(id);
        const folders = await folderData(current);
        for (const binding of folders?.snapshot.bindings ?? []) {
            if (binding.scope === folders!.scope && !ids.has(binding.teamId)) await clearBinding(current, binding.teamId);
        }
        if (state.team && !ids.has(state.team.id)) publish({ team: null, sharing: null, folderBinding: null, page: null, invite: null });
        updateImportScans();
        scheduleImports();
        return data.teams;
    }

    async function page(current: Session, id: string, member: string | undefined, offset = 0) {
        const query = new URLSearchParams({ offset: String(offset), limit: "60" });
        if (member) query.set("member", member);
        const data = await request<GifPage>(current, `/${encodeURIComponent(id)}/gifs?${query}`);
        if (!data.items.length && data.total > 0 && offset >= data.total) {
            await page(current, id, member, Math.floor((data.total - 1) / 60) * 60);
            return;
        }
        if (state.team?.id === id) publish({ page: data, filterMember: member });
    }

    async function detail(current: Session, id: string, clearInvite = false) {
        const route = `/${encodeURIComponent(id)}`;
        const [team, sharing] = await Promise.all([
            request<TeamDetail>(current, route), request<Sharing>(current, `${route}/sharing`)
        ]);
        shares.set(id, sharing);
        const binding = await folderBinding(current, id);
        publish({ team, sharing, folderBinding: binding ? { folderId: binding.folderId, paused: binding.paused } : null,
            ...(clearInvite ? { invite: null, page: null, filterMember: undefined } : {}) });
        const member = state.filterMember && team.members.some(item => item.id === state.filterMember) ? state.filterMember : undefined;
        await page(current, id, member, clearInvite ? 0 : state.page?.offset ?? 0);
    }

    async function refreshSession(current: Session) {
        importBlocked = false;
        const teams = await list(current);
        const favorites = await readFavorites(current);
        const automatic = dependencies.imports ? await dependencies.imports.store.filterAutomatic(current.userId, favorites, current.abort.signal) : favorites;
        assertCurrent(current);
        const byUrl = new Map(favorites.map(gif => [gif.url, gif]));
        let changed = false;
        for (const team of teams) {
            const binding = await folderBinding(current, team.id);
            if (binding?.paused) continue;
            if (binding && (team.mode !== "manual" || team.sharingRevision !== binding.revision)) {
                await pauseBinding(current, binding, "Le partage a changé sur un autre appareil. Enregistre à nouveau le dossier pour reprendre son suivi.");
                continue;
            }
            if (team.mode === "off") { shares.delete(team.id); continue; }
            let sharing = shares.get(team.id);
            const route = `/${encodeURIComponent(team.id)}/sharing`;
            if (!sharing || sharing.revision !== team.sharingRevision) {
                sharing = await request<Sharing>(current, route);
                shares.set(team.id, sharing);
            }
            if (binding && (sharing.mode !== "manual" || sharing.revision !== binding.revision)) {
                await pauseBinding(current, binding, "Le partage a changé sur un autre appareil. Enregistre à nouveau le dossier pour reprendre son suivi.");
                continue;
            }
            const folder = binding ? (await folderData(current))?.snapshot.folders.find(item => item.id === binding.folderId) : null;
            if (binding && !folder) {
                await pauseBinding(current, binding, "Ce dossier local n’existe plus. Choisis un autre mode de partage.");
                continue;
            }
            const selected = new Set(folder?.urls);
            const desired = folder ? favorites.filter(gif => selected.has(gif.url)) : sharing.mode === "auto" ? automatic
                : sharing.mode === "manual" ? sharing.gifs.flatMap(gif => byUrl.has(gif.url) ? [byUrl.get(gif.url)!] : []) : [];
            if (collectionSignature(sharing.gifs) === collectionSignature(desired)) continue;
            try {
                const saved = await request<Sharing>(current, route, "PUT", {
                    mode: sharing.mode, gifs: desired, revision: sharing.revision, displayName: current.displayName
                }, binding ? () => assertBindingUnchanged(current, team.id, binding) : undefined);
                shares.set(team.id, saved);
                if (binding) await saveBinding(current, { ...binding, revision: saved.revision }, binding.revision);
                changed = true;
            } catch (error) {
                shares.delete(team.id);
                if (binding && error instanceof TeamsError && error.status === 409)
                    await pauseBinding(current, binding, "Une autre modification a été enregistrée. Le suivi du dossier est en pause pour la conserver.");
                throw error;
            }
        }
        if (changed) await list(current);
        if (state.team) await detail(current, state.team.id);
        updateImportScans();
        scheduleImports();
    }

    function updateImportScans() {
        const ids = new Set(state.teams.map(team => team.id));
        for (const id of importScans.keys()) if (!ids.has(id)) importScans.delete(id);
        for (const team of state.teams) {
            const fingerprint = `${team.updatedAt}:${team.gifCount}:${team.memberCount}`;
            const previous = importScans.get(team.id);
            if (!previous || previous.fingerprint !== fingerprint || (previous.finishedAt !== null && Date.now() - previous.finishedAt >= 60_000)) {
                importScans.set(team.id, { fingerprint, offset: 0, total: null, finishedAt: team.gifCount === 0 || team.memberCount < 2 ? Date.now() : null, warning: null });
            }
        }
    }

    function assertImport(current: Session, abort: AbortController) {
        assertCurrent(current);
        if (!dependencies.imports?.enabled() || abort !== current.importAbort || abort.signal.aborted)
            throw new DOMException("Import arrêté", "AbortError");
    }

    async function importPass(current: Session) {
        if (!dependencies.imports?.enabled()) return;
        const adapter = dependencies.imports;
        const abort = current.importAbort;
        publish({ importing: true });
        try {
            for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
                assertImport(current, abort);
                const entry = [...importScans.entries()].find(([, scan]) => scan.finishedAt === null);
                if (!entry) break;
                const [teamId, scan] = entry;
                let data: GifPage;
                try {
                    data = await request<GifPage>(current, `/${encodeURIComponent(teamId)}/gifs?offset=${scan.offset}&limit=100`, "GET", undefined, () => assertImport(current, abort));
                } catch (error) {
                    if (error instanceof TeamsError && error.status === 404) {
                        importScans.delete(teamId);
                        shares.delete(teamId);
                        publish({ teams: state.teams.filter(team => team.id !== teamId), ...(state.team?.id === teamId ? { team: null, page: null, sharing: null, folderBinding: null, invite: null } : {}) });
                        continue;
                    }
                    throw error;
                }
                assertImport(current, abort);
                if (!Array.isArray(data.items) || data.items.length > 100 || data.offset !== scan.offset || !Number.isSafeInteger(data.total) || data.total < 0 || data.total > 25_000
                    || (data.nextOffset !== null && (!Number.isSafeInteger(data.nextOffset) || data.nextOffset <= scan.offset || data.nextOffset > data.total))) {
                    scan.finishedAt = Date.now();
                    throw new Error("La pagination des GIF partagés n’est pas valide. Le prochain passage réessaiera sans modifier tes favoris existants.");
                }
                if (scan.total !== null && scan.total !== data.total) {
                    scan.offset = 0;
                    scan.total = null;
                    scan.finishedAt = Date.now();
                    throw new Error("La collection partagée a changé pendant son chargement. Elle sera relue au prochain passage.");
                }
                const incoming = data.items.filter(gif => typeof gif.memberId === "string" && gif.memberId && gif.memberId !== state.viewerId);
                const favorites = await dependencies.favorites();
                assertImport(current, abort);
                const plan = await adapter.store.prepare(current.userId, incoming, favorites, abort.signal);
                assertImport(current, abort);
                if (plan.gifs.length) {
                    await verifyIdentity(current);
                    assertImport(current, abort);
                    const result = await adapter.add(plan.gifs, current.userId, abort.signal);
                    assertImport(current, abort);
                    await adapter.store.confirm(current.userId, result.addedUrls, result.existingUrls, plan.freshUrls, abort.signal);
                    assertImport(current, abort);
                    if (result.skippedUrls.length) scan.warning = "Certains GIF n’ont pas pu être ajoutés aux favoris Discord (limite native ou aperçu indisponible). Ils seront réessayés lors d’un prochain passage.";
                    publish({ importedCount: state.importedCount + result.addedUrls.length });
                    await readFavorites(current);
                }
                scan.total = data.total;
                if (data.nextOffset === null) scan.finishedAt = Date.now();
                else scan.offset = data.nextOffset;
                // Round-robin pages: a large team must not starve the others.
                importScans.delete(teamId);
                importScans.set(teamId, scan);
            }
            publish({ importError: [...importScans.values()].find(scan => scan.warning)?.warning ?? null });
        } catch (error) {
            if (current !== session || !active || abort.signal.aborted || !adapter.enabled()) return;
            if (error instanceof TeamsError && error.status === 401) {
                importScans.clear();
                publish({ teams: [], team: null, page: null, sharing: null, folderBinding: null, invite: null });
            }
            publish({ importError: error instanceof Error ? error.message : "Impossible de recevoir les GIF partagés pour le moment." });
            importBlocked = true;
            clearTimeout(importTimer);
            importTimer = undefined;
            scheduleRetry(error);
            return;
        } finally {
            if (active && current === session) publish({ importing: false });
        }
        scheduleImports();
    }

    function scheduleImports() {
        if (!active || !session || !dependencies.imports?.enabled() || importBlocked || retryTimer !== undefined || importTimer !== undefined
            || ![...importScans.values()].some(scan => scan.finishedAt === null)) return;
        importTimer = setTimeout(() => {
            importTimer = undefined;
            if (importPending || !active || !dependencies.imports?.enabled()) return;
            importPending = true;
            void perform(importPass, false, { background: true }).finally(() => { importPending = false; scheduleImports(); });
        }, 750);
    }

    function scheduleRetry(error: unknown) {
        if (!(error instanceof TeamsError) || !(error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)) return;
        const exponential = Math.min(60_000, 5_000 * 2 ** Math.min(retryAttempt++, 4));
        const advertised = typeof error.retryAfterMs === "number" && Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0;
        const delay = Math.min(120_000, Math.max(exponential, advertised));
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            retryTimer = undefined;
            void refreshInBackground();
        }, delay);
    }

    function runRefresh(manual: boolean) {
        if (!active || refreshPending) return queue;
        const requestedGeneration = generation;
        refreshPending = true;
        folderEditsPending = false;
        let failure: unknown;
        publish({ loading: !state.connected, ...(manual ? { error: null } : {}) });
        return perform(refreshSession, false, {
            background: true,
            onError: error => { failure = error; },
            onSuccess: () => {
                retryAttempt = 0;
                publish({ error: null });
            }
        }).finally(() => {
            refreshPending = false;
            // A user switch can happen while the previous request is settling.
            // Refresh the new session immediately rather than waiting for a timer.
            if (!active) return;
            if (requestedGeneration !== generation && !session) void refreshInBackground();
            else if (session && failure) scheduleRetry(failure);
            else if (folderEditsPending) scheduleFolderRefresh();
        });
    }

    function refreshInBackground() {
        if (retryTimer !== undefined) return queue;
        return runRefresh(false);
    }

    function refresh() {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        return runRefresh(true);
    }

    function scheduleFolderRefresh() {
        if (!active || retryTimer !== undefined) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => { debounce = undefined; void refreshInBackground(); }, 1_000);
    }

    function scheduleFavoriteRefresh() {
        if (!active || retryTimer !== undefined) return;
        clearTimeout(debounce);
        const expectedGeneration = generation;
        const userId = dependencies.currentUserId();
        debounce = setTimeout(() => {
            debounce = undefined;
            void dependencies.favorites().then(favorites => {
                if (!active || generation !== expectedGeneration || dependencies.currentUserId() !== userId) return;
                if (folderEditsPending || collectionSignature(favorites) !== favoriteSignature) void refreshInBackground();
            }, () => { /* A partial native snapshot must not trigger an empty upload. */ });
        }, 1_000);
    }

    function withTeam(operation: (current: Session, id: string, sharing: Sharing | null) => Promise<void>) {
        const id = state.team?.id;
        const { sharing } = state;
        return perform(current => {
            if (!id || id !== state.team?.id) throw new Error("La team sélectionnée a changé. Réessaie depuis la bonne team.");
            return operation(current, id, sharing);
        });
    }

    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        start() {
            if (active) return;
            active = true;
            unsubscribeImportSettings = dependencies.imports?.subscribe(() => {
                session?.importAbort.abort();
                if (session) session.importAbort = new AbortController();
                clearTimeout(importTimer);
                importTimer = undefined;
                importBlocked = false;
                publish({ importing: false, importError: null });
                if (dependencies.imports?.enabled()) {
                    for (const scan of importScans.values()) { scan.offset = 0; scan.total = null; scan.finishedAt = null; scan.warning = null; }
                    void refreshInBackground();
                }
            });
            dependencies.folders?.start();
            unsubscribeFolders = dependencies.folders?.subscribeEdits(() => {
                folderEditsPending = true;
                scheduleFolderRefresh();
            });
            let observedUserId = dependencies.currentUserId();
            unsubscribeFavorites = dependencies.subscribeFavorites(() => {
                scheduleFavoriteRefresh();
            });
            unsubscribeUser = dependencies.subscribeUser(() => {
                const userId = dependencies.currentUserId();
                if (userId === observedUserId) return;
                observedUserId = userId;
                reset();
                void refreshInBackground();
            });
            interval = setInterval(() => void refreshInBackground(), 60_000);
            void refreshInBackground();
        },
        stop() {
            active = false;
            unsubscribeFavorites?.();
            unsubscribeUser?.();
            unsubscribeFolders?.();
            unsubscribeImportSettings?.();
            dependencies.folders?.stop();
            clearInterval(interval);
            reset();
        },
        refresh,
        initializeConnection: () => perform(refreshSession, true),
        selectTeam: (id: string) => perform(current => detail(current, id, true)),
        loadPage: (member?: string, offset = 0) => withTeam((current, id) => page(current, id, member, offset)),
        setSharing: (mode: SharingMode, selectedUrls: string[] = [], expectedRevision?: number) => withTeam(async (current, id, editing) => {
            const route = `/${encodeURIComponent(id)}/sharing`;
            const latest = await request<Sharing>(current, route);
            if (!editing || latest.revision !== (expectedRevision ?? editing.revision)) {
                shares.delete(id);
                publish({ sharing: latest });
                throw new TeamsError(409, "sharing_conflict", "Le partage a changé sur un autre appareil. Vérifie la nouvelle sélection avant de réessayer.");
            }
            const favorites = mode === "off" ? [] : await readFavorites(current);
            const selection = new Set(selectedUrls);
            const automatic = mode === "auto" && dependencies.imports ? await dependencies.imports.store.filterAutomatic(current.userId, favorites, current.abort.signal) : favorites;
            assertCurrent(current);
            const gifs = mode === "auto" ? automatic : mode === "manual" ? favorites.filter(gif => selection.has(gif.url)) : [];
            const saved = await request<Sharing>(current, route, "PUT", { mode, gifs, displayName: current.displayName, revision: latest.revision });
            await clearBinding(current, id);
            shares.set(id, saved);
            publish({ sharing: saved });
            await list(current);
            await detail(current, id);
        }),
        setSharingFolder: (folderId: string, expectedRevision?: number) => withTeam(async (current, id, editing) => {
            const data = await folderData(current);
            if (!data) throw new Error("Les dossiers locaux ne sont pas disponibles.");
            const previousBinding = data.snapshot.bindings.find(binding => binding.scope === data.scope && binding.teamId === id);
            const route = `/${encodeURIComponent(id)}/sharing`;
            const latest = await request<Sharing>(current, route);
            if (!editing || latest.revision !== (expectedRevision ?? editing.revision)) {
                shares.delete(id);
                publish({ sharing: latest });
                throw new TeamsError(409, "sharing_conflict", "Le partage a changé sur un autre appareil. Vérifie-le avant de choisir ce dossier.");
            }
            const favorites = await readFavorites(current);
            const folder = (await folderData(current))?.snapshot.folders.find(item => item.id === folderId);
            if (!folder) throw new Error("Ce dossier n’existe plus.");
            const selected = new Set(folder.urls);
            const saved = await request<Sharing>(current, route, "PUT", {
                mode: "manual", gifs: favorites.filter(gif => selected.has(gif.url)), displayName: current.displayName, revision: latest.revision
            }, () => assertBindingUnchanged(current, id, previousBinding));
            const stillExists = (await folderData(current))?.snapshot.folders.some(item => item.id === folderId);
            await saveBinding(current, {
                teamId: id, teamName: state.team!.name, folderId, scope: data.scope, revision: saved.revision,
                paused: stillExists ? null : "Ce dossier a été supprimé pendant l’envoi. Le suivi est en pause."
            }, previousBinding?.revision, previousBinding?.folderId ?? folderId);
            shares.set(id, saved);
            publish({ sharing: saved });
            await list(current);
            await detail(current, id);
        }),
        createTeam: (name: string) => perform(async current => {
            const team = await request<TeamDetail>(current, "", "POST", { name, displayName: current.displayName });
            await list(current);
            await detail(current, team.id, true);
        }),
        joinTeam: (code: string) => perform(async current => {
            const team = await request<TeamDetail>(current, "/join", "POST", { code: code.trim(), displayName: current.displayName });
            await list(current);
            await detail(current, team.id, true);
        }),
        createInvite: () => withTeam(async (current, id) => {
            const invite = await request<Invite>(current, `/${encodeURIComponent(id)}/invites`, "POST");
            publish({ invite });
        }),
        revokeInvite: () => withTeam(async (current, id) => {
            await request(current, `/${encodeURIComponent(id)}/invites`, "DELETE");
            publish({ invite: null });
        }),
        removeMember: (id: string) => withTeam(async (current, teamId) => {
            await request(current, `/${encodeURIComponent(teamId)}/members/${encodeURIComponent(id)}`, "DELETE");
            await list(current);
            await detail(current, teamId);
        }),
        leaveTeam: () => withTeam(async (current, id) => {
            await request(current, `/${encodeURIComponent(id)}/membership`, "DELETE");
            await clearBinding(current, id);
            publish({ team: null, sharing: null, folderBinding: null, page: null, invite: null });
            await list(current);
        }),
        deleteTeam: () => withTeam(async (current, id) => {
            await request(current, `/${encodeURIComponent(id)}`, "DELETE");
            await clearBinding(current, id);
            publish({ team: null, sharing: null, folderBinding: null, page: null, invite: null });
            await list(current);
        }),
        deleteAccount: () => perform(async current => {
            await request(current, "/account", "DELETE");
            await clearBinding(current);
            shares.clear();
            publish({ team: null, sharing: null, folderBinding: null, page: null, invite: null });
            await list(current);
        })
    };
}

export const gifTeams = createGifTeamsController({
    async identity(create) {
        const user = getCurrentUser();
        if (!user) return null;
        const key = create ? await createCloudIdentity() : await getCloudKey();
        if (!key || getCurrentUser()?.id !== user.id) return null;
        return { userId: user.id, displayName: user.displayName, authorization: await deriveTeamsAuthorization(key, user.id) };
    },
    currentUserId: () => getCurrentUser()?.id ?? null,
    favorites: loadFavorites,
    subscribeFavorites,
    subscribeUser,
    folders: gifFolders,
    imports: { store: gifImports, add: importSharedFavorites, enabled: () => settings.store.autoAddSharedFavorites, subscribe: subscribeImportSettings },
    requestDelayMs: 550,
    api: createTeamsApi
});
