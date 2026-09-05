/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { tPlugin as t } from "@api/pluginI18n";
import { Constants, React, RestAPI, SettingsRouter, UserStore } from "@webpack/common";

import { SessionMonitor } from "./monitor";

export const monitor = new SessionMonitor({
    currentAccount: () => UserStore.getCurrentUser()?.id ?? null,
    read: key => DataStore.get(key),
    write: (key, value) => DataStore.set(key, value),
    fetch: async () => (await RestAPI.get({ url: Constants.Endpoints.AUTH_SESSIONS })).body.user_sessions,
    notify: accountId => {
        void showNotification({
            title: "BetterSessions",
            body: t("Une nouvelle session Discord a été détectée. Consultez vos appareils."),
            noPersist: true,
            onClick: () => {
                if (monitor.getSnapshot().accountId === accountId && UserStore.getCurrentUser()?.id === accountId) {
                    SettingsRouter?.openUserSettings("sessions_panel");
                }
            }
        }).catch(() => { });
    }
});

export function useSessions() {
    return React.useSyncExternalStore(monitor.subscribe, monitor.getSnapshot);
}

export function formatSessionTime(value: Date | string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t("Date indisponible") : date.toLocaleString();
}
