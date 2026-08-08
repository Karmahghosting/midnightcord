/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "./DataStore";

export const API_BASE = "";
export const OAUTH_TOKEN_KEY = "midnightcord_oauth_token";

interface OAuthSigningData {
    url: string;
    redirectUri: string;
    scopes: string[];
    clientId?: string;
}

export async function beginDiscordOAuth(_state?: string): Promise<OAuthSigningData> {
    throw new Error("Midnightcord cloud integration is disabled in this build.");
}

export async function checkOAuthToken(_token: string): Promise<null> {
    return null;
}

export async function getStoredToken(): Promise<string | null> {
    return null;
}

export async function storeToken(_token: string) {
    await DataStore.del(OAUTH_TOKEN_KEY);
}

export async function clearToken() {
    await DataStore.del(OAUTH_TOKEN_KEY);
}
