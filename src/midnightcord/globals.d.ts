/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

declare global {
    export var VesktopNative: typeof import("preload/VesktopNative").VesktopNative;
    export var Vesktop: typeof import("renderer/index");
    export var VesktopPatchGlobals: any;
    export var Vencord: any;

    export var IS_DEV: boolean;
    export var Midnightcord_GIT_HASH: string;
}

export {};
