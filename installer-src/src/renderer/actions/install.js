import {progress, status} from "../stores/installation";
import {remote} from "electron";
import {promises as fs} from "fs";
import {createWriteStream} from "fs";
import path from "path";
import phin from "phin";
import https from "https";
import {execSync} from "child_process";
import {killDiscord, startDiscord} from "./utils/kill";
import {log, lognewline} from "./utils/log";
import {domain} from "../../../../DOMAIN.json"

const MAKE_DIR_PROGRESS = 5;
const FETCH_RELEASE_PROGRESS = 15;
const DOWNLOAD_PACKAGE_PROGRESS = 75;
const EXTRACTION_PROGRESS = 90;
const INJECT_SHIM_PROGRESS = 98;
const RESTART_DISCORD_PROGRESS = 100;


const RELEASE_API = `https://source.${domain}/api/v1/repos/nightcord/nightcord/releases/latest`;
const DIST_ZIP = "midnightcord-dist.zip";
const distDir = path.join(process.env.LOCALAPPDATA, "Midnightcord", "dist");

const safeExists = async (p) => {
    try { await fs.access(p); return true; } catch { return false; }
};

const safeStat = async (p) => {
    try { return await fs.stat(p); } catch { return null; }
};

const safeDelete = async (p) => {
    try { await fs.unlink(p); } catch {}
};

async function copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function cleanModulePatches(resourcesPath) {
    try {
        const appBase = path.dirname(resourcesPath);
        const modulesSearchPaths = [
            path.join(appBase, "modules"),
            path.join(resourcesPath, "modules")
        ];

        for (const modulesDir of modulesSearchPaths) {
            if (!(await safeExists(modulesDir))) continue;

            const dirs = await fs.readdir(modulesDir);
            for (const d of dirs) {
                if (!d.startsWith("discord_desktop_core")) continue;
                const corePath = path.join(modulesDir, d, "discord_desktop_core");
                if (!(await safeExists(corePath))) continue;

                const patchedFiles = [
                    path.join(corePath, "index.js"),
                    path.join(corePath, "app", "app_bootstrap", "splashScreen.js"),
                    path.join(corePath, "app", "app_bootstrap", "index.js"),
                ];

                for (const pf of patchedFiles) {
                    if (!(await safeExists(pf))) continue;
                    const content = await fs.readFile(pf, "utf-8");
                    const isPatched = content.toLowerCase().includes("vencord") ||
                                      content.toLowerCase().includes("equicord") ||
                                      content.includes('require("vencord') ||
                                      content.includes("require('vencord") ||
                                      content.includes("VencordNative") ||
                                      content.includes("equilotl");

                    if (!isPatched) continue;

                    const backupExts = [".orig", ".bak", ".vanilla"];
                    let restored = false;
                    for (const ext of backupExts) {
                        const bk = pf + ext;
                        if (await safeExists(bk)) {
                            await fs.copyFile(bk, pf);
                            await fs.unlink(bk);
                            restored = true;
                            break;
                        }
                    }
                    if (!restored) {
                        await safeDelete(pf);
                    }
                }

                const innerAppDir = path.join(corePath, "app");
                if (await safeExists(innerAppDir)) {
                    const innerPkg = path.join(innerAppDir, "package.json");
                    if (await safeExists(innerPkg)) {
                        const pkgContent = await fs.readFile(innerPkg, "utf-8");
                        const isMod = pkgContent.toLowerCase().includes("vencord") ||
                                      pkgContent.toLowerCase().includes("equicord") ||
                                      pkgContent.toLowerCase().includes("openasar");
                        if (isMod) {
                            try { await fs.rm(innerAppDir, { recursive: true, force: true }); } catch {}
                        }
                    }
                }
            }
        }
    } catch (err) {
        log(`[Midnightcord] CleanModulePatches warning: ${err.message}`);
    }
}

function downloadFileAsync(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(destPath);
        https.get(url, { headers: { "User-Agent": "Midnightcord-Installer/3.0" }, rejectUnauthorized: false }, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                file.close();
                downloadFileAsync(response.headers.location, destPath, onProgress).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                file.close();
                reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                return;
            }
            const totalBytes = parseInt(response.headers["content-length"], 10) || 0;
            let downloadedBytes = 0;

            response.on("data", (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const percent = (downloadedBytes / totalBytes) * 100;
                    onProgress(percent, downloadedBytes, totalBytes);
                }
            });

            response.pipe(file);

            file.on("finish", () => {
                file.close();
                resolve();
            });
        }).on("error", (err) => {
            file.close();
            safeDelete(destPath);
            reject(err);
        });
    });
}

const getJSON = phin.defaults({
    method: "GET",
    parse: "json",
    followRedirects: true,
    core: { rejectUnauthorized: false },
    headers: { "User-Agent": "Midnightcord-Installer/3.0", "Accept": "application/json" }
});

async function downloadDist() {
    log("Fetching latest release information from Gitea...");
    let assetUrl;
    let midnightcordVersion;
    try {
        const response = await getJSON(RELEASE_API);
        const release = response.body;
        const asset = release && release.assets && release.assets.find(a => a.name.toLowerCase() === DIST_ZIP);
        assetUrl = asset && asset.browser_download_url;
        midnightcordVersion = release && release.tag_name;
        if (!assetUrl) {
            throw new Error(`Asset '${DIST_ZIP}' not found in the latest release`);
        }
        progress.set(FETCH_RELEASE_PROGRESS);
    }
    catch (error) {
        log(`❌ Failed to query release API at ${RELEASE_API}`);
        log(`❌ ${error.message}`);
        throw error;
    }

    const tmpZip = path.join(remote.app.getPath("temp"), "midnightcord-dist.zip");
    log(`Downloading Midnightcord ${midnightcordVersion} package...`);
    try {
        await downloadFileAsync(assetUrl, tmpZip, (percent, downloaded, total) => {
            const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
            const totalMB = (total / (1024 * 1024)).toFixed(1);
            const overall = FETCH_RELEASE_PROGRESS + (percent * (DOWNLOAD_PACKAGE_PROGRESS - FETCH_RELEASE_PROGRESS) / 100);
            progress.set(overall);
            status.set(`Downloading Midnightcord... (${dlMB}/${totalMB} MB)`);
        });
        log("✅ Package downloaded successfully");
        progress.set(DOWNLOAD_PACKAGE_PROGRESS);
    }
    catch (error) {
        log(`❌ Failed to download package from ${assetUrl}`);
        log(`❌ ${error.message}`);
        throw error;
    }

    lognewline("Extracting package...");
    try {
        try { await fs.rm(distDir, { recursive: true, force: true }); } catch {}
        await fs.mkdir(distDir, { recursive: true });
        
        execSync(`powershell.exe -NoProfile -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${distDir}' -Force"`);
        log("✅ Package extracted successfully");
        progress.set(EXTRACTION_PROGRESS);
        
        await safeDelete(tmpZip);
    }
    catch (error) {
        log("❌ Failed to extract package");
        log(`❌ ${error.message}`);
        throw error;
    }
}

async function writeLoader(appDir) {
    const patcher = path.join(distDir, "patcher.js").replace(/\\/g, "/");
    await fs.writeFile(path.join(appDir, "package.json"), JSON.stringify({ name: "discord", main: "index.js" }));
    const loaderCode = `// Midnightcord Injector
"use strict";
const fs = require('fs');
const path = require('path');
const primary = ${JSON.stringify(patcher)};
const exeDir = path.dirname(process.execPath);
const fallback = path.join(exeDir, 'resources', 'dist', 'patcher.js');
const fallback2 = path.join(exeDir, 'dist', 'patcher.js');
const patcherPath = fs.existsSync(primary) ? primary : fs.existsSync(fallback) ? fallback : fallback2;
if (!fs.existsSync(patcherPath)) throw new Error('[Midnightcord] patcher.js not found. Expected at: ' + primary);
require(patcherPath);
`;
    await fs.writeFile(path.join(appDir, "index.js"), loaderCode);
}

async function applyDefaultPluginsSetting() {
    try {
        const settingsDir = path.join(process.env.APPDATA, "Midnightcord", "settings");
        const settingsPath = path.join(settingsDir, "settings.json");
        await fs.mkdir(settingsDir, { recursive: true });

        // Always enable default plugins by removing the 'plugins' key from settings.json
        // so that Midnightcord natively loads its enabledByDefault values.
        let existing = null;
        try { existing = JSON.parse(await fs.readFile(settingsPath, "utf-8")); } catch { }
        if (existing && typeof existing === "object" && "plugins" in existing) {
            delete existing.plugins;
            await fs.writeFile(settingsPath, JSON.stringify(existing, null, 2), "utf-8");
            log("✅ Default plugins enabled (reset to built-in defaults)");
        } else {
            log("✅ Default plugins enabled (no override needed)");
        }
    } catch (err) {
        log(`⚠️ Could not apply plugin settings: ${err.message}`);
    }
}

async function copyAssetsToDiscord(resPath) {
    log("Copying binaries...");
    const appBase = path.dirname(resPath);

    const filesToCopy = ["ffmpeg.exe", "ffmpeg.dll", "node.exe", "yt-dlp.exe"];
    for (const f of filesToCopy) {
        const src = path.join(distDir, f);
        if (await safeExists(src)) {
            await fs.copyFile(src, path.join(appBase, f));
        }
    }

    log("Copying directories...");
    const dirsToCopy = ["mac", "multi-instance-icons", "modules", "ghost-server"];
    for (const d of dirsToCopy) {
        const src = path.join(distDir, d);
        if (await safeExists(src)) {
            await copyDirectory(src, path.join(appBase, d));
        }
    }

    log("Copying assets...");
}

async function safeMoveOrCopy(src, dest) {
    if (await safeExists(dest)) await safeDelete(dest);
    for (let i = 0; i < 10; i++) {
        try {
            await fs.rename(src, dest);
            return true;
        } catch (err) {
            try {
                await fs.copyFile(src, dest);
                await safeDelete(src);
                return true;
            } catch (_) {}
            await new Promise(r => setTimeout(r, 300));
        }
    }
    return false;
}

async function injectShims(paths) {
    process.noAsar = true;
    const progressPerLoop = (INJECT_SHIM_PROGRESS - progress.value) / paths.length;
    for (const resPath of paths) {
        log(`Injecting into Discord at: ${resPath}`);
        try {
            const appDir = path.join(resPath, "app");
            const backup = path.join(resPath, "_app.asar");
            const appAsar = path.join(resPath, "app.asar");

            log("Closing Discord...");
            await killDiscord(resPath, log);

            log("1. Removing previous mod injection (Vencord / Equicord / OpenAsar)...");
            if (await safeExists(appDir)) {
                try { await fs.rm(appDir, { recursive: true, force: true }); } catch {}
            }

            const asarStat = await safeStat(appAsar);
            if (asarStat && asarStat.size < 2000000) {
                await safeDelete(appAsar);
            }

            const thirdPartyBackups = ["_app.asar", "original_app.asar", "app.asar.bak"];
            for (const bkName of thirdPartyBackups) {
                const bkPath = path.join(resPath, bkName);
                const bkStat = await safeStat(bkPath);
                if (bkStat && bkStat.size > 2000000) {
                    const curStat = await safeStat(appAsar);
                    if (!curStat || curStat.size < 2000000) {
                        if (await safeExists(appAsar)) await safeDelete(appAsar);
                        await fs.copyFile(bkPath, appAsar);
                    }
                    break;
                }
            }

            await cleanModulePatches(resPath);

            log("2. Configuring Midnightcord loader...");
            if (!(await safeExists(appAsar)) && !(await safeExists(backup))) {
                throw new Error("Critical error: no valid app.asar found. Please reinstall Discord from discord.com/download and try again.");
            }

            if (await safeExists(appAsar)) {
                const ok = await safeMoveOrCopy(appAsar, backup);
                if (!ok) {
                    throw new Error("Critical error: Could not process app.asar. Please close Discord manually via Task Manager and try again.");
                }
            }

            log("3. Creating app directory...");
            await fs.mkdir(appDir, { recursive: true });
            await writeLoader(appDir);
            await applyDefaultPluginsSetting();
            await copyAssetsToDiscord(resPath);

            log("4. Starting Discord...");
            startDiscord(resPath);

            log("✅ Injection successful!");
            progress.set(progress.value + progressPerLoop);
        }
        catch (err) {
            log(`❌ Could not inject into ${resPath}`);
            log(`❌ ${err.message}`);
            return err;
        }
    }
}

export default async function(paths) {
    try {
        log("Starting Install...");
        lognewline("Creating required directories...");
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) throw new Error("LOCALAPPDATA environment variable is missing.");
        await fs.mkdir(path.join(localAppData, "Midnightcord"), { recursive: true });
        log("✅ Local AppData directory prepared");
        progress.set(MAKE_DIR_PROGRESS);
        lognewline("Downloading Midnightcord package...");
        const distLocal = path.join(__dirname, "dist", "patcher.js");
        const hasLocalDist = await safeExists(distLocal);
        if (hasLocalDist) {
            log("✅ Using local dist folder");
        } else {
            await downloadDist();
        }

        lognewline("Injecting Midnightcord shims...");
        const err = await injectShims(Object.values(paths));
        if (err) return false;

        progress.set(RESTART_DISCORD_PROGRESS);
        lognewline("Install complete!");
        return true;
    } catch (err) {
        lognewline("❌ Installation failed");
        log(`❌ ${err.message}`);
        return false;
    }
}
