/*
 * Midnightcord native Discord injector
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    DISCORD_CHANNELS,
    findDiscordResources,
    injectResource,
    installDistribution,
    installLinuxDesktopEntry
} from "./nativeInjection.mjs";

const baseDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDist = join(baseDir, "dist", "desktop");
const args = process.argv.slice(2);

function argumentValue(name) {
    const inline = args.find(argument => argument.startsWith(name + "="));
    if (inline) return inline.slice(name.length + 1);
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
}

function printHelp() {
    console.log([
        "Midnightcord native injector",
        "",
        "Usage: node scripts/inject.mjs [options]",
        "",
        "Options:",
        "  --channel <name>  stable, ptb, canary or development",
        "  --copy            copy the build into the user profile before injection",
        "  --dry-run         list targets without changing files",
        "  --help            show this help"
    ].join("\n"));
}

if (args.includes("--help")) {
    printHelp();
    process.exit(0);
}

const requestedChannel = argumentValue("--channel");
const validChannels = new Set(DISCORD_CHANNELS.map(channel => channel.id));
if (requestedChannel && !validChannels.has(requestedChannel)) {
    console.error("[Midnightcord] Canal inconnu: " + requestedChannel);
    process.exit(1);
}

if (!existsSync(join(sourceDist, "patcher.js"))) {
    console.error("[Midnightcord] dist/desktop/patcher.js est introuvable.");
    console.error("[Midnightcord] Lancez corepack pnpm run buildDesktop puis recommencez.");
    process.exit(1);
}

const channels = requestedChannel ? [requestedChannel] : undefined;
const targets = findDiscordResources({ channels });
if (targets.length === 0) {
    console.error("[Midnightcord] Aucune installation Discord compatible trouvee.");
    process.exit(1);
}

if (args.includes("--dry-run")) {
    for (const target of targets) {
        console.log("[Midnightcord] " + target.channel + ": " + target.resourcesDir);
    }
    process.exit(0);
}

let patcherPath = join(sourceDist, "patcher.js");
if (args.includes("--copy")) {
    const installedDist = installDistribution(sourceDist);
    patcherPath = join(installedDist, "patcher.js");
    console.log("[Midnightcord] Fichiers installes dans " + installedDist);
}

let failures = 0;
for (const target of targets) {
    try {
        const result = injectResource(target.resourcesDir, patcherPath);
        const message = result === "installed"
            ? "injection terminee"
            : result === "updated"
              ? "chargeur mis a jour"
              : "deja a jour";
        console.log("[Midnightcord] " + target.channel + ": " + message + " dans " + target.resourcesDir);
    } catch (error) {
        failures++;
        console.error("[Midnightcord] " + target.channel + ": " + error.message);
    }
}

if (process.platform === "linux") {
    const packagedIcon = join(baseDir, "assets", "icon.png");
    const sourceIcon = existsSync(packagedIcon) ? packagedIcon : join(baseDir, "static", "icon.png");
    const desktopPath = installLinuxDesktopEntry({
        channel: targets[0]?.channel || "stable",
        iconSource: sourceIcon
    });
    if (desktopPath) console.log("[Midnightcord] Lanceur KDE installe dans " + desktopPath);
}

if (failures > 0) {
    console.error("[Midnightcord] Fermez completement Discord et recommencez si un fichier etait verrouille.");
    process.exit(1);
}

console.log("[Midnightcord] Redemarrez Discord pour appliquer les changements.");
