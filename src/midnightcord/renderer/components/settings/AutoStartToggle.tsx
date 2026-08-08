/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@Midnightcord/types/webpack/common";

import { SettingsComponent } from "./Settings";
import { VesktopSettingsSwitch } from "./VesktopSettingsSwitch";

export const AutoStartToggle: SettingsComponent = ({ settings }) => {
    const [autoStartEnabled, setAutoStartEnabled] = useState(VesktopNative.autostart.isEnabled());

    return (
        <>
            <VesktopSettingsSwitch
                title="Start With System"
                description="Automatically start Midnightcord on computer start-up"
                value={autoStartEnabled}
                onChange={async v => {
                    await VesktopNative.autostart[v ? "enable" : "disable"]();
                    setAutoStartEnabled(v);
                }}
            />

            <VesktopSettingsSwitch
                title="Auto Start Minimized"
                description={"Start Midnightcord minimized when starting with system"}
                value={settings.autoStartMinimized ?? false}
                onChange={v => (settings.autoStartMinimized = v)}
                disabled={!autoStartEnabled}
            />
        </>
    );
};
