/*
 * Release privacy regression checks
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const forbidden = [
    /api\.nightcord\.st/i,
    /social\.nightcord\.st/i,
    /mellowtel/i,
    /Vencord_cloud/
];

function collectFiles(directory) {
    if (!existsSync(directory)) return [];

    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...collectFiles(path));
        else if (!path.endsWith(".map")) files.push(path);
    }
    return files;
}

function assertClean(files, label) {
    for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const pattern of forbidden) {
            assert(!pattern.test(content), `${label}: forbidden marker ${pattern} in ${file}`);
        }
    }
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);
const sourceFiles = collectFiles(join(rootDir, "src")).filter(file => sourceExtensions.has(extname(file)));
const desktopFiles = collectFiles(join(rootDir, "dist", "desktop")).filter(file => [".js", ".css", ".json"].includes(extname(file)));

assert(desktopFiles.length > 0, "dist/desktop is missing. Build the native distribution first.");
assertClean(sourceFiles, "source");
assertClean(desktopFiles, "desktop build");

const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
assert(!packageJson.dependencies?.mellowtel, "Mellowtel must not be a dependency");

const noTrack = readFileSync(join(rootDir, "src", "plugins", "_core", "noTrack.ts"), "utf8");
assert(/required:\s*true/.test(noTrack), "NoTrack must remain required");
assert(/disableAnalytics[\s\S]*?default:\s*true/.test(noTrack), "Discord analytics blocking must remain enabled by default");

console.log("[test] Privacy regression checks passed.");
