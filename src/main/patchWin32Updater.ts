/*
 * Midnightcord, a modification for Discord's desktop app
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "original-fs";
import { dirname, join } from "path";

declare const __filename: string;
const OUR_PATCHER_PATH = __filename;

function patchResourcesDir(resourcesDir: string) {
    try {
        const appDir = join(resourcesDir, "app");
        const appAsar = join(resourcesDir, "app.asar");
        const _appAsar = join(resourcesDir, "_app.asar");

        // Check if already patched cleanly with app/index.js pointing to Midnightcord
        const loaderIndex = join(appDir, "index.js");
        if (existsSync(loaderIndex)) {
            try {
                const content = readFileSync(loaderIndex, "utf-8");
                if (content.includes("Midnightcord")) return; // Already patched
            } catch {}
        }

        // If app.asar is a directory (from old buggy patcher), clean it up
        if (existsSync(appAsar)) {
            try {
                if (statSync(appAsar).isDirectory()) {
                    rmSync(appAsar, { recursive: true, force: true });
                }
            } catch {}
        }

        // Backup original app.asar -> _app.asar if _app.asar doesn't exist yet
        if (existsSync(appAsar) && !existsSync(_appAsar)) {
            try {
                if (!statSync(appAsar).isDirectory()) {
                    renameSync(appAsar, _appAsar);
                }
            } catch {}
        }

        if (!existsSync(_appAsar) && !existsSync(appAsar)) {
            // Incomplete Discord update download
            return;
        }

        console.info(`[Midnightcord] Auto-injecting into ${resourcesDir}...`);

        if (existsSync(appDir)) {
            try { rmSync(appDir, { recursive: true, force: true }); } catch {}
        }
        mkdirSync(appDir, { recursive: true });

        writeFileSync(join(appDir, "package.json"), JSON.stringify({
            name: "discord",
            main: "index.js"
        }, null, 2));

        const indexJs = [
            "// Midnightcord Injector — auto-generated",
            "\"use strict\";",
            "const path = require(\"path\");",
            "const fs = require(\"fs\");",
            "try {",
            `    require(${JSON.stringify(OUR_PATCHER_PATH)});`,
            "} catch (e) {",
            "    console.error(\"[Midnightcord] Injection failed, falling back to original _app.asar:\", e);",
            "    const originalAsar = path.join(__dirname, \"..\", \"_app.asar\");",
            "    if (fs.existsSync(originalAsar)) {",
            "        require(originalAsar);",
            "    }",
            "}",
            ""
        ].join("\n");

        writeFileSync(join(appDir, "index.js"), indexJs);
        console.info(`[Midnightcord] Successfully injected into ${resourcesDir}`);
    } catch (err) {
        console.error(`[Midnightcord] Failed to auto-inject into ${resourcesDir}:`, err);
    }
}

function patchAllDiscordInstallations() {
    if (process.platform !== "win32") return;
    try {
        const localAppData = process.env.LOCALAPPDATA || "";
        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;

            let versions: string[] = [];
            try {
                versions = readdirSync(base).filter(d => /^app-\d+\.\d+\.\d+$/.test(d));
            } catch { continue; }

            for (const ver of versions) {
                const resourcesDir = join(base, ver, "resources");
                if (existsSync(resourcesDir)) {
                    patchResourcesDir(resourcesDir);
                }
            }
        }
    } catch (err) {
        console.error("[Midnightcord] Error in patchAllDiscordInstallations:", err);
    }
}

// Run immediately at startup so any new Discord version downloaded before restart is patched right away
patchAllDiscordInstallations();

// Periodically check every 5 minutes in case Discord auto-updates in background
setInterval(patchAllDiscordInstallations, 5 * 60 * 1000);

// Run before quit as final safety net
app.on("before-quit", patchAllDiscordInstallations);

