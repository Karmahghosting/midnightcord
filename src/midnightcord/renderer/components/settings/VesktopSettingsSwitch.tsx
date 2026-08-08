/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@Midnightcord/types/components";
import type { ComponentProps } from "react";

import { cl } from "./Settings";

export function VesktopSettingsSwitch(props: ComponentProps<typeof FormSwitch>) {
    return <FormSwitch {...props} hideBorder className={cl("switch")} />;
}
