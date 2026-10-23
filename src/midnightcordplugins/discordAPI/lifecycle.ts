/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BridgePolicy, BridgeReply, BridgeRequest } from "./types";

interface Transport {
    startServer(config: { port: number; accountId: string; allowWrites: boolean; }): Promise<unknown>;
    stopServer(): Promise<unknown>;
    nextRequest(): Promise<BridgeRequest | null>;
    isRequestActive(id: string): Promise<boolean>;
    sendResponse(id: string, status: number, body: unknown): Promise<unknown>;
}

/** Invalidate renderer work synchronously, then serialize native transitions. */
export class BridgeLifecycle {
    enabled = false;
    paused = false;
    running = false;
    error = "";
    policy: BridgePolicy | undefined;
    private account = "";
    private generation = 0;
    private transition: Promise<void> = Promise.resolve();

    constructor(private deps: {
        native: () => Transport | undefined;
        account: () => string;
        config: () => { port: number; policy: BridgePolicy; };
        execute: (request: BridgeRequest, policy: BridgePolicy, assertActive: () => Promise<void>) => Promise<BridgeReply>;
    }) { }

    start() {
        this.enabled = true;
        this.paused = false;
        this.account = this.deps.account();
        return this.refresh();
    }

    stop() { this.enabled = false; return this.refresh(); }
    pause() { this.paused = true; return this.refresh(); }
    resume() { this.paused = false; this.account = this.deps.account(); return this.refresh(); }

    observeAccount() {
        const current = this.deps.account();
        if (this.account && current !== this.account) {
            // Changing Discord accounts must not transfer the previous account's grants.
            this.paused = true;
            this.account = current;
            return this.refresh();
        }
        if (!this.account && current && !this.paused) {
            this.account = current;
            return this.refresh();
        }
        return this.transition;
    }

    refresh() {
        const epoch = ++this.generation;
        this.running = false;
        this.policy = undefined;
        this.error = "";
        this.transition = this.transition.catch(() => { }).then(async () => {
            const api = this.deps.native();
            if (!api) return;
            // Never start a superseded configuration, even if several settings changed together.
            if (epoch !== this.generation) return;
            try {
                await api.stopServer();
                if (epoch !== this.generation || !this.enabled || this.paused || !this.account) return;
                const { port, policy } = this.deps.config();
                if (policy.accountId !== this.account || this.deps.account() !== this.account) return;
                await api.startServer({ port, accountId: this.account, allowWrites: policy.allowWrites });
                if (epoch !== this.generation || this.deps.account() !== this.account) {
                    await api.stopServer();
                    return;
                }
                this.policy = policy;
                this.running = true;
                void this.pump(api, epoch, policy);
            } catch {
                if (epoch === this.generation) {
                    this.running = false;
                    this.policy = undefined;
                    this.error = "Le pont local n'a pas pu démarrer. Vérifiez le port et redémarrez Discord après une mise à jour.";
                    await api.stopServer().catch(() => { });
                }
            }
        });
        return this.transition;
    }

    private valid(epoch: number, policy: BridgePolicy) {
        return epoch === this.generation && this.enabled && !this.paused && this.running
            && this.deps.account() === policy.accountId;
    }

    private async pump(api: Transport, epoch: number, policy: BridgePolicy) {
        try {
            while (this.valid(epoch, policy)) {
                const request = await api.nextRequest();
                if (!this.valid(epoch, policy)) return;
                if (!request) continue;
                const assertActive = async () => {
                    if (!this.valid(epoch, policy) || Date.now() >= request.expiresAt) throw new Error("bridge-request-expired");
                    const pending = await api.isRequestActive(request.id);
                    if (!pending || !this.valid(epoch, policy) || Date.now() >= request.expiresAt) throw new Error("bridge-request-cancelled");
                };
                let timedOut = false;
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    await Promise.race([
                        (async () => {
                            await assertActive();
                            const reply = await this.deps.execute(request, policy, assertActive);
                            await assertActive();
                            await api.sendResponse(request.id, reply.status, reply.body);
                        })(),
                        new Promise<never>((_resolve, reject) => {
                            timer = setTimeout(() => { timedOut = true; reject(new Error("bridge-renderer-timeout")); }, Math.max(0, request.expiresAt - Date.now()));
                        })
                    ]);
                } catch {
                    if (timedOut && this.valid(epoch, policy)) {
                        // Discord REST has no reliable abort hook. Pause instead of accumulating stuck calls.
                        await this.pause();
                        this.error = "Discord n'a pas répondu à temps. Le pont a été mis en pause ; vérifiez la connexion avant de le redémarrer.";
                    } else if (this.valid(epoch, policy)) await api.sendResponse(request.id, 503, { error: "request_cancelled" }).catch(() => { });
                } finally { clearTimeout(timer); }
            }
        } catch {
            if (epoch === this.generation) {
                await this.pause();
                this.error = "Le pont a été arrêté après une interruption. Vous pouvez le redémarrer ici.";
            }
        }
    }
}
