/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Rectangle } from "electron";

export interface Settings {
    discordBranch?: "stable" | "canary" | "ptb";
    transparencyOption?: "none" | "mica" | "tabbed" | "acrylic";
    tray?: boolean;
    minimizeToTray?: boolean;
    autoStartMinimized?: boolean;
    middleClickAutoscroll?: boolean;
    openLinksWithElectron?: boolean;
    staticTitle?: boolean;
    enableMenu?: boolean;
    disableSmoothScroll?: boolean;
    hardwareAcceleration?: boolean;
    hardwareVideoAcceleration?: boolean;
    arRPC?: boolean;
    arRPCDisabled?: boolean;
    arRPCDebug?: boolean;
    arRPCProcessScanning?: boolean;
    arRPCBridge?: boolean;
    arRPCBridgePort?: number;
    arRPCBridgeHost?: string;
    arRPCWebSocketHost?: string;
    arRPCWebSocketAutoReconnect?: boolean;
    arRPCWebSocketReconnectInterval?: number;
    arRPCWebSocketCustomHost?: string;
    arRPCWebSocketCustomPort?: number;
    appBadge?: boolean;
    badgeOnlyForMentions?: boolean;
    enableTaskbarFlashing?: boolean;
    disableMinSize?: boolean;
    clickTrayToShowHide?: boolean;
    customTitleBar?: boolean;

    enableSplashScreen?: boolean;
    splashTheming?: boolean;
    splashColor?: string;
    splashBackground?: string;
    splashProgress?: boolean;
    splashPixelated?: boolean;

    spellCheckLanguages?: string[];

    audio?: {
        workaround?: boolean;

        deviceSelect?: boolean;
        granularSelect?: boolean;

        ignoreVirtual?: boolean;
        ignoreDevices?: boolean;
        ignoreInputMedia?: boolean;

        onlySpeakers?: boolean;
        onlyDefaultSpeakers?: boolean;
    };
}

export interface State {
    maximized?: boolean;
    minimized?: boolean;
    windowBounds?: Rectangle;

    firstLaunch?: boolean;

    steamOSLayoutVersion?: number;
    linuxAutoStartEnabled?: boolean;

    MidnightcordDir?: string;

    launchArguments?: string;

    updater?: {
        ignoredVersion?: string;
        snoozeUntil?: number;
    };
}
