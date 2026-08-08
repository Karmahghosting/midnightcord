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
        desktopName: "midnightcord.desktop",
        homepage: "https://github.com/Karmahghosting/midnightcord"
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

    publish: {
        provider: "github",
        owner: "Karmahghosting",
        repo: "midnightcord",
        releaseType: "release"
    },

    linux: {
        target: ["AppImage", "deb", "rpm", "tar.gz"],
        executableName: "midnightcord",
        desktop: {
            entry: {
                Name: "Midnightcord",
                Comment: "Optimized Discord desktop client",
                StartupWMClass: "midnightcord",
            }
        },
        icon: "static/icon.png",
        category: "Network",
        maintainer: "Midnightcord contributors",
        vendor: "Midnightcord",
        synopsis: "Optimized Discord desktop client",
        description: "Midnightcord is a cross-platform Discord client mod based on Nightcord, Equicord and Vencord."
    }
};
