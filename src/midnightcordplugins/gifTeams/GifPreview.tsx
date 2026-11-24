/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ImageIcon } from "@components/Icons";
import { React, useState } from "@webpack/common";

import { resolveGifPreview } from "./preview";
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

function UnavailablePreview() {
    return <span className="vc-gif-teams-preview vc-gif-teams-placeholder"><ImageIcon /><span>Aperçu indisponible</span></span>;
}

function PreviewMedia({ src, format }: { src: string; format: 1 | 2; }) {
    const [failed, setFailed] = useState(false);
    if (failed) return <UnavailablePreview />;
    return <span className="vc-gif-teams-preview">
        {format === 2
            ? <video src={src} muted loop playsInline preload="metadata" onError={() => setFailed(true)} aria-hidden="true" />
            : <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
        {format === 2 && <span className="vc-gif-teams-video-label">GIF vidéo</span>}
    </span>;
}

export function GifPreview({ gif }: { gif: GifInput; }) {
    const preview = resolveGifPreview(gif);
    return preview ? <PreviewMedia key={`${preview.src}:${preview.format}`} {...preview} /> : <UnavailablePreview />;
}

export function playPreview(target: HTMLElement) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    void target.querySelector("video")?.play().catch(() => { });
}

export function pausePreview(target: HTMLElement) { target.querySelector("video")?.pause(); }
