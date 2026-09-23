/*
 * Real Electron installer smoke test; requires a local Electron runtime and Linux Xvfb
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPackage } from "@electron/asar";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
let electron;
try { electron = require("electron"); await access(electron); }
catch { throw new Error("Electron is unavailable. Run node node_modules/electron/install.js before this optional smoke test."); }
const workRoot = resolve(repo, "../work/installer-tests");
await mkdir(workRoot, { recursive: true });
const temporary = await mkdtemp(join(workRoot, "installer-electron-"));

async function electronTest(config) {
    const assert = require("node:assert/strict");
    const fs = require("original-fs").promises;
    const { existsSync } = require("original-fs");
    const { join } = require("node:path");
    const { app, BrowserWindow, session } = require("electron");
    const threads = require("node:worker_threads");
    const RealWorker = threads.Worker;
    app.setName("Midnightcord Installer Fixture Test");
    app.setPath("userData", join(config.temporary, "electron-user-data"));
    app.setPath("sessionData", join(config.temporary, "electron-session-data"));
    app.commandLine.appendSwitch("disable-gpu");
    // Only the test process injects an empty process-list adapter into the real worker.
    threads.Worker = class extends RealWorker {
        constructor(filename, options) {
            super(filename, { ...options, execArgv: ["--import", config.registerUrl] });
            this.on("error", error => errors.push(`Worker: ${error.stack ?? error.message}`));
        }
    };
    const { createBackend, startInstaller } = require(join(config.application, "installer", "main.cjs"));
    threads.Worker = RealWorker;
    let application;
    let backend;
    const errors = [];
    const externalRequests = [];
    const timeout = setTimeout(() => app.exit(2), 45_000);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function waitFor(expression, message) {
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline) {
            if (await application.window.webContents.executeJavaScript(expression)) return;
            await delay(25);
        }
        throw new Error(message);
    }
    try {
        await app.whenReady();
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            if (/^https?:/.test(details.url)) { externalRequests.push(details.url); callback({ cancel: true }); }
            else callback({});
        });
        app.on("web-contents-created", (_event, contents) => {
            contents.on("preload-error", (_event, _path, error) => errors.push(error.message));
            contents.on("render-process-gone", (_event, details) => { if (details.reason !== "clean-exit") errors.push(details.reason); });
        });
        let reportProgress = () => {};
        backend = createBackend(config.backendOptions, event => reportProgress(event));
        application = await startInstaller({ backend, show: false, onBackendReady: ({ onProgress }) => { reportProgress = onProgress; } });
        assert(application?.window, "Production installer window created");
        const window = application.window;
        window.webContents.setBackgroundThrottling(false);
        const evaluate = expression => window.webContents.executeJavaScript(expression);
        const preferences = window.webContents.getLastWebPreferences();
        assert.equal(preferences.sandbox, true);
        assert.equal(preferences.contextIsolation, true);
        assert.equal(preferences.nodeIntegration, false);
        assert.equal(window.isVisible(), false, "Test application stays hidden");
        assert.deepEqual(await evaluate("({require:typeof require,process:typeof process,Buffer:typeof Buffer})"), { require: "undefined", process: "undefined", Buffer: "undefined" });
        assert.deepEqual(await evaluate("Object.keys(window.midnightcordInstaller).sort()"), ["close", "getState", "minimize", "onProgress", "perform", "scan"]);
        await waitFor("!document.getElementById('selection-view').hidden && document.querySelectorAll('#targets input').length === 4", "Real UI did not render the fixture targets");
        assert.equal(await evaluate("document.querySelectorAll('#targets input:checked').length"), 0, "No targets are automatically selected");
        assert.equal(await evaluate("document.getElementById('perform').disabled"), true);
        for (const target of config.resources) {
            assert.equal((await fs.readFile(join(target.path, "app.asar"))).toString("base64"), config.officialBase64);
            assert.equal(existsSync(join(target.path, "app")), false, "Loading the app does not inject anything");
        }
        const state = await evaluate("window.midnightcordInstaller.getState()");
        assert(state.targets.every(target => !target.conflict), JSON.stringify(state.targets.map(({ channel, conflict }) => ({ channel, conflict }))));
        const selected = state.targets.find(target => target.channel === "ptb");
        assert(selected && state.targets.every(target => target.path.startsWith(config.temporary)));
        await evaluate(`document.querySelector('#targets input[value="${selected.id}"]').click()`);
        await fs.writeFile(config.processControl, JSON.stringify({ running: [{ Name: "Discord.exe" }] }));
        await evaluate("document.getElementById('rescan').click()");
        await waitFor("document.getElementById('notice-text').textContent.includes('encore ouvert') && !document.getElementById('rescan').disabled", "Running-process notice missing");
        assert.equal(await evaluate("document.getElementById('perform').disabled"), true);
        await fs.writeFile(config.processControl, JSON.stringify({ fail: true }));
        await evaluate("document.getElementById('rescan').click()");
        await waitFor("!document.getElementById('scan-error').hidden && !document.getElementById('rescan').disabled", "Process scan failure is not visible");
        assert.equal(await evaluate("document.getElementById('perform').disabled"), true);
        await fs.writeFile(config.processControl, JSON.stringify({ running: [] }));
        await evaluate("document.getElementById('rescan').click()");
        await waitFor("!document.getElementById('perform').disabled", "Successful rescan did not re-enable the selected target");
        await evaluate("window.__progress=[];window.__ticks=0;window.__unsubscribe=window.midnightcordInstaller.onProgress(value=>window.__progress.push(value));window.__heartbeat=setInterval(()=>window.__ticks++,5);document.getElementById('perform').click()");
        await waitFor("!document.getElementById('progress-view').hidden", "Real UI did not enter the progress view");
        assert.equal((await evaluate("window.midnightcordInstaller.getState()")).busy, true, "Main IPC remains responsive while the real worker performs filesystem operations");
        const second = await evaluate(`window.midnightcordInstaller.perform({action:'install',targetIds:[${JSON.stringify(selected.id)}]})`);
        assert.equal(second.ok, false, "IPC prevents a concurrent job");
        const busyClose = await evaluate("window.midnightcordInstaller.close()");
        assert.equal(busyClose.ok, false, "Window cannot close during a job");
        assert.equal(window.isDestroyed(), false);
        await waitFor("!document.getElementById('back').hidden", "Install result did not appear");
        assert.equal(await evaluate("document.getElementById('progress-view').classList.contains('complete')"), true);
        assert((await evaluate("window.__ticks")) > 0, "Renderer heartbeat continues while installing");
        const progress = await evaluate("window.__progress.map(value=>value.stage)");
        assert(progress.includes("copying") && progress.includes("injecting") && progress.includes("done"));
        assert.equal((await fs.readFile(join(selected.path, "_app.asar"))).toString("base64"), config.officialBase64);
        assert.equal(existsSync(join(selected.path, "app", "index.js")), true);
        for (const target of config.resources.filter(target => target.channel !== "ptb")) {
            assert.equal((await fs.readFile(join(target.path, "app.asar"))).toString("base64"), config.officialBase64);
            assert.equal(existsSync(join(target.path, "app")), false);
        }
        assert.equal(await fs.readFile(join(config.installedDist, "ocr", "models", "fra.traineddata.gz"), "utf8"), "fixture-offline-model");
        await evaluate("window.__unsubscribe();window.__progress=[];clearInterval(window.__heartbeat)");
        reportProgress({ stage: "test-unsubscribed", percent: 0 });
        await delay(50);
        assert.equal(await evaluate("window.__progress.length"), 0, "Progress subscription cleanup works");
        await evaluate("document.getElementById('back').click()");
        await waitFor("!document.getElementById('selection-view').hidden && !document.getElementById('rescan').disabled", "Back button did not rescan");
        await evaluate("document.getElementById('uninstall-mode').click()");
        await evaluate(`document.querySelector('#targets input[value="${selected.id}"]').click();document.getElementById('perform').click()`);
        await waitFor("!document.getElementById('back').hidden", "Uninstall result did not appear");
        assert.equal(await evaluate("document.getElementById('progress-view').classList.contains('complete')"), true);
        assert.equal((await fs.readFile(join(selected.path, "app.asar"))).toString("base64"), config.officialBase64);
        assert.equal(existsSync(join(selected.path, "app")), false);
        assert.equal(existsSync(join(config.installedDist, "patcher.js")), true, "Uninstall keeps the shared distribution");
        const attacker = new BrowserWindow({ show: false, webPreferences: { preload: join(config.application, "installer", "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await attacker.loadURL("data:text/html,<title>Untrusted fixture</title>");
        const denied = await attacker.webContents.executeJavaScript("window.midnightcordInstaller.getState().then(()=>false,()=>true)");
        assert.equal(denied, true, "IPC rejects a different renderer even with the same preload");
        attacker.destroy();
        const originalUrl = window.webContents.getURL();
        await evaluate("window.location.href='https://example.invalid/installer-test'");
        await delay(80);
        assert.equal(window.webContents.getURL(), originalUrl, "External navigation is blocked");
        const windowsBefore = BrowserWindow.getAllWindows().length;
        await evaluate("window.open('https://example.invalid/popup');true");
        await delay(50);
        assert.equal(BrowserWindow.getAllWindows().length, windowsBefore, "Unexpected windows are blocked");
        await evaluate("window.midnightcordInstaller.minimize()");
        let idleCloseAttempted = false;
        window.once("close", event => { idleCloseAttempted = true; event.preventDefault(); });
        assert.equal((await evaluate("window.midnightcordInstaller.close()")).ok, true);
        assert.equal(idleCloseAttempted, true, "Close reaches the native window after the job finishes");
        assert.deepEqual(errors, []);
        assert.deepEqual(externalRequests, []);
        const report = { ok: true, electron: process.versions.electron, sandbox: true, contextIsolation: true, nodeBlocked: true, realUi: true, realWorker: true, offlinePayload: true, selectedOnly: true, officialRestored: true, busyGuard: true, idleClose: true, uiResponsive: true, processPreflight: true, untrustedSenderRejected: true, progressUnsubscribe: true, externalRequests: 0 };
        await fs.writeFile(config.report, JSON.stringify(report));
        clearTimeout(timeout);
        application.bridge.dispose();
        await backend.stop();
        app.exit(0);
    } catch (error) {
        const page = await application?.window.webContents.executeJavaScript("({state:document.readyState,scanError:document.getElementById('scan-error')?.textContent,body:document.body.innerText.slice(0,1800)})").catch(() => null);
        await fs.writeFile(config.report, JSON.stringify({ ok: false, error: String(error), stack: error.stack, errors, externalRequests, page }));
        clearTimeout(timeout);
        application?.bridge.dispose();
        await backend?.stop();
        app.exit(1);
    }
}

try {
    const application = join(temporary, "application");
    await mkdir(join(application, "scripts"), { recursive: true });
    await cp(join(repo, "installer"), join(application, "installer"), { recursive: true });
    await cp(join(repo, "scripts", "nativeInjection.mjs"), join(application, "scripts", "nativeInjection.mjs"));
    await writeFile(join(application, "package.json"), JSON.stringify({ name: "midnightcord-installer-fixture", version: "1.2.3" }));
    await mkdir(join(application, "static"), { recursive: true });
    await cp(join(repo, "static", "icon.png"), join(application, "static", "icon.png"));
    const sourceDist = join(temporary, "offline-payload");
    await mkdir(join(sourceDist, "ocr", "models"), { recursive: true });
    await writeFile(join(sourceDist, "patcher.js"), "module.exports = {};\n");
    await writeFile(join(sourceDist, "preload.js"), "// fixture\n");
    await writeFile(join(sourceDist, "renderer.js"), "// fixture\n");
    await writeFile(join(sourceDist, "package.json"), JSON.stringify({ main: "patcher.js" }));
    await writeFile(join(sourceDist, "ocr", "models", "fra.traineddata.gz"), "fixture-offline-model");
    for (let i = 0; i < 32; i++) await writeFile(join(sourceDist, `offline-${i}.bin`), Buffer.alloc(512 * 1024, i));
    const home = join(temporary, "fixture-home");
    const env = { LOCALAPPDATA: join(home, "local"), APPDATA: join(home, "roaming") };
    const officialSource = join(temporary, "official-fixture");
    await mkdir(officialSource);
    await writeFile(join(officialSource, "package.json"), JSON.stringify({ name: "discord-fixture", main: "index.js" }));
    await writeFile(join(officialSource, "index.js"), "module.exports = 'official-fixture';\n");
    const officialArchive = join(temporary, "official.asar");
    await createPackage(officialSource, officialArchive);
    const officialBase64 = (await readFile(officialArchive)).toString("base64");
    const resources = [];
    for (const [channel, name] of [["stable", "Discord"], ["ptb", "DiscordPTB"], ["canary", "DiscordCanary"], ["development", "DiscordDevelopment"]]) {
        const path = join(env.LOCALAPPDATA, name, "app-1.0.10", "resources");
        await mkdir(path, { recursive: true });
        await cp(officialArchive, join(path, "app.asar"));
        resources.push({ channel, path });
    }
    const processControl = join(temporary, "process-control.json");
    await writeFile(processControl, JSON.stringify({ running: [] }));
    const processStub = join(temporary, "process-fixture.mjs");
    const loader = join(temporary, "loader.mjs");
    const register = join(temporary, "register.mjs");
    await writeFile(processStub, `import { promisify } from "node:util"; import { readFile } from "node:fs/promises"; export const execFile = Object.assign(() => {}, { [promisify.custom]: async () => { await new Promise(resolve => setTimeout(resolve, 100)); const state = JSON.parse(await readFile(${JSON.stringify(processControl)},"utf8")); if(state.fail) throw new Error("Synthetic fixture process-list denial"); return { stdout: JSON.stringify(state.running ?? []), stderr: "" }; } });`);
    await writeFile(loader, `export function resolve(specifier, context, next) { return specifier === "node:child_process" ? { url: ${JSON.stringify(pathToFileURL(processStub).href)}, shortCircuit: true } : next(specifier, context); }`);
    await writeFile(register, `import { register } from "node:module"; register(${JSON.stringify(pathToFileURL(loader).href)}, import.meta.url);`);
    const report = join(temporary, "report.json");
    const helper = join(temporary, "electron-test.cjs");
    const config = { temporary, application, report, processControl, resources, officialBase64, registerUrl: pathToFileURL(register).href, installedDist: join(env.APPDATA, "Midnightcord", "dist"), backendOptions: { version: "1.2.3-test", platform: "win32", home, env, sourceDist } };
    await writeFile(helper, `${electronTest.toString()}\nelectronTest(${JSON.stringify(config)});\n`);
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const outcome = await new Promise((resolve, reject) => {
        const child = spawn(electron, [helper], { cwd: temporary, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", chunk => { output = (output + chunk).slice(-12_000); });
        child.stderr.on("data", chunk => { output = (output + chunk).slice(-12_000); });
        const timer = setTimeout(() => child.kill(), 55_000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal, output }); });
    });
    const result = await readFile(report, "utf8").then(JSON.parse).catch(() => ({ ok: false, outcome }));
    assert.equal(outcome.code, 0, JSON.stringify(result));
    assert.equal(result.ok, true, JSON.stringify(result));
    console.log(JSON.stringify(result));
} finally {
    const child = relative(workRoot, temporary);
    assert(child && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`) && basename(temporary).startsWith("installer-electron-"), "Refusing cleanup outside the test workspace");
    await rm(temporary, { recursive: true, force: true });
}
