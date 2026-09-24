/*
 * Midnightcord Linux launcher
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { app } = require("electron");
const { registerLinuxInstaller, startLinuxInstaller } = require("./start-installer.cjs");
const registration = process.argv.includes("--register-installer");

(registration ? registerLinuxInstaller() : startLinuxInstaller()).then(() => {
    if (registration) app.exit(0);
}).catch(error => {
    console.error("[Midnightcord Installer]", error.message);
    app.exit(1);
});
