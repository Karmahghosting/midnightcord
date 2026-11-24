/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ImageIcon } from "@components/Icons";
import { React, useEffect, useState } from "@webpack/common";

import type { GifInput } from "./types";

export function gifLabel(gif: GifInput): string {
    if (gif.title) return gif.title;
    try {
        const url = new URL(gif.url);
        return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || url.hostname)
            .replace(/[-_]/g, " ").replace(/\.(gif|mp4|webm|webp)$/i, "");
    } catch {
        return "GIF";
    }
}

export function GifPreview({ gif }: { gif: GifInput; }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [gif.src]);
    if (!gif.src || failed) return <span className="vc-gif-teams-preview vc-gif-teams-placeholder"><ImageIcon /><span>Aperçu indisponible</span></span>;
    return <span className="vc-gif-teams-preview">
        {gif.format === 2
            ? <video src={gif.src} muted loop playsInline preload="none" onError={() => setFailed(true)} aria-hidden="true" />
            : <img src={gif.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
        {gif.format === 2 && <span className="vc-gif-teams-video-label">GIF vidéo</span>}
    </span>;
}

export function playPreview(target: HTMLElement) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    void target.querySelector("video")?.play().catch(() => { });
}

export function pausePreview(target: HTMLElement) { target.querySelector("video")?.pause(); }
