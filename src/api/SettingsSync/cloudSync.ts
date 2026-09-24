/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { PlainSettings, Settings } from "@api/Settings";
import { localStorage } from "@utils/localStorage";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";

import { checksumBytes, decryptCloudPayload, digestCloudText, encryptCloudPayload, toCloudArrayBuffer } from "./cloudCrypto";
import { CLOUD_API_BASE, getCloudAuthorization, getCloudKey, unlinkCloudIdentity } from "./cloudSetup";
import { exportSettings, importSettings } from "./offline";
import type { CloudItemKey, CloudManifest, CloudManifestEntry, LocalCloudState } from "./types";

const logger = new Logger("MidnightcordCloud", "#708cff");
const LOCAL_STATE_KEY = "midnightcord_cloud_state_v1";
const CLIENT_MARKER = "desktop-v1";
const REQUEST_TIMEOUT_MS = 15_000;
let automaticSyncInProgress = false;

class CloudRequestError extends Error {
    constructor(public status: number, message: string, public code?: string) {
        super(message);
    }
}

function notify(title: string, body: string, color?: string, onClick?: () => void) {
    showNotification({ title, body, color, onClick, noPersist: true });
}

async function cloudFetch(path: string, init: RequestInit = {}) {
    const authorization = await getCloudAuthorization();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(new URL(path, CLOUD_API_BASE), {
            ...init,
            headers: {
                Authorization: `Bearer ${authorization}`,
                "X-Midnightcord-Client": CLIENT_MARKER,
                ...init.headers
            },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        let data: any;
        try { data = await response.json(); } catch { }
        throw new CloudRequestError(response.status, data?.message || `Cloud request failed (${response.status})`, data?.error);
    }
    return response;
}

async function getLocalState(): Promise<LocalCloudState> {
    const value = await DataStore.get<LocalCloudState>(LOCAL_STATE_KEY);
    return value?.schema === 1 && value.entries ? value : { schema: 1, entries: {} };
}

async function saveLocalState(state: LocalCloudState) {
    await DataStore.set(LOCAL_STATE_KEY, state);
}

async function fetchManifest(): Promise<CloudManifest> {
    return cloudFetch("/v1/cloud/manifest").then(response => response.json());
}

function enabledKeys(): CloudItemKey[] {
    const keys: CloudItemKey[] = [];
    if (Settings.cloud.settingsSync) keys.push("settings");
    if (Settings.cloud.quickCssSync) keys.push("quickCss");
    return keys;
}

async function localPayload(key: CloudItemKey): Promise<string> {
    if (key === "settings") return exportSettings({ syncDataStore: false, type: "plugins", minify: true });
    return await VencordNative.quickCss.get() ?? "";
}

async function applyPayload(key: CloudItemKey, value: string) {
    if (key === "settings") await importSettings(value, "plugins", true);
    else await VencordNative.quickCss.set(value);
}

function entryMap(manifest: CloudManifest) {
    return new Map(manifest.entries.map(entry => [entry.key, entry]));
}

function finishSync() {
    PlainSettings.cloud.lastSyncAt = Date.now();
    return VencordNative.settings.set(PlainSettings);
}

function handleError(error: unknown, manual: boolean) {
    logger.error("Cloud synchronization failed", error);
    if (!manual) return;
    if (error instanceof CloudRequestError && error.status === 412) {
        notify("Midnightcord Cloud", "A newer copy exists in the Cloud. Download it first, or upload again to replace it.", "var(--yellow-360)");
        return;
    }
    const message = error instanceof Error ? error.message : String(error);
    notify("Midnightcord Cloud", message, "var(--red-360)");
}

export function shouldCloudSync(direction: "push" | "pull") {
    if (!Settings.cloud.enabled || !Settings.cloud.settingsSync && !Settings.cloud.quickCssSync) return false;
    const mode = Settings.cloud.direction;
    return mode === "both" || mode === direction;
}

export async function putCloudSettings(manual = false, force = manual) {
    if (!await getCloudKey()) {
        if (manual) notify("Midnightcord Cloud", "Link this device with a Cloud key first.", "var(--yellow-360)");
        return false;
    }
    try {
        const cloudKey = (await getCloudKey())!;
        const manifest = await fetchManifest();
        const remote = entryMap(manifest);
        const state = await getLocalState();
        let uploaded = 0;

        for (const key of enabledKeys()) {
            const plaintext = await localPayload(key);
            const localDigest = await digestCloudText(plaintext);
            const previous = state.entries[key];
            const current = remote.get(key);
            const remoteMatchesState = previous?.remoteEtag === current?.etag || !previous && !current;
            if (!force && previous?.localDigest === localDigest && remoteMatchesState) continue;
            if (!force && previous && current && previous.remoteEtag !== current.etag)
                throw new CloudRequestError(412, "The Cloud item changed on another device.", "version_conflict");

            const encrypted = await encryptCloudPayload(cloudKey, plaintext);
            const checksum = await checksumBytes(encrypted);
            const response = await cloudFetch(`/v1/cloud/data/${key}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "If-Match": current?.etag ?? "*",
                    "X-Midnightcord-Checksum": checksum
                },
                body: toCloudArrayBuffer(encrypted)
            });
            const entry = await response.json() as CloudManifestEntry;
            state.entries[key] = { remoteEtag: entry.etag, remoteVersion: entry.version, localDigest };
            uploaded++;
        }

        if (uploaded || manual) {
            await saveLocalState(state);
            await finishSync();
        }
        delete localStorage.Vencord_settingsDirty;
        if (manual) notify("Midnightcord Cloud", uploaded ? `${uploaded} élément${uploaded > 1 ? "s" : ""} chiffré${uploaded > 1 ? "s" : ""} envoyé${uploaded > 1 ? "s" : ""}.` : "Le Cloud est déjà à jour.", "var(--green-360)");
        return true;
    } catch (error) {
        handleError(error, manual);
        return false;
    }
}

export async function getCloudSettings(shouldNotify = true, force = false) {
    if (!await getCloudKey()) {
        if (shouldNotify) notify("Midnightcord Cloud", "Link this device with a Cloud key first.", "var(--yellow-360)");
        return false;
    }
    try {
        const cloudKey = (await getCloudKey())!;
        const manifest = await fetchManifest();
        const remote = entryMap(manifest);
        const state = await getLocalState();
        let downloaded = 0;
        let settingsChanged = false;

        for (const key of enabledKeys()) {
            const entry = remote.get(key);
            if (!entry || !force && state.entries[key]?.remoteEtag === entry.etag) continue;
            const previous = state.entries[key];
            if (!force && previous && previous.remoteEtag !== entry.etag) {
                const currentDigest = await digestCloudText(await localPayload(key));
                if (previous.localDigest !== currentDigest)
                    throw new CloudRequestError(412, "Both this device and the Cloud changed. Upload or download manually to choose which copy wins.", "version_conflict");
            }
            const response = await cloudFetch(`/v1/cloud/data/${key}`);
            const encrypted = new Uint8Array(await response.arrayBuffer());
            if (await checksumBytes(encrypted) !== entry.checksum)
                throw new Error(`Cloud checksum verification failed for ${key}`);
            const plaintext = await decryptCloudPayload(cloudKey, encrypted);
            await applyPayload(key, plaintext);
            state.entries[key] = {
                remoteEtag: entry.etag,
                remoteVersion: entry.version,
                localDigest: await digestCloudText(plaintext)
            };
            settingsChanged ||= key === "settings";
            downloaded++;
        }

        if (downloaded || shouldNotify) {
            await saveLocalState(state);
            await finishSync();
        }
        if (settingsChanged) delete localStorage.Vencord_settingsDirty;
        if (shouldNotify) notify(
            "Midnightcord Cloud",
            downloaded
                ? settingsChanged ? "Configuration déchiffrée et restaurée. Clique ici pour redémarrer Midnightcord." : "QuickCSS déchiffré et restauré."
                : "Le Cloud est déjà à jour.",
            "var(--green-360)",
            settingsChanged ? (IS_WEB ? () => location.reload() : relaunch) : undefined
        );
        return downloaded > 0;
    } catch (error) {
        handleError(error, shouldNotify);
        return false;
    }
}

export async function deleteCloudSettings() {
    try {
        const manifest = await fetchManifest();
        for (const entry of manifest.entries) {
            await cloudFetch(`/v1/cloud/data/${entry.key}`, { method: "DELETE", headers: { "If-Match": entry.etag } });
        }
        await DataStore.del(LOCAL_STATE_KEY);
        PlainSettings.cloud.lastSyncAt = 0;
        await VencordNative.settings.set(PlainSettings);
        notify("Midnightcord Cloud", "Les réglages chiffrés ont été supprimés du Cloud.", "var(--green-360)");
        return true;
    } catch (error) {
        handleError(error, true);
        return false;
    }
}

export async function eraseAllCloudData() {
    try {
        await cloudFetch("/v1/cloud/account", { method: "DELETE", headers: { "X-Midnightcord-Confirm": "delete-account" } });
        await Promise.all([DataStore.del(LOCAL_STATE_KEY), unlinkCloudIdentity()]);
        Settings.cloud.enabled = false;
        Settings.cloud.lastSyncAt = 0;
        notify("Midnightcord Cloud", "Le compte Cloud local et toutes ses données distantes ont été supprimés.", "var(--green-360)");
        return true;
    } catch (error) {
        handleError(error, true);
        return false;
    }
}

export async function syncCloudOnStartup() {
    if (automaticSyncInProgress || !Settings.cloud.enabled || !await getCloudKey()) return;
    automaticSyncInProgress = true;
    try {
        if (shouldCloudSync("pull")) await getCloudSettings(false);
        if (shouldCloudSync("push")) await putCloudSettings(false);
    } finally {
        automaticSyncInProgress = false;
    }
}
