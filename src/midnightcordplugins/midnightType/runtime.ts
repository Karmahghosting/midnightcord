/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { TypeAssets } from "./assets";
import { cleanCompletion, completionPrompt, Language } from "./model";

export interface TypeStatus {
    state: "missing" | "downloading" | "ready" | "error";
    progress: number;
    downloadBytes: number;
    supported: boolean;
    message?: string;
}

interface Job { owner: number; id: string; controller: AbortController; }

/** A successful kill() only sends a signal; files remain in use until the exit event. */
export function terminateRuntimeProcess(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(force); clearTimeout(deadline);
            child.removeListener("exit", exited);
            child.removeListener("error", failed);
            if (error) reject(error); else resolve();
        };
        const exited = () => finish();
        const failed = () => { if (!child.pid) finish(); };
        const force = setTimeout(() => { try { child.kill("SIGKILL"); } catch { finish(new Error("runtime-stop-failed")); } }, 3000);
        const deadline = setTimeout(() => finish(new Error("runtime-stop-failed")), 5000);
        force.unref(); deadline.unref();
        child.once("exit", exited); child.once("error", failed);
        try {
            if (!child.kill() && !child.pid) finish();
        } catch { finish(new Error("runtime-stop-failed")); }
    });
}

async function freePort() {
    const socket = createServer();
    return new Promise<number>((resolve, reject) => {
        socket.once("error", reject);
        socket.listen(0, "127.0.0.1", () => {
            const address = socket.address();
            const port = address && typeof address !== "string" ? address.port : 0;
            socket.close(error => error ? reject(error) : resolve(port));
        });
    });
}

export function validRequest(id: unknown, prefix: unknown, language: unknown): prefix is string {
    return typeof id === "string" && /^[\w-]{1,80}$/.test(id) && typeof prefix === "string"
        && prefix.length >= 2 && prefix.length <= 2048 && ["auto", "fr", "en"].includes(language as string);
}

export class TypeRuntime {
    readonly assets: TypeAssets;
    private child?: ChildProcess;
    private startup?: Promise<void>;
    private stoppingProcess?: Promise<void>;
    private removal?: Promise<TypeStatus>;
    private stopping = 0;
    private endpoint?: string;
    private apiKey?: string;
    private idle?: ReturnType<typeof setTimeout>;
    private job?: Job;
    private setupJob?: { owner: number; controller: AbortController; promise: Promise<void>; };
    private progress = 0;
    private failure?: string;

    constructor(root: string) { this.assets = new TypeAssets(root); }

    async status(): Promise<TypeStatus> {
        const supported = !!this.assets.artifact;
        return {
            state: this.setupJob ? "downloading" : !supported || this.failure ? "error" : await this.assets.valid() ? "ready" : "missing",
            progress: this.progress, downloadBytes: this.assets.downloadBytes, supported,
            message: !supported ? "unsupported-platform" : this.failure
        };
    }

    async setup(owner: number) {
        // A new explicit install waits for removal to finish; it cannot populate a directory being deleted.
        if (this.removal) await this.removal;
        if (!this.setupJob) {
            this.failure = undefined;
            this.progress = 0;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
            timeout.unref();
            const promise = this.assets.prepare(controller.signal, ratio => { this.progress = ratio; })
                .catch(error => {
                    if (!controller.signal.aborted) this.failure = error instanceof Error ? error.message : "setup-failed";
                })
                .finally(() => { clearTimeout(timeout); this.setupJob = undefined; });
            this.setupJob = { owner, controller, promise };
        }
        await this.setupJob.promise;
        return this.status();
    }

    private async start() {
        if (this.endpoint && this.child && this.child.exitCode === null) return;
        if (this.startup) return this.startup;
        const generation = this.stopping;
        const operation = async () => {
            await this.stoppingProcess;
            if (!await this.assets.valid(true)) throw new Error("model-missing");
            const port = await freePort();
            if (generation !== this.stopping) throw new Error("cancelled");
            const apiKey = randomBytes(32).toString("hex");
            const endpoint = `http://127.0.0.1:${port}`;
            const child = spawn(this.assets.executable, [
                "--model", this.assets.model, "--host", "127.0.0.1", "--port", String(port),
                "--api-key", apiKey, "--ctx-size", "2048", "--parallel", "1",
                "--threads", String(Math.max(1, Math.min(4, availableParallelism() - 1))),
                "--batch-size", "256", "--ubatch-size", "64", "--n-gpu-layers", "0",
                "--no-webui", "--log-disable"
            ], { cwd: dirname(this.assets.executable), windowsHide: true, stdio: "ignore", shell: false });
            this.child = child;
            let failed = false;
            child.once("error", () => { failed = true; });
            child.once("exit", () => {
                if (this.child === child) { this.child = undefined; this.endpoint = undefined; this.apiKey = undefined; }
            });
            const deadline = Date.now() + 60_000;
            while (Date.now() < deadline) {
                if (generation !== this.stopping) { child.kill(); throw new Error("cancelled"); }
                if (failed || child.exitCode !== null) throw new Error("runtime-start-failed");
                try {
                    const response = await fetch(`${endpoint}/health`, {
                        headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal: AbortSignal.timeout(1000)
                    });
                    if (response.ok) { this.endpoint = endpoint; this.apiKey = apiKey; return; }
                } catch { /* The process needs a short time to load the model. */ }
                await delay(250);
            }
            child.kill();
            throw new Error("runtime-start-timeout");
        };
        this.startup = operation().finally(() => { this.startup = undefined; });
        return this.startup;
    }

    async complete(owner: number, id: string, prefix: string, language: Language): Promise<string> {
        if (!validRequest(id, prefix, language) || this.setupJob || this.removal) return "";
        // Fatal startup failures need the user's explicit Retry; do not rehash 491 MB on every keystroke pause.
        if (this.failure && /^(model-missing|runtime-start-failed|runtime-start-timeout|runtime-stop-failed)$/.test(this.failure)) return "";
        // A single bounded inference slot; another Discord window cannot cancel its owner's job.
        if (this.job && this.job.owner !== owner) return "";
        this.cancel(owner);
        clearTimeout(this.idle);
        const job = { owner, id, controller: new AbortController() };
        this.job = job;
        try {
            await this.start();
            if (job.controller.signal.aborted || this.job !== job || !this.endpoint) return "";
            const response = await fetch(`${this.endpoint}/completion`, {
                method: "POST", redirect: "error", signal: AbortSignal.any([job.controller.signal, AbortSignal.timeout(8000)]),
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
                body: JSON.stringify({
                    prompt: completionPrompt(prefix, language), n_predict: 32, stream: false,
                    temperature: 0.2, top_k: 20, top_p: 0.8, repeat_penalty: 1.1,
                    stop: ["\n", "<|im_end|>", "<|im_start|>"], cache_prompt: false
                })
            });
            if (!response.ok || job.controller.signal.aborted || this.job !== job) return "";
            const result = await response.text();
            if (result.length > 32768 || job.controller.signal.aborted || this.job !== job) return "";
            this.failure = undefined;
            return cleanCompletion(JSON.parse(result).content, prefix);
        } catch (error) {
            if (!job.controller.signal.aborted) this.failure = error instanceof Error && /^(model-missing|runtime-start-failed|runtime-start-timeout|runtime-stop-failed)$/.test(error.message)
                ? error.message : "completion-failed";
            return "";
        } finally {
            if (this.job === job) {
                this.job = undefined;
                this.idle = setTimeout(() => this.stop(), 60_000);
                this.idle.unref();
            }
        }
    }

    cancel(owner: number, id?: string) {
        if (this.job?.owner === owner && (!id || this.job.id === id)) this.job.controller.abort();
    }

    release(owner: number) {
        if (this.setupJob?.owner === owner) this.setupJob.controller.abort();
        this.cancel(owner);
        if (!this.job || this.job.owner === owner) this.stop();
    }

    stop() {
        this.stopping++;
        clearTimeout(this.idle);
        this.job?.controller.abort();
        this.job = undefined;
        if (this.child) {
            const { child } = this;
            this.stoppingProcess = terminateRuntimeProcess(child);
            void this.stoppingProcess.catch(() => {
                this.failure = "runtime-stop-failed";
                if (child.exitCode === null && child.signalCode === null && !this.child) this.child = child;
            });
        }
        this.child = undefined;
        this.endpoint = undefined;
        this.apiKey = undefined;
    }

    shutdown() {
        this.setupJob?.controller.abort();
        this.stop();
    }

    async remove() {
        if (this.removal) return this.removal;
        const operation = async () => {
            this.shutdown();
            await this.setupJob?.promise;
            await this.startup?.catch(() => { });
            await this.stoppingProcess;
            await this.assets.remove();
            this.failure = undefined;
            this.progress = 0;
            return this.status();
        };
        this.removal = operation().finally(() => { this.removal = undefined; });
        return this.removal;
    }
}
