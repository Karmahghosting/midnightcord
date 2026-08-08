/*
 * Midnightcord native Discord injection helpers
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const INJECTOR_MARKER = "Midnightcord Injector";

export const DISCORD_CHANNELS = [
    { id: "stable", windows: "Discord", macos: "Discord", linux: "discord" },
    { id: "ptb", windows: "DiscordPTB", macos: "Discord PTB", linux: "discordptb" },
    { id: "canary", windows: "DiscordCanary", macos: "Discord Canary", linux: "discordcanary" },
    { id: "development", windows: "DiscordDevelopment", macos: "Discord Development", linux: "discorddevelopment" }
];

function versionParts(name) {
    return name.replace(/^app-/, "").split(".").map(part => Number.parseInt(part, 10) || 0);
}

function compareVersionDirs(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    const length = Math.max(a.length, b.length);

    for (let index = 0; index < length; index++) {
        const difference = (b[index] || 0) - (a[index] || 0);
        if (difference !== 0) return difference;
    }

    return 0;
}

function hasDiscordPayload(resourcesDir) {
    return existsSync(join(resourcesDir, "app.asar"))
        || existsSync(join(resourcesDir, "_app.asar"))
        || existsSync(join(resourcesDir, "app"));
}

function latestVersionResource(baseDir) {
    if (!existsSync(baseDir)) return null;

    let versions;
    try {
        versions = readdirSync(baseDir)
            .filter(name => /^app-\d+(?:\.\d+)+$/.test(name))
            .sort(compareVersionDirs);
    } catch {
        return null;
    }

    for (const version of versions) {
        const resourcesDir = join(baseDir, version, "resources");
        if (existsSync(resourcesDir) && hasDiscordPayload(resourcesDir)) {
            return { resourcesDir, version: version.slice(4) };
        }
    }

    return null;
}

function addCandidate(candidates, seen, candidate) {
    const resourcesDir = resolve(candidate.resourcesDir);
    if (seen.has(resourcesDir) || !existsSync(resourcesDir) || !hasDiscordPayload(resourcesDir)) return;

    seen.add(resourcesDir);
    candidates.push({ ...candidate, resourcesDir });
}

export function findDiscordResources(options = {}) {
    const platform = options.platform || process.platform;
    const env = options.env || process.env;
    const userHome = options.home || homedir();
    const selectedChannels = new Set(options.channels || DISCORD_CHANNELS.map(channel => channel.id));
    const candidates = [];
    const seen = new Set();

    if (platform === "win32") {
        const localAppData = env.LOCALAPPDATA || "";
        for (const channel of DISCORD_CHANNELS) {
            if (!selectedChannels.has(channel.id)) continue;
            const latest = latestVersionResource(join(localAppData, channel.windows));
            if (latest) addCandidate(candidates, seen, {
                channel: channel.id,
                source: "squirrel",
                ...latest
            });
        }
    } else if (platform === "darwin") {
        const applicationDirs = options.macApplicationDirs || ["/Applications", join(userHome, "Applications")];
        for (const channel of DISCORD_CHANNELS) {
            if (!selectedChannels.has(channel.id)) continue;
            for (const applicationDir of applicationDirs) {
                addCandidate(candidates, seen, {
                    channel: channel.id,
                    source: "application",
                    resourcesDir: join(applicationDir, channel.macos + ".app", "Contents", "Resources")
                });
            }
        }
    } else if (platform === "linux") {
        const configHome = env.XDG_CONFIG_HOME || join(userHome, ".config");
        for (const channel of DISCORD_CHANNELS) {
            if (!selectedChannels.has(channel.id)) continue;
            const latest = latestVersionResource(join(configHome, channel.linux));
            if (latest) addCandidate(candidates, seen, {
                channel: channel.id,
                source: "user-update",
                ...latest
            });
        }

        if (options.includeSystem !== false) {
            const systemResources = {
                stable: [
                    "/usr/share/discord/resources",
                    "/usr/lib/discord/resources",
                    "/opt/discord/resources",
                    "/opt/Discord/resources"
                ],
                ptb: ["/usr/share/discord-ptb/resources", "/opt/discord-ptb/resources"],
                canary: ["/usr/share/discord-canary/resources", "/opt/discord-canary/resources"],
                development: []
            };

            for (const channel of DISCORD_CHANNELS) {
                if (!selectedChannels.has(channel.id)) continue;
                for (const resourcesDir of systemResources[channel.id]) {
                    addCandidate(candidates, seen, {
                        channel: channel.id,
                        source: "system",
                        resourcesDir
                    });
                }
            }
        }
    } else {
        throw new Error("Plateforme non prise en charge: " + platform);
    }

    return candidates;
}

export function isMidnightcordLoader(appDir) {
    const indexPath = join(appDir, "index.js");
    if (!existsSync(indexPath)) return false;

    try {
        return readFileSync(indexPath, "utf8").includes(INJECTOR_MARKER);
    } catch {
        return false;
    }
}

function createLoader(patcherPath) {
    const resolvedPatcher = resolve(patcherPath);
    return [
        "// " + INJECTOR_MARKER + ", generated automatically",
        "\"use strict\";",
        "const fs = require(\"node:fs\");",
        "const path = require(\"node:path\");",
        "const patcherPath = " + JSON.stringify(resolvedPatcher) + ";",
        "const distDir = path.dirname(patcherPath);",
        "const markerPath = path.join(distDir, \"midnightcord-pending-update.json\");",
        "function applyPendingUpdate() {",
        "    if (!fs.existsSync(markerPath)) return;",
        "    const updateDir = distDir + \".update\";",
        "    const previousDir = distDir + \".previous\";",
        "    try {",
        "        const marker = JSON.parse(fs.readFileSync(markerPath, \"utf8\"));",
        "        const stagingDir = path.resolve(marker.stagingDir || \"\");",
        "        const destinationDir = path.resolve(marker.destDir || \"\");",
        "        if (destinationDir !== path.resolve(distDir)) throw new Error(\"Update destination mismatch\");",
        "        if (!fs.existsSync(path.join(stagingDir, \"patcher.js\"))) throw new Error(\"Staged update is incomplete\");",
        "        fs.rmSync(updateDir, { recursive: true, force: true });",
        "        fs.cpSync(stagingDir, updateDir, { recursive: true });",
        "        fs.rmSync(previousDir, { recursive: true, force: true });",
        "        fs.renameSync(distDir, previousDir);",
        "        try {",
        "            fs.renameSync(updateDir, distDir);",
        "        } catch (error) {",
        "            fs.renameSync(previousDir, distDir);",
        "            throw error;",
        "        }",
        "        fs.rmSync(previousDir, { recursive: true, force: true });",
        "        fs.rmSync(stagingDir, { recursive: true, force: true });",
        "        console.log(\"[Midnightcord] Native update applied successfully.\");",
        "    } catch (error) {",
        "        try { fs.rmSync(updateDir, { recursive: true, force: true }); } catch {}",
        "        if (!fs.existsSync(distDir) && fs.existsSync(previousDir)) {",
        "            try { fs.renameSync(previousDir, distDir); } catch {}",
        "        }",
        "        console.error(\"[Midnightcord] Failed to apply staged update:\", error);",
        "    }",
        "}",
        "applyPendingUpdate();",
        "require(patcherPath);",
        ""
    ].join("\n");
}
function writeLoader(appDir, patcherPath) {
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "package.json"), JSON.stringify({
        name: "discord",
        main: "index.js",
        private: true,
        midnightcord: { injected: true }
    }, null, 2) + "\n");
    writeFileSync(join(appDir, "index.js"), createLoader(patcherPath));
}

export function injectResource(resourcesDir, patcherPath) {
    const resolvedResources = resolve(resourcesDir);
    const resolvedPatcher = resolve(patcherPath);
    const appAsarPath = join(resolvedResources, "app.asar");
    const backupPath = join(resolvedResources, "_app.asar");
    const appDirPath = join(resolvedResources, "app");

    if (!existsSync(resolvedPatcher)) {
        throw new Error("patcher.js introuvable: " + resolvedPatcher);
    }

    if (existsSync(appDirPath)) {
        if (!isMidnightcordLoader(appDirPath)) {
            throw new Error("Un autre chargeur utilise deja " + appDirPath);
        }

        const expectedLoader = createLoader(resolvedPatcher);
        const currentLoader = readFileSync(join(appDirPath, "index.js"), "utf8");
        writeLoader(appDirPath, resolvedPatcher);
        return currentLoader === expectedLoader ? "unchanged" : "updated";
    }

    if (existsSync(appAsarPath) && statSync(appAsarPath).isDirectory()) {
        throw new Error("Un dossier tiers utilise " + appAsarPath);
    }

    if (existsSync(appAsarPath) && existsSync(backupPath)) {
        throw new Error("app.asar et _app.asar existent ensemble, restauration manuelle requise");
    }

    let backupCreated = false;
    if (existsSync(appAsarPath)) {
        renameSync(appAsarPath, backupPath);
        backupCreated = true;
    } else if (!existsSync(backupPath)) {
        throw new Error("Aucun app.asar officiel dans " + resolvedResources);
    }

    try {
        writeLoader(appDirPath, resolvedPatcher);
    } catch (error) {
        rmSync(appDirPath, { recursive: true, force: true });
        if (backupCreated && !existsSync(appAsarPath) && existsSync(backupPath)) {
            renameSync(backupPath, appAsarPath);
        }
        throw error;
    }

    return "installed";
}

export function uninjectResource(resourcesDir) {
    const resolvedResources = resolve(resourcesDir);
    const appAsarPath = join(resolvedResources, "app.asar");
    const backupPath = join(resolvedResources, "_app.asar");
    const appDirPath = join(resolvedResources, "app");

    if (!existsSync(appDirPath)) return "unchanged";
    if (!isMidnightcordLoader(appDirPath)) {
        throw new Error("Le chargeur dans " + appDirPath + " n'appartient pas a Midnightcord");
    }
    if (!existsSync(appAsarPath) && !existsSync(backupPath)) {
        throw new Error("Impossible de restaurer Discord car la sauvegarde app.asar est absente");
    }

    rmSync(appDirPath, { recursive: true, force: true });

    if (!existsSync(appAsarPath) && existsSync(backupPath)) {
        renameSync(backupPath, appAsarPath);
        return "restored";
    }

    return "restored-with-backup";
}

export function getInstalledDistDir(options = {}) {
    const platform = options.platform || process.platform;
    const env = options.env || process.env;
    const userHome = options.home || homedir();

    if (platform === "win32") {
        return join(env.APPDATA || env.LOCALAPPDATA || userHome, "Midnightcord", "dist");
    }
    if (platform === "darwin") {
        return join(userHome, "Library", "Application Support", "Midnightcord", "dist");
    }
    return join(env.XDG_DATA_HOME || join(userHome, ".local", "share"), "midnightcord", "dist");
}

export function installDistribution(sourceDist, options = {}) {
    const source = resolve(sourceDist);
    const target = resolve(options.target || getInstalledDistDir(options));
    const temporary = target + ".tmp-" + process.pid;

    if (!existsSync(join(source, "patcher.js"))) {
        throw new Error("Distribution Midnightcord invalide: " + source);
    }

    mkdirSync(dirname(target), { recursive: true });
    rmSync(temporary, { recursive: true, force: true });
    cpSync(source, temporary, {
        recursive: true,
        filter: file => !file.endsWith(".map")
    });

    rmSync(target, { recursive: true, force: true });
    renameSync(temporary, target);
    return target;
}

const LINUX_DESKTOP_MARKER = "X-Midnightcord-Native=true";
const LINUX_EXECUTABLES = {
    stable: { command: "discord", wmClass: "discord" },
    ptb: { command: "discord-ptb", wmClass: "discordptb" },
    canary: { command: "discord-canary", wmClass: "discordcanary" },
    development: { command: "discord-development", wmClass: "discorddevelopment" }
};

export function installLinuxDesktopEntry(options = {}) {
    if ((options.platform || process.platform) !== "linux") return null;

    const userHome = options.home || homedir();
    const env = options.env || process.env;
    const dataHome = env.XDG_DATA_HOME || join(userHome, ".local", "share");
    const applicationsDir = join(dataHome, "applications");
    const desktopPath = join(applicationsDir, "midnightcord.desktop");
    const iconDir = join(dataHome, "icons", "hicolor", "256x256", "apps");
    const iconPath = join(iconDir, "midnightcord.png");
    const channel = options.channel || "stable";
    const executable = LINUX_EXECUTABLES[channel] || LINUX_EXECUTABLES.stable;

    mkdirSync(applicationsDir, { recursive: true });
    if (options.iconSource && existsSync(options.iconSource)) {
        mkdirSync(iconDir, { recursive: true });
        cpSync(options.iconSource, iconPath);
    }

    writeFileSync(desktopPath, [
        "[Desktop Entry]",
        "Name=Midnightcord",
        "Comment=Discord natif avec Midnightcord",
        `Exec=${executable.command} --ozone-platform=auto %U`,
        "Icon=midnightcord",
        "Terminal=false",
        "Type=Application",
        "Categories=Network;InstantMessaging;Chat;",
        "MimeType=x-scheme-handler/discord;",
        `StartupWMClass=${executable.wmClass}`,
        "StartupNotify=true",
        "X-KDE-StartupNotify=true",
        LINUX_DESKTOP_MARKER,
        ""
    ].join("\n"));

    return desktopPath;
}

export function removeLinuxDesktopEntry(options = {}) {
    if ((options.platform || process.platform) !== "linux") return null;

    const userHome = options.home || homedir();
    const env = options.env || process.env;
    const dataHome = env.XDG_DATA_HOME || join(userHome, ".local", "share");
    const desktopPath = join(dataHome, "applications", "midnightcord.desktop");
    const iconPath = join(dataHome, "icons", "hicolor", "256x256", "apps", "midnightcord.png");

    if (existsSync(desktopPath) && readFileSync(desktopPath, "utf8").includes(LINUX_DESKTOP_MARKER)) {
        rmSync(desktopPath, { force: true });
        if (options.purgeIcon) rmSync(iconPath, { force: true });
    }
    return desktopPath;
}

export function removeInstalledDistribution(options = {}) {
    const target = resolve(options.target || getInstalledDistDir(options));
    rmSync(target, { recursive: true, force: true });
    return target;
}
