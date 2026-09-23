/*
 * Regression tests for the offline installer using isolated Discord fixtures
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import fs, { existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { createInstaller } from "../installer/core.mjs";
import { getInstalledDistDir, installDistribution, isMidnightcordLoader } from "./nativeInjection.mjs";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const workRoot = resolve(repo, "../work/installer-tests");
const channels = [
    { id: "stable", windows: "Discord", macos: "Discord", linux: "discord" },
    { id: "ptb", windows: "DiscordPTB", macos: "Discord PTB", linux: "discordptb" },
    { id: "canary", windows: "DiscordCanary", macos: "Discord Canary", linux: "discordcanary" },
    { id: "development", windows: "DiscordDevelopment", macos: "Discord Development", linux: "discorddevelopment" }
];

async function fixture(t, platform = "win32") {
    await mkdir(workRoot, { recursive: true });
    const directory = await mkdtemp(join(workRoot, "installer-core-"));
    const home = join(directory, "home");
    const env = { LOCALAPPDATA: join(home, "LocalAppData"), APPDATA: join(home, "RoamingAppData"), XDG_CONFIG_HOME: join(home, "config"), XDG_DATA_HOME: join(home, "data") };
    const sourceDist = join(directory, "offline-payload");
    const payload = {
        "patcher.js": "module.exports = { offlineFixture: true };\n",
        "preload.js": "// fixture preload\n",
        "renderer.js": "// fixture renderer\n",
        "renderer.css": ":root { --offline-fixture: 1; }\n",
        "package.json": JSON.stringify({ name: "midnightcord", main: "patcher.js" }),
        "patcher.js.map": "not-for-installation",
        "ocr/worker.cjs": "module.exports = 'offline-worker';\n",
        "ocr/models/fra.traineddata.gz": "offline-fixture-model",
        "ocr/models/eng.traineddata.gz": "offline-fixture-model"
    };
    for (const [name, content] of Object.entries(payload)) {
        await mkdir(dirname(join(sourceDist, name)), { recursive: true });
        await writeFile(join(sourceDist, name), content);
    }
    const macApplicationDirs = [join(directory, "Applications"), join(home, "Applications")];
    const options = { version: "1.2.3-test", platform, env, home, sourceDist, macApplicationDirs, includeSystem: false, discoveryOptions: { macApplicationDirs, includeSystem: false }, listRunning: async () => [] };
    t.after(async () => {
        const child = relative(workRoot, directory);
        assert(child && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`) && basename(directory).startsWith("installer-core-"), "Refusing cleanup outside the fixture workspace");
        await rm(directory, { recursive: true, force: true });
    });
    const discord = async (channel, { version = "1.0.10", applicationDir = macApplicationDirs[0] } = {}) => {
        const definition = channels.find(item => item.id === channel);
        const resources = platform === "darwin"
            ? join(applicationDir, `${definition.macos}.app`, "Contents", "Resources")
            : join(platform === "win32" ? env.LOCALAPPDATA : env.XDG_CONFIG_HOME, platform === "win32" ? definition.windows : definition.linux, `app-${version}`, "resources");
        await mkdir(resources, { recursive: true });
        await writeFile(join(resources, "app.asar"), `official:${channel}:${version}:${applicationDir}`);
        return resources;
    };
    return { directory, home, env, sourceDist, payload, options, discord, installedDist: getInstalledDistDir(options), app: extra => createInstaller({ ...options, ...extra }) };
}

async function snapshot(directory) {
    if (!existsSync(directory)) return null;
    const output = {};
    async function visit(current) {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const absolute = join(current, entry.name);
            const name = relative(directory, absolute).split(sep).join("/");
            assert(!entry.isSymbolicLink(), "Fixture unexpectedly contains a symlink");
            if (entry.isDirectory()) { output[`${name}/`] = "directory"; await visit(absolute); }
            else output[name] = createHash("sha256").update(await readFile(absolute)).digest("hex");
        }
    }
    await visit(directory);
    return Object.fromEntries(Object.entries(output).sort(([left], [right]) => left.localeCompare(right)));
}

for (const platform of ["win32", "darwin", "linux"]) test(`${platform}: scan finds all four Discord channels inside the supplied fixture roots`, async t => {
    const f = await fixture(t, platform);
    for (const channel of channels) await f.discord(channel.id);
    if (platform !== "darwin") await f.discord("stable", { version: "1.0.2" });
    const app = f.app();
    const first = await app.scan();
    assert.equal(first.platform, platform);
    assert.equal(first.version, "1.2.3-test");
    assert.deepEqual(first.targets.map(target => target.channel).sort(), channels.map(channel => channel.id).sort());
    assert(first.targets.every(target => target.path.startsWith(f.directory)), "Scanner escaped supplied roots");
    assert(first.targets.every(target => !target.installed && !target.conflict));
    if (platform !== "darwin") assert.equal(first.targets.find(target => target.channel === "stable").version, "1.0.10");
    const second = await app.scan();
    assert.deepEqual(second.targets.map(target => target.id).sort(), first.targets.map(target => target.id).sort(), "Target IDs remain stable after rescanning");
});

test("two macOS installs in the same channel remain distinct and only the selected copy is changed", async t => {
    const f = await fixture(t, "darwin");
    const first = await f.discord("stable");
    const second = await f.discord("stable", { applicationDir: f.options.macApplicationDirs[1] });
    const beforeFirst = await snapshot(first);
    const app = f.app();
    const state = await app.scan();
    assert.equal(state.targets.length, 2);
    assert.equal(new Set(state.targets.map(target => target.id)).size, 2);
    const selected = state.targets.find(target => target.path === second);
    assert(selected, "Second Stable installation is selectable by path");
    const result = await app.perform({ action: "install", targetIds: [selected.id] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(isMidnightcordLoader(join(second, "app")), true);
    assert.deepEqual(await snapshot(first), beforeFirst);
});

test("installer copies offline payload, injects only selected Discord, and restores the official archive", async t => {
    const f = await fixture(t);
    const stable = await f.discord("stable");
    const ptb = await f.discord("ptb");
    const canary = await f.discord("canary");
    const original = await readFile(join(ptb, "app.asar"));
    const untouchedStable = await snapshot(stable);
    const untouchedCanary = await snapshot(canary);
    const progress = [];
    const app = f.app({ onProgress: event => progress.push(event) });
    const { targets } = await app.scan();
    const selected = targets.find(target => target.channel === "ptb");
    const install = await app.perform({ action: "install", targetIds: [selected.id] });
    assert.equal(install.ok, true, JSON.stringify(install));
    assert.equal(isMidnightcordLoader(join(ptb, "app")), true);
    assert.deepEqual(await readFile(join(ptb, "_app.asar")), original);
    assert.equal(existsSync(join(ptb, "app.asar")), false);
    assert.deepEqual(await snapshot(stable), untouchedStable);
    assert.deepEqual(await snapshot(canary), untouchedCanary);
    for (const [name, content] of Object.entries(f.payload)) {
        if (name.endsWith(".map")) { assert.equal(existsSync(join(f.installedDist, name)), false); continue; }
        assert.equal(await readFile(join(f.installedDist, name), "utf8"), content, `Offline file ${name} copied intact`);
    }
    const loader = await readFile(join(ptb, "app", "index.js"), "utf8");
    assert(loader.includes(JSON.stringify(join(f.installedDist, "patcher.js"))));
    assert(!loader.includes(JSON.stringify(join(f.sourceDist, "patcher.js"))), "Loader does not depend on the removable installer payload");
    assert(progress.length >= 2, "Installer reports progress");
    const installed = await app.scan();
    assert.equal(installed.targets.find(target => target.id === selected.id).installed, true);
    const uninstall = await app.perform({ action: "uninstall", targetIds: [selected.id] });
    assert.equal(uninstall.ok, true, JSON.stringify(uninstall));
    assert.deepEqual(await readFile(join(ptb, "app.asar")), original);
    assert.equal(existsSync(join(ptb, "app")), false);
    assert.equal(existsSync(join(ptb, "_app.asar")), false);
});

test("uninstalling one channel preserves the shared distribution and another installed channel", async t => {
    const f = await fixture(t);
    const stable = await f.discord("stable");
    const canary = await f.discord("canary");
    const app = f.app();
    const { targets } = await app.scan();
    assert.equal((await app.perform({ action: "install", targetIds: targets.map(target => target.id) })).ok, true);
    const shared = await snapshot(f.installedDist);
    const preserved = await snapshot(canary);
    const stableId = targets.find(target => target.channel === "stable").id;
    assert.equal((await app.perform({ action: "uninstall", targetIds: [stableId] })).ok, true);
    assert.equal(existsSync(join(stable, "app.asar")), true);
    assert.deepEqual(await snapshot(canary), preserved);
    assert.deepEqual(await snapshot(f.installedDist), shared);
});

test("invalid requests and unknown or stale targets cannot change the filesystem", async t => {
    const f = await fixture(t);
    const resources = await f.discord("stable");
    const app = f.app();
    const { targets } = await app.scan();
    const before = await snapshot(f.home);
    for (const request of [null, {}, { action: "purge", targetIds: [targets[0].id] }, { action: "install", targetIds: [] }, { action: "install", targetIds: ["../../outside"] }, { action: "install", targetIds: [targets[0].id, "unknown"] }, { action: "install", targetIds: targets[0].id }]) {
        const result = await app.perform(request);
        assert.equal(result.ok, false, `Unexpected acceptance of ${JSON.stringify(request)}`);
        assert.deepEqual(await snapshot(f.home), before);
    }
    const inside = relative(f.directory, resources);
    assert(inside && !isAbsolute(inside) && !inside.startsWith(`..${sep}`));
    await rm(resources, { recursive: true, force: true });
    const missing = await app.perform({ action: "install", targetIds: [targets[0].id] });
    assert.equal(missing.ok, false);
    assert.equal(existsSync(f.installedDist), false);
});

test("a conflicting mod in any selected target stops the entire job before mutation", async t => {
    const f = await fixture(t);
    await f.discord("stable");
    const ptb = await f.discord("ptb");
    await mkdir(join(ptb, "app"));
    await writeFile(join(ptb, "app", "index.js"), "require('unrelated-mod');\n");
    const app = f.app();
    const { targets } = await app.scan();
    assert(targets.find(target => target.channel === "ptb").conflict);
    const before = await snapshot(f.home);
    const result = await app.perform({ action: "install", targetIds: targets.map(target => target.id) });
    assert.equal(result.ok, false);
    assert.deepEqual(await snapshot(f.home), before);
    assert.equal(existsSync(f.installedDist), false);
});

test("a running Discord process blocks install and uninstall without filesystem changes", async t => {
    const f = await fixture(t);
    await f.discord("stable");
    const app = f.app({ listRunning: async () => ["Discord.exe"] });
    const { targets } = await app.scan();
    const before = await snapshot(f.home);
    for (const action of ["install", "uninstall"]) {
        const result = await app.perform({ action, targetIds: [targets[0].id] });
        assert.equal(result.ok, false);
        assert.deepEqual(await snapshot(f.home), before);
    }
});

test("an unwritable selected target stops the complete batch before copying or injecting", async t => {
    const f = await fixture(t);
    await f.discord("stable");
    const ptb = await f.discord("ptb");
    const app = f.app({ helpers: { isWritable: path => resolve(path) !== resolve(ptb) } });
    const { targets } = await app.scan();
    assert.equal(targets.find(target => target.channel === "ptb").writable, false);
    const before = await snapshot(f.home);
    const result = await app.perform({ action: "install", targetIds: targets.map(target => target.id) });
    assert.equal(result.ok, false);
    assert.deepEqual(await snapshot(f.home), before);
    assert.equal(existsSync(f.installedDist), false);
});

test("concurrent jobs are rejected while the first operation owns the installer", async t => {
    const f = await fixture(t);
    await f.discord("stable");
    let release;
    let block = false;
    const gate = new Promise(resolve => { release = resolve; });
    const app = f.app({ listRunning: async () => { if (block) await gate; return []; } });
    const { targets } = await app.scan();
    block = true;
    const first = app.perform({ action: "install", targetIds: [targets[0].id] });
    try {
        const second = await app.perform({ action: "install", targetIds: [targets[0].id] });
        assert.equal(second.ok, false);
    } finally { release(); }
    assert.equal((await first).ok, true);
    assert.equal((await app.getState()).busy, false);
});

for (const failure of ["copy", "commit"]) test(`failed distribution ${failure} preserves every previous payload byte and cleans staging`, async t => {
    const f = await fixture(t);
    await mkdir(join(f.installedDist, "ocr", "models"), { recursive: true });
    await writeFile(join(f.installedDist, "patcher.js"), "previous working patcher\n");
    await writeFile(join(f.installedDist, "ocr", "models", "custom.bin"), Buffer.from([0, 1, 254, 255]));
    const before = await snapshot(dirname(f.installedDist));
    const originalCopy = fs.cpSync;
    const originalRename = fs.renameSync;
    let injected = false;
    try {
        if (failure === "copy") fs.cpSync = (source, destination, options) => {
            if (resolve(source) !== resolve(f.sourceDist)) return originalCopy(source, destination, options);
            fs.mkdirSync(destination, { recursive: true });
            fs.copyFileSync(join(source, "patcher.js"), join(destination, "patcher.js"));
            injected = true;
            throw Object.assign(new Error("Synthetic copy failure"), { code: "EIO" });
        };
        else fs.renameSync = (source, destination) => {
            if (resolve(source).startsWith(resolve(f.installedDist) + ".tmp-") && resolve(destination) === resolve(f.installedDist)) {
                injected = true;
                throw Object.assign(new Error("Synthetic commit failure"), { code: "EACCES" });
            }
            return originalRename(source, destination);
        };
        syncBuiltinESMExports();
        assert.throws(() => installDistribution(f.sourceDist, f.options), new RegExp(`Synthetic ${failure} failure`));
    } finally {
        fs.cpSync = originalCopy;
        fs.renameSync = originalRename;
        syncBuiltinESMExports();
    }
    assert(injected, "Fault reached the real distribution helper");
    assert.deepEqual(await snapshot(dirname(f.installedDist)), before, "Previous files retain their hashes and no temporary or backup directory remains");
});

test("the copied backend and worker operate from an offline application directory", async t => {
    const f = await fixture(t);
    const resources = await f.discord("stable");
    const copiedRoot = join(f.directory, "copied-application");
    await mkdir(join(copiedRoot, "scripts"), { recursive: true });
    await cp(join(repo, "installer"), join(copiedRoot, "installer"), { recursive: true });
    await cp(join(repo, "scripts", "nativeInjection.mjs"), join(copiedRoot, "scripts", "nativeInjection.mjs"));
    const processStub = join(copiedRoot, "process-fixture.mjs");
    const loader = join(copiedRoot, "loader.mjs");
    const register = join(copiedRoot, "register.mjs");
    await writeFile(processStub, 'import { promisify } from "node:util"; export const execFile = Object.assign(() => {}, { [promisify.custom]: async () => ({ stdout: "[]", stderr: "" }) });');
    await writeFile(loader, `export function resolve(specifier, context, next) { return specifier === "node:child_process" ? { url: ${JSON.stringify(pathToFileURL(processStub).href)}, shortCircuit: true } : next(specifier, context); }`);
    await writeFile(register, `import { register } from "node:module"; register(${JSON.stringify(pathToFileURL(loader).href)}, import.meta.url);`);
    const worker = new Worker(pathToFileURL(join(copiedRoot, "installer", "worker.mjs")), {
        workerData: { ...f.options, listRunning: undefined },
        execArgv: ["--import", pathToFileURL(register).href]
    });
    const pending = new Map();
    const progress = [];
    let id = 0;
    worker.on("message", message => {
        if (message.type === "progress") { progress.push(message.progress); return; }
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error));
        else request.resolve(message.result);
    });
    worker.on("error", error => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); });
    const call = (method, request) => new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Worker ${method} timed out`)); }, 15_000);
        pending.set(requestId, { resolve, reject, timer });
        worker.postMessage({ id: requestId, method, request });
    });
    try {
        const { targets } = await call("scan");
        const result = await call("perform", { action: "install", targetIds: [targets[0].id] });
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(isMidnightcordLoader(join(resources, "app")), true);
        assert.equal(await readFile(join(f.installedDist, "ocr/models/fra.traineddata.gz"), "utf8"), "offline-fixture-model");
        assert(progress.some(event => event.stage === "copying") && progress.some(event => event.stage === "done"));
        await assert.rejects(call("unknown"), /inconnue/);
        const uninstall = await call("perform", { action: "uninstall", targetIds: [targets[0].id] });
        assert.equal(uninstall.ok, true);
        assert.equal(existsSync(join(resources, "app.asar")), true);
    } finally { await worker.terminate(); }
});
