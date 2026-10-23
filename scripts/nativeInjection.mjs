/*
 * Midnightcord native Discord injection helpers
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import {
    closeSync,
    cpSync,
    existsSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readSync,
    readdirSync,
    realpathSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, resolve, win32 } from "node:path";

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

// Only inspect archive metadata and bytes. Never load or execute another mod.
function readAsarMetadata(path) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 16) throw new Error("Archive non régulière");
    const fd = openSync(path, "r");
    try {
        const prefix = Buffer.alloc(16);
        if (readSync(fd, prefix, 0, 16, 0) !== 16 || prefix.readUInt32LE(0) !== 4) throw new Error("Archive invalide");
        const headerLength = prefix.readUInt32LE(12);
        const dataOffset = 8 + prefix.readUInt32LE(4);
        if (headerLength < 2 || headerLength > 16 * 1024 * 1024 || dataOffset < 16 + headerLength
            || dataOffset > stat.size || dataOffset - 16 - headerLength > 3) throw new Error("En-tête invalide");
        const header = Buffer.alloc(headerLength);
        if (readSync(fd, header, 0, headerLength, 16) !== headerLength) throw new Error("En-tête incomplet");
        return { files: JSON.parse(header.toString("utf8")).files, dataOffset, size: stat.size };
    } finally { closeSync(fd); }
}

function readAsarFile(path, archive, name, maxSize = 64 * 1024) {
    const entry = archive.files?.[name];
    const offset = Number(entry?.offset);
    if (!entry || entry.link || entry.unpacked || entry.files || !Number.isSafeInteger(entry.size) || entry.size < 1
        || entry.size > maxSize || !Number.isSafeInteger(offset) || offset < 0
        || archive.dataOffset + offset + entry.size > archive.size) throw new Error("Entrée non prise en charge");
    const fd = openSync(path, "r");
    try {
        const bytes = Buffer.alloc(entry.size);
        if (readSync(fd, bytes, 0, entry.size, archive.dataOffset + offset) !== entry.size) throw new Error("Entrée incomplète");
        return bytes.toString("utf8");
    } finally { closeSync(fd); }
}

function isVencordStub(index, pkg) {
    if (pkg.name !== "discord" || pkg.main !== "index.js" || Object.keys(pkg).some(key => !["name", "main"].includes(key))) return false;
    const match = /^\s*require\(("(?:[^"\\]|\\.)*")\);?\s*$/.exec(index);
    if (!match) return false;
    const patcher = JSON.parse(match[1]);
    const normalized = patcher.replace(/\\/g, "/");
    return (win32.isAbsolute(patcher) || posix.isAbsolute(patcher)) && !normalized.split("/").includes("..")
        && /\/(?:Vencord|VencordData)\/dist\/patcher\.js$/i.test(normalized);
}

function isDiscordArchive(path) {
    const archive = readAsarMetadata(path);
    const pkg = JSON.parse(readAsarFile(path, archive, "package.json"));
    // A known Discord bootstrap is required. OpenAsar/custom archives need their own uninstaller.
    if (pkg.name !== "discord" || typeof pkg.main !== "string") return false;
    const main = pkg.main.replace(/^\.\//, "");
    const bootstrap = main === "bundle.js" ? archive.files?.[main]
        : main === "app_bootstrap/index.js" ? archive.files?.app_bootstrap?.files?.["index.js"] : null;
    return !!bootstrap && !bootstrap.link && !bootstrap.unpacked && !bootstrap.files
        && Number.isSafeInteger(bootstrap.size) && bootstrap.size > 0
        && Number.isSafeInteger(Number(bootstrap.offset)) && Number(bootstrap.offset) >= 0
        && archive.dataOffset + Number(bootstrap.offset) + bootstrap.size <= archive.size;
}

export function detectVencordInstallation(resourcesDir) {
    const resources = resolve(resourcesDir);
    try {
        if (!lstatSync(resources).isDirectory() || lstatSync(resources).isSymbolicLink()) return null;
        const app = join(resources, "app");
        const asar = join(resources, "app.asar");
        const backup = join(resources, "_app.asar");
        let layout;
        let index;
        let pkg;
        if (existsSync(app)) {
            if (!lstatSync(app).isDirectory() || lstatSync(app).isSymbolicLink() || existsSync(backup)
                || readdirSync(app).sort().join(",") !== "index.js,package.json") return null;
            for (const name of ["index.js", "package.json"]) {
                const stat = lstatSync(join(app, name));
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return null;
            }
            index = readFileSync(join(app, "index.js"), "utf8");
            pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
            if (!isDiscordArchive(asar)) return null;
            layout = "directory";
        } else {
            if (lstatSync(asar).size > 64 * 1024 || !isDiscordArchive(backup)) return null;
            const archive = readAsarMetadata(asar);
            if (Object.keys(archive.files).sort().join(",") !== "index.js,package.json") return null;
            index = readAsarFile(asar, archive, "index.js");
            pkg = JSON.parse(readAsarFile(asar, archive, "package.json"));
            const entries = Object.values(archive.files).sort((a, b) => Number(a.offset) - Number(b.offset));
            if (Number(entries[0].offset) !== 0 || Number(entries[1].offset) !== entries[0].size
                || archive.dataOffset + entries[0].size + entries[1].size !== archive.size) return null;
            layout = "asar";
        }
        return isVencordStub(index, pkg) ? { layout } : null;
    } catch { return null; }
}

export function migrateVencordResource(resourcesDir, patcherPath, options = {}) {
    const resources = resolve(resourcesDir);
    const canonical = realpathSync(resources);
    if ((process.platform === "win32" ? canonical.toLowerCase() !== resources.toLowerCase() : canonical !== resources)) throw new Error("Le chemin Discord doit être canonique.");
    const detected = detectVencordInstallation(resources);
    if (!detected) throw new Error("Installation Vencord non reconnue. Retirez Vencord avec son installateur, puis installez Midnightcord.");
    const patcher = lstatSync(resolve(patcherPath));
    if (!patcher.isFile() || patcher.isSymbolicLink()) throw new Error("Le build Midnightcord est absent ou invalide.");
    const recoveryDir = join(resources, ".midnightcord-vencord-recovery-" + randomUUID());
    const staged = join(recoveryDir, "midnightcord-loader");
    const journal = [];
    // Injection-only dependency for deterministic filesystem failure tests.
    const move = options.renameSync ?? renameSync;
    const relocate = (from, to) => { move(from, to); journal.push([from, to]); };
    mkdirSync(recoveryDir, { mode: 0o700 });
    try {
        writeLoader(staged, patcherPath);
        writeFileSync(join(recoveryDir, "recovery.json"), JSON.stringify({
            version: 1, source: "Vencord", layout: detected.layout, resources, createdAt: new Date().toISOString(),
            instructions: "Close Discord. Remove only the Midnightcord app loader. For asar layout, move the saved app.asar here back to resources/app.asar and keep resources/_app.asar. For directory layout, restore resources/_app.asar to resources/app.asar and move the saved app directory back to resources/app. Vencord user data was not changed."
        }, null, 2) + "\n", { mode: 0o600 });
        const latest = detectVencordInstallation(resources);
        if (latest?.layout !== detected.layout) throw new Error("L’installation Discord a changé. Actualisez avant de recommencer.");
        if (detected.layout === "asar") {
            relocate(join(resources, "app.asar"), join(recoveryDir, "app.asar"));
            relocate(join(resources, "_app.asar"), join(resources, "app.asar"));
        } else {
            relocate(join(resources, "app"), join(recoveryDir, "app"));
        }
        relocate(join(resources, "app.asar"), join(resources, "_app.asar"));
        relocate(staged, join(resources, "app"));
        return { status: "migrated", recoveryDir };
    } catch (error) {
        try {
            for (const [from, to] of journal.reverse()) renameSync(to, from);
        } catch (rollbackError) {
            throw new Error("Migration interrompue. La sauvegarde de récupération est conservée dans " + recoveryDir + ". Restaurez-la avant de relancer Discord.", { cause: rollbackError });
        }
        rmSync(recoveryDir, { recursive: true, force: true });
        throw error;
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
    const previous = target + ".previous-" + randomUUID();

    if (!existsSync(join(source, "patcher.js"))) {
        throw new Error("Distribution Midnightcord invalide: " + source);
    }

    mkdirSync(dirname(target), { recursive: true });
    rmSync(temporary, { recursive: true, force: true });
    let previousMoved = false;
    try {
        cpSync(source, temporary, {
            recursive: true,
            filter: file => !file.endsWith(".map")
        });
        if (existsSync(target)) {
            renameSync(target, previous);
            previousMoved = true;
        }
        try {
            renameSync(temporary, target);
        } catch (error) {
            if (previousMoved) {
                try { renameSync(previous, target); }
                catch {
                    throw new Error("Impossible de remplacer le build ni de le restaurer. Le build precedent est conserve dans " + previous, { cause: error });
                }
            }
            throw error;
        }
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
    if (previousMoved) {
        try { rmSync(previous, { recursive: true, force: true }); } catch {}
    }
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
        `Exec=${executable.command} %U`,
        "Icon=midnightcord",
        "Terminal=false",
        "Type=Application",
        "Categories=Network;InstantMessaging;Chat;",
        "MimeType=x-scheme-handler/discord;",
        "Actions=Restart;Quit;",
        `StartupWMClass=${executable.wmClass}`,
        "StartupNotify=true",
        "X-KDE-StartupNotify=true",
        LINUX_DESKTOP_MARKER,
        "",
        "[Desktop Action Restart]",
        "Name=Restart Midnightcord",
        `Exec=${executable.command} --midnightcord-restart`,
        "",
        "[Desktop Action Quit]",
        "Name=Quit Midnightcord",
        `Exec=${executable.command} --midnightcord-quit`,
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
