export const API_BASE = "https://api.nightcord.st";

import * as DataStore from "./DataStore";

export const OAUTH_TOKEN_KEY = "midnightcord_oauth_token";

export async function beginDiscordOAuth(state?: string) {
    const url = new URL(`${API_BASE}/api/oauth2/signing`);
    if (state) {
        url.searchParams.set('state', state);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error('Failed to create OAuth URL');
    }

    return response.json() as Promise<{
        url: string;
        redirectUri: string;
        scopes: string[];
    }>;
}

export async function checkOAuthToken(token: string) {
    try {
        const response = await fetch(`${API_BASE}/api/oauth2/check?token=${encodeURIComponent(token)}`);
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error("Failed to check OAuth token:", e);
        return null;
    }
}

export async function getStoredToken(): Promise<string | null> {
    return (await DataStore.get(OAUTH_TOKEN_KEY)) || null;
}

export async function storeToken(token: string) {
    await DataStore.set(OAUTH_TOKEN_KEY, token);
}

export async function clearToken() {
    await DataStore.del(OAUTH_TOKEN_KEY);
}
