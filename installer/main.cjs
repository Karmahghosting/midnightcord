/*
 * Midnightcord native installer
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { Worker } = require("node:worker_threads");

function createBackend(options, onProgress) {
    const worker = new Worker(join(__dirname, "worker.mjs"), { workerData: options });
    const pending = new Map();
    let sequence = 0;
    let stopped = false;
    function rejectAll(message) {
        stopped = true;
        for (const { reject } of pending.values()) reject(new Error(message));
        pending.clear();
    }
    worker.on("message", message => {
        if (message.type === "progress") { onProgress(message.progress); return; }
        const promise = pending.get(message.id);
        if (!promise) return;
        pending.delete(message.id);
        if (message.error) promise.reject(new Error(message.error));
        else promise.resolve(message.result);
    });
    worker.on("error", () => rejectAll("Le moteur d’installation a rencontré une erreur. Fermez puis relancez l’injecteur."));
    worker.on("exit", () => rejectAll("Le moteur d’installation s’est arrêté. Fermez puis relancez l’injecteur."));
    const call = (method, request) => new Promise((resolve, reject) => {
        if (stopped) { reject(new Error("Le moteur d’installation est arrêté.")); return; }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, method, request });
    });
    return { getState: () => call("getState"), scan: () => call("scan"), perform: request => call("perform", request), stop: () => worker.terminate() };
}

function registerIpc({ ipcMain, window, backend, uiUrl }) {
    let busy = false;
    const channels = [];
    const valid = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === uiUrl;
    const handle = (name, callback) => {
        const channel = "midnightcord-installer:" + name;
        channels.push(channel);
        ipcMain.handle(channel, (event, ...args) => {
            if (!valid(event)) throw new Error("Accès à l’injecteur refusé.");
            return callback(...args);
        });
    };
    handle("getState", () => backend.getState());
    handle("scan", () => backend.scan());
    handle("perform", async request => {
        if (busy) return { ok: false, message: "Une opération est déjà en cours.", results: [] };
        busy = true;
        try { return await backend.perform(request); }
        finally { busy = false; }
    });
    handle("minimize", () => window.minimize());
    handle("close", () => {
        if (busy) return { ok: false, message: "Attendez la fin de l’opération avant de fermer l’injecteur." };
        window.close();
        return { ok: true };
    });
    return { isBusy: () => busy, dispose: () => channels.forEach(channel => ipcMain.removeHandler(channel)) };
}

async function startInstaller(options = {}) {
    if (!app.requestSingleInstanceLock()) { app.quit(); return null; }
    await app.whenReady();
    const uiPath = join(__dirname, "ui", "index.html");
    const uiUrl = pathToFileURL(uiPath).href;
    const window = new BrowserWindow({
        title: "Midnightcord Installer", width: 980, height: 700, minWidth: 800, minHeight: 620,
        backgroundColor: "#08090b", frame: false, show: false, icon: join(__dirname, "..", "static", "icon.png"),
        webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    window.setMenuBarVisibility(false);
    let lastProgress = { stage: "checking", percent: 0, message: "" };
    const onProgress = progress => {
        lastProgress = progress;
        if (!window.isDestroyed()) window.webContents.send("midnightcord-installer:progress", progress);
    };
    const backend = options.backend ?? createBackend({
        version: app.isPackaged ? app.getVersion() : require("../package.json").version,
        sourceDist: app.isPackaged ? join(process.resourcesPath, "payload", "desktop") : join(__dirname, "..", "dist", "desktop")
    }, onProgress);
    options.onBackendReady?.({ backend, window, onProgress });
    const bridge = registerIpc({ ipcMain, window, backend, uiUrl });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("will-attach-webview", event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    const preventBusyClose = event => {
        if (bridge.isBusy()) {
            event.preventDefault();
            onProgress({ ...lastProgress, message: "Attendez la fin de l’opération avant de fermer l’injecteur." });
        }
    };
    window.on("close", preventBusyClose);
    app.on("before-quit", preventBusyClose);
    app.on("second-instance", () => { if (!window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.focus(); } });
    window.on("closed", () => {
        bridge.dispose();
        void backend.stop?.();
        app.removeListener("before-quit", preventBusyClose);
        app.quit();
    });
    window.once("ready-to-show", () => { if (options.show !== false) window.show(); });
    await window.loadFile(uiPath);
    return { window, backend, bridge };
}

module.exports = { createBackend, registerIpc, startInstaller };
if (require.main === module) {
    startInstaller().catch(error => {
        console.error("[Midnightcord Installer]", error.message);
        app.exit(1);
    });
}
