/* Midnightcord macOS process control. SPDX-License-Identifier: GPL-3.0-or-later */

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

export function macAppPath(target) {
    const resources = resolve(target.path);
    const contents = dirname(resources);
    const app = dirname(contents);
    if (basename(resources) !== "Resources" || basename(contents) !== "Contents" || !app.endsWith(".app")) {
        throw new Error("Installation macOS invalide : " + target.path);
    }
    return app;
}

export function createMacDiscordController({ execute = promisify(execFile), signal = process.kill, wait = setTimeout } = {}) {
    async function processesFor(targets) {
        const bundles = targets.map(target => ({ target, prefix: join(macAppPath(target), "Contents") + sep }));
        // comm contains the executable path, without arguments. Limit the scan to
        // this user's processes, including helpers left behind by a closed window.
        const { stdout } = await execute("ps", ["-x", "-o", "pid=,comm="], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
        const matches = [];
        for (const line of stdout.split("\n")) {
            const match = /^\s*(\d+)\s+(.+)$/.exec(line);
            if (!match || Number(match[1]) <= 1) continue;
            let executable = match[2];
            try { executable = realpathSync(executable); } catch {}
            const bundle = bundles.find(({ prefix }) => executable.startsWith(prefix));
            if (bundle) matches.push({ pid: Number(match[1]), target: bundle.target });
        }
        return matches;
    }

    async function listRunning(targets) {
        return [...new Set((await processesFor(targets)).map(({ target }) => target.name))];
    }

    async function stop(targets) {
        let processes = await processesFor(targets);
        for (const [type, attempts] of [["SIGTERM", 30], ["SIGKILL", 20]]) {
            if (!processes.length) return;
            for (const { pid } of processes) {
                try { signal(pid, type); }
                catch (error) { if (error.code !== "ESRCH") throw error; }
            }
            for (let attempt = 0; attempt < attempts; attempt++) {
                await wait(100);
                processes = await processesFor(targets);
                if (!processes.length) return;
            }
        }
        throw new Error("Impossible d’arrêter Discord. Aucun fichier d’installation n’a été modifié. Réessayez après avoir quitté Discord complètement.");
    }

    async function start(target) {
        // Open the exact selected copy, even when another channel is installed.
        await execute("open", ["-a", macAppPath(target)], { timeout: 10_000 });
    }

    return { listRunning, stop, start };
}
