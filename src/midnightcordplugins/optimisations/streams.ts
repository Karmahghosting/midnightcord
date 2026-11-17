/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const videos = new Set<HTMLVideoElement>();
const visible = new WeakMap<HTMLVideoElement, boolean>();
const pausedByUs = new WeakSet<HTMLVideoElement>();

let observer: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let enabled = false;

function isStreamVideo(video: HTMLVideoElement) {
    return video.srcObject instanceof MediaStream;
}

function getDisplaySize(video: HTMLVideoElement) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.ceil(video.clientWidth * dpr);
    const height = Math.ceil(video.clientHeight * dpr);
    if (width < 64 || height < 64) return null;

    return {
        width: Math.min(1920, Math.max(320, Math.round(width / 2) * 2)),
        height: Math.min(1080, Math.max(180, Math.round(height / 2) * 2))
    };
}

async function capStreamResolution(video: HTMLVideoElement) {
    if (!enabled || !isStreamVideo(video)) return;

    const target = getDisplaySize(video);
    if (!target) return;

    const stream = video.srcObject as MediaStream;
    for (const track of stream.getVideoTracks()) {
        const settings = track.getSettings();
        const width = settings.width ?? 0;
        const height = settings.height ?? 0;
        const frameRate = settings.frameRate ?? 0;

        if (width > 0 && width <= target.width && height <= target.height && frameRate <= 60) continue;

        try {
            await track.applyConstraints({
                width: { max: target.width },
                height: { max: target.height },
                frameRate: { max: 60 }
            });
        } catch { }
    }
}

function sync(video: HTMLVideoElement) {
    if (!enabled || !isStreamVideo(video)) return;

    const shouldPause = document.hidden || visible.get(video) === false;

    if (shouldPause) {
        if (!video.paused) {
            pausedByUs.add(video);
            video.pause();
        }
    } else if (pausedByUs.has(video)) {
        pausedByUs.delete(video);
        video.play().catch(() => { });
    }
}

function scan() {
    if (!enabled) return;

    for (const video of videos) {
        if (!video.isConnected || !isStreamVideo(video)) {
            observer?.unobserve(video);
            videos.delete(video);
        }
    }

    for (const video of document.querySelectorAll<HTMLVideoElement>("video")) {
        if (videos.has(video) || !isStreamVideo(video)) continue;

        videos.add(video);
        visible.set(video, true);
        observer?.observe(video);
        resizeObserver?.observe(video);
        video.addEventListener("loadedmetadata", () => void capStreamResolution(video), { once: true });
        void capStreamResolution(video);
        sync(video);
    }
}

function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(() => {
        scanTimer = null;
        scan();
    }, 250);
}

function syncAll() {
    for (const video of videos) sync(video);
}

export function enableStreamPause() {
    if (enabled) return;
    enabled = true;

    observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            visible.set(entry.target as HTMLVideoElement, entry.isIntersecting);
            sync(entry.target as HTMLVideoElement);
        }
    }, { rootMargin: "120px" });

    resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) void capStreamResolution(entry.target as HTMLVideoElement);
    });

    mutationObserver = new MutationObserver(scheduleScan);
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("visibilitychange", syncAll);
    window.addEventListener("focus", syncAll);
    window.addEventListener("blur", syncAll);

    scan();
}

export function disableStreamPause() {
    if (!enabled) return;
    enabled = false;

    observer?.disconnect();
    observer = null;

    resizeObserver?.disconnect();
    resizeObserver = null;

    mutationObserver?.disconnect();
    mutationObserver = null;

    if (scanTimer !== null) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }

    document.removeEventListener("visibilitychange", syncAll);
    window.removeEventListener("focus", syncAll);
    window.removeEventListener("blur", syncAll);

    for (const video of videos) {
        if (pausedByUs.has(video)) {
            pausedByUs.delete(video);
            video.play().catch(() => { });
        }
    }

    videos.clear();
}
