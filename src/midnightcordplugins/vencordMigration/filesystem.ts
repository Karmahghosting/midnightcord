/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, win32 } from "node:path";

import { MAX_CSS_BYTES, MAX_JSON_BYTES, MAX_THEMES, MigrationSource, parseBackup, safeThemeName } from "./engine";

export function vencordDirectories(platform: string, home: string, appData?: string, configHome?: string, discordData?: string, override?: string) {
    const path = platform === "win32" ? win32 : posix;
    const base = platform === "win32" ? appData || path.join(home, "AppData", "Roaming") : platform === "darwin" ? path.join(home, "Library", "Application Support") : configHome || path.join(home, ".config");
    return [...new Set([override, path.join(base, "Vencord"), path.join(base, "VencordData"), discordData && path.join(discordData, "..", "VencordData")].filter((value): value is string => !!value && path.isAbsolute(value)).map(value => path.normalize(value)))];
}

export async function realDirectory(path: string) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Dossier lié ou invalide refusé.");
}
export async function readBounded(path: string, limit: number): Promise<string> {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error("Fichier lié, invalide ou trop volumineux refusé.");
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > limit || stat.ino !== info.ino || stat.dev !== info.dev) throw new Error("Le fichier a changé pendant sa lecture.");
        const bytes = Buffer.alloc(limit + 1);
        let length = 0;
        while (length <= limit) {
            const result = await file.read(bytes, length, bytes.length - length, null);
            if (!result.bytesRead) break;
            length += result.bytesRead;
        }
        if (length > limit) throw new Error("Fichier trop volumineux.");
        return bytes.subarray(0, length).toString("utf8");
    } finally { await file.close(); }
}
async function optionalText(path: string, limit: number) {
    try { return await readBounded(path, limit); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
export async function readInstallation(directory: string): Promise<Omit<MigrationSource, "id" | "label">> {
    await realDirectory(directory);
    const settingsDir = join(directory, "settings");
    await realDirectory(settingsDir);
    const data = parseBackup(await readBounded(join(settingsDir, "settings.json"), MAX_JSON_BYTES));
    const warnings: string[] = [];
    let quickCss = "";
    try { quickCss = await optionalText(join(settingsDir, "quickCss.css"), MAX_CSS_BYTES); } catch { warnings.push("QuickCSS ignoré : fichier lié, inaccessible ou trop volumineux."); }
    const themes: MigrationSource["themes"] = [];
    try {
        const folder = join(directory, "themes");
        await realDirectory(folder);
        const names = (await readdir(folder)).filter(safeThemeName).sort();
        if (names.length > MAX_THEMES) warnings.push("Seuls les 100 premiers thèmes CSS sont proposés.");
        let total = 0;
        for (const name of names.slice(0, MAX_THEMES)) {
            try {
                const content = await readBounded(join(folder, name), MAX_CSS_BYTES);
                total += Buffer.byteLength(content);
                if (total > 20 * 1024 * 1024) { warnings.push("La sélection de thèmes a été limitée à 20 Mio."); break; }
                themes.push({ name, content });
            } catch { warnings.push(`Thème ignoré : ${name}`); }
        }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push("Le dossier des thèmes n'est pas accessible ou est un lien."); }
    return { ...data, quickCss, themes, warnings };
}

export async function atomicText(path: string, text: string) {
    await realDirectory(dirname(path));
    try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Destination liée ou invalide refusée.");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
        await writeFile(temp, text, { flag: "wx", mode: 0o600, flush: true });
        await rename(temp, path);
    } finally { await unlink(temp).catch(() => { }); }
}

/** Writes a durable snapshot before touching any target, and restores targets on failure. */
export async function applyFiles(input: {
    settingsDir: string; themesDir: string; backupDir: string; oldSettings: string; newSettings: string;
    quickCss?: string; themes: MigrationSource["themes"]; guard?: () => void;
}) {
    await realDirectory(input.settingsDir);
    await realDirectory(input.themesDir);
    await mkdir(input.backupDir, { recursive: true, mode: 0o700 });
    await realDirectory(input.backupDir);
    const backupName = `vencord-migration-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const backup = join(input.backupDir, backupName);
    await mkdir(backup, { mode: 0o700 });
    const themeBackupDir = join(backup, "themes");
    await mkdir(themeBackupDir, { mode: 0o700 });
    const cssPath = join(input.settingsDir, "quickCss.css");
    const settingsPath = join(input.settingsDir, "settings.json");
    let originalCss: string | null = null;
    try { originalCss = await readBounded(cssPath, MAX_CSS_BYTES); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const changes: { path: string; original: string | null; value: string; }[] = [];
    for (const theme of input.themes) {
        if (!safeThemeName(theme.name) || Buffer.byteLength(theme.content) > MAX_CSS_BYTES) throw new Error("Thème invalide.");
        const path = join(input.themesDir, theme.name);
        let original: string | null = null;
        try { original = await readBounded(path, MAX_CSS_BYTES); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        changes.push({ path, original, value: theme.content });
        if (original !== null) await writeFile(join(themeBackupDir, theme.name), original, { flag: "wx", mode: 0o600, flush: true });
    }
    await writeFile(join(backup, "settings-backup.json"), JSON.stringify({ settings: JSON.parse(input.oldSettings), quickCss: originalCss ?? "" }, null, 2), { flag: "wx", mode: 0o600, flush: true });
    // The generic settings importer merges objects and skips empty CSS, so it cannot
    // reverse a migration. Keep complete replacement files and exact recovery steps.
    await writeFile(join(backup, "settings.json"), input.oldSettings, { flag: "wx", mode: 0o600, flush: true });
    if (originalCss !== null) await writeFile(join(backup, "quickCss.css"), originalCss, { flag: "wx", mode: 0o600, flush: true });
    const recovery = {
        version: 1,
        settings: { source: join(backup, "settings.json"), destination: settingsPath },
        quickCss: { source: originalCss === null ? null : join(backup, "quickCss.css"), destination: cssPath },
        themes: changes.map(change => ({ source: change.original === null ? null : join(themeBackupDir, basename(change.path)), destination: change.path }))
    };
    const instructions = [
        "RESTAURER LA CONFIGURATION MIDNIGHTCORD AVANT MIGRATION",
        "",
        "1. Fermez complètement Discord (y compris son icône de notification) et Midnightcord Installer.",
        "2. Remplacez le fichier de réglages entier ; ne fusionnez pas les fichiers et n'utilisez pas Import All Settings.",
        `   Source : ${recovery.settings.source}`,
        `   Destination : ${recovery.settings.destination}`,
        "3. Restaurez QuickCSS, même lorsque la sauvegarde est vide :",
        recovery.quickCss.source ? `   Copiez ${recovery.quickCss.source} vers ${cssPath} en remplaçant le fichier.` : `   Supprimez ${cssPath} s'il existe : il n'existait pas avant la migration.`,
        "4. Restaurez uniquement les thèmes concernés ci-dessous :",
        ...recovery.themes.map(theme => theme.source ? `   Copiez ${theme.source} vers ${theme.destination} en remplaçant le fichier.` : `   Supprimez ${theme.destination} s'il existe : ce thème a été ajouté par la migration.`),
        ...(recovery.themes.length ? [] : ["   Aucun thème à restaurer."]),
        "5. Relancez Discord. Les fichiers Vencord d'origine n'ont pas été modifiés.",
        "",
        "Cette opération rétablit les réglages au moment de cette sauvegarde ; les modifications ultérieures de ces fichiers seront remplacées.",
        "Le fichier recovery.json contient la liste exacte des fichiers. Une source null signifie que le fichier était absent avant la migration.",
        "Gardez ce dossier privé : il contient votre configuration Midnightcord d'origine.",
        ""
    ].join("\n");
    await writeFile(join(backup, "recovery.json"), JSON.stringify(recovery, null, 2), { flag: "wx", mode: 0o600, flush: true });
    await writeFile(join(backup, "README.txt"), instructions, { flag: "wx", mode: 0o600, flush: true });
    if (input.quickCss !== undefined) changes.push({ path: cssPath, original: originalCss, value: input.quickCss });
    changes.push({ path: settingsPath, original: input.oldSettings, value: input.newSettings });
    const applied: typeof changes = [];
    try {
        for (const change of changes) { input.guard?.(); await atomicText(change.path, change.value); applied.push(change); }
        input.guard?.();
    } catch (error) {
        let rollbackFailed = false;
        for (const change of applied.reverse()) {
            try { if (change.original === null) await unlink(change.path); else await atomicText(change.path, change.original); } catch { rollbackFailed = true; }
        }
        throw new Error(rollbackFailed ? `Migration interrompue. Restaurez la sauvegarde ${backupName}.` : `Migration annulée ; les fichiers précédents ont été restaurés. ${error instanceof Error ? error.message : ""}`);
    }
    return backupName;
}
