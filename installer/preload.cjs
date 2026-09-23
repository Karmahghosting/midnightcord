/*
 * Midnightcord native installer
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("midnightcordInstaller", {
    getState: () => ipcRenderer.invoke("midnightcord-installer:getState"),
    scan: () => ipcRenderer.invoke("midnightcord-installer:scan"),
    perform: request => ipcRenderer.invoke("midnightcord-installer:perform", request),
    onProgress(callback) {
        if (typeof callback !== "function") throw new TypeError("Callback required");
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on("midnightcord-installer:progress", listener);
        return () => ipcRenderer.removeListener("midnightcord-installer:progress", listener);
    },
    minimize: () => ipcRenderer.invoke("midnightcord-installer:minimize"),
    close: () => ipcRenderer.invoke("midnightcord-installer:close")
});
