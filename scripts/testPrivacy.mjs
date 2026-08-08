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
    /nightcord\.st/i,
    /mellowtel/i,
    /Vencord_cloud/,
    /MIDNIGHTCORD_ASAR_URL/,
    /MIDNIGHTCORD_UPDATE_URL/
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

const updaterSource = readFileSync(join(rootDir, "src", "main", "updater", "http.ts"), "utf8");
assert(updaterSource.includes('const REPOSITORY = "Karmahghosting/midnightcord"'), "Updater must be locked to the Midnightcord GitHub repository");
assert(updaterSource.includes('createHash("sha256")'), "Native updater must verify SHA256");
assert(!updaterSource.includes("source."), "Native updater must not use a legacy source host");

const nativePackageScript = readFileSync(join(rootDir, "package.json"), "utf8");
assert(!/package:native[^\n]+disable-updater/.test(nativePackageScript), "Native release builds must include the GitHub updater");

const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
assert(!packageJson.dependencies?.mellowtel, "Mellowtel must not be a dependency");

const fakeVoiceSource = readFileSync(join(rootDir, "src", "midnightcordplugins", "FakeVoice", "index.tsx"), "utf8");
assert(/name:\s*"FakeVoice"[\s\S]*?enabledByDefault:\s*false/.test(fakeVoiceSource), "Fake Voice must remain disabled by default");

const userAreaSource = readFileSync(join(rootDir, "src", "api", "UserArea.tsx"), "utf8");
assert(userAreaSource.includes("> :not(.vc-user-area-btns):not(style)"), "Native user-area controls must remain protected from shrinking");

const noTrack = readFileSync(join(rootDir, "src", "plugins", "_core", "noTrack.ts"), "utf8");
assert(/required:\s*true/.test(noTrack), "NoTrack must remain required");
assert(/disableAnalytics[\s\S]*?default:\s*true/.test(noTrack), "Discord analytics blocking must remain enabled by default");

const settingsSource = readFileSync(join(rootDir, "src", "plugins", "_core", "settings.tsx"), "utf8");
assert(settingsSource.includes('typeof rawSettingsLocation === "string"'), "Settings location must be validated before use");
assert(settingsSource.includes("return originalLayout"), "Settings injection must fall back to Discord's original layout");

for (const relativePath of [
    ["src", "renderer", "patches", "streamerMode.ts"],
    ["src", "midnightcord", "renderer", "patches", "streamerMode.ts"]
]) {
    const streamerModeSource = readFileSync(join(rootDir, ...relativePath), "utf8");
    assert(!streamerModeSource.includes("STREAMING_AUTO_STREAMER_MODE"), "Streamer Mode must use Discord's native support predicate");
}

console.log("[test] Privacy regression checks passed.");
