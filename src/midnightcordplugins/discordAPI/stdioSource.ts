/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Standalone CommonJS: no npm dependencies, tokens or Discord implementation embedded.
export const STDIO_SOURCE = String.raw`#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const { StringDecoder } = require("node:string_decoder");
const { once } = require("node:events");
const MAX_LINE = 32768;
const MAX_RESPONSE = 2 * 1024 * 1024;
const MAX_QUEUE = 32;
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = id => typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
let protocol = VERSIONS[0];
let pending = "";
let ended = false;
let stopping = false;
let working = false;
let active;
const queue = [];
const decoder = new StringDecoder("utf8");

function fatal(message) {
    if (stopping) return;
    stopping = true;
    queue.length = 0;
    pending = "";
    if (active) active.abort();
    process.stderr.write("[Midnightcord MCP] " + message + "\n");
    process.exitCode = 1;
    process.stdin.destroy();
}

function credentials() {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--config" || !args[1]) throw new Error("config");
    const fd = fs.openSync(args[1], "r");
    let config;
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size < 1 || stat.size > 16384) throw new Error("config");
        const buffer = Buffer.alloc(16385);
        const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (size > 16384) throw new Error("config");
        config = JSON.parse(buffer.subarray(0, size).toString("utf8"));
    } finally {
        fs.closeSync(fd);
    }
    if (!object(config) || typeof config.url !== "string" || !/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/mcp$/.test(config.url)) throw new Error("config");
    const port = Number(config.url.match(/:([0-9]+)\/mcp$/)[1]);
    if (port > 65535 || typeof config.token !== "string" || !/^[a-zA-Z0-9_-]{32,256}$/.test(config.token)) throw new Error("config");
    return { url: config.url, token: config.token };
}

function rpcError(id, code, message) {
    return { jsonrpc: "2.0", id: validId(id) ? id : null, error: { code, message } };
}

async function output(message) {
    if (stopping) return;
    if (!process.stdout.write(JSON.stringify(message) + "\n")) await once(process.stdout, "drain");
}

async function readResponse(response) {
    if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("response");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > MAX_RESPONSE) throw new Error("response");
            chunks.push(Buffer.from(part.value));
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}

async function forward(line) {
    let message;
    try { message = JSON.parse(line); }
    catch {
        await output(rpcError(null, -32700, "Invalid JSON"));
        return;
    }
    const hasId = object(message) && Object.hasOwn(message, "id");
    const isResponse = object(message) && !Object.hasOwn(message, "method") && hasId
        && Object.hasOwn(message, "result") !== Object.hasOwn(message, "error");
    if (!object(message) || message.jsonrpc !== "2.0" || (hasId && !validId(message.id))
        || (!isResponse && (typeof message.method !== "string" || !message.method.length))
        || (message.params !== undefined && !object(message.params))) {
        await output(rpcError(message && message.id, -32600, "Invalid JSON-RPC message"));
        return;
    }
    const request = hasId && !isResponse;
    let config;
    try { config = credentials(); }
    catch {
        if (request) await output(rpcError(message.id, -32001, "Midnightcord connection configuration is unavailable. Open Discord and enable DiscordAPI, then copy the MCP configuration again."));
        else process.stderr.write("[Midnightcord MCP] Connection configuration is unavailable.\n");
        return;
    }
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer " + config.token, "MCP-Protocol-Version": protocol },
            body: JSON.stringify(message),
            signal: controller.signal,
            redirect: "error"
        });
        if (!request && response.status === 202) return;
        if (!response.ok || response.status === 202) {
            if (response.body) await response.body.cancel();
            throw new Error("http");
        }
        const body = await readResponse(response);
        if (!request || !object(body) || body.jsonrpc !== "2.0" || body.id !== message.id
            || Object.hasOwn(body, "result") === Object.hasOwn(body, "error")) throw new Error("response");
        if (Object.hasOwn(body, "error") && (!object(body.error) || !Number.isInteger(body.error.code) || typeof body.error.message !== "string")) throw new Error("response");
        if (message.method === "initialize" && object(body.result)) {
            if (!VERSIONS.includes(body.result.protocolVersion)) throw new Error("protocol");
            protocol = body.result.protocolVersion;
        }
        await output(body);
    } catch {
        controller.abort();
        if (request) await output(rpcError(message.id, -32000, "Midnightcord is unavailable or rejected the request. Keep Discord open, enable DiscordAPI and check its permissions. Requests are never retried automatically."));
        else if (!stopping) process.stderr.write("[Midnightcord MCP] Notification could not be delivered.\n");
    } finally {
        clearTimeout(timeout);
        if (active === controller) active = undefined;
    }
}

async function drain() {
    if (working || stopping) return;
    working = true;
    try {
        while (queue.length && !stopping) await forward(queue.shift());
    } catch {
        fatal("The stdio connection closed unexpectedly.");
    } finally {
        working = false;
        if (ended && !queue.length) process.stdin.destroy();
    }
}

function receive(chunk) {
    if (stopping) return;
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (Buffer.byteLength(line, "utf8") > MAX_LINE) return fatal("Input message exceeds 32 KiB.");
        if (!line.trim()) continue;
        if (queue.length >= MAX_QUEUE) return fatal("Too many queued MCP messages.");
        queue.push(line);
    }
    if (Buffer.byteLength(pending, "utf8") > MAX_LINE) return fatal("Input message exceeds 32 KiB.");
    void drain();
}

if (typeof fetch !== "function") {
    fatal("Node.js 18 or newer is required.");
} else {
    try { credentials(); }
    catch { fatal("Use --config with the connection.json file generated by Midnightcord DiscordAPI."); }
    if (!stopping) {
        process.stdin.on("data", chunk => receive(decoder.write(chunk)));
        process.stdin.on("end", () => {
            receive(decoder.end());
            ended = true;
            if (pending.trim()) receive("\n");
            void drain();
        });
        process.stdin.on("error", () => fatal("Cannot read stdin."));
        process.stdout.on("error", () => fatal("Cannot write stdout."));
        process.on("SIGINT", () => fatal("Connection stopped."));
        process.on("SIGTERM", () => fatal("Connection stopped."));
    }
}
`;
