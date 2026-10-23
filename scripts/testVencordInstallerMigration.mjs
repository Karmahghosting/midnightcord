/* Vencord-to-Midnightcord installer regression tests. SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";

import { createInstaller } from "../installer/core.mjs";
import { detectVencordInstallation, isMidnightcordLoader, migrateVencordResource, uninjectResource } from "./nativeInjection.mjs";

// ASAR fixtures use the format written by the upstream Vencord installer:
// https://github.com/Vencord/Installer/blob/main/app_asar.go
function asar(contents) {
    const files = {};
    const bodies = [];
    let offset = 0;
    for (const [name, text] of Object.entries(contents)) {
        const body = Buffer.from(text);
        let directory = files;
        const parts = name.split("/");
        const leaf = parts.pop();
        for (const part of parts) directory = (directory[part] ??= { files: {} }).files;
        directory[leaf] = { size: body.length, offset: String(offset) };
        bodies.push(body);
        offset += body.length;
    }
    const metadata = Buffer.from(JSON.stringify({ files }));
    const aligned = Math.ceil(metadata.length / 4) * 4;
    const header = Buffer.alloc(16 + aligned);
    [4, aligned + 8, aligned + 4, metadata.length].forEach((value, i) => header.writeUInt32LE(value, i * 4));
    metadata.copy(header, 16);
    return Buffer.concat([header, ...bodies]);
}

function snapshot(root) {
    const data = {};
    function visit(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) { data[relative(root, path)] = "directory"; visit(path); }
            else data[relative(root, path)] = createHash("sha256").update(readFileSync(path)).digest("hex");
        }
    }
    visit(root);
    return data;
}

function fixture(t, layout = "asar", patcher = "C:\\Users\\Fixture\\AppData\\Roaming\\Vencord\\dist\\patcher.js") {
    // macOS exposes /var through /private/var. Production discovery already
    // canonicalizes targets; direct transaction tests must use the same paths.
    const root = mkdtempSync(join(realpathSync(tmpdir()), "midnightcord-vencord-migration-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const resources = join(root, "Discord", "resources");
    const sourceDist = join(root, "payload");
    mkdirSync(resources, { recursive: true });
    mkdirSync(sourceDist);
    writeFileSync(join(sourceDist, "patcher.js"), "// Midnightcord fixture; never executed\n");
    const original = asar({ "package.json": JSON.stringify({ name: "discord", main: "app_bootstrap/index.js" }), "app_bootstrap/index.js": "// official bootstrap fixture\n" });
    const stub = { "index.js": `require(${JSON.stringify(patcher)})`, "package.json": '{"name":"discord","main":"index.js"}' };
    if (layout === "asar") {
        writeFileSync(join(resources, "_app.asar"), original);
        writeFileSync(join(resources, "app.asar"), asar(stub));
    } else {
        writeFileSync(join(resources, "app.asar"), original);
        mkdirSync(join(resources, "app"));
        for (const [name, data] of Object.entries(stub)) writeFileSync(join(resources, "app", name), data);
    }
    const profile = join(root, "Vencord", "settings");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "settings.json"), '{"plugins":{"Example":{"enabled":true}}}');
    const options = {
        sourceDist, home: root, env: { APPDATA: join(root, "appdata"), XDG_DATA_HOME: join(root, "data") },
        findTargets: () => [{ channel: "stable", resourcesDir: resources }], listRunning: async () => []
    };
    return { root, resources, profile, sourceDist, original, options, patcher: join(sourceDist, "patcher.js") };
}

for (const [platform, patcher] of [
    ["win32", "C:\\Users\\Example\\AppData\\Roaming\\Vencord\\dist\\patcher.js"],
    ["darwin", "/Users/example/Library/Application Support/Vencord/dist/patcher.js"],
    ["linux", "/home/example/.config/Vencord/dist/patcher.js"]
]) test(`${platform}: recognized Vencord migrates only through explicit action and preserves settings`, async t => {
    const f = fixture(t, "asar", patcher);
    const app = createInstaller({ ...f.options, platform });
    const state = await app.scan();
    assert.equal(state.targets[0].vencord, true);
    const before = snapshot(f.resources);
    const profileBefore = snapshot(f.profile);
    const targetIds = [state.targets[0].id];
    assert.equal((await app.perform({ action: "install", targetIds })).ok, false);
    assert.deepEqual(snapshot(f.resources), before);
    const result = await app.perform({ action: "migrate-vencord", targetIds });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(isMidnightcordLoader(join(f.resources, "app")), true);
    assert.deepEqual(readFileSync(join(f.resources, "_app.asar")), f.original);
    assert(existsSync(join(result.results[0].recoveryDir, "app.asar")));
    assert.deepEqual(snapshot(f.profile), profileBefore);
    assert.equal(uninjectResource(f.resources), "restored");
    assert.deepEqual(readFileSync(join(f.resources, "app.asar")), f.original);
});

test("legacy directory loader migrates with an intact recovery copy", t => {
    const f = fixture(t, "directory");
    assert.deepEqual(detectVencordInstallation(f.resources), { layout: "directory" });
    const before = snapshot(join(f.resources, "app"));
    const result = migrateVencordResource(f.resources, f.patcher);
    assert.deepEqual(snapshot(join(result.recoveryDir, "app")), before);
    assert.deepEqual(readFileSync(join(f.resources, "_app.asar")), f.original);
});

test("current Discord bundle.js archive format is recognized", t => {
    const f = fixture(t);
    const archive = asar({ "package.json": '{"name":"discord","main":"bundle.js","description":"Discord Client for Desktop - Bootstrapper"}', "bundle.js": "// bundled official fixture" });
    writeFileSync(join(f.resources, "_app.asar"), archive);
    assert.deepEqual(detectVencordInstallation(f.resources), { layout: "asar" });
    migrateVencordResource(f.resources, f.patcher);
    assert.deepEqual(readFileSync(join(f.resources, "_app.asar")), archive);
});

for (const layout of ["asar", "directory"]) test(`${layout}: each failed rename restores the exact original installation`, t => {
    for (let failAt = 1; failAt <= (layout === "asar" ? 4 : 3); failAt++) {
        const f = fixture(t, layout);
        const before = snapshot(f.resources);
        let count = 0;
        assert.throws(() => migrateVencordResource(f.resources, f.patcher, {
            renameSync(from, to) { if (++count === failAt) throw new Error("fixture rename failure"); renameSync(from, to); }
        }), /fixture rename failure/);
        assert.deepEqual(snapshot(f.resources), before, `failed rename ${failAt}`);
    }
});

test("modified loaders, foreign mods and invalid backups remain untouched", t => {
    for (const kind of ["foreign", "code", "extra-file", "invalid-backup", "missing-backup", "bad-offset", "oversize-header"]) {
        const f = fixture(t, "asar", kind === "foreign" ? "/Users/example/AnotherMod/dist/patcher.js" : undefined);
        if (kind === "code" || kind === "extra-file") writeFileSync(join(f.resources, "app.asar"), asar({
            "index.js": `require("/Users/example/Vencord/dist/patcher.js")${kind === "code" ? ";require('another-mod')" : ""}`,
            "package.json": '{"name":"discord","main":"index.js"}', ...(kind === "extra-file" ? { "extra.js": "// unknown" } : {})
        }));
        if (kind === "invalid-backup") writeFileSync(join(f.resources, "_app.asar"), "not an archive");
        if (kind === "missing-backup") rmSync(join(f.resources, "_app.asar"));
        if (kind === "bad-offset" || kind === "oversize-header") {
            const bytes = readFileSync(join(f.resources, "app.asar"));
            bytes.writeUInt32LE(0xffffffff, kind === "bad-offset" ? 4 : 12);
            writeFileSync(join(f.resources, "app.asar"), bytes);
        }
        const before = snapshot(f.resources);
        assert.equal(detectVencordInstallation(f.resources), null, kind);
        assert.throws(() => migrateVencordResource(f.resources, f.patcher), /non reconnue/);
        assert.deepEqual(snapshot(f.resources), before, kind);
    }
});

test("symlinked legacy loader is not migrated", t => {
    const f = fixture(t, "directory");
    const originalLoader = join(f.root, "external-loader");
    renameSync(join(f.resources, "app"), originalLoader);
    symlinkSync(originalLoader, join(f.resources, "app"), process.platform === "win32" ? "junction" : "dir");
    const before = snapshot(originalLoader);
    assert.equal(detectVencordInstallation(f.resources), null);
    assert.throws(() => migrateVencordResource(f.resources, f.patcher), /non reconnue/);
    assert.deepEqual(snapshot(originalLoader), before);
});

test("running Discord, unknown process state and missing write access block migration before changes", async t => {
    for (const kind of ["running", "scan-error", "read-only", "reopened"]) {
        const f = fixture(t);
        const before = snapshot(f.resources);
        let checks = 0;
        const app = createInstaller({
            ...f.options,
            listRunning: async () => {
                checks++;
                if (kind === "scan-error") throw new Error("process lookup failed");
                return kind === "running" || (kind === "reopened" && checks >= 3) ? ["Discord Stable"] : [];
            },
            ...(kind === "read-only" ? { helpers: { isWritable: () => false } } : {})
        });
        const state = await app.scan();
        assert.equal((await app.perform({ action: "migrate-vencord", targetIds: [state.targets[0].id] })).ok, false, kind);
        assert.deepEqual(snapshot(f.resources), before, kind);
    }
});

test("normal Discord cannot be selected for Vencord migration", async t => {
    const f = fixture(t);
    rmSync(join(f.resources, "app.asar"));
    renameSync(join(f.resources, "_app.asar"), join(f.resources, "app.asar"));
    const before = snapshot(f.resources);
    const app = createInstaller(f.options);
    const state = await app.scan();
    assert.equal(state.targets[0].vencord, false);
    assert.equal((await app.perform({ action: "migrate-vencord", targetIds: [state.targets[0].id] })).ok, false);
    assert.deepEqual(snapshot(f.resources), before);
});
