/*
 * Midnightcord native installer
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as native from "../scripts/nativeInjection.mjs";

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const channelNames = { stable: "Discord Stable", ptb: "Discord PTB", canary: "Discord Canary", development: "Discord Development" };

function writable(path) {
    try {
        let existing = path;
        while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
        accessSync(existing, constants.W_OK);
        return true;
    } catch { return false; }
}

function processChannel(name) {
    const normalized = basename(name.trim()).replace(/\.exe$/i, "").replace(/[^a-z]/gi, "").toLowerCase();
    for (const channel of [...native.DISCORD_CHANNELS].reverse()) {
        const expected = channel.windows.toLowerCase();
        if (normalized === expected || normalized.startsWith(expected + "helper")) return channel.id;
    }
    return null;
}

export async function detectRunningDiscord({ platform = process.platform, targets = [] } = {}) {
    const labels = new Set();
    if (platform === "win32") {
        const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
            "Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object Name,ExecutablePath | ConvertTo-Json -Compress"
        ], { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
        const processes = JSON.parse(stdout.trim() || "[]");
        for (const process of Array.isArray(processes) ? processes : [processes]) {
            const channel = processChannel(process.Name ?? "");
            if (channel) labels.add(channelNames[channel]);
            if (process.Name?.toLowerCase() !== "update.exe" || !process.ExecutablePath) continue;
            const executable = resolve(process.ExecutablePath).toLowerCase();
            for (const target of targets) {
                if (executable === join(dirname(dirname(target.path)), "Update.exe").toLowerCase()) labels.add(channelNames[target.channel] + " (mise à jour)");
            }
        }
    } else if (platform === "darwin" || platform === "linux") {
        const { stdout } = await exec("ps", ["-ax", "-o", platform === "linux" ? "pid=,comm=" : "comm="], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
        for (let command of stdout.split("\n")) {
            if (platform === "linux") {
                const process = /^\s*(\d+)\s+(.+)$/.exec(command);
                if (!process) continue;
                command = process[2];
                try { command = readlinkSync("/proc/" + process[1] + "/exe"); } catch {}
                if (command.toLowerCase() === "discorddevelopm") command = "DiscordDevelopment";
            }
            const channel = processChannel(command);
            if (channel) labels.add(channelNames[channel]);
        }
    } else {
        throw new Error("Ce système n’est pas pris en charge.");
    }
    return [...labels];
}

export function createInstaller(options = {}) {
    const platform = options.platform ?? process.platform;
    const env = options.env ?? process.env;
    const home = options.home ?? homedir();
    const sourceDist = resolve(options.sourceDist ?? join(root, "dist", "desktop"));
    const helpers = { ...native, isWritable: writable, ...options.helpers };
    const discovery = { ...options.discoveryOptions, platform, env, home };
    const distributionOptions = { platform, env, home };
    const findTargets = options.findTargets ?? (() => helpers.findDiscordResources(discovery));
    const listRunning = options.listRunning ?? (targets => detectRunningDiscord({ platform, targets }));
    let busy = false;
    let initialized = false;
    let registry = new Map();
    let state = { version: options.version ?? "", platform, targets: [], running: [], busy: false, error: null };
    const snapshot = () => ({ ...state, busy, targets: state.targets.map(target => ({ ...target })), running: [...state.running] });
    const progress = event => { try { options.onProgress?.(event); } catch {} };

    async function refresh() {
        const targets = [];
        const seen = new Set();
        for (const candidate of await findTargets()) {
            if (!Object.hasOwn(channelNames, candidate.channel)) continue;
            const path = realpathSync(candidate.resourcesDir);
            const canonical = platform === "win32" ? path.toLowerCase() : path;
            if (seen.has(canonical)) continue;
            seen.add(canonical);
            const app = join(path, "app");
            const appAsar = join(path, "app.asar");
            const backup = join(path, "_app.asar");
            const installed = helpers.isMidnightcordLoader(app);
            let conflict = null;
            if (existsSync(app) && !installed) conflict = "Un autre mod utilise déjà cette installation. Retirez-le avec son propre désinstalleur.";
            else if (existsSync(appAsar) && statSync(appAsar).isDirectory()) conflict = "Un dossier tiers remplace app.asar.";
            else if (!existsSync(appAsar) && !existsSync(backup)) conflict = "La sauvegarde officielle de Discord est absente.";
            else if (!installed && existsSync(appAsar) && existsSync(backup)) conflict = "app.asar et sa sauvegarde existent ensemble. Une restauration manuelle est nécessaire.";
            const paths = [path, ...(installed ? [app, join(app, "index.js"), join(app, "package.json")] : [])];
            targets.push({
                id: "target-" + createHash("sha256").update(candidate.channel + "\0" + canonical).digest("hex").slice(0, 24),
                channel: candidate.channel, name: channelNames[candidate.channel], version: candidate.version ?? "",
                path, source: candidate.source ?? "", installed, writable: paths.every(item => helpers.isWritable(item)), conflict
            });
        }
        let running = [];
        let error = null;
        try { running = await listRunning(targets); }
        catch { error = "Impossible de vérifier si Discord est fermé. Réessayez après avoir fermé Discord complètement."; }
        registry = new Map(targets.map(target => [target.id, target]));
        state = { ...state, targets, running, error };
        initialized = true;
        return snapshot();
    }

    async function scan() {
        return busy ? snapshot() : refresh();
    }

    async function getState() {
        return initialized ? snapshot() : scan();
    }

    async function perform(request) {
        const results = [];
        if (busy) return { ok: false, message: "Une opération est déjà en cours.", results };
        if (!request || !["install", "uninstall"].includes(request.action) || !Array.isArray(request.targetIds)
            || !request.targetIds.length || request.targetIds.length > 64 || request.targetIds.some(id => typeof id !== "string")
            || new Set(request.targetIds).size !== request.targetIds.length || request.targetIds.some(id => !registry.has(id))) {
            return { ok: false, message: "Sélection invalide. Actualisez la liste et choisissez une installation détectée.", results };
        }
        const requested = request.targetIds.map(id => ({ ...registry.get(id) }));
        busy = true;
        let ok = false;
        let message;
        progress({ stage: "checking", percent: 0, message: "Vérification des installations sélectionnées…" });
        try {
            await refresh();
            if (state.error) throw new Error(state.error);
            if (state.running.length) throw new Error("Fermez complètement Discord, y compris son icône de notification, puis réessayez. En cours : " + state.running.join(", ") + ".");
            const targets = requested.map(previous => {
                const target = registry.get(previous.id);
                if (!target || target.path !== previous.path) throw new Error("Les installations ont changé. Actualisez la liste avant de recommencer.");
                if (target.conflict) throw new Error(target.name + " : " + target.conflict);
                if (!target.writable) throw new Error("Écriture non autorisée dans " + target.path + ". Vérifiez les permissions de cette installation.");
                return target;
            });
            const installing = request.action === "install";
            const steps = targets.length + (installing ? 2 : 1);
            let completed = 1;
            let patcherPath;
            if (installing) {
                if (!existsSync(join(sourceDist, "patcher.js"))) throw new Error("Le build Midnightcord est absent du paquet. Téléchargez de nouveau l’archive complète.");
                const destination = resolve(helpers.getInstalledDistDir(distributionOptions));
                if (destination === sourceDist || destination.startsWith(sourceDist + sep) || sourceDist.startsWith(destination + sep)) throw new Error("Le dossier du paquet doit être distinct du dossier Midnightcord installé.");
                if (!helpers.isWritable(dirname(destination))) throw new Error("Écriture non autorisée dans le profil Midnightcord : " + dirname(destination));
                progress({ stage: "copying", percent: Math.round(100 * completed / steps), message: "Copie du build Midnightcord dans votre profil…" });
                patcherPath = join(helpers.installDistribution(sourceDist, distributionOptions), "patcher.js");
                completed++;
            }
            for (const target of targets) {
                progress({ stage: installing ? "injecting" : "restoring", percent: Math.round(100 * completed / steps), message: (installing ? "Installation dans " : "Restauration de ") + target.name + "…", targetId: target.id });
                try {
                    const status = installing ? helpers.injectResource(target.path, patcherPath) : helpers.uninjectResource(target.path);
                    results.push({ id: target.id, ok: true, status, message: status === "unchanged" ? "Déjà à jour." : installing ? "Midnightcord installé." : "Discord restauré." });
                } catch (error) { results.push({ id: target.id, ok: false, message: error.message }); }
                completed++;
            }
            ok = results.every(result => result.ok);
            message = ok ? installing ? "Installation terminée. Vous pouvez relancer Discord." : "Discord a été restauré. Vos réglages Midnightcord sont conservés."
                : "Certaines installations n’ont pas pu être modifiées. Consultez les résultats puis réessayez.";
            await refresh();
        } catch (error) {
            message = error.message || "L’opération a échoué.";
        } finally { busy = false; }
        progress({ stage: ok ? "done" : "error", percent: ok ? 100 : 0, message });
        return { ok, message, results, state: snapshot() };
    }

    return { getState, scan, perform };
}
