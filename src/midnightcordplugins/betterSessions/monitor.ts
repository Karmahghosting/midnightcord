/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Session } from "./types";

export interface SavedSession {
    name: string;
    isNew: boolean;
}

interface StoredSessions {
    version: 1;
    initialized: boolean;
    sessions: Map<string, SavedSession>;
}

interface MonitorDependencies {
    currentAccount?(): string | null;
    read(key: string): Promise<unknown>;
    write(key: string, value: StoredSessions): Promise<void>;
    fetch(): Promise<unknown>;
    notify(accountId: string, count: number): void;
}

interface Snapshot {
    accountId: string | null;
    ready: boolean;
    loading: boolean;
    sessions: Session[];
    saved: Map<string, SavedSession>;
    error: string | null;
}

const MAX_SESSIONS = 500;
export const sessionKey = (accountId: string) => `BetterSessions_savedSessions_${accountId}`;

export function readStoredSessions(value: unknown): StoredSessions {
    const data = value as Partial<StoredSessions> | undefined;
    const source = value instanceof Map ? value : data?.version === 1 ? data.sessions : null;
    const sessions = new Map<string, SavedSession>();
    if (source instanceof Map) {
        for (const [id, entry] of source) {
            if (typeof id !== "string" || !id || id.length > 256 || !entry || typeof entry.name !== "string") continue;
            sessions.set(id, { name: entry.name.slice(0, 80), isNew: entry.isNew === true });
            if (sessions.size >= MAX_SESSIONS) break;
        }
    }
    return { version: 1, initialized: value instanceof Map ? value.size > 0 : data?.initialized === true && data.version === 1, sessions };
}

export function parseSessions(value: unknown): Session[] {
    if (!Array.isArray(value) || value.length > MAX_SESSIONS) throw new Error("Invalid session response");
    const unique = new Map<string, Session>();
    for (const entry of value) {
        if (!entry || typeof entry.id_hash !== "string" || !entry.id_hash || entry.id_hash.length > 256) throw new Error("Invalid session entry");
        const info = entry.client_info;
        if (!info || typeof info.os !== "string" || typeof info.platform !== "string") throw new Error("Invalid session client info");
        unique.set(entry.id_hash, {
            id_hash: entry.id_hash,
            approx_last_used_time: new Date(entry.approx_last_used_time),
            client_info: { os: info.os.slice(0, 100), platform: info.platform.slice(0, 100), location: typeof info.location === "string" ? info.location.slice(0, 200) : "" }
        });
        if (unique.size >= MAX_SESSIONS) break;
    }
    if (value.length && !unique.size) throw new Error("Invalid session response");
    return [...unique.values()];
}

export function checkIntervalMs(minutes: number) {
    return Math.min(1440, Math.max(5, Number.isFinite(minutes) ? minutes : 20)) * 60_000;
}

export class SessionMonitor {
    private generation = 0;
    private initialized = false;
    private fetching: number | null = null;
    private writes: Promise<void> = Promise.resolve();
    private listeners = new Set<() => void>();
    private snapshot: Snapshot = { accountId: null, ready: false, loading: false, sessions: [], saved: new Map(), error: null };

    constructor(private deps: MonitorDependencies) { }

    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private update(patch: Partial<Snapshot>) {
        this.snapshot = { ...this.snapshot, ...patch };
        this.listeners.forEach(listener => listener());
    }

    private current(generation: number, accountId: string | null) {
        return this.generation === generation && this.snapshot.accountId === accountId
            && (!this.deps.currentAccount || this.deps.currentAccount() === accountId);
    }

    async activate(accountId: string | null) {
        const generation = ++this.generation;
        this.fetching = null;
        this.initialized = false;
        this.update({ accountId, ready: false, loading: !!accountId, sessions: [], saved: new Map(), error: null });
        if (!accountId) return;
        try {
            await this.writes;
            if (!this.current(generation, accountId)) return;
            const stored = readStoredSessions(await this.deps.read(sessionKey(accountId)));
            if (!this.current(generation, accountId)) return;
            this.initialized = stored.initialized;
            this.update({ ready: true, saved: stored.sessions });
            await this.refresh();
        } catch {
            if (this.current(generation, accountId)) this.update({ loading: false, error: "Impossible de charger les noms des appareils. Réessayez." });
        }
    }

    stop() {
        this.generation++;
        this.fetching = null;
        this.update({ accountId: null, ready: false, loading: false, sessions: [], saved: new Map(), error: null });
    }

    private persist() {
        const { accountId, saved } = this.snapshot;
        if (!accountId) return Promise.resolve();
        const value: StoredSessions = { version: 1, initialized: this.initialized, sessions: new Map([...saved].map(([id, entry]) => [id, { ...entry }])) };
        const write = this.writes.then(() => this.deps.write(sessionKey(accountId), value));
        this.writes = write.catch(() => { });
        return write;
    }

    async refresh() {
        const { accountId, ready } = this.snapshot;
        if (!accountId || !ready || !this.current(this.generation, accountId) || this.fetching === this.generation) return;
        const { generation } = this;
        this.fetching = generation;
        this.update({ loading: true, error: null });
        try {
            const sessions = parseSessions(await this.deps.fetch());
            if (!this.current(generation, accountId)) return;
            const saved = new Map<string, SavedSession>();
            let newCount = 0;
            for (const session of sessions) {
                const previous = this.snapshot.saved.get(session.id_hash);
                if (!previous && this.initialized) newCount++;
                saved.set(session.id_hash, previous ?? { name: "", isNew: this.initialized });
            }
            this.initialized = true;
            this.update({ sessions, saved });
            if (newCount) this.deps.notify(accountId, newCount);
            await this.persist();
        } catch {
            if (this.current(generation, accountId)) this.update({ error: "Impossible de vérifier ou de sauvegarder les sessions. Réessayez." });
        } finally {
            if (this.current(generation, accountId)) {
                this.fetching = null;
                this.update({ loading: false });
            }
        }
    }

    async rename(accountId: string, id: string, name: string): Promise<boolean> {
        if (!this.current(this.generation, accountId) || !this.snapshot.ready || !this.snapshot.saved.has(id)) return false;
        const { generation } = this;
        const saved = new Map(this.snapshot.saved);
        saved.set(id, { name: name.trim().slice(0, 80), isNew: false });
        this.update({ saved, error: null });
        try {
            await this.persist();
            return this.current(generation, accountId);
        } catch {
            if (this.current(generation, accountId)) this.update({ error: "Le nom n'a pas pu être enregistré. Réessayez." });
            return false;
        }
    }

    async markSeen(accountId: string) {
        if (!this.current(this.generation, accountId) || !this.snapshot.ready) return;
        const { generation } = this;
        const saved = new Map([...this.snapshot.saved].map(([id, entry]) => [id, { ...entry, isNew: false }]));
        this.update({ saved });
        try {
            await this.persist();
        } catch {
            if (this.current(generation, accountId)) this.update({ error: "Impossible d'enregistrer les sessions consultées." });
        }
    }
}
