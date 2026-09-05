/*
 * Package the isolated OCR worker and its offline runtime assets
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const sha256 = data => createHash("sha256").update(data).digest("hex");

export async function prepareLocalOcr({ outputRoot = join(rootDir, "dist") } = {}) {
    const outputDirectory = resolve(outputRoot);
    const tesseractPackage = require.resolve("tesseract.js/package.json");
    const tesseractDir = dirname(tesseractPackage);
    const tesseractRequire = createRequire(tesseractPackage);
    const coreDir = dirname(tesseractRequire.resolve("tesseract.js-core/package.json"));
    const tesseract = JSON.parse(await readFile(tesseractPackage, "utf8"));
    if (tesseract.version !== "7.0.0") throw new Error("LocalOCR worker protocol requires tesseract.js 7.0.0; review the runtime before upgrading.");

    const assets = new Map();
    const worker = await build({
        stdin: {
            contents: [
                "globalThis.fetch = async () => { throw new Error('Network disabled in LocalOCR worker'); };",
                "console.log = console.warn = console.error = () => {};",
                `require(${JSON.stringify(join(tesseractDir, "src/worker-script/node/index.js"))});`
            ].join("\n"),
            resolveDir: rootDir,
            sourcefile: "local-ocr-worker-entry.js"
        },
        absWorkingDir: rootDir,
        platform: "node",
        format: "cjs",
        target: "node18",
        bundle: true,
        minify: true,
        legalComments: "eof",
        write: false,
        external: ["tesseract.js-core", "node:worker_threads", "worker_threads"]
    });
    assets.set("worker.cjs", Buffer.from(worker.outputFiles[0].contents));

    const coreEntries = await readdir(coreDir, { withFileTypes: true });
    const coreFiles = coreEntries.filter(entry => entry.isFile() && (
        ["index.js", "package.json", "LICENSE"].includes(entry.name)
        || /^tesseract-core(?:-[a-z]+)*\.(?:js|wasm)$/.test(entry.name)
    )).map(entry => entry.name).sort();
    const coreNames = new Set(coreFiles);
    const selector = await readFile(join(tesseractDir, "src/worker-script/node/getCore.js"), "utf8");
    const requiredCores = [...selector.matchAll(/require\(['"]tesseract\.js-core\/([^'"]+)['"]\)/g)].map(match => match[1]);
    if (!requiredCores.length) throw new Error("LocalOCR cannot determine the required Tesseract core variants.");
    for (const name of requiredCores) {
        if (!coreNames.has(`${name}.js`)) throw new Error(`LocalOCR core is missing ${name}.js`);
    }
    for (const name of coreFiles.filter(name => name.startsWith("tesseract-core") && name.endsWith(".js"))) {
        if (!coreNames.has(name.replace(/\.js$/, ".wasm"))) throw new Error(`LocalOCR core is missing the WASM file for ${name}`);
    }
    for (const name of coreFiles) assets.set(`node_modules/tesseract.js-core/${name}`, await readFile(join(coreDir, name)));
    assets.set("licenses/tesseract.js-LICENSE.md", await readFile(join(tesseractDir, "LICENSE.md")));
    for (const language of ["eng", "fra"]) {
        const modelPackage = require.resolve(`@tesseract.js-data/${language}/package.json`);
        const modelDir = dirname(modelPackage);
        assets.set(`models/${language}.traineddata.gz`, await readFile(join(modelDir, "4.0.0_best_int", `${language}.traineddata.gz`)));
        assets.set(`licenses/model-${language}-package.json`, await readFile(modelPackage));
        assets.set(`licenses/model-${language}-README.md`, await readFile(join(modelDir, "README.md")));
    }

    const files = [...assets.keys()].sort().map(path => ({ path, sha256: sha256(assets.get(path)) }));
    const manifest = { version: sha256(JSON.stringify(files)), files };
    assets.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
    const destinations = ["desktop", "midnightcord"].map(kind => join(outputDirectory, kind, "ocr"));
    for (const destination of destinations) {
        const withinOutput = relative(outputDirectory, destination);
        if (basename(destination) !== "ocr" || !withinOutput || isAbsolute(withinOutput) || withinOutput === ".." || withinOutput.startsWith(`..${sep}`)) {
            throw new Error("Refusing to replace an OCR directory outside the build output.");
        }
        await rm(destination, { recursive: true, force: true });
        for (const [path, data] of assets) {
            const target = join(destination, ...path.split("/"));
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, data);
        }
    }
    return { ...manifest, destinations };
}
