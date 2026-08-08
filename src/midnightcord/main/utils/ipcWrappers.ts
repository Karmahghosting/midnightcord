/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ipcMain, IpcMainEvent, IpcMainInvokeEvent, WebFrameMain } from "electron";
import { DISCORD_HOSTNAMES } from "main/constants";
import { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";

export function validateSender(frame: WebFrameMain | null, event: string) {
    if (!frame) throw new Error(`ipc[${event}]: No sender frame`);
    if (!frame.url) return;

    try {
        var { hostname, protocol } = new URL(frame.url);
    } catch (e) {
        throw new Error(`ipc[${event}]: Invalid URL ${frame.url}`);
    }

    if (protocol === "file:" || protocol === "vesktop:" || protocol === "Midnightcord:") return;

    if (!DISCORD_HOSTNAMES.includes(hostname)) {
        throw new Error(`ipc[${event}]: Disallowed hostname ${hostname}`);
    }
}

export function handleSync(event: IpcEvents | UpdaterIpcEvents, cb: (e: IpcMainEvent, ...args: any[]) => any) {
    ipcMain.on(event, (e, ...args) => {
        validateSender(e.senderFrame, event);
        e.returnValue = cb(e, ...args);
    });
}

export function handle(event: IpcEvents | UpdaterIpcEvents, cb: (e: IpcMainInvokeEvent, ...args: any[]) => any) {
    try { ipcMain.removeHandler(event); } catch {}
    ipcMain.handle(event, (e, ...args) => {
        validateSender(e.senderFrame, event);
        return cb(e, ...args);
    });
}
