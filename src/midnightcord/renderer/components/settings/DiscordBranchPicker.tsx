/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SimpleErrorBoundary } from "../SimpleErrorBoundary";
import { SettingsComponent } from "./Settings";

export const DiscordBranchPicker: SettingsComponent = ({ settings }) => (
    <SimpleErrorBoundary>
        <select
            aria-label="Discord branch"
            value={settings.discordBranch || "stable"}
            onChange={event => (settings.discordBranch = event.currentTarget.value as typeof settings.discordBranch)}
            style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "4px",
                background: "var(--background-tertiary)",
                color: "var(--text-normal)",
                border: "1px solid var(--background-modifier-accent)"
            }}
        >
            <option value="stable">Stable</option>
            <option value="canary">Canary</option>
            <option value="ptb">PTB</option>
        </select>
    </SimpleErrorBoundary>
);
