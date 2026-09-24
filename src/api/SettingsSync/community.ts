/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { Alerts, Toasts } from "@webpack/common";

import { CLOUD_API_BASE, getCloudAuthorization, getCloudKey } from "./cloudSetup";
import { createCommunityFlow } from "./communityFlow";

const logger = new Logger("MidnightcordCommunity");
const listeners = new Set<() => void>();
const flow = createCommunityFlow({
    baseUrl: CLOUD_API_BASE,
    isEnabled: () => Settings.cloud.enabled,
    getAuthorization: async () => await getCloudKey() ? getCloudAuthorization() : null,
    fetch: (url, init) => fetch(url, init),
    prepareExternal: IS_WEB ? () => {
        const tab = window.open("about:blank", "_blank");
        if (tab) tab.opener = null;
        let navigated = false;
        return {
            open: url => {
                if (!tab || tab.closed) throw new Error("The community authorization window could not be opened");
                tab.location.replace(url);
                navigated = true;
            },
            close: () => {
                if (!navigated) tab?.close();
            }
        };
    } : undefined,
    openExternal: url => {
        if (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) {
            return VencordNative.native.openExternal(url);
        }
        window.open(url, "_blank", "noopener,noreferrer");
    },
    showPrompt: (onConfirm, onCancel) => Alerts.show({
        title: t("Join the Midnightcord community server?"),
        body: t("Joining is optional. Continue to Discord to authorize a one-time join to the official Midnightcord server. Cloud sync works with either choice."),
        confirmText: t("Continue to Discord"),
        cancelText: t("Cloud only"),
        onConfirm,
        onCancel
    }),
    onChange: () => listeners.forEach(listener => listener()),
    onError: manual => {
        if (!manual) {
            logger.warn("Community invitation unavailable. It can be retried in Cloud settings.");
            return;
        }
        Toasts.show({
            message: t("Could not update the community invitation. Try again from Cloud settings."),
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE
        });
    }
});

export const getCommunityStatus = flow.getStatus;
export const offerCommunityJoin = flow.offer;
export const openCommunityJoin = flow.join;

export function addCommunityChangeListener(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
