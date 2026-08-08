/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, type NativeImage, nativeImage } from "electron";
import { join } from "path";
import { BADGE_DIR } from "shared/paths";

import { updateUnityLauncherCount } from "./dbus";
import { AppEvents } from "./events";

const imgCache = new Map<number, NativeImage>();
let appBadgeWindow: BrowserWindow | undefined;

export function setAppBadgeWindow(win: BrowserWindow) {
    appBadgeWindow = win;
}
function loadBadge(index: number) {
    const cached = imgCache.get(index);
    if (cached) return cached;

    const img = nativeImage.createFromPath(join(BADGE_DIR, `${index}.ico`));
    imgCache.set(index, img);

    return img;
}

let lastIndex: null | number = -1;
let isInVoiceCall = false;

const voiceStateListener = (inCall: boolean) => {
    isInVoiceCall = inCall;
};

if (!AppEvents.listeners("voiceCallStateChanged").includes(voiceStateListener)) {
    AppEvents.on("voiceCallStateChanged", voiceStateListener);
}

export function destroyAppBadge() {
    appBadgeWindow = undefined;
    AppEvents.off("voiceCallStateChanged", voiceStateListener);
    imgCache.clear();
}

/**
 * -1 = show unread indicator
 * 0 = clear
 */
export function setBadgeCount(count: number, targetWin: BrowserWindow | undefined = appBadgeWindow) {
    if (!targetWin || targetWin.isDestroyed()) return;

    const isAppWindow = targetWin === appBadgeWindow;

    if (isAppWindow && !isInVoiceCall) {
        AppEvents.emit("setTrayVariant", count !== 0 ? "trayUnread" : "tray");
    }

    switch (process.platform) {
        case "linux":
            if (isAppWindow) updateUnityLauncherCount(count);
            break;
        case "darwin":
            if (isAppWindow) {
                if (count === 0) {
                    app.dock!.setBadge("");
                    break;
                }
                app.dock!.setBadge(count === -1 ? "•" : count.toString());
            }
            break;
        case "win32": {
            const [index, description] = getBadgeIndexAndDescription(count);
            if (isAppWindow) {
                if (lastIndex === index) break;
                lastIndex = index;
            }

            try {
                targetWin.setOverlayIcon(index === null ? null : loadBadge(index), description);
            } catch { }
            break;
        }
    }
}

function getBadgeIndexAndDescription(count: number): [number | null, string] {
    if (count === -1) return [11, "Unread Messages"];
    if (count === 0) return [null, "No Notifications"];

    const index = Math.max(1, Math.min(count, 10));
    return [index, `${index} Notification`];
}
