/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@Midnightcord/types/components";

import { SimpleErrorBoundary } from "../SimpleErrorBoundary";
import { cl, SettingsComponent } from "./Settings";

export const DiscordBranchPicker: SettingsComponent = ({ settings }) => (
    <SimpleErrorBoundary>
        <select
            aria-label="Discord branch"
            className={cl("select")}
            value={settings.discordBranch || "stable"}
            onChange={event => (settings.discordBranch = event.currentTarget.value as typeof settings.discordBranch)}
        >
            <option value="stable">Stable</option>
            <option value="canary">Canary</option>
            <option value="ptb">PTB</option>
        </select>
        <BaseText size="sm" style={{ display: "block", marginTop: "8px", opacity: 0.7 }}>
            Select which Discord installation Midnightcord uses. A full restart is required.
        </BaseText>
    </SimpleErrorBoundary>
);
