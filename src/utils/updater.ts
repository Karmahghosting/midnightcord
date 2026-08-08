/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "./Logger";
import { IpcRes } from "./types";

export const UpdateLogger = /* #__PURE__ */ new Logger("Updater", "white");
export let isOutdated = false;
export const isNewer = false;
export let updateError: any;
export let changes: Record<"hash" | "author" | "message", string>[] = [];

async function Unwrap<T>(p: Promise<IpcRes<T>>): Promise<T> {
    const res = await p;
    if (res.ok) return res.value as T;
    updateError = res.error;
    throw res.error;
}

/**
 * Demande au main process s'il y a une version plus récente.
 * Met à jour isOutdated et changes.
 */
export async function checkForUpdates(): Promise<boolean> {
    changes = await Unwrap(VencordNative.updater.getUpdates());
    return (isOutdated = changes.length > 0);
}

/**
 * Télécharge le Setup.exe (étape 1).
 * Retourne true si le téléchargement a réussi.
 */
export async function update(): Promise<boolean> {
    if (!isOutdated) return true;
    const ok = await Unwrap(VencordNative.updater.update());
    if (ok) isOutdated = false;
    return ok;
}

/**
 * Lance l'installeur téléchargé (étape 2).
 * L'app va se fermer et se relancer automatiquement après installation.
 */
export async function rebuild(): Promise<boolean> {
    return Unwrap(VencordNative.updater.rebuild());
}

import { Settings } from "@api/Settings";

export const getRepo = () => Unwrap(VencordNative.updater.getRepo());

/**
 * Vérifie les mises à jour au démarrage et propose à l'utilisateur de mettre à jour.
 */
export async function maybePromptToUpdate(confirmMessage: string, checkForDev = false) {
    if (IS_WEB || IS_UPDATER_DISABLED || Settings.disableAutoUpdate) return;
    if (checkForDev && IS_DEV) return;

    try {
        const outdated = await checkForUpdates();
        if (outdated) {
            // Mise à jour automatique sans confirmation
            const downloaded = await update();
            if (downloaded) await rebuild();
        }
    } catch (err) {
        UpdateLogger.error(err);
        alert("La vérification des mises à jour a échoué. Vérifie ta connexion ou réinstalle Midnightcord.");
    }
}
