/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

import { handleMcp } from "./mcp";
import type { BridgeRequest } from "./types";

type BridgeResponse = { status: number; body: unknown; };
type RequestInput = { method: string; path: string; body?: Record<string, unknown>; query?: Record<string, string>; };
type Pending = { request: BridgeRequest; finish: (response: BridgeResponse) => void; timer: ReturnType<typeof setTimeout>; delivered: boolean; };
type Waiter = { finish: (request: BridgeRequest | null) => void; timer: ReturnType<typeof setTimeout>; };
const BODY_LIMIT = 32 * 1024;
const RESPONSE_LIMIT = 2 * 1024 * 1024;
const METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

/** No listeners or filesystem effects occur until the user starts the bridge. */
export class DiscordApiServer {
    private server?: Server;
    private sockets = new Set<Socket>();
    private events = new Map<ServerResponse, ReturnType<typeof setInterval>>();
    private pending = new Map<string, Pending>();
    private queue: string[] = [];
    private waiter?: Waiter;
    private epoch = 0;
    private token = "";
    private port = 0;
    private writes = false;
    private requests: number[] = [];
    private listening = false;
    private cancelStart?: () => void;

    constructor(private options: { requestTimeoutMs?: number; pollTimeoutMs?: number; maxPending?: number; rateLimit?: number; heartbeatMs?: number; } = {}) { }

    async start(port: number, token: string, allowWrites: boolean): Promise<number> {
        this.stop();
        if (!Number.isInteger(port) || port < 0 || port > 65535 || !/^[a-f\d]{64}$/.test(token)) throw new Error("invalid-bridge-config");
        this.token = token;
        this.writes = allowWrites === true;
        const { epoch } = this;
        const server = createServer((request, response) => { void this.handle(request, response).catch(() => this.json(response, 500, { error: "bridge-internal-error" })); });
        this.server = server;
        server.maxConnections = 64;
        server.maxHeadersCount = 40;
        server.headersTimeout = 10_000;
        server.requestTimeout = 10_000;
        server.keepAliveTimeout = 5_000;
        server.on("connection", socket => {
            this.sockets.add(socket);
            socket.once("close", () => this.sockets.delete(socket));
        });
        server.on("clientError", (_error, socket) => socket.destroy());
        return new Promise<number>((resolve, reject) => {
            const cancel = () => reject(new Error("bridge-start-cancelled"));
            this.cancelStart = cancel;
            server.once("error", () => {
                if (this.cancelStart === cancel) this.cancelStart = undefined;
                if (this.server === server) this.stop();
                reject(new Error("bridge-listen-failed"));
            });
            server.listen(port, "127.0.0.1", () => {
                if (this.cancelStart === cancel) this.cancelStart = undefined;
                if (epoch !== this.epoch || this.server !== server) {
                    server.close();
                    reject(new Error("bridge-start-cancelled"));
                    return;
                }
                const address = server.address();
                if (!address || typeof address === "string") { this.stop(); reject(new Error("bridge-listen-failed")); return; }
                this.port = address.port;
                this.listening = true;
                resolve(this.port);
            });
        });
    }

    status() {
        return { running: this.listening, port: this.port, allowWrites: this.writes, pendingRequests: this.queue.length, activeResponses: this.pending.size, sseClients: this.events.size };
    }

    stop() {
        this.epoch++;
        this.cancelStart?.();
        this.cancelStart = undefined;
        this.listening = false;
        const { server } = this;
        this.server = undefined;
        this.cancelRequests(503, "bridge-stopped");
        this.closeEvents();
        server?.close();
        for (const socket of this.sockets) socket.destroy();
        this.sockets.clear();
        this.token = "";
        this.requests = [];
        this.port = 0;
    }

    rotateKey(token: string) {
        if (!this.listening || !/^[a-f\d]{64}$/.test(token)) throw new Error("bridge-not-running");
        this.epoch++;
        this.token = token;
        this.cancelRequests(401, "bridge-key-rotated");
        this.closeEvents();
        this.requests = [];
    }

    private cancelRequests(status: number, error: string) {
        for (const id of Array.from(this.pending.keys())) this.complete(id, { status, body: { error } });
        this.queue = [];
        this.endWait(null);
    }

    private closeEvents() {
        for (const [client, heartbeat] of this.events) { clearInterval(heartbeat); client.end(); }
        this.events.clear();
    }

    nextRequest(): Promise<BridgeRequest | null> {
        if (!this.listening) return Promise.resolve(null);
        if (this.waiter) return Promise.reject(new Error("bridge-poll-already-pending"));
        const request = this.takeRequest();
        if (request) return Promise.resolve(request);
        return new Promise(resolve => {
            const timer = setTimeout(() => this.endWait(null), this.options.pollTimeoutMs ?? 20_000);
            timer.unref?.();
            this.waiter = { finish: resolve, timer };
        });
    }

    private takeRequest(): BridgeRequest | null {
        while (this.queue.length) {
            const id = this.queue.shift()!;
            if (!this.isRequestActive(id)) continue;
            const pending = this.pending.get(id)!;
            pending.delivered = true;
            return pending.request;
        }
        return null;
    }

    private endWait(value: BridgeRequest | null) {
        const { waiter } = this;
        this.waiter = undefined;
        if (waiter) { clearTimeout(waiter.timer); waiter.finish(value); }
    }

    isRequestActive(id: string) {
        const pending = this.pending.get(id);
        if (!pending || !this.listening) return false;
        if (pending.request.expiresAt <= Date.now()) { this.complete(id, { status: 504, body: { error: "bridge-request-expired" } }); return false; }
        return true;
    }

    sendResponse(id: string, status: number, body: unknown) {
        if (!this.isRequestActive(id)) return false;
        if (!this.pending.get(id)?.delivered) return false;
        if (!Number.isInteger(status) || status < 200 || status > 599) status = 500;
        let encoded: string;
        try { encoded = JSON.stringify(body) ?? "null"; } catch { encoded = ""; }
        if (!encoded || Buffer.byteLength(encoded) > RESPONSE_LIMIT) return this.complete(id, { status: 502, body: { error: "bridge-response-too-large" } });
        return this.complete(id, { status, body });
    }

    private complete(id: string, response: BridgeResponse) {
        const pending = this.pending.get(id);
        if (!pending) return false;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        this.queue = this.queue.filter(queued => queued !== id);
        pending.finish(response);
        return true;
    }

    private execute(input: RequestInput, response: ServerResponse, epoch: number): Promise<BridgeResponse> {
        if (!this.listening || epoch !== this.epoch || response.destroyed) return Promise.resolve({ status: 503, body: { error: "bridge-request-cancelled" } });
        if (!METHODS.has(input.method) || !/^\/api\/[a-zA-Z0-9_\-/]+$/.test(input.path)) return Promise.resolve({ status: 400, body: { error: "invalid-api-route" } });
        if (input.method !== "GET" && !this.writes) return Promise.resolve({ status: 403, body: { error: "bridge-writes-disabled" } });
        if (this.pending.size >= (this.options.maxPending ?? 32)) return Promise.resolve({ status: 429, body: { error: "bridge-queue-full" } });
        const request: BridgeRequest = { id: randomUUID(), method: input.method, path: input.path, body: input.body ?? {}, query: input.query ?? {}, expiresAt: Date.now() + (this.options.requestTimeoutMs ?? 20_000) };
        return new Promise(resolve => {
            const closed = () => this.complete(request.id, { status: 499, body: { error: "bridge-client-disconnected" } });
            const timer = setTimeout(() => this.complete(request.id, { status: 504, body: { error: "bridge-request-expired" } }), this.options.requestTimeoutMs ?? 20_000);
            timer.unref?.();
            this.pending.set(request.id, { request, delivered: false, timer, finish: result => { response.off("close", closed); resolve(result); } });
            response.once("close", closed);
            this.queue.push(request.id);
            if (this.waiter) this.endWait(this.takeRequest());
        });
    }

    pushEvent(type: string, data: unknown) {
        if (!this.listening || !/^[A-Z][A-Z0-9_]{0,63}$/.test(type)) return;
        let serialized: string;
        try { serialized = JSON.stringify(data); } catch { return; }
        if (typeof serialized !== "string" || Buffer.byteLength(serialized) > 32 * 1024) return;
        const payload = `event: ${type}\ndata: ${serialized}\n\n`;
        for (const client of this.events.keys()) this.writeEvent(client, payload);
    }

    private writeEvent(client: ServerResponse, payload: string) {
        if (client.destroyed || client.writableLength > 64 * 1024 || !client.write(payload)) {
            clearInterval(this.events.get(client));
            this.events.delete(client);
            client.destroy();
        }
    }

    private json(response: ServerResponse, status: number, body: unknown) {
        if (response.destroyed || response.writableEnded) return;
        let encoded: string;
        try { encoded = JSON.stringify(body) ?? "null"; } catch { encoded = ""; }
        if (!encoded || Buffer.byteLength(encoded) > RESPONSE_LIMIT) { status = 502; encoded = '{"error":"bridge-response-too-large"}'; }
        response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        response.end(encoded);
    }

    private async handle(request: IncomingMessage, response: ServerResponse) {
        const { epoch } = this;
        if (!this.listening || request.socket.remoteAddress !== "127.0.0.1" || request.headers.host !== `127.0.0.1:${this.port}`) { this.json(response, 403, { error: "invalid-bridge-host" }); return; }
        if (request.headers.origin !== undefined || (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "none")) { this.json(response, 403, { error: "browser-access-denied" }); return; }
        const auth = request.headers.authorization;
        const expected = Buffer.from(`Bearer ${this.token}`);
        const supplied = Buffer.from(typeof auth === "string" ? auth : "");
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { this.json(response, 401, { error: "unauthorized" }); return; }
        const now = Date.now();
        this.requests = this.requests.filter(time => time > now - 60_000);
        if (this.requests.length >= (this.options.rateLimit ?? 60)) { response.setHeader("Retry-After", "60"); this.json(response, 429, { error: "bridge-rate-limited" }); return; }
        this.requests.push(now);
        if (!request.url?.startsWith("/") || request.url.startsWith("//") || request.url.length > 4096) { this.json(response, 400, { error: "invalid-request-target" }); return; }
        let url: URL;
        try { url = new URL(request.url, `http://127.0.0.1:${this.port}`); } catch { this.json(response, 400, { error: "invalid-request-target" }); return; }
        const method = request.method ?? "";
        if (url.pathname === "/api/events" && method === "GET") {
            if (this.events.size >= 4) { this.json(response, 429, { error: "too-many-event-clients" }); return; }
            response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Content-Type-Options": "nosniff" });
            const heartbeat = setInterval(() => this.writeEvent(response, ": heartbeat\n\n"), this.options.heartbeatMs ?? 15_000);
            heartbeat.unref?.();
            this.events.set(response, heartbeat);
            response.once("close", () => { clearInterval(heartbeat); this.events.delete(response); });
            this.writeEvent(response, "event: connected\ndata: {}\n\n");
            return;
        }
        if (url.pathname === "/mcp" && method !== "POST") { response.setHeader("Allow", "POST"); this.json(response, 405, { error: "method-not-allowed" }); return; }
        if (url.pathname === "/mcp" && request.headers["mcp-protocol-version"] !== undefined && !["2025-11-25", "2025-06-18", "2025-03-26"].includes(String(request.headers["mcp-protocol-version"]))) { this.json(response, 400, { error: "unsupported-mcp-protocol-version" }); return; }
        if (url.pathname !== "/mcp" && !/^\/api\/[a-zA-Z0-9_\-/]+$/.test(url.pathname)) { this.json(response, 404, { error: "route-not-found" }); return; }
        if (!METHODS.has(method)) { this.json(response, 405, { error: "method-not-allowed" }); return; }
        if (url.pathname !== "/mcp" && method !== "GET" && !this.writes) { this.json(response, 403, { error: "bridge-writes-disabled" }); return; }
        let body: unknown;
        try { body = await this.readBody(request); }
        catch (error) {
            const reason = error instanceof Error ? error.message : "invalid-json";
            this.json(response, reason === "body-too-large" ? 413 : 400, url.pathname === "/mcp" && reason === "invalid-json"
                ? { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } } : { error: reason });
            return;
        }
        if (!this.listening || epoch !== this.epoch || response.destroyed) return;
        if (url.pathname === "/mcp") {
            const result = await handleMcp(body, input => this.execute(input, response, epoch), this.writes);
            if (result === null) { if (!response.destroyed) { response.writeHead(202, { "Cache-Control": "no-store" }); response.end(); } }
            else this.json(response, 200, result);
            return;
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) { this.json(response, 400, { error: "json-object-required" }); return; }
        const query = Object.create(null) as Record<string, string>;
        for (const [key, value] of url.searchParams) { if (key.length > 80 || value.length > 2048) { this.json(response, 400, { error: "invalid-query" }); return; } query[key] = value; }
        const result = await this.execute({ method, path: url.pathname, body: body as Record<string, unknown>, query }, response, epoch);
        this.json(response, result.status, result.body);
    }

    private readBody(request: IncomingMessage): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let size = 0;
            let settled = false;
            const finish = (error?: string) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                request.off("data", onData);
                request.off("end", onEnd);
                request.off("aborted", onAbort);
                if (error) { request.resume(); reject(new Error(error)); return; }
                try { resolve(size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(new Error("invalid-json")); }
            };
            const onData = (chunk: Buffer) => { size += chunk.length; if (size > BODY_LIMIT) finish("body-too-large"); else chunks.push(chunk); };
            const onEnd = () => finish();
            const onAbort = () => finish("request-aborted");
            const timer = setTimeout(() => finish("request-body-timeout"), 5_000);
            timer.unref?.();
            request.on("data", onData);
            request.once("end", onEnd);
            request.once("aborted", onAbort);
            request.once("error", onAbort);
            if (Number(request.headers["content-length"] ?? 0) > BODY_LIMIT) finish("body-too-large");
        });
    }
}
