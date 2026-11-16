/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile } from "node:child_process";

import { app } from "electron";
import { IpcEvents } from "shared/IpcEvents";

import { handle } from "./utils/ipcWrappers";

const SINK = "midnightcord_sb";
const SOURCE = "midnightcord_sb_mic";

function run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile("pactl", args, { timeout: 10_000 }, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr?.trim() || error.message));
            else resolve(stdout.trim());
        });
    });
}

async function defaultSource() {
    const source = await run(["get-default-source"]).catch(() => "");
    if (source && !source.startsWith(SINK)) return source;

    const sources = await run(["list", "short", "sources"]).catch(() => "");
    const candidate = sources
        .split("\n")
        .map(line => line.split("\t")[1])
        .find(name => name && !name.startsWith(SINK) && !name.endsWith(".monitor"));

    return candidate ?? "";
}

async function ensure() {
    if (process.platform !== "linux") {
        return { ok: false as const, platform: process.platform };
    }

    try {
        const sinks = await run(["list", "short", "sinks"]).catch(() => "");
        if (!sinks.split("\n").some(line => line.split("\t")[1] === SINK)) {
            await run([
                "load-module",
                "module-null-sink",
                `sink_name=${SINK}`,
                "sink_properties=device.description=Midnightcord-Soundboard"
            ]);
        }

        const sources = await run(["list", "short", "sources"]).catch(() => "");
        if (!sources.split("\n").some(line => line.split("\t")[1] === SOURCE)) {
            await run([
                "load-module",
                "module-remap-source",
                `master=${SINK}.monitor`,
                `source_name=${SOURCE}`,
                "source_properties=device.description=Midnightcord-Soundboard-Mic"
            ]);
        }

        const modules = await run(["list", "short", "modules"]).catch(() => "");
        const hasLoopback = modules
            .split("\n")
            .some(line => line.includes("module-loopback") && line.includes(SINK));

        if (!hasLoopback) {
            const source = await defaultSource();
            if (source) {
                await run([
                    "load-module",
                    "module-loopback",
                    `source=${source}`,
                    `sink=${SINK}`,
                    "latency_msec=20",
                    "source_dont_move=true",
                    "sink_dont_move=true"
                ]);
            }
        }

        return { ok: true as const, platform: process.platform, sinkName: SINK, sourceName: SOURCE };
    } catch (error) {
        return { ok: false as const, platform: process.platform, error: (error as Error).message };
    }
}

async function remove() {
    if (process.platform !== "linux") return;

    try {
        const modules = await run(["list", "short", "modules"]);
        const ids = modules
            .split("\n")
            .filter(line => line.includes(SINK) || line.includes(SOURCE))
            .map(line => line.split("\t")[0]);

        for (const id of ids) {
            await run(["unload-module", id]).catch(() => { });
        }
    } catch { }
}

async function findDiscordOutputs() {
    const output = await run(["list", "source-outputs"]);
    return output
        .split(/\n(?=Source Output #)/)
        .map(block => ({
            id: block.match(/Source Output #(\d+)/)?.[1],
            binary: /application\.process\.binary = "electron"/.test(block),
            record: /media\.name = "RecordStream"/.test(block),
            source: block.match(/\n\tSource: (\S+)/)?.[1]
        }))
        .filter(entry => entry.id && entry.binary && entry.record);
}

async function route() {
    if (process.platform !== "linux") return 0;

    try {
        const outputs = await findDiscordOutputs();
        let moved = 0;
        for (const output of outputs) {
            if (output.source === SOURCE) continue;
            await run(["move-source-output", output.id!, SOURCE]).then(() => moved++).catch(() => { });
        }
        return moved;
    } catch {
        return 0;
    }
}

async function unroute() {
    if (process.platform !== "linux") return;

    try {
        const source = await defaultSource();
        if (!source) return;
        const outputs = await findDiscordOutputs();
        for (const output of outputs) {
            await run(["move-source-output", output.id!, source]).catch(() => { });
        }
    } catch { }
}

app.whenReady().then(() => void remove());
app.on("before-quit", () => void remove());

handle(IpcEvents.SOUNDBOARD_MIC_ENSURE, ensure);
handle(IpcEvents.SOUNDBOARD_MIC_REMOVE, remove);
handle(IpcEvents.SOUNDBOARD_MIC_ROUTE, route);
handle(IpcEvents.SOUNDBOARD_MIC_UNROUTE, unroute);
