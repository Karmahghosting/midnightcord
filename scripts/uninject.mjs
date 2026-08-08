/*
 * Midnightcord native Discord uninjector
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import {
    DISCORD_CHANNELS,
    findDiscordResources,
    removeInstalledDistribution,
    uninjectResource
} from "./nativeInjection.mjs";

const args = process.argv.slice(2);

function argumentValue(name) {
    const inline = args.find(argument => argument.startsWith(name + "="));
    if (inline) return inline.slice(name.length + 1);
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
}

function printHelp() {
    console.log([
        "Midnightcord native uninjector",
        "",
        "Usage: node scripts/uninject.mjs [options]",
        "",
        "Options:",
        "  --channel <name>  stable, ptb, canary or development",
        "  --purge           remove the installed build after restoration",
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

let failures = 0;
let restored = 0;
for (const target of targets) {
    try {
        const result = uninjectResource(target.resourcesDir);
        if (result === "unchanged") {
            console.log("[Midnightcord] " + target.channel + ": aucune injection Midnightcord trouvee");
            continue;
        }

        restored++;
        const suffix = result === "restored-with-backup"
            ? ", sauvegarde conservee car app.asar existe deja"
            : "";
        console.log("[Midnightcord] " + target.channel + ": Discord restaure" + suffix);
    } catch (error) {
        failures++;
        console.error("[Midnightcord] " + target.channel + ": " + error.message);
    }
}

if (args.includes("--purge") && failures === 0 && restored > 0) {
    const removed = removeInstalledDistribution();
    console.log("[Midnightcord] Distribution supprimee de " + removed);
}

if (failures > 0) {
    console.error("[Midnightcord] Fermez completement Discord et recommencez si un fichier etait verrouille.");
    process.exit(1);
}

console.log("[Midnightcord] Redemarrez Discord pour appliquer les changements.");
