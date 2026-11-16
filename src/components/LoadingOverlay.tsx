/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { midnightcordLogoDataUrl } from "./BrandIcons";

const OVERLAY_ID = "midnightcord-loading-overlay";

export function showLoadingOverlay(message = "Loading Midnightcord...") {
    hideLoadingOverlay();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "gap:18px",
        "background:radial-gradient(circle at 50% 45%, #17181c 0%, #0b0c0f 70%)",
        "color:#f2f3f5",
        "font-family:var(--font-primary, sans-serif)",
        "user-select:none"
    ].join(";");

    const logo = document.createElement("img");
    logo.src = midnightcordLogoDataUrl;
    logo.alt = "";
    logo.width = 96;
    logo.height = 96;
    logo.style.cssText = "object-fit:contain;filter:drop-shadow(0 0 24px rgba(88,101,242,.35))";

    const spinner = document.createElement("div");
    spinner.style.cssText = [
        "width:26px",
        "height:26px",
        "border-radius:50%",
        "border:3px solid rgba(255,255,255,.12)",
        "border-top-color:#5865f2",
        "animation:mc-loading-spin .8s linear infinite"
    ].join(";");

    const text = document.createElement("div");
    text.textContent = message;
    text.style.cssText = "font-size:14px;font-weight:500;color:#dbdee1";

    const style = document.createElement("style");
    style.textContent = "@keyframes mc-loading-spin { to { transform: rotate(360deg); } }";

    overlay.append(logo, spinner, text, style);
    document.body.appendChild(overlay);
}

export function hideLoadingOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
}
