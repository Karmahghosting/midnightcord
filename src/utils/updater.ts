/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";

import { Logger } from "./Logger";
import { IpcRes } from "./types";

export const UpdateLogger = /* #__PURE__ */ new Logger("Updater", "white");
export let isOutdated = false;
export const isNewer = false;
export let updateError: any;
export let changes: Record<"hash" | "author" | "message", string>[] = [];

async function Unwrap<T>(promise: Promise<IpcRes<T>>): Promise<T> {
    const result = await promise;
    if (result.ok) return result.value as T;
    updateError = result.error;
    throw result.error;
}

export async function checkForUpdates(): Promise<boolean> {
    changes = await Unwrap(VencordNative.updater.getUpdates());
    return (isOutdated = changes.length > 0);
}

export async function update(): Promise<boolean> {
    if (!isOutdated) return true;
    return Unwrap(VencordNative.updater.update());
}

export async function rebuild(): Promise<boolean> {
    const staged = await Unwrap(VencordNative.updater.rebuild());
    if (staged) isOutdated = false;
    return staged;
}

export const getRepo = () => Unwrap(VencordNative.updater.getRepo());

export async function stageAutomaticUpdate(): Promise<boolean> {
    if (IS_WEB || IS_UPDATER_DISABLED || Settings.disableAutoUpdate) return false;

    try {
        if (!await checkForUpdates()) return false;
        if (!await update()) return false;
        const staged = await rebuild();
        if (staged) UpdateLogger.info("Update verified and staged for the next launch.");
        return staged;
    } catch (error) {
        UpdateLogger.error("Automatic GitHub update failed", error);
        return false;
    }
}

export async function maybePromptToUpdate(_confirmMessage: string, checkForDev = false) {
    if (IS_WEB || IS_UPDATER_DISABLED || Settings.disableAutoUpdate) return;
    if (checkForDev && IS_DEV) return;

    try {
        if (!await checkForUpdates()) return;
        if (await update()) await rebuild();
    } catch (error) {
        UpdateLogger.error(error);
        alert("La vérification des mises à jour a échoué. Vérifie ta connexion ou réinstalle Midnightcord.");
    }
}
