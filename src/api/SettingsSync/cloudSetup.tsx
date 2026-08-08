/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { openModal } from "@utils/modal";
import { OAuth2AuthorizeModal, UserStore } from "@webpack/common";

export const logger = new Logger("SettingsSync:CloudSetup", "#39b7e0");

export const getCloudUrl = () => new URL(Settings.cloud.url);
const getCloudUrlOrigin = () => getCloudUrl().origin;

const getUserId = () => {
    const id = UserStore.getCurrentUser()?.id;
    if (!id) throw new Error("User not yet logged in");
    return id;
};

export async function getAuthorization() {
    const secrets = await DataStore.get<Record<string, string>>("Vencord_cloudSecret") ?? {};

    const origin = getCloudUrlOrigin();

    // we need to migrate from the old format here
    if (secrets[origin]) {
        await DataStore.update<Record<string, string>>("Vencord_cloudSecret", secrets => {
            secrets ??= {};
            // use the current user ID
            secrets[`${origin}:${getUserId()}`] = secrets[origin];
            delete secrets[origin];
            return secrets;
        });

        // since this doesn't update the original object, we'll early return the existing authorization
        return secrets[origin];
    }

    return secrets[`${origin}:${getUserId()}`];
}

async function setAuthorization(secret: string) {
    await DataStore.update<Record<string, string>>("Vencord_cloudSecret", secrets => {
        secrets ??= {};
        secrets[`${getCloudUrlOrigin()}:${getUserId()}`] = secret;
        return secrets;
    });
}

export async function deauthorizeCloud() {
    await DataStore.update<Record<string, string>>("Vencord_cloudSecret", secrets => {
        secrets ??= {};
        delete secrets[`${getCloudUrlOrigin()}:${getUserId()}`];
        return secrets;
    });
}

export async function authorizeCloud() {
    if (await getAuthorization() !== undefined) {
        Settings.cloud.authenticated = true;
        return;
    }

    let clientId: string;
    let redirectUri: string;
    let scopes: string[];

    const cloudUrl = getCloudUrl();
    const isMidnightcord = cloudUrl.hostname.includes("midnightcord");

    try {
        if (isMidnightcord) {
            // Midnightcord API uses /api/oauth2/signing
            const signingRes = await fetch(new URL("/api/oauth2/signing", cloudUrl));
            const signingData = await signingRes.json();
            // Extract clientId from the authorization URL
            const authUrl = new URL(signingData.url);
            clientId = authUrl.searchParams.get("client_id")!;
            redirectUri = signingData.redirectUri;
            scopes = signingData.scopes ?? ["identify", "guilds.join"];
        } else {
            // Vencord/Equicord API uses /v1/oauth/settings
            const oauthConfiguration = await fetch(new URL("/v1/oauth/settings", cloudUrl));
            const data = await oauthConfiguration.json();
            clientId = data.clientId;
            redirectUri = data.redirectUri;
            scopes = ["identify"];
        }
    } catch {
        showNotification({
            title: "Cloud Integration",
            body: "Setup failed (couldn't retrieve OAuth configuration)."
        });
        Settings.cloud.authenticated = false;
        return;
    }

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
                Settings.cloud.authenticated = false;
                return;
            }

            try {
                const res = await fetch(location, {
                    headers: { Accept: "application/json" }
                });
                const data = await res.json();

                // Midnightcord returns { token }, Vencord/Equicord returns { secret }
                const credential = data.token ?? data.secret;
                if (credential) {
                    logger.info("Authorized with cloud");
                    await setAuthorization(credential);
                    showNotification({
                        title: "Cloud Integration",
                        body: "Cloud integrations enabled!"
                    });
                    Settings.cloud.authenticated = true;
                } else {
                    logger.error("OAuth callback returned no credential", data);
                    showNotification({
                        title: "Cloud Integration",
                        body: data.error
                            ? `Setup failed: ${data.error}`
                            : "Setup failed (no credential returned)."
                    });
                    Settings.cloud.authenticated = false;
                }
            } catch (e: any) {
                logger.error("Failed to authorize", e);
                showNotification({
                    title: "Cloud Integration",
                    body: `Setup failed (${e.toString()}).`
                });
                Settings.cloud.authenticated = false;
            }
        }}
    />);
}

export async function getCloudAuth() {
    const secret = await getAuthorization();

    return window.btoa(`${secret}:${getUserId()}`);
}
