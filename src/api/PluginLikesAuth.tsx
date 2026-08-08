/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { openModal } from "@utils/modal";
import { OAuth2AuthorizeModal } from "@webpack/common";

import { beginDiscordOAuth, getStoredToken, storeToken } from "./OAuth2";

/** Dispatched on window whenever the like-system login state changes, so mounted components (like PluginCard) can react. */
export const LIKE_AUTH_EVENT = "midnightcord-like-auth-changed";

function notifyAuthChanged() {
    window.dispatchEvent(new CustomEvent(LIKE_AUTH_EVENT));
}

/**
 * Starts the Discord OAuth2 flow required to like plugins.
 * Resolves with the token on success, or null if the user cancelled / it failed.
 * If already logged in, resolves immediately with the existing token.
 */
export async function authorizeLikeSystem(): Promise<string | null> {
    const existing = await getStoredToken();
    if (existing) return existing;

    let clientId: string;
    let redirectUri: string;
    let scopes: string[];

    try {
        const signing = await beginDiscordOAuth();
        const authUrl = new URL(signing.url);
        clientId = authUrl.searchParams.get("client_id")!;
        redirectUri = signing.redirectUri;
        scopes = signing.scopes ?? ["identify"];
    } catch (e) {
        console.error("[PluginLikes] Failed to start OAuth flow:", e);
        showNotification({
            title: "Midnightcord",
            body: "Failed to start the login flow. Please try again."
        });
        return null;
    }

    return new Promise<string | null>(resolve => {
        openModal(props => (
            <OAuth2AuthorizeModal
                {...props}
                scopes={scopes}
                responseType="code"
                redirectUri={redirectUri}
                permissions={0n}
                clientId={clientId}
                cancelCompletesFlow={false}
                callback={async ({ location }: any) => {
                    if (!location) {
                        resolve(null);
                        return;
                    }

                    try {
                        const res = await fetch(location, { headers: { Accept: "application/json" } });
                        const data = await res.json();

                        if (data.token) {
                            await storeToken(data.token);
                            notifyAuthChanged();
                            showNotification({
                                title: "Midnightcord",
                                body: "Successfully logged in! You can now like plugins."
                            });
                            resolve(data.token);
                        } else {
                            showNotification({
                                title: "Midnightcord",
                                body: "Login failed, no token returned."
                            });
                            resolve(null);
                        }
                    } catch (e) {
                        console.error("[PluginLikes] Failed to complete OAuth flow:", e);
                        showNotification({
                            title: "Midnightcord",
                            body: "Login failed, check console."
                        });
                        resolve(null);
                    }
                }}
            />
        ));
    });
}
