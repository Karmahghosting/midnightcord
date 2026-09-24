const path = require("node:path");
const rootPackage = require("./package.json");

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "st.midnightcord.installer",
    productName: "Midnightcord",
    electronVersion: require("electron/package.json").version,
    copyright: "Copyright 2026 Midnightcord contributors",
    artifactName: "${productName}-${version}-linux-${arch}.${ext}",

    // The installer worker and injection helper need physical filesystem paths.
    asar: false,
    compression: "maximum",
    beforeBuild: async () => false,
    removePackageScripts: true,
    electronLanguages: ["fr", "en-US"],

    extraMetadata: {
        version: rootPackage.version,
        main: "packaging/linux-entry.cjs",
        desktopName: "midnightcord-installer.desktop",
        homepage: "https://github.com/Karmahghosting/midnightcord"
    },
    files: [
        "package.json",
        { from: path.resolve(__dirname, "packaging"), to: "packaging", filter: ["linux-entry.cjs", "start-installer.cjs"] },
        { from: path.resolve(__dirname, "installer"), to: "installer", filter: ["**/*", "!**/*.test.*", "!**/*.map", "!**/fixtures{,/**}"] },
        { from: path.resolve(__dirname, "scripts"), to: "scripts", filter: ["nativeInjection.mjs"] },
        { from: path.resolve(__dirname, "static"), to: "static", filter: ["icon.png"] },
        { from: __dirname, to: ".", filter: ["LICENSE"] }
    ],
    extraResources: [
        {
            from: path.resolve(__dirname, "dist/desktop"),
            to: "payload/desktop",
            filter: ["**/*", "!**/*.map"]
        }
    ],
    directories: {
        app: ".",
        output: path.resolve(__dirname, "release"),
        buildResources: path.resolve(__dirname, "static")
    },
    publish: null,

    linux: {
        target: ["AppImage", "deb", "rpm", "tar.gz"],
        executableName: "midnightcord-installer",
        // A nonempty argument prevents AppImage's default --no-sandbox flag.
        executableArgs: ["--install-vencord"],
        desktop: {
            entry: {
                Name: "Install Vencord",
                Comment: "Install, repair or remove Midnightcord in Discord",
                StartupWMClass: "midnightcord-installer",
            }
        },
        icon: path.resolve(__dirname, "static/icon.png"),
        category: "Utility",
        maintainer: "Midnightcord contributors",
        vendor: "Midnightcord",
        synopsis: "Install Midnightcord in Discord",
        description: "Install, repair or remove Midnightcord in an existing official Discord installation."
    },
    deb: { packageName: "midnightcord" },
    rpm: { packageName: "midnightcord" }
};
