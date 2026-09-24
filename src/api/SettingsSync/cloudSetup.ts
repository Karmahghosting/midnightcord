/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { createCloudKey, deriveCloudAuthorization, getCloudFingerprint, isCloudKey } from "./cloudCrypto";

export const CLOUD_API_BASE = "https://api.midnightcord.fr/";
export const CLOUD_KEY_STORE = "midnightcord_cloud_key";

export async function getCloudKey(): Promise<string | null> {
    const value = await DataStore.get<unknown>(CLOUD_KEY_STORE);
    return typeof value === "string" && isCloudKey(value) ? value : null;
}

export async function createCloudIdentity(): Promise<string> {
    const existing = await getCloudKey();
    if (existing) return existing;
    const key = createCloudKey();
    await DataStore.set(CLOUD_KEY_STORE, key);
    return key;
}

export async function importCloudIdentity(value: string): Promise<string> {
    const normalized = value.trim();
    if (!isCloudKey(normalized)) throw new Error("Invalid Midnightcord Cloud key");
    await DataStore.set(CLOUD_KEY_STORE, normalized);
    await DataStore.del("midnightcord_cloud_state_v1");
    return normalized;
}

export async function unlinkCloudIdentity() {
    await Promise.all([
        DataStore.del(CLOUD_KEY_STORE),
        DataStore.del("midnightcord_cloud_state_v1")
    ]);
}

export async function getCloudAuthorization(): Promise<string> {
    const key = await getCloudKey();
    if (!key) throw new Error("This device is not linked to Midnightcord Cloud");
    return deriveCloudAuthorization(key);
}

export async function getCurrentCloudFingerprint(): Promise<string | null> {
    const key = await getCloudKey();
    return key ? getCloudFingerprint(key) : null;
}
