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
 * Checks whether GitHub contains a newer Midnightcord release.
 */
export async function checkForUpdates(): Promise<boolean> {
    changes = await Unwrap(VencordNative.updater.getUpdates());
    return (isOutdated = changes.length > 0);
}

/**
 * Resolves the verified assets for the latest GitHub release.
 */
export async function update(): Promise<boolean> {
    if (!isOutdated) return true;
    const ok = await Unwrap(VencordNative.updater.update());
    if (ok) isOutdated = false;
    return ok;
}

/**
 * Downloads, verifies and stages the selected update for the next launch.
 */
export async function rebuild(): Promise<boolean> {
    return Unwrap(VencordNative.updater.rebuild());
}

import { Settings } from "@api/Settings";

export const getRepo = () => Unwrap(VencordNative.updater.getRepo());

/**
 * Checks GitHub in the background and stages a verified update.
 * The loader applies it on the next normal Discord launch.
 */
export async function stageAutomaticUpdate(): Promise<boolean> {
    if (IS_WEB || IS_UPDATER_DISABLED || Settings.disableAutoUpdate) return false;

    try {
        if (!await checkForUpdates()) return false;
        const staged = await rebuild();
        if (staged) {
            isOutdated = false;
            UpdateLogger.info("Update verified and staged for the next launch.");
        }
        return staged;
    } catch (error) {
        UpdateLogger.error("Automatic GitHub update failed", error);
        return false;
    }
}

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
