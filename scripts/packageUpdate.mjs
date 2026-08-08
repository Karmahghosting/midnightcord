/*
 * Build the platform-independent Midnightcord native update payload
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { strToU8, zipSync } from "fflate";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const sourceDir = join(rootDir, "dist", "desktop");
const outputDir = join(rootDir, "release", "update");
const artifactName = `Midnightcord-Update-${packageJson.version}.zip`;
const artifactPath = join(outputDir, artifactName);

for (const required of ["patcher.js", "preload.js", "renderer.js", "package.json"]) {
    if (!existsSync(join(sourceDir, required))) {
        throw new Error(`Update payload is missing ${required}. Build Midnightcord first.`);
    }
}

const entries = {};
function collect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = join(directory, entry.name);
        if (entry.isDirectory()) {
            collect(absolutePath);
            continue;
        }
        if (absolutePath.endsWith(".map")) continue;

        const archivePath = relative(sourceDir, absolutePath).split(sep).join("/");
        entries[archivePath] = readFileSync(absolutePath);
    }
}

collect(sourceDir);
entries["midnightcord-update.json"] = strToU8(JSON.stringify({
    version: packageJson.version,
    files: Object.keys(entries).sort()
}, null, 2) + "\n");

mkdirSync(outputDir, { recursive: true });
const archive = Buffer.from(zipSync(entries, { level: 9 }));
writeFileSync(artifactPath, archive);

const checksum = createHash("sha256").update(archive).digest("hex");
writeFileSync(artifactPath + ".sha256", `${checksum}  ${artifactName}\n`);

const standaloneSource = join(rootDir, "dist", "midnightcord.asar");
if (existsSync(standaloneSource)) {
    const standaloneName = "Midnightcord-Standalone.asar";
    const standaloneData = readFileSync(standaloneSource);
    const standalonePath = join(outputDir, standaloneName);
    const standaloneHash = createHash("sha256").update(standaloneData).digest("hex");
    writeFileSync(standalonePath, standaloneData);
    writeFileSync(standalonePath + ".sha256", `${standaloneHash}  ${standaloneName}\n`);
    console.log(`[package] Standalone repair payload created: ${standalonePath}`);
}

console.log(`[package] Update payload created: ${artifactPath}`);
console.log(`[package] SHA256: ${checksum}`);
