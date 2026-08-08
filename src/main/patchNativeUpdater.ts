/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync
} from "original-fs";
import { basename, dirname, join, resolve } from "path";

const LOADER_MARKER = "Midnightcord Injector";
const VERSION_DIRECTORY = /^app-(\d+(?:\.\d+)+)$/;

interface LoaderSnapshot {
    index: string;
    packageJson: string;
}

function fileSize(file: string) {
    try {
        const stat = statSync(file);
        return stat.isFile() ? stat.size : 0;
    } catch {
        return 0;
    }
}

function isRegularFile(file: string) {
    try {
        return statSync(file).isFile();
    } catch {
        return false;
    }
}

function readLoaderSnapshot(injectorPath: string): LoaderSnapshot | null {
    try {
        const loaderDir = dirname(injectorPath);
        const index = readFileSync(injectorPath, "utf8");
        if (!index.includes(LOADER_MARKER)) return null;

        const packagePath = join(loaderDir, "package.json");
        const packageJson = existsSync(packagePath)
            ? readFileSync(packagePath, "utf8")
            : JSON.stringify({ name: "discord", main: "index.js", private: true }, null, 2) + "\n";

        return { index, packageJson };
    } catch (error) {
        console.error("[Midnightcord] Could not read the native loader:", error);
        return null;
    }
}

function compareVersions(left: string, right: string) {
    const leftParts = left.split(".").map(part => Number.parseInt(part, 10) || 0);
    const rightParts = right.split(".").map(part => Number.parseInt(part, 10) || 0);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index++) {
        const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (difference !== 0) return difference;
    }

    return 0;
}

function repairResourcesDir(resourcesDir: string, loader: LoaderSnapshot) {
    const targetResources = resolve(resourcesDir);
    const appDir = join(targetResources, "app");
    const appAsar = join(targetResources, "app.asar");
    const backupAsar = join(targetResources, "_app.asar");
    const indexPath = join(appDir, "index.js");
    const packagePath = join(appDir, "package.json");

    try {
        if (!existsSync(targetResources)) return;

        if (existsSync(appDir)) {
            const currentLoader = isRegularFile(indexPath) ? readFileSync(indexPath, "utf8") : "";
            if (!currentLoader.includes(LOADER_MARKER)) {
                console.warn("[Midnightcord] Another loader owns " + appDir + ", leaving it unchanged.");
                return;
            }

            if (currentLoader !== loader.index) writeFileSync(indexPath, loader.index);
            if (!existsSync(packagePath) || readFileSync(packagePath, "utf8") !== loader.packageJson) {
                writeFileSync(packagePath, loader.packageJson);
            }
            return;
        }

        if (fileSize(appAsar) < 1_000_000 || existsSync(backupAsar)) return;

        renameSync(appAsar, backupAsar);
        try {
            mkdirSync(appDir, { recursive: true });
            writeFileSync(packagePath, loader.packageJson);
            writeFileSync(indexPath, loader.index);
            console.info("[Midnightcord] Restored native injection in " + targetResources);
        } catch (error) {
            rmSync(appDir, { recursive: true, force: true });
            if (!existsSync(appAsar) && existsSync(backupAsar)) renameSync(backupAsar, appAsar);
            throw error;
        }
    } catch (error) {
        console.error("[Midnightcord] Could not repair native injection in " + targetResources + ":", error);
    }
}

function repairNewVersionDirectories(currentResources: string, loader: LoaderSnapshot) {
    const currentVersionDir = dirname(currentResources);
    const currentMatch = VERSION_DIRECTORY.exec(basename(currentVersionDir));
    if (!currentMatch) return;

    const installRoot = dirname(currentVersionDir);
    let entries: string[];
    try {
        entries = readdirSync(installRoot);
    } catch {
        return;
    }

    for (const entry of entries) {
        const match = VERSION_DIRECTORY.exec(entry);
        if (!match || compareVersions(match[1], currentMatch[1]) <= 0) continue;
        const versionDir = join(installRoot, entry);
        if (!isRegularFile(join(versionDir, basename(process.execPath)))) continue;
        repairResourcesDir(join(versionDir, "resources"), loader);
    }
}

export function startNativeUpdateRepair(injectorPath: string) {
    const loader = readLoaderSnapshot(injectorPath);
    if (!loader) return;

    const repair = () => {
        repairResourcesDir(process.resourcesPath, loader);
        repairNewVersionDirectories(process.resourcesPath, loader);
    };

    repair();
    const timer = setInterval(repair, 2 * 60 * 1000);
    timer.unref();
    app.on("before-quit", repair);
}
