/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "node:path";
import { Worker } from "node:worker_threads";

import { inspectBytes } from "../imageOptimizer/helpers";

export type Language = "eng" | "fra" | "fra+eng";
export type OcrResult = { ok: true; text: string; confidence: number; elapsed: number; truncated: boolean; } | { ok: false; error: string; };
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 12_000_000;

/** One physical worker: cancellation also interrupts model loading and native WASM. */
export class OcrRuntime {
    private worker?: Worker;
    private language?: Language;
    private pending?: { jobId: string; resolve(value: any): void; reject(reason: Error): void; };
    private active?: { id: string; owner: number; cancelled?: string; abort(reason: Error): void; };
    private idle?: ReturnType<typeof setTimeout>;
    private terminating: Promise<unknown> = Promise.resolve();
    private sequence = 0;

    constructor(private assets: () => Promise<string>, private idleMs = 60_000, private timeoutMs = 90_000) { }

    get hasResources() { return !!this.active || !!this.worker; }

    cancel(owner: number, id?: string) {
        if (this.active && (this.active.owner !== owner || (id && this.active.id !== id))) return false;
        if (this.active) {
            this.active.cancelled = "cancelled";
            this.active.abort(new Error("cancelled"));
        }
        this.destroy("cancelled");
        return true;
    }

    private destroy(reason: string) {
        clearTimeout(this.idle);
        this.idle = undefined;
        this.pending?.reject(new Error(reason));
        this.pending = undefined;
        const { worker } = this;
        this.worker = undefined;
        this.language = undefined;
        if (worker) this.terminating = worker.terminate().catch(() => { });
    }

    private command(action: string, payload: unknown): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker || this.pending) return reject(new Error("engine-failed"));
            const jobId = String(++this.sequence);
            this.pending = { jobId, resolve, reject };
            this.worker.postMessage({ workerId: "local-ocr", jobId, action, payload });
        });
    }

    async recognize(owner: number, id: string, image: Uint8Array, language: Language): Promise<OcrResult> {
        if (this.active) return { ok: false, error: "busy" };
        if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || !["eng", "fra", "fra+eng"].includes(language)) return { ok: false, error: "invalid-request" };
        try {
            if (!(image instanceof Uint8Array) || !image.byteLength || image.byteLength > MAX_BYTES) throw new Error();
            const info = inspectBytes(image);
            if (info.mime !== "image/png" || info.width * info.height > MAX_PIXELS) throw new Error();
        } catch { return { ok: false, error: "invalid-image" }; }
        let abort!: (reason: Error) => void;
        const cancelled = new Promise<never>((_resolve, reject) => { abort = reject; });
        const operation = { id, owner, cancelled: undefined as string | undefined, abort };
        this.active = operation;
        clearTimeout(this.idle);
        const started = performance.now();
        const timeout = setTimeout(() => {
            operation.cancelled = "timeout";
            operation.abort(new Error("timeout"));
            this.destroy("timeout");
        }, this.timeoutMs);
        timeout.unref?.();
        try {
            const directory = await Promise.race([this.assets(), cancelled]);
            if (operation.cancelled) throw new Error(operation.cancelled);
            if (this.language && this.language !== language) this.destroy("language-changed");
            await Promise.race([this.terminating, cancelled]);
            if (operation.cancelled) throw new Error(operation.cancelled);
            if (!this.worker) {
                const worker = new Worker(join(directory, "worker.cjs"), { stdout: true, stderr: true });
                // Never forward engine diagnostics, which may contain recognized input.
                worker.stdout?.resume();
                worker.stderr?.resume();
                this.worker = worker;
                worker.on("error", () => { if (this.worker === worker) this.destroy("engine-failed"); });
                worker.on("exit", () => { if (this.worker === worker) this.destroy("engine-failed"); });
                worker.on("message", message => {
                    const { pending } = this;
                    if (this.worker !== worker || !pending || message?.jobId !== pending.jobId) return;
                    if (message.status === "resolve") { this.pending = undefined; pending.resolve(message.data); }
                    else if (message.status === "reject") { this.pending = undefined; pending.reject(new Error("engine-failed")); }
                });
                // Protocol of the pinned Tesseract.js 7 worker, exercised by the native smoke test.
                await this.command("load", { options: { lstmOnly: true, logging: false } });
                await this.command("loadLanguage", { langs: language, options: { langPath: join(directory, "models"), gzip: true, cacheMethod: "none", lstmOnly: true } });
                await this.command("initialize", { langs: language, oem: 1, config: {} });
                this.language = language;
            }
            const data = await this.command("recognize", { image, options: {}, output: { text: true } });
            if (operation.cancelled) throw new Error(operation.cancelled);
            const text = typeof data?.text === "string" ? data.text : "";
            return { ok: true, text: text.slice(0, 100_000), confidence: Number.isFinite(data?.confidence) ? Math.max(0, Math.min(100, data.confidence)) : 0, elapsed: Math.round(performance.now() - started), truncated: text.length > 100_000 };
        } catch {
            this.destroy("engine-failed");
            return { ok: false, error: operation.cancelled || "engine-failed" };
        } finally {
            clearTimeout(timeout);
            if (this.active === operation) this.active = undefined;
            if (this.worker) {
                this.idle = setTimeout(() => this.destroy("idle"), this.idleMs);
                this.idle.unref?.();
            }
        }
    }
}
