/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Language, OcrResult } from "./runtime";

interface Runtime {
    readonly hasResources: boolean;
    recognize(owner: number, id: string, image: Uint8Array, language: Language): Promise<OcrResult>;
    cancel(owner: number, id?: string): boolean;
}

interface Lease {
    owner: number;
    session: string;
}

export class OcrSessionManager {
    private lease?: Lease;
    private pending?: { lease: Lease; promise: Promise<OcrResult>; };

    constructor(private runtime: Runtime) { }

    async recognize(owner: number, session: string, id: string, image: Uint8Array, language: Language): Promise<OcrResult> {
        if (!Number.isSafeInteger(owner) || owner < 1 || typeof session !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(session)) return { ok: false, error: "invalid-request" };
        if (this.lease && this.lease.owner !== owner) {
            if (this.pending || this.runtime.hasResources) return { ok: false, error: "busy" };
            this.lease = undefined;
        }
        let { lease } = this;
        if (lease?.owner === owner && lease.session === session) {
            if (this.pending) return { ok: false, error: "busy" };
        } else {
            if (lease?.owner === owner) this.runtime.cancel(owner);
            lease = { owner, session };
            this.lease = lease;
            if (this.pending) await this.pending.promise.catch(() => { });
            if (this.lease !== lease) return { ok: false, error: "cancelled" };
        }
        let operation: { lease: Lease; promise: Promise<OcrResult>; } | undefined;
        try {
            operation = { lease, promise: this.runtime.recognize(owner, id, image, language) };
            this.pending = operation;
            const result = await operation.promise;
            return this.lease === lease ? result : { ok: false, error: "cancelled" };
        } catch {
            if (this.lease === lease) this.runtime.cancel(owner);
            return { ok: false, error: "engine-failed" };
        } finally {
            if (operation && this.pending === operation) this.pending = undefined;
            if (this.lease === lease && !this.runtime.hasResources) this.lease = undefined;
        }
    }

    cancel(owner: number, session: string, id?: string) {
        if (this.lease?.owner !== owner || this.lease.session !== session) return false;
        return this.runtime.cancel(owner, id);
    }

    release(owner: number, session: string) {
        if (this.lease?.owner !== owner || this.lease.session !== session) return false;
        this.runtime.cancel(owner);
        this.lease = undefined;
        return true;
    }

    releaseOwner(owner: number) {
        if (this.lease?.owner !== owner) return false;
        return this.release(owner, this.lease.session);
    }
}
