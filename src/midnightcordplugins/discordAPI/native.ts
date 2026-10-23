/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import { app, type IpcMainInvokeEvent, type WebContents } from "electron";

import { DiscordApiServer } from "./server";
import { STDIO_SOURCE } from "./stdioSource";

const runtime = new DiscordApiServer();
const directory = join(DATA_DIR, "discord-api");
const configPath = join(directory, "connection.json");
const adapterPath = join(directory, "midnightcord-mcp.cjs");
let ownerId: number | undefined;
let accountId = "";
let apiKey = "";
let generation = 0;
let preparing = false;
let fileWrites: Promise<void> = Promise.resolve();
const observed = new WeakSet<WebContents>();

function stop() {
    generation++;
    runtime.stop();
    ownerId = undefined;
    accountId = "";
    apiKey = "";
    preparing = false;
}

app.once("before-quit", stop);
process.once("exit", stop);

function guard(event: IpcMainInvokeEvent, requireOwner = true) {
    const frame = event.senderFrame;
    let origin = "";
    try { origin = new URL(frame?.url ?? "about:blank").origin; } catch { /* Invalid frame URLs never gain access. */ }
    if (!frame || frame !== event.sender.mainFrame || !["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"].includes(origin)) throw new Error("discord-api-unauthorized-origin");
    if (ownerId !== undefined && ownerId !== event.sender.id) throw new Error("discord-api-owned-by-another-window");
    if (requireOwner && ownerId === undefined) throw new Error("discord-api-not-running");
    if (!observed.has(event.sender)) {
        observed.add(event.sender);
        const { id } = event.sender;
        const release = () => { if (ownerId === id) stop(); };
        event.sender.once("destroyed", release);
        event.sender.on("render-process-gone", release);
        event.sender.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) release(); });
    }
    return event.sender.id;
}

async function prepareDirectory() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("discord-api-unsafe-directory");
    await chmod(directory, 0o700);
}

function privateWrite(target: string, data: string, epoch: number) {
    const operation = fileWrites.then(async () => {
        if (epoch !== generation) throw new Error("discord-api-operation-cancelled");
        try { if ((await lstat(target)).isSymbolicLink()) throw new Error("discord-api-unsafe-file"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
        try {
            await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
            if (epoch !== generation) throw new Error("discord-api-operation-cancelled");
            await rename(temporary, target);
            await chmod(target, 0o600);
        } finally { await unlink(temporary).catch(() => { }); }
    });
    fileWrites = operation.catch(() => { });
    return operation;
}

function connection() {
    const status = runtime.status();
    if (!status.running || !apiKey) throw new Error("discord-api-not-running");
    const apiUrl = `http://127.0.0.1:${status.port}`;
    return {
        apiUrl,
        mcpUrl: `${apiUrl}/mcp`,
        apiKey,
        configPath,
        mcpConfig: { mcpServers: { midnightcord: { command: "node", args: [adapterPath, "--config", configPath] } } }
    };
}

export async function startServer(event: IpcMainInvokeEvent, config: { port: number; accountId: string; allowWrites: boolean; }) {
    const id = guard(event, false);
    if (!config || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || !/^\d{17,20}$/.test(config.accountId) || typeof config.allowWrites !== "boolean") throw new Error("discord-api-invalid-config");
    stop();
    ownerId = id;
    accountId = config.accountId;
    preparing = true;
    const epoch = generation;
    const key = randomBytes(32).toString("hex");
    try {
        await prepareDirectory();
        if (epoch !== generation) throw new Error("discord-api-start-cancelled");
        await privateWrite(adapterPath, STDIO_SOURCE, epoch);
        if (epoch !== generation) throw new Error("discord-api-start-cancelled");
        await runtime.start(config.port, key, config.allowWrites);
        if (epoch !== generation) throw new Error("discord-api-start-cancelled");
        // The stable credentials path allows MCP clients to reread a rotated key.
        await privateWrite(configPath, JSON.stringify({ url: `http://127.0.0.1:${config.port}/mcp`, token: key }, null, 2), epoch);
        if (epoch !== generation) throw new Error("discord-api-start-cancelled");
        apiKey = key;
        preparing = false;
        return { success: true, ...runtime.status(), accountId };
    } catch (error) {
        if (epoch === generation) stop();
        throw error;
    }
}

export function nextRequest(event: IpcMainInvokeEvent) { guard(event); return runtime.nextRequest(); }
export function isRequestActive(event: IpcMainInvokeEvent, id: string) { guard(event); return typeof id === "string" && runtime.isRequestActive(id); }
export function sendResponse(event: IpcMainInvokeEvent, id: string, status: number, data: unknown) { guard(event); if (typeof id !== "string") return false; return runtime.sendResponse(id, status, data); }
export function pushEvent(event: IpcMainInvokeEvent, type: string, data: unknown) { guard(event); if (typeof type === "string") runtime.pushEvent(type, data); }
export function getStatus(event: IpcMainInvokeEvent) { guard(event, false); return { ...runtime.status(), accountId, preparing }; }
export function getConnection(event: IpcMainInvokeEvent) { guard(event); return connection(); }

export async function rotateKey(event: IpcMainInvokeEvent) {
    guard(event);
    if (!runtime.status().running || preparing) throw new Error("discord-api-not-running");
    const epoch = ++generation;
    const key = randomBytes(32).toString("hex");
    apiKey = key;
    runtime.rotateKey(key);
    try {
        await privateWrite(configPath, JSON.stringify({ url: connection().mcpUrl, token: key }, null, 2), epoch);
        if (epoch !== generation) throw new Error("discord-api-key-rotation-cancelled");
        return connection();
    } catch (error) { if (epoch === generation) stop(); throw error; }
}

export function stopServer(event: IpcMainInvokeEvent) { guard(event, false); stop(); }
