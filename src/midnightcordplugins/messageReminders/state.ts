/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MAX_REMINDERS = 200;
export const MAX_DELAY = 366 * 24 * 60 * 60 * 1000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const snowflake = /^\d{5,22}$/;

export interface ReminderSource {
    channelId: string;
    messageId: string;
    guildId: string | null;
    preview: string;
    author: string;
}

export interface Reminder extends ReminderSource {
    id: string;
    dueAt: number;
    createdAt: number;
    notifiedAt: number | null;
}

interface ReminderStorage {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<unknown>;
}

export function storageKey(accountId: string) {
    if (!snowflake.test(accountId)) throw new Error("Compte Discord invalide.");
    return `MessageReminders:v1:${accountId}`;
}

function timestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_TIMESTAMP;
}

function validSource(value: ReminderSource) {
    return typeof value.channelId === "string" && snowflake.test(value.channelId)
        && typeof value.messageId === "string" && snowflake.test(value.messageId)
        && (value.guildId === null || typeof value.guildId === "string" && snowflake.test(value.guildId))
        && typeof value.preview === "string" && typeof value.author === "string";
}

export function readReminders(value: unknown): Reminder[] {
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
        || !("reminders" in value) || !Array.isArray(value.reminders)) return [];
    const ids = new Set<string>();
    const messages = new Set<string>();
    const result: Reminder[] = [];
    for (const raw of value.reminders.slice(0, MAX_REMINDERS * 2)) {
        if (!raw || typeof raw !== "object") continue;
        const record = raw as Reminder;
        if (!validSource(record) || typeof record.id !== "string" || !/^[\w-]{1,80}$/.test(record.id)
            || !timestamp(record.dueAt) || !timestamp(record.createdAt)
            || !(record.notifiedAt === null || timestamp(record.notifiedAt))) continue;
        const messageKey = `${record.channelId}:${record.messageId}`;
        if (ids.has(record.id) || messages.has(messageKey)) continue;
        ids.add(record.id);
        messages.add(messageKey);
        result.push({
            id: record.id, channelId: record.channelId, messageId: record.messageId,
            guildId: record.guildId, preview: record.preview.slice(0, 300), author: record.author.slice(0, 80),
            createdAt: record.createdAt, dueAt: record.dueAt, notifiedAt: record.notifiedAt
        });
        if (result.length === MAX_REMINDERS) break;
    }
    return result.sort((a, b) => a.dueAt - b.dueAt);
}

export function tomorrowMorning(now: number) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.getTime();
}

export function localDateTime(timestamp: number) {
    const date = new Date(timestamp);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class ReminderService {
    private generation = 0;
    private account: string | null = null;
    private records: Reminder[] = [];
    private loaded = false;
    private loadFailure: string | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private listeners = new Set<() => void>();

    constructor(
        private storage: ReminderStorage,
        private currentAccount: () => string | null,
        private notify: (reminders: readonly Reminder[], account: string) => void,
        private now: () => number = Date.now,
        private makeId: () => string = () => crypto.randomUUID()
    ) { }

    get accountId() { return this.account; }
    get ready() { return this.loaded; }
    get loadError() { return this.loadFailure; }
    get snapshot(): readonly Reminder[] { return this.records; }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private publish() {
        this.listeners.forEach(listener => listener());
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.queue.then(operation);
        this.queue = result.catch(() => {});
        return result;
    }

    private current(generation: number, account: string | null) {
        return !!account && this.generation === generation && this.account === account && this.currentAccount() === account;
    }

    stop() {
        this.generation++;
        this.account = null;
        this.loaded = false;
        this.loadFailure = null;
        this.records = [];
        this.publish();
    }

    activate(account: string | null): Promise<void> {
        this.stop();
        if (!account) return Promise.resolve();
        const key = storageKey(account);
        const { generation } = this;
        this.account = account;
        return this.enqueue(async () => {
            if (!this.current(generation, account)) return;
            try {
                const stored = await this.storage.get(key);
                if (!this.current(generation, account)) return;
                if (stored !== undefined && stored !== null && (typeof stored !== "object" || !("version" in stored) || stored.version !== 1))
                    throw new Error("Format de rappels non reconnu. Les données existantes ont été conservées.");
                this.records = readReminders(stored);
                this.loaded = true;
                this.publish();
            } catch (error) {
                if (this.current(generation, account)) {
                    this.loadFailure = "Impossible de charger les rappels. Réessayez avant de créer un rappel.";
                    this.publish();
                }
                throw error;
            }
        });
    }

    private change(update: (records: readonly Reminder[]) => Reminder[], after?: (records: readonly Reminder[], account: string) => void): Promise<void> {
        const { generation } = this;
        const { account } = this;
        return this.enqueue(async () => {
            if (!this.current(generation, account) || !this.loaded) throw new Error("Rappels indisponibles pour ce compte.");
            const previous = this.records;
            const records = update(this.records).sort((a, b) => a.dueAt - b.dueAt);
            await this.storage.set(storageKey(account!), { version: 1, reminders: records });
            if (!this.current(generation, account)) {
                if (after) await this.storage.set(storageKey(account!), { version: 1, reminders: previous });
                return;
            }
            this.records = records;
            try {
                this.publish();
                if (this.current(generation, account)) after?.(records, account!);
            } catch (error) {
                if (after) {
                    if (this.current(generation, account)) {
                        this.records = previous;
                        this.publish();
                    }
                    await this.storage.set(storageKey(account!), { version: 1, reminders: previous });
                }
                throw error;
            }
        });
    }

    private validateDue(dueAt: number) {
        if (!timestamp(dueAt) || dueAt <= this.now() || dueAt > this.now() + MAX_DELAY)
            throw new Error("Choisissez une date future dans les 366 prochains jours.");
    }

    add(source: ReminderSource, dueAt: number): Promise<void> {
        return this.change(records => {
            this.validateDue(dueAt);
            if (!validSource(source)) throw new Error("Message Discord invalide.");
            const existing = records.find(record => record.channelId === source.channelId && record.messageId === source.messageId);
            if (!existing && records.length >= MAX_REMINDERS) throw new Error("Limite de 200 rappels atteinte. Supprimez un rappel pour continuer.");
            const reminder: Reminder = {
                channelId: source.channelId, messageId: source.messageId, guildId: source.guildId,
                preview: source.preview.slice(0, 300), author: source.author.slice(0, 80),
                id: existing?.id ?? this.makeId(), createdAt: existing?.createdAt ?? this.now(), dueAt, notifiedAt: null
            };
            return [...records.filter(record => record.id !== reminder.id), reminder];
        });
    }

    dismiss(id: string) {
        return this.change(records => records.filter(record => record.id !== id));
    }

    snooze(id: string, dueAt: number) {
        return this.change(records => {
            this.validateDue(dueAt);
            return records.map(record => record.id === id ? { ...record, dueAt, notifiedAt: null } : record);
        });
    }

    tick(): Promise<void> {
        if (!this.loaded || !this.records.some(record => record.notifiedAt === null && record.dueAt <= this.now())) return Promise.resolve();
        let due: Reminder[] = [];
        return this.change(records => {
            const now = this.now();
            due = records.filter(record => record.notifiedAt === null && record.dueAt <= now);
            return records.map(record => due.includes(record) ? { ...record, notifiedAt: now } : record);
        }, (_, account) => {
            if (due.length) this.notify(due, account);
        });
    }
}
