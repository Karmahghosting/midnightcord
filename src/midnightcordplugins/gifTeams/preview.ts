/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const PREVIEW_HOSTS = new Set(["media.tenor.com", "c.tenor.com", "giphy.com", "cdn.discordapp.com", "media.discordapp.net", "i.imgur.com", "gif.fxtwitter.com"]);

export function publicGifUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value || value.length > 2048) return null;
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/\.$/, "");
        if (url.protocol !== "https:" || url.username || url.password || url.port
            || !host.includes(".") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("[")
            || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)
            || host.endsWith(".home.arpa")) return null;
        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

function safePreview(value: unknown): string | null {
    const url = publicGifUrl(value);
    const host = url ? new URL(url).hostname.toLowerCase() : "";
    return url && (PREVIEW_HOSTS.has(host) || host.endsWith(".giphy.com")) ? url : null;
}

function mediaFormat(url: string): 1 | 2 | null {
    const path = new URL(url).pathname;
    if (/\.(gif|webp|avif|png|jpe?g)$/i.test(path)) return 1;
    if (/\.(mp4|webm)$/i.test(path)) return 2;
    return null;
}

/** Old snapshots may have an empty preview or an obsolete native format. */
export function resolveGifPreview(gif: { url: string; src?: string; format?: number; }): { src: string; format: 1 | 2; } | null {
    let src = safePreview(gif.src);
    if (!src) {
        const direct = safePreview(gif.url);
        // A favorite may link to an HTML page. Only known media extensions
        // on approved preview hosts are safe as an implicit source.
        if (direct && mediaFormat(direct) !== null) src = direct;
    }
    if (!src) return null;
    return { src, format: mediaFormat(src) ?? (gif.format === 2 ? 2 : 1) };
}
