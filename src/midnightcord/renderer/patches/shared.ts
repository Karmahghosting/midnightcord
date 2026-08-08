/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Patch } from "@Midnightcord/types/utils/types";

window.VesktopPatchGlobals = {};

interface PatchData {
    patches: Omit<Patch, "plugin">[];
    [key: string]: any;
}

export function addPatch<P extends PatchData>(p: P) {
    const { patches, ...globals } = p;

    for (const patch of patches) {
        Vencord.Plugins.addPatch(patch, "Midnightcord", "VesktopPatchGlobals");
    }

    Object.assign(VesktopPatchGlobals, globals);
}
