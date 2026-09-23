/*
 * Package the self-contained Midnightcord graphical installer.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { build } from "electron-builder";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--dir", "--x64", "--arm64", "--help"]);

for (const arg of args) {
    if (!allowedArgs.has(arg)) throw new Error(`Unknown installer packaging option: ${arg}`);
}
if (args.has("--help")) {
    console.log("Usage: node scripts/packageInstaller.mjs [--x64 | --arm64] [--dir]");
    console.log("Build on the target OS. Windows: portable EXE x64; macOS: ZIP; Linux: tar.gz.");
    console.log("Archives: release/installer. Unpacked --dir builds: release/installer-unpacked/<platform>-<arch>.");
    process.exit(0);
}

const platformNames = { win32: "windows", darwin: "macos", linux: "linux" };
const platformName = platformNames[process.platform];
const isDir = args.has("--dir");
const requestedArch = args.has("--arm64") ? "arm64" : args.has("--x64") ? "x64" : process.arch;
if (!platformName) throw new Error(`Unsupported installer platform: ${process.platform}`);
if (args.has("--x64") && args.has("--arm64")) throw new Error("Choose one architecture per build.");
if (!["x64", "arm64"].includes(requestedArch)) throw new Error(`Unsupported installer architecture: ${requestedArch}`);
if (process.platform === "win32" && requestedArch !== "x64") throw new Error("The Windows installer is packaged for x64 only.");

const rootPackage = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
const electronVersion = require("electron/package.json").version;
const desktopDir = join(rootDir, "dist", "desktop");
for (const relativePath of [
    "installer/main.cjs", "installer/preload.cjs", "installer/core.mjs", "installer/worker.mjs",
    "installer/ui/index.html", "scripts/nativeInjection.mjs", "static/icon.png",
    "dist/desktop/patcher.js", "dist/desktop/preload.js", "dist/desktop/renderer.js", "dist/desktop/renderer.css"
]) {
    try {
        if (!(await stat(join(rootDir, relativePath))).isFile()) throw new Error("Not a file");
    } catch {
        throw new Error(`Required installer file is missing: ${relativePath}. Build the client before packaging.`);
    }
}

// Keep pnpm's lifecycle environment out of the dependency-free staging app.
delete process.env.npm_config_user_agent;
delete process.env.npm_execpath;
delete process.env.npm_node_execpath;
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

const stagingParent = await realpath(tmpdir());
const stagingDir = await mkdtemp(join(stagingParent, "midnightcord-installer-"));
const outputDir = join(rootDir, "release", "installer");
const buildOutputDir = isDir
    ? join(rootDir, "release", "installer-unpacked", `${platformName}-${requestedArch}`)
    : join(stagingDir, "output");
const artifactBaseName = `Midnightcord-Installer-${rootPackage.version}-${platformName}-${requestedArch}`;

try {
    await writeFile(join(stagingDir, "package.json"), JSON.stringify({
        name: "midnightcord-installer",
        productName: "Midnightcord Installer",
        version: rootPackage.version,
        description: "Install, repair or remove Midnightcord in the official Discord client.",
        main: "installer/main.cjs",
        author: "Midnightcord contributors",
        license: "GPL-3.0-or-later",
        homepage: rootPackage.homepage
    }, null, 2) + "\n");

    await build({
        projectDir: stagingDir,
        publish: "never",
        dir: isDir,
        x64: requestedArch === "x64",
        arm64: requestedArch === "arm64",
        ...(process.platform === "win32" ? { win: isDir ? [] : ["portable"] }
            : process.platform === "darwin" ? { mac: isDir ? [] : ["zip"] }
                : { linux: isDir ? [] : ["tar.gz"] }),
        config: {
            appId: "st.midnightcord.installer",
            productName: "Midnightcord Installer",
            electronVersion,
            artifactName: `${artifactBaseName}.\${ext}`,
            asar: false,
            // No app dependencies: skip both installation and node_modules collection.
            beforeBuild: async () => false,
            afterPack: async context => {
                if (process.platform !== "win32") return;
                // The existing rcedit dependency avoids winCodeSign's privileged symlink extraction.
                const { rcedit } = await import("rcedit");
                await rcedit(join(context.appOutDir, "Midnightcord Installer.exe"), {
                    icon: join(rootDir, "static", "icon.ico"),
                    "file-version": rootPackage.version.split("-")[0],
                    "product-version": rootPackage.version,
                    "version-string": {
                        CompanyName: "Midnightcord contributors",
                        FileDescription: "Midnightcord Installer",
                        ProductName: "Midnightcord Installer",
                        OriginalFilename: "Midnightcord Installer.exe"
                    },
                    "requested-execution-level": "asInvoker"
                });
            },
            ...(process.platform === "darwin" ? {
                afterSign: async context => {
                    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
                    await execFileAsync("codesign", ["--verify", "--deep", "--strict", appPath]);
                }
            } : {}),
            forceCodeSigning: false,
            compression: "normal",
            directories: { output: buildOutputDir, buildResources: join(rootDir, "static") },
            files: [
                "package.json",
                { from: join(rootDir, "installer"), to: "installer", filter: ["**/*", "!**/*.test.*", "!**/*.map", "!**/fixtures{,/**}"] },
                { from: join(rootDir, "scripts"), to: "scripts", filter: ["nativeInjection.mjs"] },
                { from: join(rootDir, "static"), to: "static", filter: ["icon.png"] },
                { from: rootDir, to: ".", filter: ["LICENSE"] }
            ],
            extraResources: [{ from: desktopDir, to: "payload/desktop", filter: ["**/*", "!**/*.map"] }],
            win: { icon: join(rootDir, "static", "icon.ico"), signAndEditExecutable: false, requestedExecutionLevel: "asInvoker" },
            portable: { requestExecutionLevel: "user" },
            mac: { icon: join(rootDir, "static", "icon.png"), identity: "-", hardenedRuntime: false, gatekeeperAssess: false, notarize: false },
            linux: { icon: join(rootDir, "static", "icon.png"), executableName: "midnightcord-installer", category: "Utility" }
        }
    });

    if (isDir) {
        console.log(`[installer] Unpacked application: ${buildOutputDir}`);
    } else {
        const extensions = process.platform === "win32" ? ["exe"]
            : process.platform === "darwin" ? ["zip"]
                : ["tar.gz"];
        await mkdir(outputDir, { recursive: true });
        for (const extension of extensions) {
            const artifactName = `${artifactBaseName}.${extension}`;
            const source = join(buildOutputDir, artifactName);
            const destination = join(outputDir, artifactName);
            const hash = createHash("sha256");
            for await (const chunk of createReadStream(source)) hash.update(chunk);
            const temporaryDestination = `${destination}.${process.pid}.tmp`;
            try {
                await copyFile(source, temporaryDestination);
                await rename(temporaryDestination, destination);
            } finally {
                await rm(temporaryDestination, { force: true });
            }
            await writeFile(`${destination}.sha256`, `${hash.digest("hex")}  ${basename(destination)}\n`);
            console.log(`[installer] ${destination}`);
        }
    }
} finally {
    if (dirname(stagingDir) !== stagingParent || !basename(stagingDir).startsWith("midnightcord-installer-")) {
        throw new Error("Refusing to remove an unexpected staging directory.");
    }
    await rm(stagingDir, { recursive: true, force: true });
}
