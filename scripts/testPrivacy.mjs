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

const customProfileSource = readFileSync(join(rootDir, "src", "midnightcordplugins", "customProfile", "index.tsx"), "utf8");
for (const forbiddenPattern of [
    /FluxDispatcher\.subscribe\("CURRENT_USER_UPDATE"/,
    /Object\.defineProperty\(UserClass\.prototype,\s*"premiumType"/,
    /const staffProps =/,
    /event\.user\.premiumType\s*=\s*2/,
    /return isEnabled && storedData\.badgeFlags/,
    /return data\.badgeFlags/,
    /prop === "premiumSince"[\s\S]{0,250}getFakeNitroDate/,
    /prop === "premiumGuildSince"[\s\S]{0,350}getFakeBoostDate/,
    /delete\s+\(u as any\)\.premiumType/
]) {
    assert(!forbiddenPattern.test(customProfileSource), `CustomProfile must not alter Discord account entitlements: ${forbiddenPattern}`);
}
assert.equal(
    customProfileSource.match(/if \(prop === "premiumType"\) \{\s*return target\.premiumType;/g)?.length,
    2,
    "CustomProfile user proxies must expose the real premium type"
);

const injectorSource = readFileSync(join(rootDir, "scripts", "inject.mjs"), "utf8");
assert(injectorSource.includes('if (!args.includes("--no-copy"))'), "Native injection must install the current build by default");

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

const instantScreenshareSource = readFileSync(join(rootDir, "src", "plugins", "instantScreenshare", "utils.tsx"), "utf8");
assert(/instantScreenshare:\s*\{[\s\S]*?default:\s*false/.test(instantScreenshareSource), "Automatic screenshare must remain opt-in");

const midnightcordSettingsSource = readFileSync(join(rootDir, "src", "components", "settings", "tabs", "vencord", "index.tsx"), "utf8");
assert(!midnightcordSettingsSource.includes("UserStore"), "Midnightcord settings must not call a missing lazy UserStore");
assert(!midnightcordSettingsSource.includes("<Select"), "Midnightcord settings must not depend on Discord's unstable lazy Select");

const trayMenuSource = readFileSync(join(rootDir, "src", "main", "trayMenu.ts"), "utf8");
assert(trayMenuSource.includes("Menu.buildFromTemplate ="), "The native Discord tray menu must be patched");
assert(trayMenuSource.includes("Restart Midnightcord"), "The native tray menu must provide restart");
assert(trayMenuSource.includes('item.label?.includes("Midnightcord")'), "The tray menu must not inject itself recursively");
assert(trayMenuSource.includes("return hasOpenOrShow && hasQuit && isNotAppMenu"), "Only the native tray menu may be patched");

const rendererStartupSource = readFileSync(join(rootDir, "src", "Vencord.ts"), "utf8");
assert(rendererStartupSource.includes("openSettingsTabModal(UpdaterTab)"), "Startup updates must open the updater popup");

const badgeApiSource = readFileSync(join(rootDir, "src", "plugins", "_api", "badges", "index.tsx"), "utf8");
assert(badgeApiSource.includes('const MIDNIGHTCORD_BADGE_ENDPOINT = "https://api.midnightcord.fr/v1/badge"'), "Midnightcord badges must use the isolated API host");
assert(badgeApiSource.includes('method: "POST"'), "Badge lookups must query one profile at a time");
assert(badgeApiSource.includes('"X-Midnightcord-Client": MIDNIGHTCORD_CLIENT_MARKER'), "Badge lookups must carry the client marker");
assert(badgeApiSource.includes("body: JSON.stringify({ userId })"), "Badge lookups must send only one user ID");
assert(!badgeApiSource.includes("https://midnightcord.fr/api/badges"), "The website must not serve badge data");
assert(!badgeApiSource.includes("const midnightcordBadges = await loadBadges"), "The client must never download the full Midnightcord badge list");

assert(!midnightcordSettingsSource.includes("DEV_TEAM_IDS"), "Creator and admin cards must be removed");
assert(!midnightcordSettingsSource.includes("Midnightcord Channel"), "The obsolete channel action must be removed");
assert(midnightcordSettingsSource.includes('text="Ko-fi"'), "Quick actions must link to Ko-fi");
assert(midnightcordSettingsSource.includes("https://ko-fi.com/midnightcord"), "Ko-fi must use the official Midnightcord page");
assert(!existsSync(join(rootDir, "src", "midnightcord", "renderer", "components", "ContributeModal.tsx")), "The crypto donation modal must be removed");

const changelogManagerSource = readFileSync(join(rootDir, "src", "components", "settings", "tabs", "changelog", "changelogManager.ts"), "utf8");
assert(changelogManagerSource.includes("memoryDataStore"), "Changelog storage must have an in-memory fallback");
assert(changelogManagerSource.includes("disablePersistentDataStore"), "IndexedDB failures must be contained");

const branchPickerSource = readFileSync(join(rootDir, "src", "midnightcord", "renderer", "components", "settings", "DiscordBranchPicker.tsx"), "utf8");
assert(branchPickerSource.includes("<select"), "The standalone settings must use a native branch selector");
assert(!branchPickerSource.includes("@Midnightcord/types/webpack/common"), "The branch selector must not depend on Discord lazy modules");

const rendererUtilsSource = readFileSync(join(rootDir, "src", "midnightcord", "renderer", "utils.ts"), "utf8");
assert(rendererUtilsSource.includes("navigator.platform.toLowerCase()"), "CachyOS must have a platform detection fallback");

const packageLinuxSource = readFileSync(join(rootDir, "scripts", "packageLinux.mjs"), "utf8");
const fetchArrpcSource = readFileSync(join(rootDir, "scripts", "build", "fetchArrpc.mjs"), "utf8");
assert(packageLinuxSource.includes('await fetchArrpcBinary("linux", requestedArch)'), "Linux packages must bundle the Rich Presence relay");
assert(fetchArrpcSource.includes('const ARRPC_VERSION = "1.3.5"'), "The Rich Presence relay version must be pinned");
assert(fetchArrpcSource.includes("checksum mismatch"), "The Rich Presence relay must be checksum verified before packaging");

const afterPackSource = readFileSync(join(rootDir, "scripts", "build", "afterPack.mjs"), "utf8");
assert(afterPackSource.includes("Required arRPC binary not found"), "Packaging must fail when the Rich Presence relay is missing");
assert(!afterPackSource.includes("Warning: arRPC binary not found"), "Packaging must never silently omit the Rich Presence relay");

console.log("[test] Privacy regression checks passed.");
