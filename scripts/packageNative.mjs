/*
 * Build a self-contained Midnightcord native injection bundle
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const platformNames = { win32: "windows", darwin: "macos", linux: "linux" };
const platformName = platformNames[process.platform];

if (!platformName) {
    throw new Error("Plateforme non prise en charge: " + process.platform);
}
if (process.arch !== "x64" && process.arch !== "arm64") {
    throw new Error("Architecture non prise en charge: " + process.arch);
}

const sourceDist = join(rootDir, "dist", "desktop");
if (!existsSync(join(sourceDist, "patcher.js"))) {
    throw new Error("dist/desktop/patcher.js est introuvable. Lancez le build avant le packaging.");
}

const outputDir = join(rootDir, "release", "native");
const stagingDir = mkdtempSync(join(tmpdir(), "midnightcord-native-"));
const bundleDir = join(stagingDir, "Midnightcord");
const runtimeDir = join(bundleDir, "runtime");
const scriptsDir = join(bundleDir, "scripts");

mkdirSync(outputDir, { recursive: true });
mkdirSync(runtimeDir, { recursive: true });
mkdirSync(scriptsDir, { recursive: true });

try {
    cpSync(sourceDist, join(bundleDir, "dist", "desktop"), {
        recursive: true,
        filter: file => !file.endsWith(".map")
    });

    if (process.platform === "win32" && existsSync(join(rootDir, "mac"))) {
        cpSync(join(rootDir, "mac"), join(bundleDir, "dist", "desktop", "mac"), { recursive: true });
    }

    for (const filename of [
        "checkNodeVersion.js",
        "nativeInjection.mjs",
        "inject.mjs",
        "uninject.mjs"
    ]) {
        cpSync(join(rootDir, "scripts", filename), join(scriptsDir, filename));
    }
    cpSync(join(rootDir, "LICENSE"), join(bundleDir, "LICENSE"));

    const runtimeName = process.platform === "win32" ? "node.exe" : "node";
    const bundledRuntime = join(runtimeDir, runtimeName);
    cpSync(process.execPath, bundledRuntime);
    if (process.platform !== "win32") chmodSync(bundledRuntime, 0o755);

    const runtimeSize = statSync(bundledRuntime).size;
    if (runtimeSize < 1_000_000) {
        console.warn("[package] Le runtime Node local utilise des bibliotheques systeme.");
        console.warn("[package] Les runners GitHub officiels fournissent un binaire autonome pour la release.");
    }

    const windowsInstall = [
        "@echo off",
        "setlocal",
        "set \"ROOT=%~dp0\"",
        "\"%ROOT%runtime\\node.exe\" \"%ROOT%scripts\\inject.mjs\" --copy %*",
        "set \"EXIT_CODE=%ERRORLEVEL%\"",
        "pause",
        "exit /b %EXIT_CODE%",
        ""
    ].join("\r\n");
    const windowsUninstall = [
        "@echo off",
        "setlocal",
        "set \"ROOT=%~dp0\"",
        "\"%ROOT%runtime\\node.exe\" \"%ROOT%scripts\\uninject.mjs\" --purge %*",
        "set \"EXIT_CODE=%ERRORLEVEL%\"",
        "pause",
        "exit /b %EXIT_CODE%",
        ""
    ].join("\r\n");
    const unixInstall = [
        "#!/bin/sh",
        "set -eu",
        "ROOT=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
        "exec \"$ROOT/runtime/node\" \"$ROOT/scripts/inject.mjs\" --copy \"$@\"",
        ""
    ].join("\n");
    const unixUninstall = [
        "#!/bin/sh",
        "set -eu",
        "ROOT=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
        "exec \"$ROOT/runtime/node\" \"$ROOT/scripts/uninject.mjs\" --purge \"$@\"",
        ""
    ].join("\n");

    if (process.platform === "win32") {
        writeFileSync(join(bundleDir, "Install-Midnightcord.cmd"), windowsInstall);
        writeFileSync(join(bundleDir, "Uninstall-Midnightcord.cmd"), windowsUninstall);
    } else {
        const installName = process.platform === "darwin" ? "Install Midnightcord.command" : "install-midnightcord.sh";
        const uninstallName = process.platform === "darwin" ? "Uninstall Midnightcord.command" : "uninstall-midnightcord.sh";
        const installPath = join(bundleDir, installName);
        const uninstallPath = join(bundleDir, uninstallName);
        writeFileSync(installPath, unixInstall);
        writeFileSync(uninstallPath, unixUninstall);
        chmodSync(installPath, 0o755);
        chmodSync(uninstallPath, 0o755);
    }

    writeFileSync(join(bundleDir, "README.txt"), [
        "Midnightcord " + packageJson.version,
        "",
        "Cette archive injecte Midnightcord dans Discord natif afin de conserver le moteur vocal officiel.",
        "Fermez completement Discord avant installation ou desinstallation.",
        "",
        "Windows:",
        "  Double-cliquez sur Install-Midnightcord.cmd.",
        "",
        "macOS:",
        "  Ouvrez Install Midnightcord.command.",
        "",
        "Linux:",
        "  Lancez ./install-midnightcord.sh.",
        "",
        "Stable, PTB, Canary et Development sont detectes automatiquement.",
        "Utilisez --channel stable pour cibler uniquement Discord Stable.",
        ""
    ].join("\n"));

    const baseName = "Midnightcord-Native-" + packageJson.version + "-" + platformName + "-" + process.arch;
    let artifactPath;

    if (process.platform === "win32") {
        artifactPath = join(outputDir, baseName + ".zip");
        rmSync(artifactPath, { force: true });
        const escapedBundle = bundleDir.replaceAll("'", "''");
        const escapedArtifact = artifactPath.replaceAll("'", "''");
        execFileSync("powershell.exe", [
            "-NoProfile",
            "-Command",
            "Compress-Archive -LiteralPath '" + escapedBundle + "' -DestinationPath '" + escapedArtifact + "' -Force"
        ], { stdio: "inherit" });
    } else if (process.platform === "darwin") {
        artifactPath = join(outputDir, baseName + ".zip");
        rmSync(artifactPath, { force: true });
        execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", bundleDir, artifactPath], {
            stdio: "inherit"
        });
    } else {
        artifactPath = join(outputDir, baseName + ".tar.gz");
        rmSync(artifactPath, { force: true });
        execFileSync("tar", ["-czf", artifactPath, "-C", stagingDir, "Midnightcord"], {
            stdio: "inherit"
        });
    }

    const checksum = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
    writeFileSync(artifactPath + ".sha256", checksum + "  " + artifactPath.split(/[\\/]/).pop() + "\n");
    console.log("[package] Archive creee: " + artifactPath);
    console.log("[package] SHA256: " + checksum);
} finally {
    rmSync(stagingDir, { recursive: true, force: true });
}
