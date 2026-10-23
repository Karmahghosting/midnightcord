/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import { app, IpcMainInvokeEvent } from "electron";

import { Language } from "./model";
import { TypeRuntime } from "./runtime";

const runtime = new TypeRuntime(join(DATA_DIR, "midnight-type"));
const observed = new WeakSet<Electron.WebContents>();

app.once("before-quit", () => runtime.shutdown());
process.once("exit", () => runtime.shutdown());

function owner(event: IpcMainInvokeEvent) {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"].includes(new URL(frame.url || "about:blank").origin))
        throw new Error("midnight-type-unauthorized-origin");
    if (!observed.has(event.sender)) {
        observed.add(event.sender);
        const { id } = event.sender;
        event.sender.once("destroyed", () => runtime.release(id));
        event.sender.on("render-process-gone", () => runtime.release(id));
    }
    return event.sender.id;
}

export function status(event: IpcMainInvokeEvent) { owner(event); return runtime.status(); }
export function setup(event: IpcMainInvokeEvent) { return runtime.setup(owner(event)); }
export function complete(event: IpcMainInvokeEvent, requestId: string, prefix: string, language: Language) {
    return runtime.complete(owner(event), requestId, prefix, language);
}
export function cancel(event: IpcMainInvokeEvent, requestId?: string) { runtime.cancel(owner(event), requestId); }
export function release(event: IpcMainInvokeEvent) { runtime.release(owner(event)); }
export function remove(event: IpcMainInvokeEvent) { owner(event); return runtime.remove(); }
