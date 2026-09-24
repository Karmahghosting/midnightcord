/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { PlainSettings, Settings } from "@api/Settings";
import { openSettingsTabModal, SyncTab } from "@components/settings";
import { Logger } from "@utils/Logger";
import { Alerts } from "@webpack/common";

import { createCloudOnboarding } from "./cloudOnboardingFlow";
import { getCloudKey } from "./cloudSetup";

const logger = new Logger("MidnightcordCloudOnboarding");

export const offerCloudOnboarding = createCloudOnboarding({
    getState: () => IS_REPORTER ? "handled" : PlainSettings.cloudOnboarding,
    saveState: async state => {
        const previous = PlainSettings.cloudOnboarding;
        PlainSettings.cloudOnboarding = state;
        try {
            await VencordNative.settings.set(PlainSettings);
        } catch (error) {
            PlainSettings.cloudOnboarding = previous;
            throw error;
        }
    },
    isCloudEnabled: () => Settings.cloud.enabled,
    hasIdentity: async () => Boolean(await getCloudKey()),
    showPrompt: onConfirm => Alerts.show({
        title: t("Enable Midnightcord Cloud?"),
        body: t("Keep an encrypted copy of your settings and QuickCSS across your devices. Open Cloud settings to create a recovery key or link an existing one. Nothing is enabled until you choose, and you can set it up later."),
        confirmText: t("Configure Cloud"),
        cancelText: t("Not now"),
        onConfirm
    }),
    openSettings: () => openSettingsTabModal(SyncTab),
    onError: () => logger.warn("Could not offer Cloud setup. It remains available in Cloud settings.")
});
