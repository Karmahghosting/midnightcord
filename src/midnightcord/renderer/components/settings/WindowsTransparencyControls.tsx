/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading, Paragraph } from "@Midnightcord/types/components";
import { Margins } from "@Midnightcord/types/utils";
import { isWindows } from "renderer/utils";

import { SimpleErrorBoundary } from "../SimpleErrorBoundary";
import { SettingsComponent } from "./Settings";

export const WindowsTransparencyControls: SettingsComponent = ({ settings }) => {
    if (!isWindows) return null;

    try {
        if (VesktopNative?.app?.supportsWindowsTransparency?.() !== true) return null;
    } catch {
        return null;
    }

    return (
        <div>
            <Heading tag="h5">Transparency Options</Heading>
            <Paragraph className={Margins.bottom8}>
                Requires a full restart. You will need a theme that supports transparency for this to work.
            </Paragraph>

            <SimpleErrorBoundary>
                <select
                    aria-label="Transparency option"
                    value={settings.transparencyOption || "none"}
                    onChange={event => (settings.transparencyOption = event.currentTarget.value as typeof settings.transparencyOption)}
                    style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "4px",
                        background: "var(--background-tertiary)",
                        color: "var(--text-normal)",
                        border: "1px solid var(--background-modifier-accent)"
                    }}
                >
                    <option value="none">None</option>
                    <option value="mica">Mica</option>
                    <option value="tabbed">Tabbed</option>
                    <option value="acrylic">Acrylic</option>
                </select>
            </SimpleErrorBoundary>
        </div>
    );
};
