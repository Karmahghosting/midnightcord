/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// Mapping: style value → folder path segments inside mac/mac/
const STYLE_FOLDER: Record<string, [string, string]> = {
    modern_shadow:    ["1. Sierra and newer",      "2. With Shadow"],
    modern_no_shadow: ["1. Sierra and newer",      "1. No Shadow"],
    classic_shadow:   ["2. El Capitan and before", "2. With Shadow"],
    classic_no_shadow:["2. El Capitan and before", "1. No Shadow"],
};

const SIZE_FOLDER: Record<string, string> = {
    normal: "1. Normal",
    large:  "2. Large",
    xl:     "3. XtraLarge",
};

// Windows registry cursor key names → .cur file names in the pack
const CURSOR_MAP: Record<string, string> = {
    Arrow:           "Normal",
    Hand:            "Link",
    AppStarting:     "Link",       // closest match — "working in background"
    Wait:            "Pan",        // spinning wheel closest to Pan
    IBeam:           "Text",
    SizeAll:         "Move",
    SizeNESW:        "Diagonal Resize 1",
    SizeNWSE:        "Diagonal Resize 2",
    SizeNS:          "Vertical Resize",
    SizeWE:          "Horizontal Resize",
    No:              "Unavailable",
    Help:            "Help",
    Crosshair:       "Precision",
    UpArrow:         "Alternate",
};

function getCursorsDir(event: any): string {
    // __dirname in main process points to the compiled output folder.
    // The mac/ folder is at the root of the repo (beside src/, dist/, etc.)
    // In production the app is packaged — cursors live in extraResources/mac.
    // We try both locations.
    const appPath = (event.sender as any).getOwnerBrowserWindow?.()?.webContents?.getURL?.() ?? "";

    // Try: next to app.asar / app resources
    const resPath = path.join(process.resourcesPath ?? "", "mac", "mac");
    if (fs.existsSync(resPath)) return resPath;

    // Dev fallback: walk up from __dirname to find the repo root
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(dir, "mac", "mac");
        if (fs.existsSync(candidate)) return candidate;
        dir = path.dirname(dir);
    }

    throw new Error("Cannot locate mac cursor folder");
}

export async function applyCursors(event: any, style: string, size: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const styleSegs = STYLE_FOLDER[style] ?? STYLE_FOLDER.modern_shadow;
        const sizeFolder = SIZE_FOLDER[size] ?? SIZE_FOLDER.normal;
        const baseDir = path.join(getCursorsDir(event), ...styleSegs, sizeFolder);

        if (!fs.existsSync(baseDir)) {
            return { ok: false, error: `Cursor folder not found: ${baseDir}` };
        }

        // Build one PowerShell script that sets all cursors at once
        const regLines: string[] = [];
        for (const [regName, fileName] of Object.entries(CURSOR_MAP)) {
            const curFile = path.join(baseDir, `${fileName}.cur`);
            if (!fs.existsSync(curFile)) continue;
            // Escape backslashes for PowerShell string
            const escaped = curFile.replace(/\\/g, "\\\\");
            regLines.push(
                `Set-ItemProperty -Path "HKCU:\\Control Panel\\Cursors" -Name "${regName}" -Value "${escaped}"`
            );
        }

        // Set cursor scheme name
        regLines.push(`Set-ItemProperty -Path "HKCU:\\Control Panel\\Cursors" -Name "" -Value "macOS"`);

        // Broadcast WM_SETTINGCHANGE so Windows refreshes cursors immediately without reboot
        regLines.push(`
$signature = @'
[DllImport("user32.dll", SetLastError=true)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
$type = Add-Type -MemberDefinition $signature -Name "NativeMethods" -Namespace "Win32" -PassThru
[UIntPtr]$result = [UIntPtr]::Zero
$type::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, "Environment", 2, 5000, [ref]$result)
`);

        const script = regLines.join("\n");
        execSync(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`, {
            windowsHide: true,
            timeout: 10000,
        });

        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

export async function restoreCursors(_event: any): Promise<{ ok: boolean; error?: string }> {
    try {
        // Clearing all cursor values makes Windows fall back to the system default
        const regNames = Object.keys(CURSOR_MAP);
        const clearLines = regNames.map(name =>
            `Set-ItemProperty -Path "HKCU:\\Control Panel\\Cursors" -Name "${name}" -Value ""`
        );
        clearLines.push(`Set-ItemProperty -Path "HKCU:\\Control Panel\\Cursors" -Name "" -Value ""`);
        clearLines.push(`
$signature = @'
[DllImport("user32.dll", SetLastError=true)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
$type = Add-Type -MemberDefinition $signature -Name "NativeMethods2" -Namespace "Win32" -PassThru
[UIntPtr]$result = [UIntPtr]::Zero
$type::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, "Environment", 2, 5000, [ref]$result)
`);
        const script = clearLines.join("\n");
        execSync(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`, {
            windowsHide: true,
            timeout: 10000,
        });

        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}
