/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type CloudItemKey = "settings" | "quickCss";

export interface CloudManifestEntry {
    key: CloudItemKey;
    version: number;
    checksum: string;
    size: number;
    updatedAt: string;
    etag: string;
}

export interface CloudManifest {
    schema: 1;
    entries: CloudManifestEntry[];
}

export interface LocalCloudEntry {
    remoteEtag: string;
    remoteVersion: number;
    localDigest: string;
}

export interface LocalCloudState {
    schema: 1;
    entries: Partial<Record<CloudItemKey, LocalCloudEntry>>;
}
