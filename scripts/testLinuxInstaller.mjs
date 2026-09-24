/*
 * Linux installer dispatch regression tests, without launching a real client.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = await readFile(join(repo, "packaging/linux-entry.cjs"), "utf8");
const starter = await readFile(join(repo, "packaging/start-installer.cjs"), "utf8");

async function dispatch(platform, args, failure) {
    const imports = [];
    const exits = [];
    const errors = [];
    let started = 0;
    let registered = 0;
    runInNewContext(entry, {
        process: { platform, argv: ["/opt/Midnightcord/midnightcord", ...args] },
        console: { error: (...values) => errors.push(values) },
        require(specifier) {
            imports.push(specifier);
            if (specifier === "electron") return { app: { exit: code => exits.push(code) } };
            assert.equal(specifier, "./start-installer.cjs");
            return {
                startLinuxInstaller: async () => { started++; if (failure) throw failure; },
                registerLinuxInstaller: async () => { registered++; if (failure) throw failure; }
            };
        }
    }, { filename: "packaging/linux-entry.cjs" });
    await Promise.resolve();
    await Promise.resolve();
    return { imports, exits, errors, started, registered };
}

test("Linux installer flag dispatches before loading any client module", async () => {
    const result = await dispatch("linux", ["--install-vencord"]);
    assert.deepEqual(result.imports, ["electron", "./start-installer.cjs"]);
    assert.equal(result.started, 1);
    assert.deepEqual(result.exits, []);
});

for (const [platform, args] of [["linux", []], ["linux", ["--install-vencord-extra"]], ["win32", ["--install-vencord"]], ["darwin", ["--install-vencord"]]]) {
    test(`${platform} ${args.join(" ") || "ordinary launch"} opens only the injector`, async () => {
        const result = await dispatch(platform, args);
        assert.deepEqual(result.imports, ["electron", "./start-installer.cjs"]);
        assert.equal(result.started, 1);
    });
}

test("installer startup rejection is handled and exits unsuccessfully", async () => {
    const result = await dispatch("linux", ["--install-vencord"], new Error("Fixture launch failure"));
    assert.equal(result.started, 1);
    assert.deepEqual(result.exits, [1]);
    assert.deepEqual(result.errors, [["[Midnightcord Installer]", "Fixture launch failure"]]);
    assert(!result.imports.includes("../dist/js/main.js"));
});

test("explicit desktop registration exits without opening a window", async () => {
    const result = await dispatch("linux", ["--register-installer"]);
    assert.equal(result.registered, 1);
    assert.equal(result.started, 0);
    assert.deepEqual(result.exits, [0]);
});

test("failed desktop registration reports failure without launching the UI", async () => {
    const result = await dispatch("linux", ["--register-installer"], new Error("Fixture registration failure"));
    assert.equal(result.registered, 1);
    assert.equal(result.started, 0);
    assert.deepEqual(result.exits, [1]);
});

function launcher(failure) {
    const events = [];
    const paths = { appData: "/fixture/config", userData: "/fixture/config/Midnightcord", sessionData: "/fixture/client-session" };
    let name = "Midnightcord";
    let sandbox = false;
    const switches = new Set(["no-sandbox", "ozone-platform"]);
    const process = { execPath: "/fixture/package/midnightcord-installer", stdout: { write: text => events.push(["stdout", text]) }, stderr: { write: text => events.push(["stderr", text]) }, argv: ["midnightcord", "--install-vencord", "--no-sandbox", "--no-sandbox=true", "--ozone-platform=auto", "--no-sandbox-unrelated"] };
    const module = { exports: {} };
    const app = {
        getPath: key => paths[key],
        setPath: (key, value) => { events.push(["path", key, value]); paths[key] = value; },
        setName: value => { events.push(["name", value]); name = value; },
        setDesktopName: value => events.push(["desktop", value]),
        commandLine: { removeSwitch: value => { events.push(["removeSwitch", value]); switches.delete(value); } },
        enableSandbox: () => { events.push(["sandbox"]); sandbox = true; }
    };
    runInNewContext(starter, {
        process, module,
        require(specifier) {
            if (specifier === "electron") return { app };
            if (specifier === "node:path") return posix;
            if (specifier === "node:fs") return { mkdirSync: (path, options) => events.push(["mkdir", path, options.recursive]) };
            if (specifier === "node:child_process") return { execFile: (file, args, options, callback) => { events.push(["execFile", file, Array.from(args), options.timeout]); callback(failure, "Fixture registered", ""); } };
            assert.equal(specifier, "../installer/main.cjs");
            events.push(["importGraphite"]);
            assert.equal(name, "midnightcord-installer");
            assert.equal(paths.userData, "/fixture/config/midnightcord-installer");
            assert.equal(paths.sessionData, "/fixture/config/midnightcord-installer/sessionData");
            assert.equal(sandbox, true, "Sandbox enabled before Electron startup or client import");
            assert.equal(switches.has("no-sandbox"), false);
            return { startInstaller: async options => { events.push(["start", options.title]); if (failure) throw failure; return "fixture-window"; } };
        }
    }, { filename: "packaging/start-installer.cjs" });
    return { start: module.exports.startLinuxInstaller, register: module.exports.registerLinuxInstaller, events, process, paths, switches };
}

test("graphite starts with isolated client profile/session and the requested native title", async () => {
    const fixture = launcher();
    assert.equal(await fixture.start(), "fixture-window");
    assert(fixture.events.some(event => event[0] === "mkdir" && event[1] === fixture.paths.sessionData && event[2]));
    assert(fixture.events.some(event => event[0] === "desktop" && event[1] === "midnightcord-installer.desktop"));
    assert.deepEqual(fixture.events.at(-1), ["start", "Install Vencord"]);
    assert(fixture.events.findIndex(event => event[0] === "sandbox") < fixture.events.findIndex(event => event[0] === "importGraphite"));
});

test("AppImage no-sandbox arguments are removed without losing unrelated options", async () => {
    const fixture = launcher();
    await fixture.start();
    assert.deepEqual(Array.from(fixture.process.argv), ["midnightcord", "--install-vencord", "--ozone-platform=auto", "--no-sandbox-unrelated"]);
    assert(fixture.switches.has("ozone-platform"));
});

test("graphite failure propagates without falling back to client startup", async () => {
    const fixture = launcher(new Error("Missing graphite fixture"));
    await assert.rejects(fixture.start(), /Missing graphite fixture/);
    assert.equal(fixture.events.filter(event => event[0] === "start").length, 1);
});

test("registration runs only the adjacent helper with no shell or renderer-controlled path", async () => {
    const fixture = launcher();
    await fixture.register();
    assert.deepEqual(fixture.events, [["execFile", "/fixture/package/register-installer.sh", [], 10_000], ["stdout", "Fixture registered"]]);
});
