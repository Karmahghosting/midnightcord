/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@Midnightcord/types/components";

import { SettingsComponent } from "./Settings";

export const ArRPCSettingsButton: SettingsComponent = () => {
    return <Button onClick={() => VesktopNative.arrpc.openSettings()}>Configure Rich Presence</Button>;
};
