/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./updater";
import "./ipcPlugins";
import "./settings";

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeTheme, screen, shell, systemPreferences } from "electron";
import monacoHtml from "file://monacoWin.html?minify&base64";
import { FSWatcher, mkdirSync, readFileSync, watch, writeFileSync } from "fs";
import { open, readdir, readFile, unlink } from "fs/promises";
import { join, normalize } from "path";

import { makeLinksOpenExternally } from "../midnightcord/main/utils/makeLinksOpenExternally";
import { registerCspIpcHandlers } from "./csp/manager";
import { ALLOWED_PROTOCOLS, DATA_DIR, QUICK_CSS_PATH, SETTINGS_DIR, THEMES_DIR } from "./utils/constants";

const RENDERER_CSS_PATH = join(__dirname, "renderer.css");
const USERPLUGINS_DIR = join(DATA_DIR, "userplugins");

mkdirSync(THEMES_DIR, { recursive: true });
mkdirSync(USERPLUGINS_DIR, { recursive: true });

registerCspIpcHandlers();

export function ensureSafePath(basePath: string, path: string) {
    const normalizedBasePath = normalize(basePath + "/");
    const newPath = join(basePath, path);
    const normalizedPath = normalize(newPath);
    const base = normalizedBasePath.toLowerCase();
    const target = normalizedPath.toLowerCase();
    return target.startsWith(base) ? normalizedPath : null;
}

export function validateSender(event: any): boolean {
    if (!event || !event.sender) return false;
    const frame = event.senderFrame;
    if (!frame) return false;
    const { url } = frame;
    if (!url) return false;

    if (url.startsWith("file://")) {
        const normalizedPath = normalize(url.replace("file://", ""));
        const appPath = normalize(app.getAppPath());
        return normalizedPath.startsWith(appPath);
    }

    if (url.startsWith("data:")) return false;

    try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:") {
            const host = parsed.hostname.toLowerCase();
            return host === "discord.com" || host.endsWith(".discord.com") || host === "discordapp.com" || host.endsWith(".discordapp.com");
        }
    } catch {}
    return false;
}

function verifySignature(filePath: string): Promise<boolean> {
    if (process.platform !== "win32") return Promise.resolve(true);
    const { execFile } = require("child_process");
    return new Promise<boolean>(resolve => {
        execFile("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            `(Get-AuthenticodeSignature -FilePath '${filePath.replace(/'/g, "''")}').Status`
        ], (error: any, stdout: string) => {
            if (error) {
                resolve(false);
                return;
            }
            resolve(stdout.trim() === "Valid");
        });
    });
}

function readCss() {
    return readFile(QUICK_CSS_PATH, "utf-8").catch(() => "");
}

async function listThemes(): Promise<{ fileName: string; content: string; }[]> {
    try {
        const files = await readdir(THEMES_DIR);
        return await Promise.all(files.map(async fileName => ({ fileName, content: await getThemeData(fileName) })));
    } catch {
        return [];
    }
}

function getThemeData(fileName: string) {
    fileName = fileName.replace(/\?v=\d+$/, "");
    const safePath = ensureSafePath(THEMES_DIR, fileName);
    if (!safePath) return Promise.reject(`Unsafe path ${fileName}`);
    return readFile(safePath, "utf-8");
}

ipcMain.handle(IpcEvents.WORLD_BOMB_TYPE, async (event, text: string, delay: number = 50) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    if (process.platform !== "win32") return;
    const { spawn } = require("child_process");
    const { writeFileSync, unlinkSync, mkdtempSync, rmSync } = require("fs");
    const { join } = require("path");
    const { tmpdir } = require("os");

    if (!/^[\x20-\x7E]*$/.test(text)) {
        throw new Error("WorldBombType: disallowed characters");
    }
    const safeDelay = Math.max(0, Math.min(10000, delay));

    const psLines = [
        "Add-Type -AssemblyName System.WindowsForms;",
        "$text = $args[0];",
        "$delay = [int]$args[1];",
        "foreach ($char in $text.ToCharArray()) {",
        "  [System.Windows.Forms.SendKeys]::SendWait($char);",
        "  if ($delay -gt 0) { Start-Sleep -m $delay; }",
        "}",
    ];
    const psScript = psLines.join("\r\n");
    const tempDir = mkdtempSync(join(tmpdir(), "midnightcord-wb-"));
    const tempFile = join(tempDir, "sendkeys.ps1");
    try {
        writeFileSync(tempFile, "\uFEFF" + psScript, "utf8");
        const child = spawn("powershell", [
            "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", tempFile, text, String(safeDelay)
        ]);
        await new Promise<void>((resolve, reject) => {
            child.on("error", reject);
            child.on("exit", code => {
                if (code === 0) resolve();
                else reject(new Error(`PowerShell exit code ${code}`));
            });
        });
    } finally {
        try { unlinkSync(tempFile); } catch {}
        try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
});

function runPowershellScript(psScript: string): Promise<void> {
    if (process.platform !== "win32") return Promise.resolve();
    const { spawn } = require("child_process");
    const { writeFileSync, unlinkSync, mkdtempSync, rmSync } = require("fs");
    const { join } = require("path");
    const { tmpdir } = require("os");
    const tempDir = mkdtempSync(join(tmpdir(), "midnightcord-ps-"));
    const tempFile = join(tempDir, "script.ps1");
    return new Promise<void>((resolve, reject) => {
        try {
            writeFileSync(tempFile, "\uFEFF" + psScript, "utf8");
            const child = spawn("powershell", [
                "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", tempFile
            ]);
            child.on("error", reject);
            child.on("exit", code => {
                try { unlinkSync(tempFile); } catch {}
try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
                if (code === 0) resolve();
                else reject(new Error(`PowerShell exit code ${code}`));
            });
        } catch (e) {
            try { unlinkSync(tempFile); } catch {}
            try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
            reject(e);
        }
    });
}

ipcMain.handle(IpcEvents.WORLD_BOMB_PRESS_ENTER, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return runPowershellScript(`
        $sig = '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'
        Add-Type -MemberDefinition $sig -Name WinAPI -Namespace NC -ErrorAction SilentlyContinue
        [NC.WinAPI]::keybd_event(0x0D, 0x1C, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 20
        [NC.WinAPI]::keybd_event(0x0D, 0x1C, 2, [UIntPtr]::Zero)
    `);
});

ipcMain.handle(IpcEvents.WORLD_BOMB_PRESS_BACKSPACE, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return runPowershellScript("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')");
});

ipcMain.handle(IpcEvents.WORLD_BOMB_CLICK, (event, x: number, y: number) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    const safeX = Math.max(0, Math.min(99999, Math.round(x)));
    const safeY = Math.max(0, Math.min(99999, Math.round(y)));
    return runPowershellScript(`
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name "Win32" -Namespace Win32 -PassThru | Out-Null;
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${safeX}, ${safeY});
        [Win32.Win32]::mouse_event(0x0002, 0, 0, 0, 0);
        [Win32.Win32]::mouse_event(0x0004, 0, 0, 0, 0);
    `);
});

ipcMain.handle(IpcEvents.WORLD_BOMB_SEQUENCE, async (
    event,
    word: string,
    lps: number,
    humanChance: number,
    targetX: number = -1,
    targetY: number = -1
) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    if (process.platform !== "win32") return;
    const { spawn } = require("child_process");
    const { writeFileSync, unlinkSync, mkdtempSync, rmSync } = require("fs");
    const { join } = require("path");
    const { tmpdir } = require("os");

    if (!/^[\x20-\x7E]+$/.test(word)) {
        throw new Error("WorldBombSequence: disallowed characters");
    }
    const safeLps = Math.max(1, Math.min(100, lps));
    const safeHumanChance = Math.max(0, Math.min(100, humanChance));

    let targetWindow = BrowserWindow.fromWebContents(event.sender);
    let mainHwnd = 0;
    if (streamProofWindow && targetWindow === streamProofWindow) {
        const allWins = BrowserWindow.getAllWindows();
        const mainWin = allWins.find(w => w !== streamProofWindow && !w.isDestroyed());
        if (mainWin) {
            targetWindow = mainWin;
            try {
                const handleBuf = mainWin.getNativeWindowHandle();
                if (handleBuf && handleBuf.length >= 4) {
                    mainHwnd = handleBuf.readInt32LE(0);
                }
            } catch (err) {
                console.error("Error reading main window handle:", err);
            }
        }
    } else if (targetWindow) {
        try {
            const handleBuf = targetWindow.getNativeWindowHandle();
            if (handleBuf && handleBuf.length >= 4) {
                mainHwnd = handleBuf.readInt32LE(0);
            }
        } catch (err) {
            console.error("Error reading window handle:", err);
        }
    }

    const bounds = targetWindow?.getBounds() ?? { x: 0, y: 0, width: 1280, height: 720 };
    const centerX = targetX >= 0 ? Math.round(targetX) : Math.round(bounds.x + bounds.width / 2);
    const centerY = targetY >= 0 ? Math.round(targetY) : Math.round(bounds.y + bounds.height / 2);

    const minMs = Math.max(10, Math.round(1000 / (safeLps * 1.5)));
    const maxMs = Math.max(minMs + 1, Math.round(1000 / safeLps));
    const baseMs = Math.round((minMs + maxMs) / 2);

    const lines: string[] = [
        "$ErrorActionPreference = \"Stop\"",
        "try {",
        "  Add-Type -AssemblyName System.Windows.Forms",
        "  Add-Type -AssemblyName System.Drawing",
        "  $sig = '[DllImport(\"user32.dll\")] public static extern void mouse_event(uint a, uint b, uint c, uint d, uint e); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'",
        "  Add-Type -MemberDefinition $sig -Name WinAPI -Namespace NC -ErrorAction SilentlyContinue",
        "  $handle = [IntPtr]::Zero"
    ];

    if (mainHwnd > 0) {
        lines.push(`  $handle = [IntPtr]${mainHwnd}`);
    } else {
        lines.push(`  $proc = Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue`);
        lines.push("  if ($proc) { $handle = $proc.MainWindowHandle }");
    }

    lines.push(
        "  if ($handle -ne [IntPtr]::Zero) {",
        "    [NC.WinAPI]::SetForegroundWindow($handle) | Out-Null",
        "    Start-Sleep -Milliseconds 10",
        "  }",
        `  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${centerX}, ${centerY})`,
        "  [NC.WinAPI]::mouse_event(2, 0, 0, 0, 0)",
        "  [NC.WinAPI]::mouse_event(4, 0, 0, 0, 0)",
        "  Start-Sleep -Milliseconds 10"
    );

    for (const char of word) {
        if (safeHumanChance > 0) {
            lines.push(`  if ((Get-Random -Minimum 1 -Maximum 101) -le ${safeHumanChance}) {`);
            lines.push("    [System.Windows.Forms.SendKeys]::SendWait('x')");
            lines.push(`    Start-Sleep -Milliseconds ${baseMs}`);
            lines.push("    [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')");
            lines.push(`    Start-Sleep -Milliseconds ${baseMs}`);
            lines.push("  }");
        }
        lines.push(`  [System.Windows.Forms.SendKeys]::SendWait('${char.replace(/'/g, "''")}')`);
        lines.push(`  Start-Sleep -Milliseconds (Get-Random -Minimum ${minMs} -Maximum ${maxMs})`);
    }

    lines.push("  [NC.WinAPI]::keybd_event(0x0D, 0x1C, 0, [UIntPtr]::Zero)");
    lines.push("  Start-Sleep -Milliseconds 20");
    lines.push("  [NC.WinAPI]::keybd_event(0x0D, 0x1C, 2, [UIntPtr]::Zero)");
    lines.push("} catch { exit 1 }");

    const psScript = lines.join("\r\n");
    const tempDir = mkdtempSync(join(tmpdir(), "midnightcord-wbs-"));
    const tempFile = join(tempDir, "sequence.ps1");
    try {
        writeFileSync(tempFile, "\uFEFF" + psScript, "utf8");
        await new Promise<void>((resolve, reject) => {
            const child = spawn("powershell.exe", [
                "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", tempFile
            ]);
            child.on("error", reject);
            child.on("exit", code => {
                if (code === 0) resolve();
                else reject(new Error(`PowerShell exit code ${code}`));
            });
        });
    } finally {
        try { unlinkSync(tempFile); } catch {}
        try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
});
ipcMain.handle(IpcEvents.WORLD_BOMB_GET_CURSOR_POS, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return screen.getCursorScreenPoint();
});

let streamProofWindow: BrowserWindow | null = null;
ipcMain.handle(IpcEvents.WORLD_BOMB_OPEN_WINDOW, (event, lps: number = 50, humanChance: number = 10, safeMode: boolean = false, theme: string = "", playMode: string = "Normal", noSpace: boolean = false, groqKey: string = "", words: string[] = [], streamProof: boolean = false) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    if (streamProofWindow) {
        streamProofWindow.close();
        streamProofWindow = null;
        return { status: "closed" };
    }

    streamProofWindow = new BrowserWindow({
        width: 326,
        height: 180,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: join(__dirname, "worldbomb-preload.js"),
            sandbox: false,
            webSecurity: false
        }
    });

    try {
        streamProofWindow.setContentProtection(streamProof);
    } catch (e) {
        console.error("setContentProtection error:", e);
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 12px; background: transparent; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; -webkit-app-region: no-drag; }
* { -webkit-app-region: no-drag; }
#drag-header { -webkit-app-region: drag; }
.nc-wb-overlay {
    position: relative;
    background: #242528;
    color: #dbdee1;
    border-radius: 12px;
    padding: 16px;
    width: 300px;
    box-sizing: border-box;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    user-select: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.nc-wb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    width: calc(100% - 30px);
    cursor: grab;
}
.nc-wb-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 6px;
}
.nc-wb-close {
    position: absolute;
    top: 14px;
    right: 14px;
    cursor: pointer;
    color: #b5bac1;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 10px;
    z-index: 99999;
    -webkit-app-region: no-drag;
}
.nc-wb-close:hover {
    color: #dbdee1;
    background: rgba(78, 80, 88, 0.16);
}
.nc-wb-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.nc-wb-input-row {
    display: flex;
    gap: 8px;
}
.nc-wb-input {
    flex: 1;
    background: #1e1f22;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 8px 10px;
    color: #dbdee1;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
}
.nc-wb-input:focus {
    border-color: #5865f2;
}
.nc-wb-button {
    background: #5865f2;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
}
.nc-wb-button:hover {
    background: #4e5dcd;
}
.nc-wb-button:active {
    background: #3c4aa9;
}
.nc-wb-status {
    font-size: 11px;
    color: #949ba4;
    font-weight: 500;
}
.nc-wb-definition {
    font-size: 11px;
    line-height: 1.4;
    color: #dbdee1;
    background: #2b2d31;
    padding: 8px 10px;
    border-radius: 0 6px 6px 0;
    border-left: 3px solid #5865f2;
    max-height: 60px;
    overflow-y: auto;
}
.nc-wb-definition::-webkit-scrollbar {
    width: 4px;
}
.nc-wb-definition::-webkit-scrollbar-track {
    background: transparent;
}
.nc-wb-definition::-webkit-scrollbar-thumb {
    background: #4e5058;
    border-radius: 2px;
}
.nc-wb-definition::-webkit-scrollbar-thumb:hover {
    background: #6d6f78;
}

/* Settings styling */
.nc-wb-range-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
}
.nc-wb-range-container label {
    font-size: 11px;
    font-weight: 600;
    color: #949ba4;
    text-transform: uppercase;
}
.nc-wb-range-val {
    color: #dbdee1;
    font-weight: 700;
    float: right;
}
.nc-wb-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #1e1f22;
    outline: none;
    margin: 4px 0;
}
.nc-wb-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #5865f2;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.nc-wb-settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.nc-wb-settings-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.nc-wb-settings-label {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
}
.nc-wb-settings-sublabel {
    font-size: 10px;
    color: #949ba4;
}
.nc-wb-switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    cursor: pointer;
}
.nc-wb-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}
.nc-wb-switch-slider {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: #80848e;
    transition: .15s ease;
    border-radius: 10px;
}
.nc-wb-switch-slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .15s ease;
    border-radius: 50%;
}
input:checked + .nc-wb-switch-slider {
    background-color: #23a55a;
}
input:checked + .nc-wb-switch-slider:before {
    transform: translateX(16px);
}

/* Custom Dropdown select style */
.nc-wb-select-custom {
    position: relative;
    width: 100%;
}
.nc-wb-select-trigger {
    background: #1e1f22;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 8px 10px;
    color: #dbdee1;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    box-sizing: border-box;
}
.nc-wb-select-trigger:hover {
    border-color: rgba(255, 255, 255, 0.16);
}
.nc-wb-select-dropdown {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0; right: 0;
    background: #1e1f22;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.24);
    z-index: 10000;
    overflow: hidden;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-sizing: border-box;
}
.nc-wb-select-option {
    padding: 6px 10px;
    color: #b5bac1;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
}
.nc-wb-select-option:hover {
    background: rgba(78, 80, 88, 0.16);
    color: #dbdee1;
}
.nc-wb-select-option.selected {
    background: #5865f2;
    color: #ffffff;
}

/* Footer & Settings Toggle button */
.nc-wb-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-app-region: no-drag;
    pointer-events: auto;
}
.nc-wb-settings-btn {
    cursor: pointer;
    color: #b5bac1;
    font-size: 14px;
    transition: color 0.15s ease, transform 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-app-region: no-drag;
    pointer-events: auto;
    padding: 4px;
}
.nc-wb-settings-btn:hover {
    color: #dbdee1;
    transform: rotate(30deg);
}
.nc-wb-status-footer {
    font-size: 10px;
    color: #949ba4;
    font-weight: 500;
}
</style>
</head>
<body>
<div class="nc-wb-overlay">
    <div class="nc-wb-close" id="btn-close">✕</div>
    <div class="nc-wb-header" id="drag-header">
        <h3>🎯 WordBomb Helper</h3>
    </div>
    
    <!-- Home View -->
    <div class="nc-wb-content" id="view-home">
        <div class="nc-wb-input-row">
            <input type="text" class="nc-wb-input" id="syllable" placeholder="Enter Syllable..." autofocus autocomplete="off" spellcheck="false" />
            <button class="nc-wb-button" id="btn-find">FIND</button>
        </div>
        <div class="nc-wb-status" id="status">Ready...</div>
        <div id="definition-container" style="display: none;" class="nc-wb-definition">
            <strong style="color: #5865f2">Definition:</strong> <span id="definition-text"></span>
        </div>
    </div>

    <!-- Settings View -->
    <div class="nc-wb-content" id="view-settings" style="display: none;">
        <div class="nc-wb-range-container">
            <label>Speed (LPS) <span class="nc-wb-range-val" id="val-lps">50</span></label>
            <input type="range" min="10" max="100" step="1" class="nc-wb-slider" id="slide-lps" />
        </div>
        <div class="nc-wb-range-container">
            <label>Error Chance <span class="nc-wb-range-val" id="val-error">0%</span></label>
            <input type="range" min="0" max="100" step="1" class="nc-wb-slider" id="slide-error" />
        </div>
        <div class="nc-wb-range-container">
            <label>Theme (Optional)</label>
            <input type="text" class="nc-wb-input" id="input-theme" placeholder="e.g. tech, nature..." />
        </div>
        <div class="nc-wb-range-container" style="margin-bottom: 12px;">
            <label>Play Style</label>
            <div class="nc-wb-select-custom" id="select-playmode">
                <div class="nc-wb-select-trigger" id="playmode-trigger">
                    <span id="playmode-label">Normal</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5H7z"/>
                    </svg>
                </div>
                <div class="nc-wb-select-dropdown" id="playmode-dropdown" style="display: none;">
                    <div class="nc-wb-select-option" data-value="Normal">Normal</div>
                    <div class="nc-wb-select-option" data-value="Pro">Pro Mod (Long & Complex)</div>
                    <div class="nc-wb-select-option" data-value="Noob">Noob Mod (Short & Simple)</div>
                </div>
            </div>
        </div>
        <div class="nc-wb-settings-row">
            <div class="nc-wb-settings-info">
                <span class="nc-wb-settings-label">No Spaces or Dashes</span>
                <span class="nc-wb-settings-sublabel">Do not type words with spaces/dashes</span>
            </div>
            <label class="nc-wb-switch">
                <input type="checkbox" id="chk-nospace" />
                <span class="nc-wb-switch-slider"></span>
            </label>
        </div>
        <div class="nc-wb-settings-row">
            <div class="nc-wb-settings-info">
                <span class="nc-wb-settings-label">Safe Mode (Def.)</span>
                <span class="nc-wb-settings-sublabel">Generate AI word definitions</span>
            </div>
            <label class="nc-wb-switch">
                <input type="checkbox" id="chk-safemode" />
                <span class="nc-wb-switch-slider"></span>
            </label>
        </div>
        <div class="nc-wb-settings-row" style="margin-bottom: 12px;">
            <div class="nc-wb-settings-info">
                <span class="nc-wb-settings-label">StreamProof</span>
                <span class="nc-wb-settings-sublabel">Hide window from stream capture</span>
            </div>
            <label class="nc-wb-switch">
                <input type="checkbox" id="chk-streamproof" />
                <span class="nc-wb-switch-slider"></span>
            </label>
        </div>
        <button class="nc-wb-button" id="btn-back" style="width: 100%;">BACK</button>
    </div>

    <!-- Footer -->
    <div class="nc-wb-footer">
        <div class="nc-wb-settings-btn" id="btn-settings">⚙</div>
        <div class="nc-wb-status-footer" id="status-footer">LPS: 50 | Error: 0%</div>
    </div>
</div>

<script>
    // Variables & settings
    let dictionary = ${JSON.stringify(words)};
    let history = [];
    let badWords = new Set();
    let themeWords = new Set();
    
    // Load local storage settings or default values
    const loadSetting = (key, def) => {
        try {
            const val = localStorage.getItem(key);
            if (val !== null) return val;
        } catch {}
        return def;
    };
    const saveSetting = (key, val) => {
        try { localStorage.setItem(key, String(val)); } catch {}
    };

    let lps = parseFloat(loadSetting('wb_lps', '${lps}'));
    let humanChance = parseInt(loadSetting('wb_humanChance', '${humanChance}'));
    let safeMode = loadSetting('wb_safeMode', '${safeMode}') === 'true';
    let theme = loadSetting('wb_theme', '${theme}');
    let playMode = loadSetting('wb_playMode', '${playMode}');
    let noSpace = loadSetting('wb_noSpace', '${noSpace}') === 'true';
    let streamProof = loadSetting('wb_streamProof', '${streamProof}') === 'true';
    const groqKey = "${groqKey}";

    // Set initial UI states
    document.getElementById('status').innerText = "Ready (" + dictionary.length + " words)";
    document.getElementById('status-footer').innerText = "LPS: " + lps + " | Error: " + humanChance + "%";
    
    // Setup inputs values in settings
    document.getElementById('slide-lps').value = lps;
    document.getElementById('val-lps').innerText = lps;
    document.getElementById('slide-error').value = humanChance;
    document.getElementById('val-error').innerText = humanChance + "%";
    document.getElementById('input-theme').value = theme;
    document.getElementById('chk-nospace').checked = noSpace;
    document.getElementById('chk-safemode').checked = safeMode;
    document.getElementById('chk-streamproof').checked = streamProof;
    window.worldBombAPI.setStreamProof(streamProof);
    
    // Setup PlayMode selected
    const trigger = document.getElementById('playmode-trigger');
    const dropdown = document.getElementById('playmode-dropdown');
    const playmodeLabel = document.getElementById('playmode-label');
    
    // Set playmode trigger label text
    const styleOptions = {
        'Normal': 'Normal',
        'Pro': 'Pro Mod (Long & Complex)',
        'Noob': 'Noob Mod (Short & Simple)'
    };
    playmodeLabel.innerText = styleOptions[playMode] || 'Normal';
    document.querySelectorAll('.nc-wb-select-option').forEach(o => {
        if (o.getAttribute('data-value') === playMode) o.classList.add('selected');
        else o.classList.remove('selected');
    });

    // Theme fetching
    function fetchTheme() {
        if (theme.trim().length > 0) {
            fetch("https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(theme) + "&utf8=&format=json&srlimit=1")
                .then(r => r.json())
                .then(d => {
                    if (d.query && d.query.search && d.query.search[0] && d.query.search[0].pageid) {
                        const pageId = d.query.search[0].pageid;
                        return fetch("https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=" + pageId + "&format=json");
                    }
                    throw new Error("No page");
                })
                .then(r => r.json())
                .then(d => {
                    const pages = d.query && d.query.pages;
                    if (pages) {
                        const textObj = Object.values(pages)[0];
                        if (textObj && textObj.extract) {
                            themeWords.clear();
                            const words = textObj.extract.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñæœ]+/g) || [];
                            words.forEach(w => {
                                if (w.length > 3) themeWords.add(w);
                            });
                            if (themeWords.size > 0) {
                                document.getElementById('status').innerText = "Ready (" + dictionary.length + " words) (+ Theme)";
                            }
                        }
                    }
                }).catch(e => console.error("Theme fetch error:", e));
        }
    }
    fetchTheme();

    // Toggle Settings panel
    let isSettingsOpen = false;
    const homeView = document.getElementById('view-home');
    const settingsView = document.getElementById('view-settings');
    const btnSettings = document.getElementById('btn-settings');
    
    function toggleSettings() {
        isSettingsOpen = !isSettingsOpen;
        if (isSettingsOpen) {
            homeView.style.display = 'none';
            settingsView.style.display = 'flex';
            btnSettings.innerText = '✕';
            window.worldBombAPI.resize(326, 450);
        } else {
            settingsView.style.display = 'none';
            homeView.style.display = 'flex';
            btnSettings.innerText = '⚙';
            
            // Adjust height based on definition container visibility
            const hasDef = document.getElementById('definition-container').style.display !== 'none';
            window.worldBombAPI.resize(326, hasDef ? 220 : 180);
            setTimeout(() => document.getElementById('syllable').focus(), 50);
        }
    }
    btnSettings.onclick = toggleSettings;
    document.getElementById('btn-back').onclick = toggleSettings;

    // Trigger settings updates
    document.getElementById('slide-lps').oninput = (e) => {
        lps = parseFloat(e.target.value);
        document.getElementById('val-lps').innerText = lps;
        document.getElementById('status-footer').innerText = "LPS: " + lps + " | Error: " + humanChance + "%";
        saveSetting('wb_lps', lps);
    };
    document.getElementById('slide-error').oninput = (e) => {
        humanChance = parseInt(e.target.value);
        document.getElementById('val-error').innerText = humanChance + "%";
        document.getElementById('status-footer').innerText = "LPS: " + lps + " | Error: " + humanChance + "%";
        saveSetting('wb_humanChance', humanChance);
    };
    document.getElementById('input-theme').onchange = (e) => {
        theme = e.target.value.toLowerCase().trim();
        saveSetting('wb_theme', theme);
        fetchTheme();
    };
    document.getElementById('chk-nospace').onchange = (e) => {
        noSpace = e.target.checked;
        saveSetting('wb_noSpace', noSpace);
    };
    document.getElementById('chk-safemode').onchange = (e) => {
        safeMode = e.target.checked;
        saveSetting('wb_safeMode', safeMode);
        if (!safeMode) document.getElementById('definition-container').style.display = 'none';
    };
    document.getElementById('chk-streamproof').onchange = (e) => {
        streamProof = e.target.checked;
        saveSetting('wb_streamProof', streamProof);
        window.worldBombAPI.setStreamProof(streamProof);
    };

    // Custom select trigger
    trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'flex';
        dropdown.style.display = isOpen ? 'none' : 'flex';
        trigger.style.borderColor = isOpen ? 'rgba(255, 255, 255, 0.08)' : '#5865f2';
    };
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
        trigger.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    });
    document.querySelectorAll('.nc-wb-select-option').forEach(opt => {
        opt.onclick = (e) => {
            e.stopPropagation();
            const val = opt.getAttribute('data-value');
            playMode = val;
            playmodeLabel.innerText = opt.innerText;
            dropdown.style.display = 'none';
            trigger.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            saveSetting('wb_playMode', val);
            document.querySelectorAll('.nc-wb-select-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        };
    });

    // FIND / Search Logic
    const letters = "abcdefghijklmnopqrstuvwxyz-".split("");
    function getMissingAlphabet() {
        if (history.length === 0) return letters;
        return history[history.length - 1].alphabet;
    }

    function computeScore(word, currentMissing) {
        let score = 0;
        let found = new Set();
        for (let char of word) {
            if (currentMissing.includes(char) && !found.has(char)) {
                score += 100;
                found.add(char);
            }
        }
        if (themeWords.has(word)) {
            score += 1000;
        }
        if (playMode === "Pro") {
            score += word.length * 5;
        } else if (playMode === "Noob") {
            score -= word.length * 10;
        }
        return score;
    }

    function processSearch() {
        const syl = document.getElementById('syllable').value.toLowerCase().trim();
        if (!syl || dictionary.length === 0) return;
        
        let validWords = dictionary.filter(w => {
            const low = w.toLowerCase();
            if (!low.includes(syl)) return false;
            if (badWords.has(low)) return false;
            if (noSpace && (low.includes(' ') || low.includes('-'))) return false;
            if (playMode === "Pro" && low.length < 13) return false;
            if (playMode === "Noob" && low.length > 7) return false;
            return true;
        });
        if (validWords.length === 0) {
            document.getElementById('status').innerText = "No word found!";
            document.getElementById('status').style.color = "#ef4444";
            return;
        }

        const currentMissing = getMissingAlphabet();
        validWords.sort((a, b) => computeScore(b, currentMissing) - computeScore(a, currentMissing));
        
        const bestWord = validWords[0];
        document.getElementById('status').innerText = "Typing: " + bestWord + "...";
        document.getElementById('status').style.color = "#5865f2";
        
        let newMissing = currentMissing.filter(c => !bestWord.includes(c));
        if (newMissing.length === 0) newMissing = letters;
        history.push({ alphabet: newMissing, word: bestWord });
        badWords.add(bestWord);
        
        document.getElementById('syllable').value = "";
        document.body.style.pointerEvents = "none";
        
        if (safeMode) {
            const defContainer = document.getElementById('definition-container');
            const defText = document.getElementById('definition-text');
            defContainer.style.display = 'block';
            defText.innerText = 'Generating AI definition...';
            
            // Adjust height since definition container is shown
            if (!isSettingsOpen) window.worldBombAPI.resize(326, 220);

            if (!groqKey) {
                defText.innerText = "Error: Groq API key not found.";
            } else {
                fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer " + groqKey,
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        temperature: 0.7,
                        max_tokens: 150,
                        messages: [{
                            role: "user",
                            content: 'Give a very short definition (1 simple sentence) for the following word in French, explaining what it is concretely. Word: "' + bestWord + '"'
                        }]
                    }),
                })
                .then(r => r.json())
                .then(data => {
                    const ans = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    if (ans) {
                        defText.innerText = ans.trim();
                    } else {
                        defText.innerText = "AI could not define this word.";
                    }
                })
                .catch(() => defText.innerText = "Network error.");
            }
        } else {
            document.getElementById('definition-container').style.display = 'none';
            if (!isSettingsOpen) window.worldBombAPI.resize(326, 180);
        }

        let timeoutId = setTimeout(() => {
            document.body.style.pointerEvents = "auto";
            document.getElementById('status').innerText = "Ready (Timeout)";
            document.getElementById('status').style.color = "#ef4444";
            document.getElementById('syllable').focus();
        }, 5000);

        window.worldBombAPI.sequence(bestWord, lps, humanChance)
            .then(() => {
                clearTimeout(timeoutId);
                document.getElementById('status').innerText = "Ready!";
            })
            .catch(err => {
                clearTimeout(timeoutId);
                document.getElementById('status').innerText = "Input error";
                document.getElementById('status').style.color = "#ef4444";
            })
            .finally(() => {
                document.body.style.pointerEvents = "auto";
                setTimeout(() => document.getElementById('syllable').focus(), 50);
            });
    }

    document.getElementById('btn-find').onclick = processSearch;
    document.getElementById('btn-close').onclick = () => {
        window.worldBombAPI.closeWindow();
    };
    document.getElementById('syllable').onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            processSearch();
        }
    };
</script>
</body>
</html>
    `;

    try {
        const { writeFileSync } = require("fs");
        const { join } = require("path");
        const { DATA_DIR } = require("./utils/constants");
        const htmlPath = join(DATA_DIR, "worldbomb.html");
        writeFileSync(htmlPath, htmlContent, "utf-8");
        streamProofWindow.loadFile(htmlPath);
    } catch (e) {
        streamProofWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlContent));
    }

    streamProofWindow.on("closed", () => {
        streamProofWindow = null;
    });
});

ipcMain.on(IpcEvents.WORLD_BOMB_CLOSE_WINDOW, () => {
    if (streamProofWindow) {
        streamProofWindow.close();
        streamProofWindow = null;
    }
});

ipcMain.on(IpcEvents.WORLD_BOMB_SET_STREAM_PROOF, (event, enabled: boolean) => {
    if (streamProofWindow) {
        try {
            streamProofWindow.setContentProtection(enabled);
        } catch (e) {
            console.error("setContentProtection error:", e);
        }
    }
});

ipcMain.on(IpcEvents.WORLD_BOMB_RESIZE_WINDOW, (event, width: number, height: number) => {
    if (streamProofWindow) {
        try {
            streamProofWindow.setSize(width, height);
        } catch (e) {
            console.error("setSize error:", e);
        }
    }
});

ipcMain.handle(IpcEvents.SET_CONTENT_PROTECTION, (event, enabled: boolean) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        try {
            win.setContentProtection(enabled);
            return true;
        } catch (e) {
            console.error("Failed to set content protection:", e);
        }
    }
    return false;
});

ipcMain.handle(IpcEvents.OPEN_QUICKCSS, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return shell.openPath(QUICK_CSS_PATH);
});

ipcMain.handle(IpcEvents.OPEN_EXTERNAL, (event, url) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    try {
        var { protocol } = new URL(url);
    } catch {
        throw "Malformed URL";
    }
    if (!ALLOWED_PROTOCOLS.includes(protocol))
        throw "Disallowed protocol.";

    shell.openExternal(url);
});

ipcMain.handle(IpcEvents.GET_QUICK_CSS, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return readCss();
});
ipcMain.handle(IpcEvents.SET_QUICK_CSS, (event, css) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return writeFileSync(QUICK_CSS_PATH, css);
});

ipcMain.handle(IpcEvents.GET_THEMES_DIR, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return THEMES_DIR;
});
ipcMain.handle(IpcEvents.GET_THEMES_LIST, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return listThemes();
});
ipcMain.handle(IpcEvents.GET_THEME_DATA, (event, fileName) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return getThemeData(fileName);
});
ipcMain.handle(IpcEvents.DELETE_THEME, (event, fileName) => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    const safePath = ensureSafePath(THEMES_DIR, fileName);
    if (!safePath) return Promise.reject(`Unsafe path ${fileName}`);
    return unlink(safePath);
});
ipcMain.handle(IpcEvents.GET_THEME_SYSTEM_VALUES, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    let accentColor = systemPreferences.getAccentColor?.() ?? "";

    if (accentColor.length && accentColor[0] !== "#") {
        accentColor = `#${accentColor}`;
    }

    return {
        "os-accent-color": accentColor
    };
});

ipcMain.handle(IpcEvents.OPEN_THEMES_FOLDER, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return shell.openPath(THEMES_DIR);
});
ipcMain.handle(IpcEvents.OPEN_SETTINGS_FOLDER, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return shell.openPath(SETTINGS_DIR);
});

ipcMain.handle(IpcEvents.INIT_FILE_WATCHERS, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    const { sender } = event;
    let quickCssWatcher: FSWatcher | undefined;
    let rendererCssWatcher: FSWatcher | undefined;

    open(QUICK_CSS_PATH, "a+").then(fd => {
        fd.close();
        quickCssWatcher = watch(QUICK_CSS_PATH, { persistent: false }, debounce(async () => {
            sender.postMessage(IpcEvents.QUICK_CSS_UPDATE, await readCss());
        }, 50));
    }).catch(() => { });

    const themesWatcher = watch(THEMES_DIR, { persistent: false }, debounce(() => {
        sender.postMessage(IpcEvents.THEME_UPDATE, void 0);
    }));

    if (IS_DEV) {
        rendererCssWatcher = watch(RENDERER_CSS_PATH, { persistent: false }, async () => {
            sender.postMessage(IpcEvents.RENDERER_CSS_UPDATE, await readFile(RENDERER_CSS_PATH, "utf-8"));
        });
    }

    sender.once("destroyed", () => {
        quickCssWatcher?.close();
        themesWatcher.close();
        rendererCssWatcher?.close();
    });
});

ipcMain.on(IpcEvents.GET_MONACO_THEME, e => {
    e.returnValue = nativeTheme.shouldUseDarkColors ? "vs-dark" : "vs-light";
});

ipcMain.handle(IpcEvents.GET_DESKTOP_SOURCES, async event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    try {
        const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1, height: 1 }
        });
        return sources.map(s => ({ id: s.id, name: s.name }));
    } catch {
        return [];
    }
});

let monacoWin: BrowserWindow | null = null;

ipcMain.handle(IpcEvents.OPEN_MONACO_EDITOR, async event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    if (monacoWin && !monacoWin.isDestroyed()) {
        monacoWin.show();
        monacoWin.focus();
        return;
    }

    monacoWin = new BrowserWindow({
        title: "Midnightcord QuickCSS Editor",
        autoHideMenuBar: true,
        darkTheme: true,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    monacoWin.once("closed", () => { monacoWin = null; });

    monacoWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": ["default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval';"]
            }
        });
    });

    makeLinksOpenExternally(monacoWin);

    await monacoWin.loadURL(`data:text/html;base64,${monacoHtml}`);
});

app.on("before-quit", async event => {
    if (monacoWin && !monacoWin.isDestroyed() && !monacoWin.isVisible()) {
        const result = await dialog.showMessageBox({
            type: "question",
            buttons: ["Cancel", "Close Anyway"],
            defaultId: 0,
            title: "QuickCSS Editor Open",
            message: "QuickCSS editor is still open in the background.",
            detail: "Do you want to close Discord anyway? This will also close the QuickCSS editor."
        });

        if (result.response === 1) {
            app.exit();
        }
    }
});

ipcMain.handle(IpcEvents.GET_RENDERER_CSS, event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    return readFile(RENDERER_CSS_PATH, "utf-8");
});

ipcMain.handle(IpcEvents.SET_WINDOW_BACKGROUND_MATERIAL, (event, material: "none" | "acrylic" | "mica" | "tabbed") => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    try {

        const canSetMaterial = typeof win.setBackgroundMaterial === "function";

        const canSetVibrancy = typeof win.setVibrancy === "function";

        if (material === "none") {
            win.setBackgroundColor("#36393f");
            if (canSetMaterial) {

                win.setBackgroundMaterial("none");
            }
            if (canSetVibrancy) {

                win.setVibrancy(null);
            }
        } else {
            win.setBackgroundColor("#00000000");
            if (canSetMaterial) {

                win.setBackgroundMaterial(material);
            } else if (canSetVibrancy) {

                win.setVibrancy((material === "acrylic" ? "acrylic" : "under-window") as any);
            }
        }
    } catch (e) {
        console.error("[CreateTheme] setBackgroundMaterial failed:", e);
    }
});

const THUMBAR_ICONS = {
    prev: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAY0lEQVR4nGNgGLngPxIgRy+MzUKpI9DFmKhpGAMDGS4kFCQkuZCY8CXKhaREFEEXkhrrOF1ITvJhYMDjQkYooJqByAZT1UCYocQaTFKyIcZQknMKIdeSnfXIiTCiAblJbGAAADXRMBdqfKdTAAAAAElFTkSuQmCC",
    next: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAZklEQVR4nOXUMQrAMAxDUbXk/ld2lwoMwbGcein5YxMeylLg7MzMqvcZv93Rpd1RE+jhVpBoFV6CHm4FiSqwDHp4dT6qYIaWFwLA9dYCRhCTn5xBTFqoYkCysAKxcOEONvXlp/CfHp4sPAHr7DkEAAAAAElFTkSuQmCC",
    play: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAXElEQVR4nO3UsQoAIAhFUY3+/5dtCiTS9NnQ0N0cOohDRD8Rkcr7ZqEovAUrsAsicAjU8FVwoh6cBk8wDFpwr4LMzHqGwRWCQQuapW54woiCG0agEJiBzKq/zfsN8Hg8AZZiLwgAAAAASUVORK5CYII=",
    pause: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAKklEQVR4nGNgGHGAEV3g/////1EUMDIykiLPRE3XjRo4auCogcPHwBEIAFPvCBxAwtPtAAAAAElFTkSuQmCC",
};

ipcMain.handle(IpcEvents.SET_THUMBAR_BUTTONS, (event, state: "playing" | "paused" | "stopped") => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform !== "win32") return;

    const { nativeImage } = require("electron");

    if (state === "stopped") {
        win.setThumbarButtons([]);
        return;
    }

    const prevIcon = nativeImage.createFromDataURL(`data:image/png;base64,${THUMBAR_ICONS.prev}`);
    const nextIcon = nativeImage.createFromDataURL(`data:image/png;base64,${THUMBAR_ICONS.next}`);
    const midIcon = nativeImage.createFromDataURL(`data:image/png;base64,${state === "playing" ? THUMBAR_ICONS.pause : THUMBAR_ICONS.play}`);
    const midTip = state === "playing" ? "Pause" : "Play";
    const midAction = state === "playing" ? "pause" : "play";

    win.setThumbarButtons([
        {
            tooltip: "Previous",
            icon: prevIcon,
            click() { event.sender.send(IpcEvents.THUMBAR_BUTTON_CLICK, "prev"); }
        },
        {
            tooltip: midTip,
            icon: midIcon,
            click() { event.sender.send(IpcEvents.THUMBAR_BUTTON_CLICK, midAction); }
        },
        {
            tooltip: "Next",
            icon: nextIcon,
            click() { event.sender.send(IpcEvents.THUMBAR_BUTTON_CLICK, "next"); }
        }
    ]);
});

if (IS_DISCORD_DESKTOP) {
    let rendererJsCache: string | null = null;
    ipcMain.on(IpcEvents.PRELOAD_GET_RENDERER_JS, e => {
        if (!rendererJsCache) {
            rendererJsCache = readFileSync(join(__dirname, "renderer.js"), "utf-8");
        }
        e.returnValue = rendererJsCache;
    });
}

try { ipcMain.removeHandler(IpcEvents.RELAUNCH_APP); } catch {}
ipcMain.handle(IpcEvents.RELAUNCH_APP, async event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");

    if (process.platform === "win32") {
        const { spawn } = await import("node:child_process");
        spawn(process.execPath, process.argv.slice(1), {
            detached: true,
            stdio: "ignore"
        }).unref();
        app.exit(0);
        return;
    }
    app.relaunch();
    app.exit(0);
});

ipcMain.handle(IpcEvents.CHECK_VB_CABLE, async event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    if (process.platform !== "win32") return { installed: false };
    const { existsSync } = require("fs");

    const p1 = "C:\\Program Files\\VB\\Cable\\VBCABLE_ControlPanel.exe";
    const p2 = "C:\\Program Files (x86)\\VB\\Cable\\VBCABLE_ControlPanel.exe";
    return { installed: existsSync(p1) || existsSync(p2) };
});

ipcMain.handle(IpcEvents.INSTALL_VB_CABLE, async event => {
    if (!validateSender(event)) throw new Error("Unauthorized IPC invocation");
    if (process.platform !== "win32") return { success: false, error: "Windows only" };

    const { spawn } = require("child_process");
    const os = require("os");
    const path = require("path");
    const fs = require("fs");

    const zipUrl = "https://download.vb-audio.com/Download_Html/VBCABLE_Setup.zip";
    const tmpDir = path.join(os.tmpdir(), "Midnightcord-VBCable");
    const tmpZip = path.join(os.tmpdir(), "VBCable_Setup.zip");

    try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn("powershell", [
                "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-Command",
                `Invoke-WebRequest -Uri "${zipUrl}" -OutFile "${tmpZip}";` +
                `Expand-Archive -Path "${tmpZip}" -DestinationPath "${tmpDir}" -Force;`
            ]);
            child.on("error", reject);
            child.on("exit", code => {
                if (code === 0) resolve();
                else reject(new Error(`Download/Extract failed with code ${code}`));
            });
        });

        const installerPath = path.join(tmpDir, "VBCABLE_Setup_x64.exe");
        if (!fs.existsSync(installerPath)) {
            return { success: false, error: "Installer not found after extraction" };
        }

        const isSigned = await verifySignature(installerPath);
        if (!isSigned) {
            return { success: false, error: "Signature validation failed for the VB-Cable installer." };
        }

        const { response } = await dialog.showMessageBox({
            type: "info",
            buttons: ["Install VB-Cable", "Cancel"],
            defaultId: 0,
            title: "VB-Cable Installation",
            message: "VB-Cable must be installed with administrator privileges.",
            detail: "A UAC window will open to confirm the installation."
        });
        if (response === 1) return { success: false, error: "Cancelled by user" };

        await new Promise<void>((resolve, reject) => {
            const child = spawn("powershell", [
                "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-Command",
                `Start-Process -FilePath "${installerPath}" -ArgumentList "/SILENT" -Verb RunAs -Wait;`
            ]);
            child.on("error", reject);
            child.on("exit", code => {
                if (code === 0) resolve();
                else reject(new Error(`Install failed with code ${code}`));
            });
        });

        return { success: true };
    } catch (err: any) {
        console.error("[Midnightcord] VBCable install failed:", err);
        return { success: false, error: "Installation failed: " + (err.message || err) };
    } finally {
        try { fs.unlinkSync(tmpZip); } catch {}
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
});
