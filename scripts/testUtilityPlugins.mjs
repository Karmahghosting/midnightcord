/*
 * Targeted utility-plugin regression suite, shared by local development and CI
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const plugins = ["audioProfiles", "betterSessions", "messageReminders", "secretGuard", "imageOptimizer", "localOCR"];
const tests = [];

function collectTests(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) collectTests(path);
        else if (entry.name.endsWith(".test.ts")) tests.push(path);
    }
}

for (const plugin of plugins) collectTests(join(rootDir, "src", "midnightcordplugins", plugin));
if (!tests.length) throw new Error("No utility-plugin tests found.");
const checks = [
    [require.resolve("tsx/cli"), "--test", ...tests.sort()],
    [join(rootDir, "scripts", "testMessageValidators.mjs")],
    [join(rootDir, "scripts", "testLocalOcr.mjs")]
];

console.log(`Utility-plugin checks on ${process.platform}/${process.arch} (${tests.length} TypeScript test files)`);
for (const args of checks) {
    const result = spawnSync(process.execPath, args, { cwd: rootDir, stdio: "inherit", windowsHide: true, timeout: 120_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
    }
}
