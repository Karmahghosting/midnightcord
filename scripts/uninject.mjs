/*
 * Midnightcord — Local un-injector for Discord Desktop
 * Annule l'injection en :
 * 1. Supprimant le dossier app/ créé par inject.mjs
 * 2. Restaurant _app.asar → app.asar
 *
 * Usage: pnpm uninject   (ou: node scripts/uninject.mjs)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from "fs";
import { join } from "path";

// ── Locate Discord installations (même logique que inject.mjs) ───────────────
function findAllDiscordResources() {
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";

        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
                    .sort()
                    .reverse();
                for (const ver of versions) {
                    candidates.push(join(base, ver, "resources"));
                }
            } catch { }
        }
    } else if (platform === "darwin") {
        candidates.push(
            "/Applications/Discord.app/Contents/Resources",
            "/Applications/Discord PTB.app/Contents/Resources",
            "/Applications/Discord Canary.app/Contents/Resources"
        );
    } else if (platform === "linux") {
        const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || "", ".config");
        for (const channel of ["discord", "discordptb", "discordcanary", "discorddevelopment"]) {
            const base = join(configHome, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => d.startsWith("app-"))
                    .sort()
                    .reverse();
                for (const version of versions) {
                    candidates.push(join(base, version, "resources"));
                }
            } catch { }
        }

        candidates.push(
            "/usr/share/discord/resources",
            "/usr/lib/discord/resources",
            "/opt/discord/resources",
            "/opt/Discord/resources"
        );
    }

    // Filtrer uniquement les paths avec une injection Midnightcord présente
    return candidates.filter(p => {
        if (!existsSync(p)) return false;
        return existsSync(join(p, "app")) || existsSync(join(p, "_app.asar"));
    });
}

// ── Uninject ─────────────────────────────────────────────────────────────────
function uninject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const backupPath = join(resourcesDir, "_app.asar");
    const appAsarPath = join(resourcesDir, "app.asar");

    // Vérifier que le dossier app/ a bien été créé par Midnightcord
    if (existsSync(appDirPath)) {
        try {
            if (existsSync(join(appDirPath, "index.js"))) {
                const indexContent = readFileSync(join(appDirPath, "index.js"), "utf-8");
                if (!indexContent.includes("Midnightcord Injector") && !indexContent.includes("Midnightcord")) {
                    console.warn(`\x1b[33m[Midnightcord] Le dossier app/ existe mais n'a pas l'air d'avoir été créé par Midnightcord.\x1b[0m`);
                    console.warn("\x1b[33m            Abandon pour éviter de casser un autre mod.\x1b[0m");
                    return false;
                }
            }
        } catch { }

        console.log("[Midnightcord] Suppression du dossier app/ injecté...");
        rmSync(appDirPath, { recursive: true, force: true });
    } else {
        console.log("\x1b[33m[Midnightcord] Aucun dossier app/ injecté trouvé.\x1b[0m");
    }

    // Restaurer le backup
    if (existsSync(backupPath) && !existsSync(appAsarPath)) {
        console.log("[Midnightcord] Restauration _app.asar → app.asar...");
        renameSync(backupPath, appAsarPath);
    } else if (existsSync(backupPath) && existsSync(appAsarPath)) {
        console.log("[Midnightcord] app.asar déjà présent, nettoyage du backup...");
        rmSync(backupPath, { force: true });
    }

    console.log(`\x1b[32m[Midnightcord] Désinjection réussie depuis : ${resourcesDir}\x1b[0m`);
    console.log("\x1b[36m[Midnightcord] Redémarrez Discord pour appliquer les changements.\x1b[0m");
    return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const allResources = findAllDiscordResources();

if (allResources.length === 0) {
    console.error("\x1b[31m[Midnightcord] Aucune installation Discord avec Midnightcord injecté trouvée.\x1b[0m");
    console.error("\x1b[33m           Assurez-vous que Midnightcord a bien été injecté via 'pnpm inject'.\x1b[0m");
    process.exit(1);
}

let uninjectCount = 0;
for (const res of allResources) {
    console.log(`\n[Midnightcord] Trouvé : ${res}`);
    if (uninject(res)) uninjectCount++;
}

if (uninjectCount === 0) {
    console.error("\x1b[31m[Midnightcord] Aucune désinjection réussie.\x1b[0m");
    process.exit(1);
}

console.log(`\n\x1b[32m[Midnightcord] ${uninjectCount}/${allResources.length} désinjection(s) réussie(s).\x1b[0m`);
