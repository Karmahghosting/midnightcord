/*
 * Optional Electron ASAR smoke test; requires the local Electron runtime and a native build
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createPackage } from "@electron/asar";
import { build } from "esbuild";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
let electronPath;
try {
    electronPath = require("electron");
    await access(electronPath);
} catch {
    throw new Error("Electron is not available locally. Run node node_modules/electron/install.js before this optional ASAR test.");
}
const archive = join(rootDir, "dist", "desktop.asar");
await access(archive).catch(() => { throw new Error("Build the native distribution before testing dist/desktop.asar."); });
const workRoot = resolve(rootDir, "../work/validation");
await mkdir(workRoot, { recursive: true });
const temporary = await mkdtemp(join(workRoot, "local-ocr-asar-"));
const sha256 = data => createHash("sha256").update(data).digest("hex");
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAARgAAABgCAIAAABJ6vrDAAADKElEQVR4nO3ZMZLcCAwEwf3/p+9eQAMDNMAQM23tsEBGW/r7D2j7uw6Af4EhwQBDggGGBAMMCQYYEgwwJBhgSDDAkGCAIcEAQ4IBhgQDDAkGGBIMMCQYYEgwwJBggCHBAEOCAa0h/T0Yiyv+/tO/T7t6P1Vv63mS/i6R5tYfhw+o/v7UB6i6ej9Vb+t5kv4ukebWH4cPqP7+1Aeouno/VW/reZL+LpHm1h+HD6j+/tQHqLp6P1Vv63mS/i6R5tYfhw+o/v7UB6i6ej9Vb+t5kv4ukebWH4cPqP7+1Aeouno/VW/reZL+LpHm1h+HD6j+/tQHqLp6P1Vv63mS/i6R5tYfhw+o/v7UB6i6ej9Vb+t5kv4ukebWH4cPqP7+G16onvf0bN5rSEF6bns27zWkID23PZv3GlKQntuezXsNKUjPbc/mvYYUpOe2Z/NeQwrSc9uzea8hBem57dm815CC9Nz2bN5rSEF6bns27zWkID23PZv3GlKQntuezXsNKUjPbc/mvYYUpOe2Z/NeQwrSc9uzea8hBem57dm8NzKktKueqffTeecdX+vZvNeQBp5b7em8846v9Wzea0gDz632dN55x9d6Nu81pIHnVns677zjaz2b9xrSwHOrPZ133vG1ns17DWngudWezjvv+FrP5r2GNPDcak/nnXd8rWfzXkMaeG61p/POO77Ws3mv/5AN0nPbs3mvIQXpue3ZvNeQgvTc9mzea0hBem57Nu81pCA9tz2b9xpSkJ7bns17DSlIz23P5r2GFKTntmfzXkMK0nPbs3mvIQXpue3ZvNeQgvTc9mzea0hBem57Nu81pCA9tz2b9xpSkJ7bns17DSlIz23P5r2GFKTntmfz3k8MKU3Pbz3pzupzOwxpgJ7fetKd1ed2GNIAPb/1pDurz+0wpAF6futJd1af22FIA/T81pPurD63w5AG6PmtJ91ZfW6HIQ3Q81tPurP63A5DGqDnt550Z/W5HWf/GQf/EkOCAYYEAwwJBhgSDDAkGGBIMMCQYIAhwQBDggGGBAMMCQYYEgwwJBhgSDDAkGCAIcEAQ4IBhgQDDAkG/A+XzEruV9tRRQAAAABJRU5ErkJggg==";

try {
    const invalidArchives = [];
    for (const [name, path, expectedHash] of [
        ["corrupt", "worker.cjs", sha256("different bytes")],
        ["traversal", "../escape.txt", sha256("fixture")],
        ["absolute", "/escape.txt", sha256("fixture")],
        ["empty-segment", "models//escape.txt", sha256("fixture")]
    ]) {
        const source = join(temporary, name, "ocr");
        await mkdir(source, { recursive: true });
        await writeFile(join(source, "worker.cjs"), "fixture");
        await writeFile(join(source, "manifest.json"), JSON.stringify({ version: "a".repeat(64), files: [{ path, sha256: expectedHash }] }));
        const pathToArchive = join(temporary, `${name}.asar`);
        await createPackage(dirname(source), pathToArchive);
        invalidArchives.push(pathToArchive);
    }
    const reportPath = join(temporary, "report.json");
    const helperPath = join(temporary, "electron-smoke.cjs");
    await build({
        stdin: {
            contents: `
                const assert = require("node:assert/strict");
                const { app } = require("electron");
                const { createHash } = require("node:crypto");
                const { access, readFile, writeFile } = require("node:fs/promises");
                const { join, relative, isAbsolute, sep } = require("node:path");
                const { prepareAssets } = require("./src/midnightcordplugins/localOCR/assets.ts");
                const { OcrRuntime } = require("./src/midnightcordplugins/localOCR/runtime.ts");
                const temporary = ${JSON.stringify(temporary)};
                const reportPath = ${JSON.stringify(reportPath)};
                app.setName("Midnightcord OCR Smoke Test");
                app.setPath("userData", join(temporary, "electron-user-data"));
                app.setPath("sessionData", join(temporary, "electron-session-data"));
                app.commandLine.appendSwitch("disable-gpu");
                let runtime;
                app.whenReady().then(async () => {
                    const source = join(${JSON.stringify(archive)}, "ocr");
                    const cache = join(temporary, "cache");
                    const directory = await prepareAssets(source, cache);
                    const withinCache = relative(cache, directory);
                    assert.ok(withinCache && !isAbsolute(withinCache) && !withinCache.startsWith(".." + sep));
                    const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
                    const hash = data => createHash("sha256").update(data).digest("hex");
                    for (const file of manifest.files) assert.equal(hash(await readFile(join(directory, file.path))), file.sha256);
                    await writeFile(join(directory, "worker.cjs"), "corrupted local cache");
                    assert.equal(await prepareAssets(source, cache), directory);
                    assert.equal(hash(await readFile(join(directory, "worker.cjs"))), manifest.files.find(file => file.path === "worker.cjs").sha256);
                    for (const archive of ${JSON.stringify(invalidArchives)}) {
                        await assert.rejects(prepareAssets(join(archive, "ocr"), cache), /invalid-assets/);
                    }
                    await assert.rejects(access(join(cache, "escape.txt")));
                    runtime = new OcrRuntime(() => prepareAssets(source, cache), 100, 15_000);
                    const result = await runtime.recognize(1, "asar-real", Buffer.from(${JSON.stringify(pngBase64)}, "base64"), "fra+eng");
                    assert.equal(result.ok, true, JSON.stringify(result));
                    assert.match(result.text, /^HELLO\\s*$/);
                    runtime.cancel(1);
                    await writeFile(reportPath, JSON.stringify({ ok: true, electron: process.versions.electron, files: manifest.files.length, recognized: result.text.trim(), extraction: "real-asar", cacheRepair: true, invalidArchivesRejected: ${invalidArchives.length} }));
                    app.exit(0);
                }).catch(async error => {
                    runtime?.cancel(1);
                    await writeFile(reportPath, JSON.stringify({ ok: false, error: String(error), stack: error.stack }));
                    app.exit(1);
                });
            `,
            resolveDir: rootDir,
            sourcefile: "electron-local-ocr-smoke.js"
        },
        absWorkingDir: rootDir,
        outfile: helperPath,
        bundle: true,
        platform: "node",
        format: "cjs",
        external: ["electron", "node:worker_threads", "worker_threads"]
    });
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const outcome = await new Promise((resolve, reject) => {
        const child = spawn(electronPath, [helperPath], { cwd: temporary, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-8000); });
        child.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-8000); });
        const timeout = setTimeout(() => child.kill(), 30_000);
        child.once("error", error => { clearTimeout(timeout); reject(error); });
        child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal, output }); });
    });
    const report = await readFile(reportPath, "utf8").then(JSON.parse).catch(() => ({ ok: false, outcome }));
    assert.equal(outcome.code, 0, JSON.stringify(report));
    assert.equal(report.ok, true, JSON.stringify(report));
    console.log(JSON.stringify(report));
} finally {
    const child = relative(workRoot, temporary);
    if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`) || !basename(temporary).startsWith("local-ocr-asar-")) {
        throw new Error("Refusing to remove an ASAR test directory outside its workspace.");
    }
    await rm(temporary, { recursive: true, force: true });
}
