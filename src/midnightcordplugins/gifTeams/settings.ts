/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, SettingsStore } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    autoAddSharedFavorites: {
        type: OptionType.BOOLEAN,
        description: "Ajouter les GIF de mes teams aux favoris Discord, sans les repartager automatiquement depuis cet appareil.",
        default: true
    }
});

export function subscribeImportSettings(listener: () => void) {
    const path = "plugins.GifTeams.autoAddSharedFavorites";
    SettingsStore.addChangeListener(path, listener);
    return () => SettingsStore.removeChangeListener(path, listener);
}
