/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ipcRenderer } from "electron/renderer";
import type { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";

export function invoke<T = any>(event: IpcEvents | UpdaterIpcEvents, ...args: any[]) {
    return ipcRenderer.invoke(event, ...args) as Promise<T>;
}

export function sendSync<T = any>(event: IpcEvents | UpdaterIpcEvents, ...args: any[]) {
    return ipcRenderer.sendSync(event, ...args) as T;
}
