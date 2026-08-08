import {progress, status} from "../stores/installation";
import {promises as fs} from "fs";
import path from "path";
import {killDiscord, startDiscord} from "./utils/kill";
import {log, lognewline} from "./utils/log";

const DELETE_SHIM_PROGRESS = 85;
const RESTART_DISCORD_PROGRESS = 100;

const safeExists = async (p) => {
    try { await fs.access(p); return true; } catch { return false; }
};

const safeStat = async (p) => {
    try { return await fs.stat(p); } catch { return null; }
};

const safeDelete = async (p) => {
    try { await fs.unlink(p); } catch {}
};

async function shouldAutoRestart() {
    try {
        const prefsPath = path.join(process.env.APPDATA, "Midnightcord", "settings", "installer-prefs.json");
        const raw = JSON.parse(await fs.readFile(prefsPath, "utf-8"));
        return raw.autoRestart !== false;
    } catch { return true; }
}

async function cleanModulePatches(resPath) {
    try {
        const appBase = path.dirname(resPath);
        const modulesSearchPaths = [
            path.join(appBase, "modules"),
            path.join(resPath, "modules")
        ];

        for (const modulesDir of modulesSearchPaths) {
            if (!(await safeExists(modulesDir))) continue;

            const entries = await fs.readdir(modulesDir).catch(() => []);
            for (const entry of entries) {
                if (!entry.startsWith("discord_desktop_core")) continue;
                const corePath = path.join(modulesDir, entry, "discord_desktop_core");
                if (!(await safeExists(corePath))) continue;

                const patchedFiles = [
                    path.join(corePath, "index.js"),
                    path.join(corePath, "app", "app_bootstrap", "splashScreen.js"),
                    path.join(corePath, "app", "app_bootstrap", "index.js")
                ];

                for (const pf of patchedFiles) {
                    if (!(await safeExists(pf))) continue;
                    const content = await fs.readFile(pf, "utf-8").catch(() => "");
                    const isPatched = content.toLowerCase().includes("vencord") ||
                                      content.toLowerCase().includes("equicord") ||
                                      content.includes("equilotl");
                    if (!isPatched) continue;

                    const backupExts = [".orig", ".bak", ".vanilla"];
                    let restored = false;
                    for (const ext of backupExts) {
                        const bk = pf + ext;
                        if (await safeExists(bk)) {
                            await fs.copyFile(bk, pf);
                            await safeDelete(bk);
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
                        const pkgContent = await fs.readFile(innerPkg, "utf-8").catch(() => "");
                        if (pkgContent.toLowerCase().includes("vencord") || pkgContent.toLowerCase().includes("equicord") || pkgContent.toLowerCase().includes("openasar")) {
                            try { await fs.rm(innerAppDir, { recursive: true, force: true }); } catch {}
                        }
                    }
                }
            }
        }
    } catch (e) {
        log(`Warning while cleaning module patches: ${e.message}`);
    }
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

async function removeThirdPartyMods(paths) {
    process.noAsar = true;
    const progressPerLoop = (DELETE_SHIM_PROGRESS - progress.value) / paths.length;
    for (const resPath of paths) {
        log(`Removing Vencord / Equicord from: ${resPath}`);
        try {
            const appDir = path.join(resPath, "app");
            const backup = path.join(resPath, "_app.asar");
            const appAsar = path.join(resPath, "app.asar");

            log("Closing Discord...");
            await killDiscord(resPath, log);

            log("1. Removing injected mod directory...");
            if (await safeExists(appDir)) {
                try { await fs.rm(appDir, { recursive: true, force: true }); } catch {}
            }

            log("2. Restoring original app.asar file...");
            const asarStat = await safeStat(appAsar);
            if (asarStat && asarStat.size < 2000000) {
                await safeDelete(appAsar);
            }

            const thirdPartyBackups = ["_app.asar", "original_app.asar", "app.asar.bak"];
            for (const bkName of thirdPartyBackups) {
                const bkPath = path.join(resPath, bkName);
                const bkStat = await safeStat(bkPath);
                if (bkStat && bkStat.size > 2000000) {
                    const curAsarStat = await safeStat(appAsar);
                    if (!(await safeExists(appAsar)) || (curAsarStat && curAsarStat.size < 2000000)) {
                        await safeMoveOrCopy(bkPath, appAsar);
                    }
                    break;
                }
            }

            log("3. Cleaning module patches...");
            await cleanModulePatches(resPath);

            if (await shouldAutoRestart()) {
                log("4. Restarting Discord...");
                startDiscord(resPath);
            } else {
                log("4. Skipping Discord restart (disabled in options).");
            }

            log("✅ Vencord / Equicord uninstalled successfully!");
            progress.set(progress.value + progressPerLoop);
        } catch (err) {
            log(`❌ Could not remove Vencord/Equicord from ${resPath}`);
            log(`❌ ${err.message}`);
            return err;
        }
    }
}

export default async function(paths) {
    try {
        log("Starting Vencord/Equicord Uninstallation...");
        lognewline("Cleaning Vencord & Equicord files and restoring original Discord...");

        const err = await removeThirdPartyMods(Object.values(paths));
        if (err) return false;

        progress.set(RESTART_DISCORD_PROGRESS);
        lognewline("Uninstall complete!");
        return true;
    } catch (err) {
        lognewline("❌ Uninstallation failed");
        log(`❌ ${err.message}`);
        return false;
    }
}
