/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "./utils";

// Make clicking Notifications focus the window
const originalSetOnClick = Object.getOwnPropertyDescriptor(Notification.prototype, "onclick")!.set!;
Object.defineProperty(Notification.prototype, "onclick", {
    set(onClick) {
        originalSetOnClick.call(this, function (this: unknown) {
            onClick.apply(this, arguments);
            VesktopNative.win.focus();
        });
    },
    configurable: true
});

// Hide "Download Discord Desktop now!!!!" banner
localStorage.setItem("hideNag", "true");

function ensureMouseMode() {
    const root = document.documentElement;
    if (root && !root.classList.contains("mouse-mode")) {
        root.classList.add("mouse-mode");
    }
}

document.addEventListener("pointermove", ensureMouseMode, { passive: true, capture: true });
document.addEventListener("mousemove", ensureMouseMode, { passive: true, capture: true });
document.addEventListener("pointerdown", ensureMouseMode, { passive: true, capture: true });
