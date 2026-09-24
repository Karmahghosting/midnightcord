/*
 * Inspect and run extracted Linux packages in isolated fixtures; never install them.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createPackage } from "@electron/asar";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const exec = promisify(execFile);
const command = (file, args, options = {}) => exec(file, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, ...options });
const args = process.argv.slice(2);
if (args.includes("--help")) {
    console.log("Linux only: xvfb-run -a node scripts/testLinuxInstallerPackage.mjs --release-dir release");
    console.log("Or supply both --deb file.deb --rpm file.rpm. Requires dpkg-deb, rpm, rpm2cpio, cpio, desktop-file-validate and Electron system libraries.");
    process.exit(0);
}
assert.equal(process.platform, "linux", "Run the package smoke test on a native Linux runner");
assert.notEqual(process.getuid(), 0, "Run as an ordinary user so the real Electron sandbox remains enabled");
const options = {};
for (let index = 0; index < args.length; index += 2) {
    assert(["--release-dir", "--deb", "--rpm"].includes(args[index]) && args[index + 1], `Invalid argument ${args[index]}`);
    options[args[index]] = resolve(args[index + 1]);
}
if (options["--release-dir"]) {
    const { version } = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
    const files = await readdir(options["--release-dir"]);
    for (const extension of ["deb", "rpm"]) {
        const candidates = files.filter(file => file.endsWith(`.${extension}`) && file.includes(version) && file.includes(`linux-${process.arch}`));
        assert.equal(candidates.length, 1, `Expected one ${extension} for ${version}/${process.arch}: ${candidates}`);
        options[`--${extension}`] = join(options["--release-dir"], candidates[0]);
    }
}
assert(options["--deb"] && options["--rpm"], "Supply --release-dir or both --deb and --rpm");
const workRoot = resolve(repo, "../work/linux-installer-packages");
await mkdir(workRoot, { recursive: true });
const temporary = await mkdtemp(join(workRoot, "package-"));
const rootPackage = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));

function desktopSections(text) {
    const sections = {};
    let section;
    for (const line of text.split(/\r?\n/)) {
        if (/^\[.+\]$/.test(line)) section = sections[line.slice(1, -1)] ??= {};
        else if (section && /^[^#=]+=/.test(line)) { const at = line.indexOf("="); section[line.slice(0, at)] = line.slice(at + 1); }
    }
    return sections;
}

async function filesBelow(directory) {
    const output = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) output.push(...await filesBelow(path));
        else if (entry.isFile()) output.push(path);
    }
    return output;
}

function start(file, args, options = {}) {
    const child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-12_000); });
    const result = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal, output }));
    });
    return { child, result };
}

async function extract(format, source, destination) {
    await mkdir(destination, { recursive: true });
    if (format === "deb") {
        const metadata = (await command("dpkg-deb", ["--field", source, "Package", "Version", "Architecture"])).stdout;
        assert.match(metadata, /Package: midnightcord\s/);
        assert(metadata.includes(`Version: ${rootPackage.version}`));
        assert(metadata.includes(`Architecture: ${process.arch === "arm64" ? "arm64" : "amd64"}`));
        await command("dpkg-deb", ["--extract", source, destination]);
        await command("dpkg-deb", ["--control", source, join(destination, "DEBIAN")]);
        return;
    }
    const metadata = (await command("rpm", ["-qp", "--queryformat", "%{NAME}\n%{VERSION}\n%{ARCH}\n", source])).stdout.trim().split("\n");
    assert.deepEqual(metadata, ["midnightcord", rootPackage.version, process.arch === "arm64" ? "aarch64" : "x86_64"]);
    const listing = (await command("rpm", ["-qpl", source])).stdout.trim().split("\n");
    assert(listing.length > 5 && listing.every(path => /^\/(?:opt|usr|etc)(?:\/|$)/.test(path) && !path.split("/").includes("..")), "Unexpected RPM destination");
    const reader = spawn("rpm2cpio", [source], { stdio: ["ignore", "pipe", "pipe"] });
    const unpacker = spawn("cpio", ["-idm", "--no-absolute-filenames"], { cwd: destination, stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    for (const process of [reader, unpacker]) process.stderr.on("data", data => { errors = (errors + data).slice(-4000); });
    const finished = child => new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Archive extraction failed (${code}): ${errors}`))); });
    await Promise.all([finished(reader), finished(unpacker), pipeline(reader.stdout, unpacker.stdin)]);
}

async function inspectPackage(root) {
    const desktopDir = join(root, "usr/share/applications");
    const desktop = join(desktopDir, "midnightcord-installer.desktop");
    await command("desktop-file-validate", [desktop]);
    const installerEntry = desktopSections(await readFile(desktop, "utf8"))["Desktop Entry"];
    assert.equal(installerEntry.Name, "Install Vencord");
    assert.equal(installerEntry.Type, "Application");
    assert.match(installerEntry.Exec, /^"?\/opt\/Midnightcord\/midnightcord-installer"? --install-vencord(?: %U)?$/);
    assert.equal(installerEntry.StartupWMClass, "midnightcord-installer");
    assert.notEqual(installerEntry.NoDisplay, "true");
    assert(!installerEntry.Exec.includes("--no-sandbox"));
    assert.deepEqual((await readdir(desktopDir)).filter(file => file.endsWith(".desktop")), ["midnightcord-installer.desktop"], "The package exposes only the injector");
    const appDir = join(root, "opt/Midnightcord");
    const resources = join(appDir, "resources");
    for (const path of ["midnightcord-installer", "install-vencord", "register-installer.sh"]) assert((await stat(join(appDir, path))).mode & 0o111, `${path} must be executable`);
    const systemLauncher = await readFile(join(root, "usr/bin/install-vencord"), "utf8");
    assert(systemLauncher.includes("/opt/Midnightcord/"), "The package owns a launcher targeting its installed files");
    assert(!systemLauncher.includes("--no-sandbox"));
    const application = join(resources, "app");
    const manifest = JSON.parse(await readFile(join(application, "package.json"), "utf8"));
    assert.equal(manifest.name, "midnightcord", "Package identity remains compatible with upgrades");
    assert.equal(manifest.version, rootPackage.version);
    assert.equal(manifest.main, "packaging/linux-entry.cjs");
    for (const name of ["linux-entry.cjs", "start-installer.cjs"]) assert.equal(await readFile(join(application, "packaging", name), "utf8"), await readFile(join(repo, "packaging", name), "utf8"));
    for (const name of ["installer/main.cjs", "installer/preload.cjs", "installer/worker.mjs", "installer/core.mjs", "installer/ui/index.html", "installer/ui/app.js", "installer/ui/style.css", "scripts/nativeInjection.mjs", "static/icon.png", "package.json"]) {
        assert((await stat(join(application, name))).isFile(), `Missing graphite file ${name}`);
    }
    for (const name of ["patcher.js", "preload.js", "renderer.js", "renderer.css", "ocr/worker.cjs", "ocr/manifest.json", "ocr/models/eng.traineddata.gz", "ocr/models/fra.traineddata.gz"]) {
        assert((await stat(join(resources, "payload/desktop", name))).isFile(), `Missing offline payload ${name}`);
    }
    const files = (await filesBelow(appDir)).map(path => relative(appDir, path).split(sep).join("/"));
    assert(!files.some(path => path.endsWith(".map")), "Installed payload excludes source maps");
    assert(!files.some(path => /(?:^|\/)dist\/js\/|(?:^|\/)arrpc(?:\/|$|-)|(?:^|\/)midnightcord\.asar$/.test(path)), "No standalone client or arRPC is shipped");
    for (const name of ["patcher.js", "preload.js", "renderer.js"]) {
        assert.match((await readFile(join(resources, "payload/desktop", name), "utf8")).slice(0, 1500), /\/\/ Updater Disabled: false/, `Native updater remains active in ${name}`);
    }
    return { appDir, resources, application, manifest };
}

async function registrationLifecycle(format, appDir) {
    const home = join(temporary, `${format}-registration`, "home");
    const data = join(home, "data");
    const env = { ...process.env, HOME: home, XDG_DATA_HOME: data, XDG_CONFIG_HOME: join(home, "config") };
    delete env.APPIMAGE;
    delete env.ELECTRON_RUN_AS_NODE;
    const launcher = join(home, ".local/bin/install-vencord");
    const desktop = join(data, "applications/midnightcord-installer.desktop");
    const icon = join(data, "icons/hicolor/256x256/apps/midnightcord-installer.png");
    const marker = "# Midnightcord Install Vencord launcher";
    const unrelated = join(home, "config/Midnightcord/settings.json");
    await mkdir(dirname(unrelated), { recursive: true });
    await writeFile(unrelated, "previous user settings");
    const helper = join(appDir, "register-installer.sh");
    await command(helper, [], { env });
    const first = await readFile(launcher, "utf8");
    const firstDesktop = await readFile(desktop, "utf8");
    assert(first.includes(marker) && first.includes("--install-vencord"));
    assert(firstDesktop.includes(marker));
    assert.equal(desktopSections(firstDesktop)["Desktop Entry"].Name, "Install Vencord");
    assert((await stat(launcher)).mode & 0o111);
    await command("desktop-file-validate", [desktop]);
    await command(helper, [], { env });
    assert.equal(await readFile(launcher, "utf8"), first, "Registration is idempotent");
    assert.equal(await readFile(desktop, "utf8"), firstDesktop);
    await writeFile(icon, "user-customized-icon");
    await command(helper, ["--unregister"], { env });
    assert.equal(await stat(launcher).catch(() => null), null);
    assert.equal(await stat(desktop).catch(() => null), null);
    assert.equal(await readFile(icon, "utf8"), "user-customized-icon", "Unregister preserves a replacement icon");
    await rm(icon);
    await writeFile(launcher, "unrelated user launcher");
    await assert.rejects(command(helper, [], { env }), /unrelated file/);
    await assert.rejects(command(helper, ["--unregister"], { env }), /unrelated file/);
    assert.equal(await readFile(launcher, "utf8"), "unrelated user launcher");
    assert.equal(await stat(desktop).catch(() => null), null, "Conflict is rejected before another destination is written");
    await rm(launcher);
    await symlink(unrelated, launcher);
    await assert.rejects(command(helper, [], { env }), /unrelated file/);
    assert.equal(await readFile(unrelated, "utf8"), "previous user settings");
    await rm(launcher);
    await command(helper, [], { env });
    await command(helper, ["--unregister"], { env });
    assert.equal(await stat(icon).catch(() => null), null, "Owned unchanged icon is removed");
    assert.equal(await readFile(unrelated, "utf8"), "previous user settings");
}

async function graphiteFixture(originalStart, createBackend, options, config) {
    const assert = require("node:assert/strict");
    const fs = require("original-fs").promises;
    const { existsSync } = require("original-fs");
    const { join } = require("node:path");
    const { app, session } = require("electron");
    const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    const requests = [];
    let application;
    let backend;
    const timeout = setTimeout(() => app.exit(2), 45_000);
    try {
        assert.equal(options.title, "Install Vencord");
        assert.equal(app.getName(), "midnightcord-installer");
        assert.equal(app.commandLine.hasSwitch("no-sandbox"), false);
        assert.equal(app.getPath("userData"), join(config.configHome, "midnightcord-installer"));
        assert.equal(app.getPath("sessionData"), join(config.configHome, "midnightcord-installer/sessionData"));
        await app.whenReady();
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            if (/^https?:/.test(details.url)) { requests.push(details.url); callback({ cancel: true }); }
            else callback({});
        });
        let progress = () => {};
        backend = createBackend(config.backend, event => progress(event));
        application = await originalStart({ ...options, backend, show: false, onBackendReady: context => { progress = context.onProgress; } });
        assert(application?.window, "The packaged injection entry creates its actual window");
        const window = application.window;
        const evaluate = text => window.webContents.executeJavaScript(text);
        async function waitFor(expression) {
            const deadline = Date.now() + 15_000;
            while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(25); }
            throw new Error(`Renderer condition timed out: ${expression}`);
        }
        await waitFor("document.querySelectorAll('#targets input').length === 2 && !document.getElementById('selection-view').hidden");
        assert.equal(window.getTitle(), "Install Vencord");
        assert.equal(await evaluate("document.querySelectorAll('#targets input:checked').length"), 0);
        assert.equal(await evaluate("typeof require + ':' + typeof process + ':' + typeof Buffer"), "undefined:undefined:undefined");
        const preferences = window.webContents.getLastWebPreferences();
        assert.equal(preferences.sandbox, true);
        assert.equal(preferences.contextIsolation, true);
        assert.equal(preferences.nodeIntegration, false);
        assert.equal(await evaluate("document.body.innerText.includes('Votre Midnightcord')"), true, "The real graphite UI is rendered");
        const state = await evaluate("window.midnightcordInstaller.getState()");
        assert.equal(state.error, null);
        assert(state.targets.every(target => target.path.startsWith(config.home) && !target.conflict));
        const selected = state.targets.find(target => target.channel === "ptb");
        await evaluate(`document.querySelector('#targets input[value="${selected.id}"]').click();document.getElementById('perform').click()`);
        await waitFor("!document.getElementById('back').hidden");
        assert.equal(await evaluate("document.getElementById('progress-view').classList.contains('complete')"), true);
        assert.equal((await fs.readFile(join(selected.path, "_app.asar"))).toString("base64"), config.official);
        assert(existsSync(join(selected.path, "app/index.js")));
        assert.equal(existsSync(join(config.stable, "app")), false);
        assert.equal((await fs.readFile(join(config.stable, "app.asar"))).toString("base64"), config.official);
        assert(existsSync(join(config.installedDist, "ocr/models/fra.traineddata.gz")));
        const { createHash } = require("node:crypto");
        const hash = bytes => createHash("sha256").update(bytes).digest("hex");
        assert.equal(hash(await fs.readFile(join(config.installedDist, "ocr/models/fra.traineddata.gz"))), config.modelHash);
        await evaluate("document.getElementById('uninstall-mode').click()");
        assert.equal(await evaluate("document.querySelectorAll('#targets input:not(:disabled)').length"), 1);
        await evaluate(`document.querySelector('#targets input[value="${selected.id}"]').click();document.getElementById('perform').click()`);
        await waitFor("!document.getElementById('back').hidden");
        assert.equal(await evaluate("document.getElementById('progress-view').classList.contains('complete')"), true);
        assert.equal((await fs.readFile(join(selected.path, "app.asar"))).toString("base64"), config.official);
        assert.equal(existsSync(join(selected.path, "app")), false);
        assert(existsSync(join(config.installedDist, "patcher.js")));
        assert.deepEqual(requests, []);
        await fs.writeFile(config.report, JSON.stringify({ ok: true, title: window.getTitle(), sandbox: true, selectedOnly: true, restored: true, nativePayloadIntact: true, actualPackagedEntry: true, actualWorker: true }));
        application.bridge.dispose();
        await backend.stop();
        clearTimeout(timeout);
        app.exit(0);
    } catch (error) {
        const page = await application?.window.webContents.executeJavaScript("document.body.innerText").catch(() => null);
        await fs.writeFile(config.report, JSON.stringify({ ok: false, error: error.stack, page, requests }));
        application?.bridge.dispose();
        await backend?.stop();
        clearTimeout(timeout);
        app.exit(1);
    }
}

async function runtime(format, root, packageInfo) {
    const { appDir, resources, application } = packageInfo;
    const fixture = join(temporary, `${format}-runtime`);
    const home = join(fixture, "home");
    const configHome = join(home, "config");
    const dataHome = join(home, "data");
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: configHome, XDG_DATA_HOME: dataHome, XDG_CACHE_HOME: join(home, "cache") };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.Midnightcord_USER_DATA_DIR;
    delete env.MIDNIGHTCORD_USER_DATA_DIR;
    await mkdir(configHome, { recursive: true });
    const officialSource = join(fixture, "official");
    await mkdir(officialSource);
    await writeFile(join(officialSource, "package.json"), JSON.stringify({ main: "index.js" }));
    await writeFile(join(officialSource, "index.js"), "module.exports = 'official fixture';");
    const officialArchive = join(fixture, "official.asar");
    await createPackage(officialSource, officialArchive);
    const official = (await readFile(officialArchive)).toString("base64");
    const stable = join(configHome, "discord/app-1.0.0/resources");
    const ptb = join(configHome, "discordptb/app-1.0.0/resources");
    for (const path of [stable, ptb]) { await mkdir(path, { recursive: true }); await cp(officialArchive, join(path, "app.asar")); }
    const config = {
        home, configHome, official, stable, report: join(fixture, "report.json"),
        modelHash: createHash("sha256").update(await readFile(join(resources, "payload/desktop/ocr/models/fra.traineddata.gz"))).digest("hex"),
        installedDist: join(dataHome, "midnightcord/dist"),
        backend: { version: packageInfo.manifest.version, platform: "linux", home, env, sourceDist: join(resources, "payload/desktop"), discoveryOptions: { includeSystem: false } }
    };
    // Only the extracted copy gets fixture paths and an empty process-list adapter.
    const graphiteMain = join(application, "installer/main.cjs");
    const main = await readFile(graphiteMain, "utf8");
    await writeFile(graphiteMain, main + `\nconst fixtureStart = module.exports.startInstaller;\nmodule.exports.startInstaller = options => (${graphiteFixture.toString()})(fixtureStart, createBackend, options, ${JSON.stringify(config)});\n`);
    const workerPath = join(application, "installer/worker.mjs");
    const worker = await readFile(workerPath, "utf8");
    assert(worker.includes("...workerData,"));
    await writeFile(workerPath, worker.replace("...workerData,", "...workerData, listRunning: async () => [],"));
    const sandbox = join(appDir, "chrome-sandbox");
    const sandboxStat = await lstat(sandbox);
    assert(sandboxStat.isFile() && !sandboxStat.isSymbolicLink(), "Only the extracted sandbox helper may be configured");
    if (sandboxStat.uid !== 0 || (sandboxStat.mode & 0o4777) !== 0o4755) {
        assert.equal(process.env.CI, "true", "Configure the extracted chrome-sandbox helper before running outside CI");
        assert(relative(root, sandbox) && !relative(root, sandbox).startsWith(".."));
        await command("sudo", ["-n", "chown", "root:root", sandbox]);
        await command("sudo", ["-n", "chmod", "4755", sandbox]);
    }
    let injector;
    try {
        injector = start(join(appDir, "install-vencord"), [], { cwd: appDir, env });
        const timer = setTimeout(() => injector.child.kill(), 60_000);
        const outcome = await injector.result.finally(() => clearTimeout(timer));
        const report = await readFile(config.report, "utf8").then(JSON.parse).catch(() => null);
        assert.equal(outcome.code, 0, JSON.stringify({ outcome, report }));
        assert.equal(report?.ok, true, JSON.stringify({ outcome, report }));
        return report;
    } finally {
        if (injector && injector.child.exitCode === null) injector.child.kill();
    }
}

try {
    for (const format of ["deb", "rpm"]) {
        const source = options[`--${format}`];
        const root = join(temporary, format);
        await extract(format, source, root);
        const info = await inspectPackage(root);
        await registrationLifecycle(format, info.appDir);
        const report = await runtime(format, root, info);
        console.log(JSON.stringify({ format, package: source, registrationLifecycle: true, injectionOnly: true, ...report }));
    }
} finally {
    const child = relative(workRoot, temporary);
    assert(child && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`), "Refusing cleanup outside the package-test workspace");
    await rm(temporary, { recursive: true, force: true });
}
