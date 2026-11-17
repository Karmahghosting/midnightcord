/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, session } from "electron";
import { IpcEvents } from "shared/IpcEvents";

import { mainWin } from "./mainWindow";
import { handle } from "./utils/ipcWrappers";

const LOW_MEMORY_KB = 900 * 1024;
const PRESSURE_COOLDOWN_MS = 120_000;
const CHECK_INTERVAL_MS = 20_000;

let pressureTimer: ReturnType<typeof setInterval> | null = null;
let lastPressure = 0;

export interface MemoryProcessInfo {
    pid: number;
    type: string;
    name?: string;
    workingSetSize: number;
}

export interface MemoryInfo {
    system: {
        total: number;
        free: number;
        swapTotal: number;
        swapFree: number;
    };
    processes: MemoryProcessInfo[];
}

function collectMemoryInfo(): MemoryInfo {
    const system = process.getSystemMemoryInfo();

    return {
        system: {
            total: system.total,
            free: system.free,
            swapTotal: system.swapTotal,
            swapFree: system.swapFree
        },
        processes: app.getAppMetrics().map(metric => ({
            pid: metric.pid,
            type: metric.type,
            name: metric.name,
            workingSetSize: metric.memory.workingSetSize
        }))
    };
}

function notifyRenderer() {
    if (!mainWin || mainWin.isDestroyed()) return;
    mainWin.webContents.send(IpcEvents.MEMORY_PRESSURE, collectMemoryInfo());
}

export function installMemoryGuard() {
    if (pressureTimer) return;

    pressureTimer = setInterval(() => {
        const { free } = process.getSystemMemoryInfo();
        if (free > LOW_MEMORY_KB) return;
        if (Date.now() - lastPressure < PRESSURE_COOLDOWN_MS) return;

        lastPressure = Date.now();
        notifyRenderer();
    }, CHECK_INTERVAL_MS);
}

export function stopMemoryGuard() {
    if (!pressureTimer) return;
    clearInterval(pressureTimer);
    pressureTimer = null;
}

handle(IpcEvents.GET_MEMORY_INFO, () => collectMemoryInfo());

handle(IpcEvents.FREE_MEMORY, async () => {
    try {
        (globalThis as any).gc?.();
    } catch { }

    try {
        await session.defaultSession.clearCache();
    } catch { }

    return collectMemoryInfo();
});
