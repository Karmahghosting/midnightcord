/*
 * Midnightcord Linux launcher
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { app } = require("electron");
const { execFile } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

async function startLinuxInstaller() {
    // Keep the installer's profile separate from existing Midnightcord settings.
    const profile = join(app.getPath("appData"), "midnightcord-installer");
    const sessionData = join(profile, "sessionData");
    mkdirSync(sessionData, { recursive: true });
    app.setName("midnightcord-installer");
    app.setPath("userData", profile);
    app.setPath("sessionData", sessionData);
    app.setDesktopName("midnightcord-installer.desktop");

    // Never inherit an opt-out from an external AppImage launcher.
    app.commandLine.removeSwitch("no-sandbox");
    process.argv = process.argv.filter(argument => !/^--no-sandbox(?:=|$)/.test(argument));
    app.enableSandbox();

    const { startInstaller } = require("../installer/main.cjs");
    return startInstaller({ title: "Install Vencord" });
}

async function registerLinuxInstaller() {
    const helper = join(dirname(process.execPath), "register-installer.sh");
    await new Promise((resolve, reject) => {
        execFile(helper, [], { timeout: 10_000, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => {
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
            if (error) reject(error);
            else resolve();
        });
    });
}

module.exports = { registerLinuxInstaller, startLinuxInstaller };
