const { execSync } = require("child_process");
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, cpSync, renameSync, rmSync } = require("fs");
const { createHash } = require("crypto");
const { join } = require("path");

// ─── Configuration de Build Midnightcord ─────────────────────────────────────────

function killMidnightcord() {
    const releaseDir = join(__dirname, "release", "midnightcord-dist");
    const releaseExe = join(releaseDir, "Discord.exe");

    try {
        execSync(
            `powershell -NoProfile -Command "Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${releaseExe.replace(/'/g, "''")}'} | Stop-Process -Force"`,
            { stdio: "ignore", shell: true }
        );
    } catch (_) { }

    const resDir = join(releaseDir, "resources");
    for (const name of ["app.asar", "_app.asar"]) {
        const p = join(resDir, name);
        if (!existsSync(p)) continue;
        try { rmSync(p, { recursive: true, force: true }); } catch (_) { }
    }
}

function findDiscordApp() {
    const base = join(process.env.LOCALAPPDATA, "Discord");
    let best = null, bestVer = [0, 0, 0];
    try {
        for (const e of readdirSync(base)) {
            const m = e.match(/^app-(\d+)\.(\d+)\.(\d+)$/);
            if (!m) continue;
            const v = [+m[1], +m[2], +m[3]];
            if (v[0] > bestVer[0] || v[1] > bestVer[1] || v[2] > bestVer[2]) { bestVer = v; best = join(base, e); }
        }
    } catch { }
    if (!best) throw new Error("Discord introuvable. Assurez-vous que Discord est installé.");
    return best;
}

function buildEquicord() {
    console.log("[build] Compilation de Midnightcord...");
    execSync("node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone", { stdio: "inherit" });
}

function buildMidnightcordFromDiscord(discordApp) {
    const discordRes = join(discordApp, "resources");
    const outDir = join(__dirname, "release", "midnightcord-dist");

    if (existsSync(outDir)) {
        try { rmSync(outDir, { recursive: true, force: true }); } catch (e) { }
    }

    console.log("[midnightcord] Copie des binaires Discord...");
    mkdirSync(outDir, { recursive: true });

    for (const f of readdirSync(discordApp)) {
        if (f === "resources" || f === "modules") continue;
        const src = join(discordApp, f);
        const dst = join(outDir, f);
        try { cpSync(src, dst, { recursive: true }); } catch (e) { }
    }

    const outModules = join(outDir, "modules");
    mkdirSync(outModules, { recursive: true });

    const discordModules = join(discordApp, "modules");
    if (existsSync(discordModules)) {
        for (const mod of readdirSync(discordModules)) {
            const src = join(discordModules, mod);
            if (!statSync(src).isDirectory()) continue;
            const dst = join(outModules, mod);
            try { cpSync(src, dst, { recursive: true }); } catch (e) { }
        }
    }

    const outRes = join(outDir, "resources");
    mkdirSync(outRes, { recursive: true });

    const buildInfoSrc = join(discordRes, "build_info.json");
    if (existsSync(buildInfoSrc)) {
        const buildInfo = JSON.parse(readFileSync(buildInfoSrc, "utf8"));
        buildInfo.newUpdater = false;
        writeFileSync(join(outRes, "build_info.json"), JSON.stringify(buildInfo, null, 2));
    }

    const bootstrapSrc = join(discordRes, "bootstrap");
    const bootstrapDst = join(outRes, "bootstrap");
    if (existsSync(bootstrapSrc)) {
        mkdirSync(bootstrapDst, { recursive: true });
        cpSync(bootstrapSrc, bootstrapDst, { recursive: true });
    }

    console.log("[midnightcord] Préparation de _app.asar...");
    let appAsarSrc = join(discordRes, "_app.asar");
    if (!existsSync(appAsarSrc)) appAsarSrc = join(discordRes, "app.asar");
    
    if (existsSync(appAsarSrc)) {
        cpSync(appAsarSrc, join(outRes, "_app.asar"), { recursive: statSync(appAsarSrc).isDirectory() });
    }

    const outAppAsar = join(outRes, "app.asar");
    mkdirSync(outAppAsar, { recursive: true });
    writeFileSync(join(outAppAsar, "package.json"), JSON.stringify({ name: "discord", main: "index.js" }, null, 2));
    writeFileSync(join(outAppAsar, "index.js"), `
"use strict";
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

app.setAppUserModelId("com.squirrel.Discord.Discord");

const bundledModulesPath = path.join(path.dirname(process.execPath), "modules");
require(path.join(__dirname, "..", "app", "dist", "desktop", "patcher.js"));
`);

    const outApp = join(outRes, "app");
    mkdirSync(outApp, { recursive: true });
    writeFileSync(join(outApp, "package.json"), JSON.stringify({ name: "discord", main: "index.js", version: "1.18.0" }, null, 2));
    writeFileSync(join(outApp, "index.js"), `
"use strict";
const path = require("path");
const { app } = require("electron");

app.setAppUserModelId("com.squirrel.Discord.Discord");

require(path.join(__dirname, "dist", "desktop", "patcher.js"));
`);

    const outDist = join(outApp, "dist", "desktop");
    mkdirSync(outDist, { recursive: true });
    const equicordDist = join(__dirname, "dist", "desktop");

    for (const f of ["patcher.js", "renderer.js", "renderer.css", "renderer.js.LEGAL.txt"]) {
        if (existsSync(join(equicordDist, f))) cpSync(join(equicordDist, f), join(outDist, f));
    }

    const midnightcordPreload = join(__dirname, "midnightcord-preload.js");
    if (existsSync(midnightcordPreload)) {
        cpSync(midnightcordPreload, join(outDist, "preload.js"));
    }

    // FFmpeg et YT-DLP (cherche dans le dossier local ou PATH)
    const binDir = join(__dirname, "static", "bin");
    for (const bin of ["ffmpeg.exe", "yt-dlp.exe"]) {
        const localBin = join(binDir, bin);
        if (existsSync(localBin)) cpSync(localBin, join(outDir, bin));
    }

    // Curseurs macOS (utilises par le plugin CursorMacOS) -> resourcesPath/mac/mac/...
    // native.ts cherche via process.resourcesPath, qui pointe vers outDir/resources (asar: false)
    const macCursorsSrc = join(__dirname, "mac");
    if (existsSync(macCursorsSrc)) {
        console.log("[midnightcord] Copie des curseurs macOS...");
        cpSync(macCursorsSrc, join(outRes, "mac"), { recursive: true });
    } else {
        console.warn("[midnightcord] ATTENTION: dossier 'mac' introuvable a la racine, le plugin CursorMacOS ne fonctionnera pas dans le build package.");
    }

    const discordExe = join(outDir, "Discord.exe");
    const injectScript = join(__dirname, "inject-discord.ps1");
    if (existsSync(injectScript)) cpSync(injectScript, join(outDir, "inject-discord.ps1"));

    const iconSrc = join(__dirname, "midnightcord.ico");
    if (existsSync(iconSrc)) {
        cpSync(iconSrc, join(outDir, "app.ico"));
        // Rcedit pour le branding
        try {
            const rcedit = join(__dirname, "node_modules", ".bin", "rcedit.cmd");
            if (existsSync(rcedit)) {
                execSync(`"${rcedit}" "${discordExe}" --set-icon "${iconSrc}" --set-version-string "ProductName" "Midnightcord" --set-version-string "FileDescription" "Midnightcord"`, { stdio: "ignore" });
            }
        } catch (e) { }
    }

    console.log(`[midnightcord] Build terminé -> ${outDir}`);
}

function obfuscateDesktop() {
    // Obfuscation légère pour la protection intellectuelle de base sans casser les perfs
    const obfArgs = ["--compact", "true", "--simplify", "true", "--string-array", "true"];
    const files = ["patcher.js", "preload.js", "renderer.js"];
    for (const f of files) {
        const fp = join(__dirname, "dist", "desktop", f);
        if (!existsSync(fp)) continue;
        try { execSync(`npx javascript-obfuscator "${fp}" --output "${fp}" ${obfArgs.join(" ")}`, { stdio: "ignore" }); } catch (e) { }
    }
}

// ─── Execution du build ───────────────────────────────────────────────────────

killMidnightcord();
const discord = findDiscordApp();
buildEquicord();
// obfuscateDesktop(); // Optionnel pour l'open source
buildMidnightcordFromDiscord(discord);

module.exports = {
    appId: "com.midnightcord.app",
    productName: "Midnightcord",
    copyright: "Copyright 2026 Midnightcord",
    extraMetadata: { main: "index.js" },
    asar: false,
    files: ["index.js", "dist/desktop/**/*", "!**/*.map", "!**/*.ts"],
    directories: { output: "release", buildResources: "desktop/assets" },
    win: {
        target: [{ target: "dir", arch: ["x64"] }],
        icon: "midnightcord.ico",
        requestedExecutionLevel: "asInvoker"
    }
};
