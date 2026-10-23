/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type TypingLanguage = "auto" | "fr" | "en";
export interface TypingDraft { identity: string; text: string; }
export interface TypingSuggestion { draft: TypingDraft; text: string; }
export interface TypingPorts {
    current(): TypingDraft | undefined;
    complete(id: string, text: string): Promise<string>;
    cancel(id: string): void;
    changed(suggestion: TypingSuggestion | undefined): void;
    failed(): void;
    delay(): number;
}

export function sameDraft(left?: TypingDraft, right?: TypingDraft) {
    return !!left && !!right && left.identity === right.identity && left.text === right.text;
}

export function canComplete(text: string) {
    return text.trim().length >= 6 && text.length <= 4000
        && !/^\s*\//.test(text) && !text.includes("```")
        && !/(?:^|\s)[@#:][^\s]*$/u.test(text)
        && !/(?:https?:\/\/|www\.)\S*$/iu.test(text);
}

export function cleanSuggestion(value: string, prefix: string) {
    if (typeof value !== "string") return "";
    // Only plain, short continuation text can enter the composer.
    let text = value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160);
    if (text.startsWith(prefix)) text = text.slice(prefix.length);
    if (!text.trim() || /<\||\|>|```|@everyone|@here|<[@#][!&]?\d|https?:\/\//i.test(text)) return "";
    if (!/[\s'’-]$/.test(prefix) && !/^\s|^[,.;:!?…'’)]/u.test(text)) text = " " + text;
    if (/\s$/.test(prefix)) text = text.trimStart();
    return text;
}

/** No persistent draft storage: only the current input and one cancellable request. */
export class TypingController {
    private draft?: TypingDraft;
    private suggestion?: TypingSuggestion;
    private timer?: ReturnType<typeof setTimeout>;
    private request?: string;
    private revision = 0;
    private sequence = 0;
    private readonly session = Math.random().toString(36).slice(2);

    constructor(private readonly ports: TypingPorts) { }

    observe() {
        const next = this.ports.current();
        if (sameDraft(this.draft, next)) return;
        this.dismiss();
        this.draft = next;
        if (!next || !canComplete(next.text)) return;
        const { revision } = this;
        this.timer = setTimeout(() => { void this.predict(next, revision); }, Math.max(250, Math.min(1500, this.ports.delay())));
    }

    private async predict(draft: TypingDraft, revision: number) {
        this.timer = undefined;
        if (revision !== this.revision || !sameDraft(draft, this.ports.current())) return;
        const id = `${this.session}-${++this.sequence}`;
        this.request = id;
        try {
            const raw = await this.ports.complete(id, draft.text.slice(-1024));
            if (revision !== this.revision || !sameDraft(draft, this.ports.current())) return;
            const text = cleanSuggestion(raw, draft.text.slice(-1024));
            this.suggestion = text ? { draft, text } : undefined;
            this.ports.changed(this.suggestion);
        } catch {
            if (revision === this.revision && sameDraft(draft, this.ports.current())) this.ports.failed();
        } finally {
            if (this.request === id) this.request = undefined;
        }
    }

    take(wordOnly: boolean) {
        if (!this.suggestion || !sameDraft(this.suggestion.draft, this.ports.current())) {
            this.dismiss();
            return "";
        }
        const text = wordOnly ? this.suggestion.text.match(/^\s*\S+\s*/u)?.[0] ?? "" : this.suggestion.text;
        this.dismiss();
        return text;
    }

    dismiss() {
        this.revision++;
        clearTimeout(this.timer);
        this.timer = undefined;
        if (this.request) this.ports.cancel(this.request);
        this.request = undefined;
        this.suggestion = undefined;
        this.ports.changed(undefined);
    }

    reset() { this.dismiss(); this.draft = undefined; }
}
