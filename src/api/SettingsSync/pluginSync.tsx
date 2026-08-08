/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { getCloudUrl } from "./cloudSetup";
import { openModal } from "@utils/modal";
import { OAuth2AuthorizeModal } from "@webpack/common";

const logger = new Logger("SettingsSync:PluginSync", "#39b7e0");

const PLUGIN_TOKEN_KEY = "Midnightcord_pluginSyncToken";

export async function getPluginSyncToken(): Promise<string | undefined> {
    return await DataStore.get<string>(PLUGIN_TOKEN_KEY);
}

export async function setPluginSyncToken(token: string) {
    await DataStore.set(PLUGIN_TOKEN_KEY, token);
}

export async function clearPluginSyncToken() {
    await DataStore.set(PLUGIN_TOKEN_KEY, undefined);
}

export async function beginDiscordOAuth(state?: string) {
    const url = new URL("/api/oauth2/signing", getCloudUrl());
    if (state) {
        url.searchParams.set("state", state);
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to create OAuth URL");
    }

    return response.json() as Promise<{
        url: string;
        redirectUri: string;
        scopes: string[];
    }>;
}

export async function checkOAuthToken(token: string) {
    const response = await fetch(new URL(`/api/oauth2/check?token=${encodeURIComponent(token)}`, getCloudUrl()));
    if (!response.ok) {
        return null;
    }
    return response.json();
}

export async function getOwnPluginConfig(pluginName: string, token: string) {
    const response = await fetch(new URL(`/api/sync/${encodeURIComponent(pluginName)}?token=${encodeURIComponent(token)}`, getCloudUrl()));
    if (!response.ok) {
        throw new Error("Failed to load plugin config");
    }
    return response.json();
}

export async function saveOwnPluginConfig(pluginName: string, token: string, settings: Record<string, unknown>) {
    const response = await fetch(new URL(`/api/sync/${encodeURIComponent(pluginName)}`, getCloudUrl()), {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ token, settings })
    });

    if (!response.ok) {
        throw new Error("Failed to save plugin config");
    }

    return response.json();
}

export async function getPublicPluginConfig(pluginName: string, userId: string) {
    const response = await fetch(new URL(`/api/sync/${encodeURIComponent(pluginName)}/public?userId=${encodeURIComponent(userId)}`, getCloudUrl()));
    if (!response.ok) {
        return null;
    }
    return response.json();
}

export async function authorizePluginSync(): Promise<boolean> {
    if (await getPluginSyncToken()) {
        return true;
    }

    try {
        const { url, redirectUri, scopes } = await beginDiscordOAuth();
        const parsedUrl = new URL(url);
        const clientId = parsedUrl.searchParams.get("client_id");

        if (!clientId) {
            throw new Error("Missing client_id in OAuth URL");
        }

        return new Promise((resolve) => {
            openModal((props: any) => <OAuth2AuthorizeModal
                {...props}
                scopes={scopes}
                responseType="code"
                redirectUri={redirectUri}
                permissions={0n}
                clientId={clientId}
                cancelCompletesFlow={false}
                callback={async ({ location }: any) => {
                    if (!location) {
                        resolve(false);
                        return;
                    }

                    try {
                        const res = await fetch(location, {
                            headers: { Accept: "application/json" }
                        });
                        const data = await res.json();
                        
                        if (data.token) {
                            logger.info("Authorized plugin sync");
                            await setPluginSyncToken(data.token);
                            showNotification({
                                title: "Plugin Sync",
                                body: "Plugin sync is now authenticated!"
                            });
                            resolve(true);
                        } else {
                            logger.error("OAuth callback returned no token", data);
                            showNotification({
                                title: "Plugin Sync",
                                body: data.error ? `Setup failed: ${data.error}` : "Setup failed (no token returned)."
                            });
                            resolve(false);
                        }
                    } catch (e: any) {
                        logger.error("Failed to authorize plugin sync", e);
                        showNotification({
                            title: "Plugin Sync",
                            body: `Setup failed (${e.toString()}).`
                        });
                        resolve(false);
                    }
                }}
            />);
        });
    } catch (e: any) {
        logger.error("Failed to begin plugin sync OAuth", e);
        showNotification({
            title: "Plugin Sync",
            body: `Could not start setup (${e.toString()}).`
        });
        return false;
    }
}

