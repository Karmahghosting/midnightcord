const path = require("node:path");
const rootPackage = require("./package.json");

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "fr.midnightcord.Midnightcord",
    productName: "Midnightcord",
    electronVersion: require("electron/package.json").version,
    copyright: "Copyright 2026 Midnightcord contributors",
    asar: true,
    compression: "maximum",
    removePackageScripts: true,
    electronLanguages: ["fr", "en-US"],
    extraMetadata: {
        version: rootPackage.version,
        main: "dist/js/main.js"
    },
    files: [
        "package.json",
        { from: "dist", to: "dist", filter: ["**/*", "!**/*.map"] },
        { from: "static", to: "static", filter: ["**/*"] }
    ],
    extraResources: [
        { from: "dist/midnightcord.asar", to: "midnightcord.asar" },
        { from: "dist/desktop.asar", to: "desktop.asar" }
    ],
    directories: {
        app: ".",
        output: path.resolve(__dirname, "release/standalone"),
        buildResources: path.resolve(__dirname, "static")
    },
    publish: null,
    linux: {
        target: ["dir"],
        executableName: "midnightcord",
        icon: path.resolve(__dirname, "static/icon.png"),
        category: "Network;Chat"
    }
};
