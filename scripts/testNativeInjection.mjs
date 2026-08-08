/*
 * Tests for the native Discord injector
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    findDiscordResources,
    injectResource,
    installDistribution,
    isMidnightcordLoader,
    uninjectResource
} from "./nativeInjection.mjs";

const root = mkdtempSync(join(tmpdir(), "midnightcord-inject-test-"));

try {
    const patcher = join(root, "build", "patcher.js");
    mkdirSync(join(root, "build"), { recursive: true });
    writeFileSync(patcher, "module.exports = {};\n");

    const resources = join(root, "Discord", "app-1.0.10", "resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "app.asar"), "official-discord");

    assert.equal(injectResource(resources, patcher), "installed");
    assert.equal(existsSync(join(resources, "app.asar")), false);
    assert.equal(readFileSync(join(resources, "_app.asar"), "utf8"), "official-discord");
    assert.equal(isMidnightcordLoader(join(resources, "app")), true);
    assert.equal(injectResource(resources, patcher), "unchanged");

    assert.equal(uninjectResource(resources), "restored");
    assert.equal(readFileSync(join(resources, "app.asar"), "utf8"), "official-discord");
    assert.equal(existsSync(join(resources, "_app.asar")), false);
    assert.equal(existsSync(join(resources, "app")), false);

    const conflictResources = join(root, "conflict", "resources");
    mkdirSync(join(conflictResources, "app"), { recursive: true });
    writeFileSync(join(conflictResources, "app.asar"), "official");
    writeFileSync(join(conflictResources, "app", "index.js"), "require('another-mod');\n");
    assert.throws(() => injectResource(conflictResources, patcher), /autre chargeur/);
    assert.equal(readFileSync(join(conflictResources, "app.asar"), "utf8"), "official");

    const localAppData = join(root, "LocalAppData");
    const oldResources = join(localAppData, "Discord", "app-1.0.2", "resources");
    const newResources = join(localAppData, "Discord", "app-1.0.10", "resources");
    mkdirSync(oldResources, { recursive: true });
    mkdirSync(newResources, { recursive: true });
    writeFileSync(join(oldResources, "app.asar"), "old");
    writeFileSync(join(newResources, "app.asar"), "new");

    const windowsTargets = findDiscordResources({
        platform: "win32",
        env: { LOCALAPPDATA: localAppData },
        home: root
    });
    assert.equal(windowsTargets.length, 1);
    assert.equal(windowsTargets[0].version, "1.0.10");
    assert.equal(windowsTargets[0].resourcesDir, newResources);

    const applications = join(root, "Applications");
    const macResources = join(applications, "Discord Canary.app", "Contents", "Resources");
    mkdirSync(macResources, { recursive: true });
    writeFileSync(join(macResources, "app.asar"), "mac");

    const macTargets = findDiscordResources({
        platform: "darwin",
        channels: ["canary"],
        home: root,
        macApplicationDirs: [applications]
    });
    assert.equal(macTargets.length, 1);
    assert.equal(macTargets[0].channel, "canary");

    const sourceDist = join(root, "source-dist");
    const installedDist = join(root, "installed-dist");
    mkdirSync(sourceDist, { recursive: true });
    writeFileSync(join(sourceDist, "patcher.js"), "patcher");
    writeFileSync(join(sourceDist, "patcher.js.map"), "map");
    assert.equal(installDistribution(sourceDist, { target: installedDist }), installedDist);
    assert.equal(readFileSync(join(installedDist, "patcher.js"), "utf8"), "patcher");
    assert.equal(existsSync(join(installedDist, "patcher.js.map")), false);

    console.log("[test] Native injection tests passed.");
} finally {
    rmSync(root, { recursive: true, force: true });
}
