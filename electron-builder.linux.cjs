const path = require("node:path");
const rootPackage = require("./package.json");

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "st.midnightcord.app",
    productName: "Midnightcord",
    electronVersion: rootPackage.devDependencies.electron.replace(/^[^0-9]*/, ""),
    copyright: "Copyright 2026 Midnightcord contributors",
    artifactName: "${productName}-${version}-linux-${arch}.${ext}",

    // A single archive means fewer filesystem lookups and a smaller install.
    asar: true,
    compression: "maximum",
    npmRebuild: false,
    removePackageScripts: true,
    electronLanguages: ["fr", "en-US"],

    extraMetadata: {
        version: rootPackage.version,
        main: "dist/js/main.js",
        homepage: "https://source.nightcord.st/nightcord/nightcord"
    },
    files: [
        "package.json",
        { from: path.resolve(__dirname, "dist/js"), to: "dist/js", filter: ["**/*", "!**/*.map", "!**/*.ts"] },
        { from: path.resolve(__dirname, "static"), to: "static", filter: ["**/*"] },
        { from: path.resolve(__dirname, "LICENSE"), to: "LICENSE" }
    ],
    extraResources: [
        {
            from: path.resolve(__dirname, "dist/midnightcord.asar"),
            to: "midnightcord.asar"
        }
    ],
    directories: {
        app: ".",
        output: path.resolve(__dirname, "release"),
        buildResources: path.resolve(__dirname, "static")
    },
    protocols: [
        {
            name: "Midnightcord",
            schemes: ["midnightcord"]
        }
    ],
    beforePack: path.resolve(__dirname, "scripts/build/beforePack.mjs"),
    afterPack: path.resolve(__dirname, "scripts/build/afterPack.mjs"),

    linux: {
        target: ["AppImage", "deb", "tar.gz"],
        executableName: "midnightcord",
        icon: "static/icon.png",
        category: "Network",
        maintainer: "Midnightcord contributors",
        vendor: "Midnightcord",
        synopsis: "Optimized Discord desktop client",
        description: "Midnightcord is a Linux-first Discord desktop client based on Nightcord, Equicord and Vencord."
    }
};
