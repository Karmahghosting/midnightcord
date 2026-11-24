/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createCloudIdentity, getCloudKey } from "@api/SettingsSync/cloudSetup";

import { getCurrentUser, loadFavorites, subscribeFavorites, subscribeUser } from "./favorites";
import { createTeamsApi, deriveTeamsAuthorization, TeamsError } from "./service";
import type { GifInput, GifPage, Invite, Sharing, SharingMode, TeamDetail, TeamsResponse, TeamsSnapshot } from "./types";

interface Identity { userId: string; displayName: string; authorization: string; }
interface Dependencies {
    identity(create: boolean): Promise<Identity | null>;
    currentUserId(): string | null;
    favorites(): Promise<GifInput[]>;
    subscribeFavorites(callback: () => void): () => void;
    subscribeUser(callback: () => void): () => void;
    api: typeof createTeamsApi;
}
interface Session extends Identity {
    abort: AbortController;
    request: ReturnType<typeof createTeamsApi>;
}
interface OperationOptions {
    background?: boolean;
    onError?: (error: unknown) => void;
    onSuccess?: () => void;
}

const initial = (): TeamsSnapshot => ({
    connected: false, loading: false, busy: false, error: null,
    teams: [], viewerId: null, team: null, page: null, sharing: null,
    favorites: [], favoritesReady: false, filterMember: undefined, invite: null
});

function collectionSignature(gifs: GifInput[]) {
    return JSON.stringify(gifs.map(gif => [gif.url, gif.src, gif.width, gif.height, gif.format ?? 1, gif.title ?? ""])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function createGifTeamsController(dependencies: Dependencies) {
    let state = initial();
    const listeners = new Set<() => void>();
    const shares = new Map<string, Sharing>();
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

    function publish(change: Partial<TeamsSnapshot>) {
        state = { ...state, ...change };
        for (const listener of listeners) listener();
    }

    function reset() {
        generation++;
        session?.abort.abort();
        session = null;
        shares.clear();
        clearTimeout(debounce);
        clearTimeout(retryTimer);
        retryTimer = undefined;
        retryAttempt = 0;
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
            session = { ...identity, abort, request: dependencies.api(identity.authorization, abort.signal) };
        } else {
            session.displayName = identity.displayName;
        }
        publish({ connected: true });
        return session;
    }

    async function request<T>(current: Session, path = "", method = "GET", body?: unknown) {
        assertCurrent(current);
        async function verifyIdentity() {
            const identity = await dependencies.identity(false);
            assertCurrent(current);
            if (identity?.authorization !== current.authorization || identity?.userId !== current.userId) {
                reset();
                void refreshInBackground();
                throw new DOMException("Identité remplacée", "AbortError");
            }
        }
        if (method !== "GET" && method !== "HEAD") await verifyIdentity();
        const data = await current.request<T>(path, method, body);
        assertCurrent(current);
        await verifyIdentity();
        return data;
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
                        ? { team: null, page: null, sharing: null, invite: null } : {};
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
        if (state.team && !ids.has(state.team.id)) publish({ team: null, sharing: null, page: null, invite: null });
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
        publish({ team, sharing, ...(clearInvite ? { invite: null, page: null, filterMember: undefined } : {}) });
        const member = state.filterMember && team.members.some(item => item.id === state.filterMember) ? state.filterMember : undefined;
        await page(current, id, member, clearInvite ? 0 : state.page?.offset ?? 0);
    }

    async function refreshSession(current: Session) {
        const teams = await list(current);
        const favorites = await readFavorites(current);
        const byUrl = new Map(favorites.map(gif => [gif.url, gif]));
        let changed = false;
        for (const team of teams) {
            if (team.mode === "off") { shares.delete(team.id); continue; }
            let sharing = shares.get(team.id);
            const route = `/${encodeURIComponent(team.id)}/sharing`;
            if (!sharing || sharing.revision !== team.sharingRevision) {
                sharing = await request<Sharing>(current, route);
                shares.set(team.id, sharing);
            }
            const desired = sharing.mode === "auto" ? favorites
                : sharing.mode === "manual" ? sharing.gifs.flatMap(gif => byUrl.has(gif.url) ? [byUrl.get(gif.url)!] : []) : [];
            if (collectionSignature(sharing.gifs) === collectionSignature(desired)) continue;
            try {
                const saved = await request<Sharing>(current, route, "PUT", {
                    mode: sharing.mode, gifs: desired, revision: sharing.revision, displayName: current.displayName
                });
                shares.set(team.id, saved);
                changed = true;
            } catch (error) {
                shares.delete(team.id);
                throw error;
            }
        }
        if (changed) await list(current);
        if (state.team) await detail(current, state.team.id);
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
            let observedUserId = dependencies.currentUserId();
            unsubscribeFavorites = dependencies.subscribeFavorites(() => {
                if (!active || retryTimer !== undefined) return;
                clearTimeout(debounce);
                debounce = setTimeout(() => { debounce = undefined; void refreshInBackground(); }, 1_000);
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
            const gifs = mode === "auto" ? favorites : mode === "manual" ? favorites.filter(gif => selection.has(gif.url)) : [];
            const saved = await request<Sharing>(current, route, "PUT", { mode, gifs, displayName: current.displayName, revision: latest.revision });
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
            publish({ team: null, sharing: null, page: null, invite: null });
            await list(current);
        }),
        deleteTeam: () => withTeam(async (current, id) => {
            await request(current, `/${encodeURIComponent(id)}`, "DELETE");
            publish({ team: null, sharing: null, page: null, invite: null });
            await list(current);
        }),
        deleteAccount: () => perform(async current => {
            await request(current, "/account", "DELETE");
            shares.clear();
            publish({ team: null, sharing: null, page: null, invite: null });
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
    api: createTeamsApi
});
