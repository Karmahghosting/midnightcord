// Midnightcord preload — globalPaths fix + Equicord avec contextBridge
"use strict";

(function () {
    const Module = require("module");
    const path = require("path");
    const fs = require("fs");

    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
    const moduleDataPath = path.join(appData, "discord", "module_data");

    const _seenPaths = new Set(Module.globalPaths);
    function addGlobalPath(p) {
        if (_seenPaths.has(p)) return;
        _seenPaths.add(p);
        Module.globalPaths.push(p);
    }
    addGlobalPath(moduleDataPath);
    try {
        for (const modName of fs.readdirSync(moduleDataPath)) {
            const modDir = path.join(moduleDataPath, modName);
            try {
                if (!fs.statSync(modDir).isDirectory()) continue;
                for (const ver of fs.readdirSync(modDir)) {
                    const verDir = path.join(modDir, ver);
                    if (fs.statSync(verDir).isDirectory()) addGlobalPath(verDir);
                }
            } catch (_) { }
        }
    } catch (e) { }

    const _gpArr = Module.globalPaths.slice();
    const _gpSet = new Set(_gpArr);
    const _orig = Module._resolveLookupPaths;
    Module._resolveLookupPaths = function (request, parent) {
        if (parent) {
            if (!parent.paths || parent.paths.length === 0) {
                parent.paths = _gpArr.slice();
            } else {
                const ex = new Set(parent.paths);
                for (const p of _gpSet) { if (!ex.has(p)) parent.paths.push(p); }
            }
        }
        return _orig.call(this, request, parent);
    };
})();

// ─── Equicord preload avec contextBridge ─────────────────────────────────────
"use strict";
const { ipcRenderer, contextBridge, webFrame } = require("electron");

function r(e, ...o) { return ipcRenderer.invoke(e, ...o); }
function T(e, ...o) { return ipcRenderer.sendSync(e, ...o); }

var S = {};
try {
    const m = T("VencordGetPluginIpcMethodMap") || {};
    for (const [e, o] of Object.entries(m)) {
        const t = S[e] = {};
        for (const [s, R] of Object.entries(o)) t[s] = (...C) => r(R, ...C);
    }
} catch (e) { }

const VencordNative = {
    themes: {
        uploadTheme: async () => { throw new Error("uploadTheme is WEB only"); },
        deleteTheme: e => r("VencordDeleteTheme", e),
        getThemesDir: () => r("VencordGetThemesDir"),
        getThemesList: () => r("VencordGetThemesList"),
        getThemeData: e => r("VencordGetThemeData", e),
        getSystemValues: () => r("VencordGetThemeSystemValues"),
        openFolder: () => r("VencordOpenThemesFolder")
    },
    updater: {
        getUpdates: () => r("VencordGetUpdates"),
        update: () => r("VencordUpdate"),
        rebuild: () => r("VencordBuild"),
        getRepo: () => r("VencordGetRepo")
    },
    settings: {
        get: () => T("VencordGetSettings"),
        set: (e, o) => r("VencordSetSettings", e, o),
        getSettingsDir: () => r("VencordGetSettingsDir"),
        openFolder: () => r("VencordOpenSettingsFolder")
    },
    quickCss: {
        get: () => r("VencordGetQuickCss"),
        set: e => r("VencordSetQuickCss", e),
        addChangeListener(e) { ipcRenderer.on("VencordQuickCssUpdate", (o, t) => e(t)); },
        addThemeChangeListener(e) { ipcRenderer.on("VencordThemeUpdate", () => e()); },
        openFile: () => r("VencordOpenQuickCss"),
        openEditor: () => r("VencordOpenMonacoEditor"),
        getEditorTheme: () => T("VencordGetMonacoTheme")
    },
    native: {
        getVersions: () => process.versions,
        openExternal: e => r("VencordOpenExternal", e),
        getRendererCss: () => r("VencordGetRendererCss"),
        onRendererCssUpdate: () => { }
    },
    csp: {
        isDomainAllowed: (e, o) => r("VencordCspIsDomainAllowed", e, o),
        removeOverride: e => r("VencordCspRemoveOverride", e),
        requestAddOverride: (e, o, t) => r("VencordCspRequestAddOverride", e, o, t)
    },
    tray: {
        setUpdateState: e => ipcRenderer.send("VencordSetTrayUpdateState", e),
        onCheckUpdates: e => { ipcRenderer.on("VencordTrayCheckUpdates", e); },
        onRepair: e => { ipcRenderer.on("VencordTrayRepair", e); }
    },
    desktopCapture: { getSources: () => r("VencordGetDesktopSources") },
    pluginHelpers: S,
    worldBomb: {
        sequence: (word, lps, humanChance, targetX = -1, targetY = -1) =>
            r("WorldBombSequence", word, lps, humanChance, targetX, targetY),
        getCursorPos: () => r("WorldBombGetCursorPos"),
    },
    window: {
        setBackgroundMaterial: e => r("EquicordSetWindowBackgroundMaterial", e),
        setThumbarButtons: e => r("SoundCordSetThumbarButtons", e),
        onThumbarClick: e => { ipcRenderer.on("SoundCordThumbarButtonClick", (o, t) => e(t)); },
        removeThumbarClickListener: () => { ipcRenderer.removeAllListeners("SoundCordThumbarButtonClick"); }
    }
};

try {
    contextBridge.exposeInMainWorld("VencordNative", VencordNative);
} catch (e) {
    if (typeof window !== "undefined") window.VencordNative = VencordNative;
}

if (location.protocol !== "data:") {
    try { r("VencordInitFileWatchers"); } catch (e) { }

    // Injection du renderer.js via webFrame.executeJavaScript
    // Identique à l'original Equicord — c'est la méthode qui fonctionne
    try {
        let rendererJs;
        try {
            const rendererPath = path.join(__dirname, "renderer.js");
            if (fs.existsSync(rendererPath)) {
                rendererJs = fs.readFileSync(rendererPath, "utf-8");
            }
        } catch (_) {}
        if (!rendererJs) {
            rendererJs = T("VencordPreloadGetRendererJs");
        }
        if (rendererJs) {
            webFrame.executeJavaScript(rendererJs).catch(e => {
                console.error("[Midnightcord] renderer inject failed:", e?.message);
            });
        }
    } catch (e) {
        console.error("[Midnightcord] VencordPreloadGetRendererJs failed:", e);
    }

    if (process.env.DISCORD_PRELOAD) {
        try { require(process.env.DISCORD_PRELOAD); } catch (e) { }
    }
} else {
    if (typeof window !== "undefined") {
        window["setCss"] = (() => { let t; return e => { clearTimeout(t); t = setTimeout(() => VencordNative.quickCss.set(e), 300); }; })();
        window["getCurrentCss"] = VencordNative.quickCss.get;
        window["getTheme"] = VencordNative.quickCss.getEditorTheme;
    }
}
//# sourceURL=file:///VencordPreload
