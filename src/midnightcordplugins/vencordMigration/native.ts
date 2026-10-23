/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { RendererSettings } from "@main/settings";
import { DATA_DIR, SETTINGS_DIR, THEMES_DIR } from "@main/utils/constants";
import { BrowserWindow, dialog, type IpcMainInvokeEvent, shell } from "electron";

import { MAX_CSS_BYTES, MAX_JSON_BYTES, MigrationOptions, MigrationSource, parseBackup, planMigration, Registry, safeThemeName } from "./engine";
import { applyFiles, readBounded, readInstallation, realDirectory, vencordDirectories } from "./filesystem";

type Receipt = { id: string; source: MigrationSource; plan: ReturnType<typeof planMigration>; version: string; };
type Session = { sources: MigrationSource[]; receipt?: Receipt; expires: number; };
const sessions = new Map<number, Session>();
const observed = new WeakSet<Electron.WebContents>();
let applying = false;
const backupDir = join(DATA_DIR, "migration-backups");

function owner(event: IpcMainInvokeEvent) {
    const url = new URL(event.senderFrame?.url || "about:blank");
    if (event.senderFrame !== event.sender.mainFrame || url.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com"].includes(url.hostname)) throw new Error("Origine de migration non autorisée.");
    if (!observed.has(event.sender)) {
        observed.add(event.sender);
        const { id } = event.sender;
        event.sender.once("destroyed", () => sessions.delete(id));
        event.sender.on("render-process-gone", () => sessions.delete(id));
    }
    return event.sender.id;
}
function session(event: IpcMainInvokeEvent) {
    const id = owner(event);
    let result = sessions.get(id);
    if (!result || result.expires < Date.now()) {
        result = { sources: [], expires: Date.now() + 30 * 60 * 1000 };
        sessions.set(id, result);
    }
    return result;
}
function summary(source: MigrationSource) {
    return { id: source.id, label: source.label, themes: source.themes.length, quickCss: !!source.quickCss.trim(), warnings: source.warnings };
}
async function current() {
    let quickCss = "";
    try { quickCss = await readBounded(join(SETTINGS_DIR, "quickCss.css"), MAX_CSS_BYTES); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await realDirectory(THEMES_DIR);
    const themes = (await readdir(THEMES_DIR)).filter(safeThemeName).sort();
    const settings = JSON.parse(JSON.stringify(RendererSettings.plain));
    const version = createHash("sha256").update(JSON.stringify({ settings, quickCss, themes })).digest("hex");
    return { settings, quickCss, themes, version };
}

export async function discover(event: IpcMainInvokeEvent) {
    const state = session(event);
    state.sources = []; state.receipt = undefined;
    const warnings: string[] = [];
    for (const directory of vencordDirectories(process.platform, homedir(), process.env.APPDATA, process.env.XDG_CONFIG_HOME, process.env.DISCORD_USER_DATA_DIR, process.env.VENCORD_USER_DATA_DIR)) {
        if (directory === DATA_DIR) continue;
        try {
            state.sources.push({ ...await readInstallation(directory), id: randomUUID(), label: basename(directory) });
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push(`${basename(directory)} : lecture impossible, utilisez l'export JSON de Vencord.`); }
    }
    return { sources: state.sources.map(summary), warnings };
}

export async function chooseExport(event: IpcMainInvokeEvent) {
    const state = session(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = { title: "Choisir une sauvegarde Vencord", properties: ["openFile"], filters: [{ name: "Sauvegarde Vencord", extensions: ["json"] }] };
    const choice = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || choice.filePaths.length !== 1) return null;
    const file = choice.filePaths[0];
    const data = parseBackup(await readBounded(file, MAX_JSON_BYTES));
    const source: MigrationSource = { ...data, themes: [], id: randomUUID(), label: basename(file), warnings: ["Les exports JSON Vencord ne contiennent pas les fichiers de thèmes locaux."] };
    state.sources = [source]; state.receipt = undefined;
    return summary(source);
}

export async function preview(event: IpcMainInvokeEvent, sourceId: string, registry: Registry, options: MigrationOptions) {
    const state = session(event);
    const source = state.sources.find(source => source.id === sourceId);
    if (!source) throw new Error("La sélection a expiré. Relancez la recherche.");
    const snapshot = await current();
    const plan = planMigration(source, snapshot.settings, snapshot.quickCss, snapshot.themes, registry, options);
    const id = randomUUID();
    state.receipt = { id, source, plan, version: snapshot.version };
    return { id, rows: plan.rows, skippedPlugins: plan.skippedPlugins, skippedFields: plan.skippedFields, conflicts: plan.conflicts, imported: plan.imported, themes: plan.themes.map(theme => theme.name), quickCss: plan.quickCss !== undefined };
}

export async function apply(event: IpcMainInvokeEvent, receiptId: string) {
    const state = session(event);
    const { receipt } = state;
    if (!receipt || receipt.id !== receiptId) throw new Error("L'aperçu a expiré. Générez un nouvel aperçu.");
    if (applying) throw new Error("Une migration est déjà en cours.");
    applying = true;
    try {
        const snapshot = await current();
        if (snapshot.version !== receipt.version) throw new Error("Vos réglages ont changé depuis l'aperçu. Générez un nouvel aperçu.");
        if (!receipt.plan.imported) throw new Error("Aucun nouveau réglage à importer. Vérifiez les conflits dans l'aperçu.");
        const oldSettings = JSON.stringify(snapshot.settings);
        const backup = await applyFiles({ settingsDir: SETTINGS_DIR, themesDir: THEMES_DIR, backupDir, oldSettings, newSettings: JSON.stringify(receipt.plan.settings, null, 4), quickCss: receipt.plan.quickCss, themes: receipt.plan.themes, guard() {
            if (JSON.stringify(RendererSettings.plain) !== oldSettings) throw new Error("Des réglages ont changé pendant la migration. Générez un nouvel aperçu.");
        } }).catch(error => {
            // Preserve a concurrent settings change if the disk transaction had to roll back.
            RendererSettings.setData(RendererSettings.plain);
            throw error;
        });
        RendererSettings.setData(receipt.plan.settings);
        state.receipt = undefined;
        return { backup, imported: receipt.plan.imported, conflicts: receipt.plan.conflicts };
    } finally { applying = false; }
}

export async function openBackups(event: IpcMainInvokeEvent) {
    owner(event);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await realDirectory(backupDir);
    const error = await shell.openPath(backupDir);
    if (error) throw new Error("Impossible d'ouvrir le dossier des sauvegardes.");
}
export function forget(event: IpcMainInvokeEvent) { sessions.delete(owner(event)); }
