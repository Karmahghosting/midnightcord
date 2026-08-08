/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, session, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

let isSetup = false;

let frameNavigateListener: ((event: any, url: string, httpResponseCode: number, httpStatusText: string, isMainFrame: boolean) => void) | null = null;
let inPageNavigateListener: ((event: any, url: string, isMainFrame: boolean) => void) | null = null;

export function setup() {
    if (isSetup) return;
    isSetup = true;

    // Load extensions that were installed in previous sessions
    loadPersistedExtensions().catch(e => console.error("[PrivateBrowser] Extension preload failed:", e));

    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
    if (!mainWindow) return;

    // Track iframe navigation in real-time bypassing cross-origin restrictions.
    // IMPORTANT: this listener fires for EVERY subframe in Discord, including
    // MidnightcordNews, YoutubePlayer, QxChat, etc.  We must only forward
    // navigations whose URL matches a tab that belongs to the PrivateBrowser.
    // The renderer registers the active browser-tab URLs via
    // window.__privateBrowserFrameUrls (a Set-like object).
    frameNavigateListener = (_event: any, url: string, _code: number, _text: string, isMainFrame: boolean) => {
        if (!isMainFrame && url && (url.startsWith("http://") || url.startsWith("https://"))) {
            mainWindow.webContents.executeJavaScript(
                `(function(){
                    var urls = window.__privateBrowserFrameUrls;
                    if (!urls) return;
                    // Only propagate if this URL (or origin) belongs to a browser tab
                    var url = ${JSON.stringify(url)};
                    var origin = (function(){ try{ return new URL(url).origin; }catch(e){ return ''; } })();
                    var match = urls.has(url) || urls.has(origin);
                    if (!match) return;
                    (typeof window.__privateBrowserOnNavigate === "function") && window.__privateBrowserOnNavigate(url);
                })()`
            ).catch(() => {});
        }
    };

    inPageNavigateListener = (_event: any, url: string, isMainFrame: boolean) => {
        if (!isMainFrame && url && (url.startsWith("http://") || url.startsWith("https://"))) {
            mainWindow.webContents.executeJavaScript(
                `(function(){
                    var urls = window.__privateBrowserFrameUrls;
                    if (!urls) return;
                    var url = ${JSON.stringify(url)};
                    var origin = (function(){ try{ return new URL(url).origin; }catch(e){ return ''; } })();
                    var match = urls.has(url) || urls.has(origin);
                    if (!match) return;
                    (typeof window.__privateBrowserOnNavigate === "function") && window.__privateBrowserOnNavigate(url);
                })()`
            ).catch(() => {});
        }
    };

    mainWindow.webContents.on("did-frame-navigate" as any, frameNavigateListener);
    mainWindow.webContents.on("did-navigate-in-page" as any, inPageNavigateListener);
}

export function teardown() {
    if (!isSetup) return;
    isSetup = false;

    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
    if (mainWindow) {
        // Restore default window open handler (open externally)
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                shell.openExternal(url).catch(() => {});
            }
            return { action: "deny" };
        });

        if (frameNavigateListener) {
            mainWindow.webContents.removeListener("did-frame-navigate" as any, frameNavigateListener);
            frameNavigateListener = null;
        }
        if (inPageNavigateListener) {
            mainWindow.webContents.removeListener("did-navigate-in-page" as any, inPageNavigateListener);
            inPageNavigateListener = null;
        }
    }
}



/**
 * Execute navigation actions (back, forward, reload) on the active browser iframe subframe.
 * Uses Electron's WebFrameMain API to bypass cross-origin CORS locks.
 */
export async function navigateFrame(action: "back" | "forward" | "reload"): Promise<boolean> {
    try {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (!mainWindow) return false;

        const mainFrame = (mainWindow.webContents as any).mainFrame;
        if (!mainFrame) return false;

        let script = "";
        if (action === "back") script = "window.history.back()";
        else if (action === "forward") script = "window.history.forward()";
        else if (action === "reload") script = "window.location.reload()";

        const frames: any[] = mainFrame.framesInSubtree ?? mainFrame.frames ?? [];
        for (const frame of frames) {
            if (frame === mainFrame) continue;
            try {
                await frame.executeJavaScript(script);
            } catch (_) {}
        }
        return true;
    } catch (_) {
        return false;
    }
}


// ─── Extension Management ────────────────────────────────────────────────────

const EXTENSIONS_DIR = path.join(app.getPath("userData"), "midnightcord-extensions");

function ensureExtensionsDir() {
    if (!fs.existsSync(EXTENSIONS_DIR)) fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
}

/**
 * Extract the zip body from a .crx file (strips the CRX header).
 * Supports CRX2 and CRX3 formats.
 */
function extractCrxZip(crxBuffer: Buffer): Buffer {
    const magic = crxBuffer.toString("utf8", 0, 4);
    if (magic !== "Cr24") throw new Error("Not a valid .crx file");
    const version = crxBuffer.readUInt32LE(4);
    let zipStart: number;
    if (version === 2) {
        const pubkeyLen = crxBuffer.readUInt32LE(8);
        const sigLen = crxBuffer.readUInt32LE(12);
        zipStart = 16 + pubkeyLen + sigLen;
    } else if (version === 3) {
        const headerSize = crxBuffer.readUInt32LE(8);
        zipStart = 12 + headerSize;
    } else {
        throw new Error(`Unsupported CRX version: ${version}`);
    }
    return crxBuffer.slice(zipStart);
}

/**
 * Minimal zip extractor using Node's built-in zlib (no external deps).
 */
async function extractZip(zipBuffer: Buffer, destDir: string): Promise<void> {
    const zlib = require("zlib");
    const { promisify } = require("util");
    const inflateRaw = promisify(zlib.inflateRaw);
    let offset = 0;

    while (offset + 4 <= zipBuffer.length) {
        const sig = zipBuffer.readUInt32LE(offset);
        if (sig !== 0x04034b50) break;

        const compression = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
        const fileNameLen = zipBuffer.readUInt16LE(offset + 26);
        const extraLen = zipBuffer.readUInt16LE(offset + 28);
        const fileName = zipBuffer.toString("utf8", offset + 30, offset + 30 + fileNameLen);
        const dataOffset = offset + 30 + fileNameLen + extraLen;
        const compressedData = zipBuffer.slice(dataOffset, dataOffset + compressedSize);

        const fullPath = path.join(destDir, fileName);
        if (fileName.endsWith("/") || fileName.endsWith("\\")) {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            if (compression === 0) {
                fs.writeFileSync(fullPath, compressedData.slice(0, uncompressedSize));
            } else if (compression === 8) {
                const inflated = await inflateRaw(compressedData);
                fs.writeFileSync(fullPath, inflated);
            }
        }
        offset = dataOffset + compressedSize;
    }
}

function copyDirRecursive(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirRecursive(s, d);
        else fs.copyFileSync(s, d);
    }
}

export interface ExtensionInfo {
    id: string;
    name: string;
    version: string;
    description: string;
    iconUrl: string;
    dir: string;
}

/**
 * Install an extension from an unpacked folder or a .crx file.
 * The files are copied to the midnightcord-extensions userData directory,
 * so they persist across Discord restarts.
 */
export async function installExtension(srcPath: string): Promise<ExtensionInfo> {
    ensureExtensionsDir();

    let extDir: string;
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
        const manifestPath = path.join(srcPath, "manifest.json");
        if (!fs.existsSync(manifestPath)) throw new Error("No manifest.json found in folder");
        const extId = crypto.createHash("md5").update(srcPath + fs.statSync(manifestPath).mtimeMs).digest("hex");
        extDir = path.join(EXTENSIONS_DIR, extId);
        if (!fs.existsSync(extDir)) copyDirRecursive(srcPath, extDir);
    } else if (srcPath.toLowerCase().endsWith(".crx")) {
        const crxBuffer = fs.readFileSync(srcPath);
        const zipBuffer = extractCrxZip(crxBuffer);
        const extId = crypto.createHash("md5").update(crxBuffer.slice(0, 128)).digest("hex");
        extDir = path.join(EXTENSIONS_DIR, extId);
        if (!fs.existsSync(extDir)) {
            fs.mkdirSync(extDir, { recursive: true });
            await extractZip(zipBuffer, extDir);
        }
    } else {
        throw new Error("Provide an unpacked extension folder or a .crx file.");
    }

    const ext = await session.defaultSession.loadExtension(extDir, { allowFileAccess: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));

    // Resolve icon
    let iconUrl = "";
    const icons = manifest.icons ?? {};
    const iconFile = icons["128"] ?? icons["64"] ?? icons["48"] ?? icons["32"] ?? icons["16"] ?? "";
    if (iconFile) {
        try {
            const iconBuf = fs.readFileSync(path.join(extDir, iconFile));
            const ext2 = path.extname(iconFile).slice(1).toLowerCase() || "png";
            iconUrl = `data:image/${ext2};base64,${iconBuf.toString("base64")}`;
        } catch {}
    }

    return {
        id: ext.id,
        name: manifest.name || "Unknown Extension",
        version: manifest.version || "?",
        description: manifest.description || "",
        iconUrl,
        dir: extDir,
    };
}

/**
 * Load all persisted extensions on Discord startup.
 */
export async function loadPersistedExtensions(): Promise<ExtensionInfo[]> {
    ensureExtensionsDir();
    const loaded: ExtensionInfo[] = [];
    try {
        const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const extDir = path.join(EXTENSIONS_DIR, entry.name);
            const manifestPath = path.join(extDir, "manifest.json");
            if (!fs.existsSync(manifestPath)) continue;
            try {
                const ext = await session.defaultSession.loadExtension(extDir, { allowFileAccess: true });
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                let iconUrl = "";
                const icons = manifest.icons ?? {};
                const iconFile = icons["128"] ?? icons["64"] ?? icons["48"] ?? icons["32"] ?? icons["16"] ?? "";
                if (iconFile) {
                    try {
                        const iconBuf = fs.readFileSync(path.join(extDir, iconFile));
                        const ext2 = path.extname(iconFile).slice(1).toLowerCase() || "png";
                        iconUrl = `data:image/${ext2};base64,${iconBuf.toString("base64")}`;
                    } catch {}
                }
                loaded.push({
                    id: ext.id,
                    name: manifest.name || "Unknown",
                    version: manifest.version || "?",
                    description: manifest.description || "",
                    iconUrl,
                    dir: extDir,
                });
            } catch (e) {
                console.error("[PrivateBrowser] Failed to load extension:", extDir, e);
            }
        }
    } catch (e) {
        console.error("[PrivateBrowser] loadPersistedExtensions error:", e);
    }
    return loaded;
}

/**
 * List all currently loaded extensions from the session.
 */
export function listExtensions(): ExtensionInfo[] {
    try {
        const all = session.defaultSession.getAllExtensions() as Record<string, any>;
        return Object.values(all).map(ext => {
            const manifest = ext.manifest ?? {};
            const icons = manifest.icons ?? {};
            const iconFile = icons["128"] ?? icons["64"] ?? icons["48"] ?? "";
            let iconUrl = "";
            const extDir = ext.path ?? "";
            if (iconFile && extDir) {
                try {
                    const iconBuf = fs.readFileSync(path.join(extDir, iconFile));
                    const ext2 = path.extname(iconFile).slice(1).toLowerCase() || "png";
                    iconUrl = `data:image/${ext2};base64,${iconBuf.toString("base64")}`;
                } catch {}
            }
            return {
                id: ext.id,
                name: manifest.name || ext.name || "Unknown",
                version: manifest.version || "?",
                description: manifest.description || "",
                iconUrl,
                dir: extDir,
            };
        }).filter(e => e.dir.startsWith(EXTENSIONS_DIR));
    } catch { return []; }
}

/**
 * Remove an extension by ID, unload from session, and delete from disk.
 */
export async function removeExtension(extensionId: string): Promise<void> {
    try {
        const all = session.defaultSession.getAllExtensions() as Record<string, any>;
        const ext = all[extensionId];
        const extPath = ext?.path ?? "";
        session.defaultSession.removeExtension(extensionId);
        if (extPath && extPath.startsWith(EXTENSIONS_DIR) && fs.existsSync(extPath)) {
            fs.rmSync(extPath, { recursive: true, force: true });
        }
    } catch (e) {
        console.error("[PrivateBrowser] removeExtension error:", e);
    }
}

/** Open the extensions directory in the system file explorer. */
export function openExtensionsDir(): void {
    ensureExtensionsDir();
    shell.openPath(EXTENSIONS_DIR);
}

/** Open a folder picker dialog for selecting an unpacked extension. */
export async function pickExtensionFolder(): Promise<string | null> {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
        title: "Select Extension Folder",
        properties: ["openDirectory"],
        buttonLabel: "Select Extension",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
}
