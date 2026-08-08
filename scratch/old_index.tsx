/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { EquicordDevs } from "@utils/constants";
import { ModalRoot, ModalSize, openModal } from "@utils/modal";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent, OptionType, PluginNative } from "@utils/types";
import { ApplicationAssetUtils, React, ReactDOM, createRoot, useEffect, useRef, useState, FluxDispatcher } from "@webpack/common";

const Native = VencordNative.pluginHelpers.YoutubeInDiscord as PluginNative<typeof import("./native")>;

// ÔöÇÔöÇÔöÇ Icons ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={24} height={24} fill="none" viewBox="0 0 24 24" {...props}>
            <path fill="currentColor" d="M23.5 5.65a3.02 3.02 0 0 0-2.12-2.14C19.5 3 12 3 12 3s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 5.66C0 7.55 0 11.5 0 11.5s0 3.95.5 5.85a3.02 3.02 0 0 0 2.12 2.14C4.5 20 12 20 12 20s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.15c.5-1.9.5-5.85.5-5.85s0-3.95-.5-5.85ZM9.55 15.1V7.9l6.27 3.59-6.27 3.59Z" />
        </svg>
    );
}
const YoutubeIconComponent: IconComponent = props => <YoutubeIcon {...props} />;

function IconPlay({ size = 24 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
}
function IconPause({ size = 24 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;
}
function IconVolume() {
    return <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/></svg>;
}
function IconVolumeMute() {
    return <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45A4.4 4.4 0 0 0 16.5 12zm2.5 0a7 7 0 0 1-.46 2.47l1.52 1.52A8.94 8.94 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.26A7 7 0 0 1 14 17.96v2.06a9 9 0 0 0 3.49-1.63l1.79 1.79L20.54 19 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>;
}
function IconBack() {
    return <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>;
}
function IconX() {
    return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IconExpand() {
    return <svg width={17} height={17} viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>;
}

// ÔöÇÔöÇÔöÇ Types ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

interface YtVideo {
    id: string;
    title: string;
    author: string;
    artworkUrl: string;
    durationStr: string;
    viewCount: string;
}

interface YtChannel {
    channelId: string;
    title: string;
    handle: string;
    subscriberCount: string;
    artworkUrl: string;
    isChannel: true;
}

interface SearchResult {
    videos: YtVideo[];
    channels: YtChannel[];
    channelInfo?: any;
}

// ÔöÇÔöÇÔöÇ Player State ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

class PlayerState {
    video: YtVideo | null = null;
    isPlaying = false;
    progress = 0;
    duration = 0;
    position = 0;
    volume = 100;
    isModalOpen = false;
    isFullscreen = false;

    private listeners = new Set<() => void>();
    subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    notify() { this.listeners.forEach(l => l()); }
}
const playerState = new PlayerState();

function usePlayerState() {
    const [, forceUpdate] = useState(0);
    useEffect(() => playerState.subscribe(() => forceUpdate(n => n + 1)), []);
    return playerState;
}

// ÔöÇÔöÇÔöÇ YouTube iframe ghost ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

let ytContainer: HTMLDivElement | null = null;
let ytInterval: any = null;
let activeVideoRect: DOMRect | null = null;
let iframeMode: "fullscreen" | "island" | "hidden" = "hidden";

function updateIframePosition() {
    if (!ytContainer) return;
    if (activeVideoRect && iframeMode !== "hidden") {
        const { left, top, width, height } = activeVideoRect;
        ytContainer.style.display = "block";
        ytContainer.style.position = "fixed";
        ytContainer.style.left = left + "px";
        ytContainer.style.top = top + "px";
        ytContainer.style.width = width + "px";
        ytContainer.style.height = height + "px";
        ytContainer.style.overflow = "hidden";
        
        // Let clicks pass to the iframe ONLY when fullscreen.
        ytContainer.style.pointerEvents = iframeMode === "fullscreen" ? "auto" : "none";
        
        ytContainer.style.zIndex = iframeMode === "fullscreen" ? "9999990" : "10000001";
        ytContainer.style.borderRadius = iframeMode === "island" ? "14px" : "0";
    } else {
        ytContainer.style.left = "-9999px";
        ytContainer.style.top = "-9999px";
        ytContainer.style.width = "1px";
        ytContainer.style.height = "1px";
        ytContainer.style.pointerEvents = "none";
    }
}

function initYoutubePlayer() {
    if (document.getElementById("ytd-player-host-container")) return;

    ytContainer = document.createElement("div");
    ytContainer.id = "ytd-player-host-container";
    ytContainer.style.position = "fixed";
    ytContainer.style.overflow = "hidden";
    ytContainer.style.background = "#000"; // Black background
    ytContainer.style.transition = "opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
    document.body.appendChild(ytContainer);

    const iframe = document.createElement("iframe");
    iframe.id = "ytd-player-iframe";
    iframe.sandbox.add("allow-scripts", "allow-same-origin", "allow-presentation");
    iframe.allow = "autoplay; encrypted-media; fullscreen"; // Added fullscreen
    iframe.allowFullscreen = true; // Added allowfullscreen
    iframe.setAttribute("allowfullscreen", "true");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    ytContainer.appendChild(iframe);

    updateIframePosition();

    window.addEventListener("message", (event) => {
        const allowedOrigins = ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://www.googlevideo.com"];
        if (!allowedOrigins.includes(event.origin)) return;
        try {
            const data = JSON.parse(event.data);
            if (data.event === "onReady") {
                const iframe = document.getElementById("ytd-player-iframe") as HTMLIFrameElement;
                iframe?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
            }
            if (data.event === "infoDelivery" && data.info) {
                if (data.info.playerState !== undefined) {
                    const s = data.info.playerState;
                    if (s === 1) {
                        playerState.isPlaying = true;
                        if (data.info.duration) playerState.duration = data.info.duration;
                        startProgressLoop();
                    } else if (s === 2 || s === 0) {
                        playerState.isPlaying = false;
                        stopProgressLoop();
                    }
                    playerState.notify();
                }
                if (data.info.currentTime !== undefined) {
                    const diff = Math.abs(playerState.position - data.info.currentTime);
                    if (diff > 1.5) {
                        playerState.position = data.info.currentTime;
                        if (playerState.duration > 0) playerState.progress = playerState.position / playerState.duration;
                    }
                }
                if (data.info.duration) {
                    playerState.duration = data.info.duration;
                }
            }
        } catch { }
    });
}

function startProgressLoop() {
    if (ytInterval) clearInterval(ytInterval);
    ytInterval = setInterval(() => {
        if (!playerState.isPlaying) return;
        playerState.position = Math.min(playerState.position + 0.25, playerState.duration);
        playerState.progress = playerState.duration > 0 ? playerState.position / playerState.duration : 0;
        playerState.notify();
    }, 250);
}

function stopProgressLoop() {
    if (ytInterval) { clearInterval(ytInterval); ytInterval = null; }
}

function postCmd(func: string, args: any[] = []) {
    const iframe = document.getElementById("ytd-player-iframe") as HTMLIFrameElement;
    if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    }
}

function loadVideo(video: YtVideo) {
    playerState.video = video;
    playerState.progress = 0;
    playerState.position = 0;
    playerState.isPlaying = false;
    playerState.notify();
    const iframe = document.getElementById("ytd-player-iframe") as HTMLIFrameElement;
    if (iframe) {
        // Native YouTube UI, with fs=1 for fullscreen button
        iframe.src = `https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=1&controls=1&disablekb=0&fs=1&modestbranding=1&rel=0&iv_load_policy=3`;
        
        let attempts = 0;
        const listenInterval = setInterval(() => {
            if (attempts++ > 10 || playerState.isPlaying) clearInterval(listenInterval);
            iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
        }, 500);
    }
}

function togglePlay(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (playerState.isPlaying) postCmd("pauseVideo");
    else postCmd("playVideo");
}

function seekTo(progress: number) {
    const time = progress * playerState.duration;
    postCmd("seekTo", [time, true]);
    playerState.progress = progress;
    playerState.position = time;
    playerState.notify();
}

function setVolume(vol: number) {
    playerState.volume = vol;
    postCmd("setVolume", [vol]);
    if (vol === 0) postCmd("mute");
    else postCmd("unMute");
    playerState.notify();
}

function fmt(secs: number) {
    if (!isFinite(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

// ÔöÇÔöÇÔöÇ Default homepage videos ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

const DEFAULT_VIDEOS: YtVideo[] = [
    { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", author: "Rick Astley", artworkUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", durationStr: "3:33", viewCount: "1.5B views" },
    { id: "9bZkp7q19f0", title: "Gangnam Style", author: "PSY", artworkUrl: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg", durationStr: "4:13", viewCount: "5.3B views" },
    { id: "kJQP7kiw5Fk", title: "Despacito ft. Daddy Yankee", author: "Luis Fonsi", artworkUrl: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", durationStr: "4:41", viewCount: "8.3B views" },
    { id: "JGwWNGJdvx8", title: "Shape of You", author: "Ed Sheeran", artworkUrl: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg", durationStr: "4:24", viewCount: "6.3B views" },
    { id: "OPf0YbXqDm0", title: "Uptown Funk ft. Bruno Mars", author: "Mark Ronson", artworkUrl: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", durationStr: "4:31", viewCount: "4.5B views" },
    { id: "fRh_vgS2dFE", title: "Sorry", author: "Justin Bieber", artworkUrl: "https://i.ytimg.com/vi/fRh_vgS2dFE/hqdefault.jpg", durationStr: "3:19", viewCount: "3.7B views" },
    { id: "RgKAFK5djSk", title: "See You Again ft. Charlie Puth", author: "Wiz Khalifa", artworkUrl: "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg", durationStr: "3:59", viewCount: "6.2B views" },
    { id: "YQHsXMglC9A", title: "Hello", author: "Adele", artworkUrl: "https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg", durationStr: "6:07", viewCount: "3.5B views" },
    { id: "09R8_2nJtjg", title: "Sugar", author: "Maroon 5", artworkUrl: "https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg", durationStr: "3:55", viewCount: "4.1B views" },
];

// ÔöÇÔöÇÔöÇ Video Card ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function VideoCard({ video, active, onPlay }: { video: YtVideo; active?: boolean; onPlay: (v: YtVideo) => void }) {
    return (
        <div className={`ytd-video-card${active ? " ytd-card-active" : ""}`} onClick={() => onPlay(video)}>
            <div className="ytd-video-thumb-wrap">
                <img className="ytd-video-thumb" src={video.artworkUrl} alt="" loading="lazy" />
                <span className="ytd-video-duration">{video.durationStr}</span>
            </div>
            <div className="ytd-video-info">
                <div className="ytd-video-title" title={video.title}>{video.title}</div>
                <div className="ytd-video-meta">
                    <span className="ytd-video-author" title={video.author}>{video.author}</span>
                    {video.viewCount && <span className="ytd-video-views">{video.viewCount}</span>}
                </div>
            </div>
        </div>
    );
}

// ÔöÇÔöÇÔöÇ Home Modal ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function YoutubeHomeModal({ onClose, onPlayVideo }: {
    onClose: () => void;
    onPlayVideo: (v: YtVideo) => void;
}) {
    const p = usePlayerState();
    const [query, setQuery] = useState("");
    const [videos, setVideos] = useState<YtVideo[]>(DEFAULT_VIDEOS);
    const [channels, setChannels] = useState<YtChannel[]>([]);
    const [channelInfo, setChannelInfo] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("­ƒöÑ Trending");

    async function doSearch(e?: React.FormEvent) {
        e?.preventDefault();
        const q = query.trim();
        if (!q) { setVideos(DEFAULT_VIDEOS); setChannels([]); setChannelInfo(null); setStatus("­ƒöÑ Trending"); return; }
        setLoading(true);
        setStatus("Searching...");
        try {
            const res: SearchResult = JSON.parse(await Native.searchYouTube(q));
            setVideos(res.videos ?? []);
            setChannels(res.channels ?? []);
            setChannelInfo(null);
            if ((res.videos?.length ?? 0) === 0) setStatus("No videos found");
            else setStatus(`${res.videos.length} results for "${q}"`);
        } catch (err) {
            setStatus("ÔÜá´©Å Search failed");
            console.error("YTD search error:", err);
        }
        setLoading(false);
    }

    async function openChannel(ch: YtChannel) {
        setLoading(true);
        setStatus(`Loading ${ch.title}...`);
        setChannels([]);
        setChannelInfo(null);
        try {
            const res: SearchResult = JSON.parse(await Native.searchChannelVideos(ch.handle || ch.channelId));
            setVideos(res.videos ?? []);
            setChannelInfo(res.channelInfo || null);
            setStatus(`Videos from ${ch.title}`);
        } catch {
            setStatus("ÔÜá´©Å Failed to load channel");
        }
        setLoading(false);
    }

    return (
        <div className="ytd-player-root">
            <div className="ytd-header">
                <span className="ytd-header-title">
                    <YoutubeIcon />
                    YouTube In Discord
                </span>
                <button className="ytd-close-btn" onClick={onClose}><IconX /></button>
            </div>

            <form className="ytd-search-row" onSubmit={doSearch}>
                <input
                    className="ytd-search-input"
                    placeholder="Search videos or channels..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                />
                <button type="submit" className="ytd-search-btn" disabled={loading}>
                    {loading ? "..." : "Search"}
                </button>
            </form>

            <div className="ytd-status">{status}</div>

            {channels.length > 0 && (
                <div className="ytd-channels-row">
                    {channels.map(ch => (
                        <div key={ch.channelId} className="ytd-channel-card" onClick={() => openChannel(ch)}>
                            <img
                                className="ytd-channel-avatar"
                                src={ch.artworkUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.title)}&background=ff0000&color=fff`}
                                alt=""
                            />
                            <div className="ytd-channel-name">{ch.title}</div>
                            {ch.subscriberCount && <div className="ytd-channel-subs">{ch.subscriberCount}</div>}
                        </div>
                    ))}
                </div>
            )}
            
            {channelInfo && (
                <div className="ytd-channel-header">
                    {channelInfo.bannerUrl && (
                        <img className="ytd-channel-banner" src={channelInfo.bannerUrl} alt="Banner" />
                    )}
                    <div className="ytd-channel-header-content">
                        {channelInfo.avatarUrl && (
                            <img className="ytd-channel-header-avatar" src={channelInfo.avatarUrl} alt="" />
                        )}
                        <div className="ytd-channel-header-info">
                            <div className="ytd-channel-header-title">{channelInfo.title}</div>
                            <div className="ytd-channel-header-stats">
                                {channelInfo.subscribers && <span>{channelInfo.subscribers}</span>}
                                {channelInfo.subscribers && channelInfo.videoCount && <span> ÔÇó </span>}
                                {channelInfo.videoCount && <span>{channelInfo.videoCount}</span>}
                            </div>
                            {channelInfo.bio && <div className="ytd-channel-header-bio">{channelInfo.bio}</div>}
                        </div>
                    </div>
                </div>
            )}

            <div className="ytd-grid">
                {videos.length === 0 && !loading && <div className="ytd-empty">No results found</div>}
                {videos.map(v => (
                    <VideoCard key={v.id} video={v} active={p.video?.id === v.id} onPlay={onPlayVideo} />
                ))}
            </div>

            {p.video && (
                <div className="ytd-now-playing">
                    <div className="ytd-np-top">
                        <img
                            className="ytd-np-thumb"
                            src={p.video.artworkUrl}
                            alt=""
                            onClick={() => onPlayVideo(p.video!)}
                        />
                        <div className="ytd-np-info">
                            <div className="ytd-np-title" onClick={() => onPlayVideo(p.video!)}>{p.video.title}</div>
                            <div className="ytd-np-artist">{p.video.author}</div>
                        </div>
                        <button className="ytd-ctrl-btn" title="Open fullscreen" onClick={e => { e.stopPropagation(); onPlayVideo(p.video!); }}>
                            <IconExpand />
                        </button>
                    </div>
                    <div className="ytd-progress-bar" onClick={e => {
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        seekTo((e.clientX - rect.left) / rect.width);
                    }}>
                        <div className="ytd-progress-fill" style={{ width: `${(p.progress || 0) * 100}%` }} />
                    </div>
                    <div className="ytd-time-row">
                        <span>{fmt(p.position)}</span>
                        <span>-{fmt(p.duration - p.position)}</span>
                    </div>
                    <div className="ytd-controls">
                        <button className="ytd-play-pause-btn" onClick={togglePlay}>
                            {p.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                        </button>
                    </div>
                    <div className="ytd-volume-row">
                        <button className="ytd-ctrl-btn" onClick={e => { e.stopPropagation(); setVolume(p.volume > 0 ? 0 : 100); }}>
                            {p.volume === 0 ? <IconVolumeMute /> : <IconVolume />}
                        </button>
                        <input type="range" min={0} max={100} value={p.volume}
                            className="ytd-volume-slider"
                            onChange={e => setVolume(Number(e.currentTarget.value))} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ÔöÇÔöÇÔöÇ Fullscreen Overlay (Portal to body) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function FullscreenOverlay({ onClose }: { onClose: () => void }) {
    useEffect(() => {
        iframeMode = "fullscreen";
        if (ytContainer) {
            ytContainer.style.transition = "all 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
        }
        
        let rafId: number;
        const sync = () => {
            if (iframeMode === "fullscreen") {
                activeVideoRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
                if (ytContainer) ytContainer.style.opacity = "1";
                updateIframePosition();
            }
            rafId = requestAnimationFrame(sync);
        };
        rafId = requestAnimationFrame(sync);
        window.addEventListener("resize", sync);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", sync);
            iframeMode = "hidden";
            activeVideoRect = null;
            updateIframePosition();
        };
    }, []);

    return (
        <div className="ytd-fs-overlay">
            {/* Simple Floating Back Button, no search bar, no hitboxes that block video */}
            <button className="ytd-fs-back-btn-float" onClick={onClose}>
                <IconBack /> Back
            </button>
        </div>
    );
}

// ÔöÇÔöÇÔöÇ Combined modal switcher ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function YoutubeModal({ onClose, startFullscreen }: { onClose: () => void; startFullscreen?: boolean }) {
    const p = usePlayerState();

    useEffect(() => {
        playerState.isModalOpen = true;
        if (startFullscreen) {
            playerState.isFullscreen = true;
        }
        return () => {
            playerState.isModalOpen = false;
            playerState.isFullscreen = false;
            playerState.notify(); // Crucial to update Dynamic Island
        }
    }, [startFullscreen]);

    function handlePlayVideo(video: YtVideo) {
        loadVideo(video);
        playerState.isFullscreen = true;
        playerState.notify();
    }

    return (
        <div className="ytd-modal-wrapper">
            <YoutubeHomeModal onClose={onClose} onPlayVideo={handlePlayVideo} />
            {p.isFullscreen && ReactDOM.createPortal(
                <FullscreenOverlay onClose={() => {
                    playerState.isFullscreen = false;
                    playerState.notify();
                }} />,
                document.body
            )}
        </div>
    );
}

// ÔöÇÔöÇÔöÇ Dynamic Island ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function DynamicIslandPlayer() {
    const p = usePlayerState();
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const isHoveredRef = useRef(isHovered);
    isHoveredRef.current = isHovered;

    useEffect(() => {
        if (p.isModalOpen && p.isFullscreen) return;

        iframeMode = p.video ? "island" : "hidden";
        
        let timeout: ReturnType<typeof setTimeout>;
        if (ytContainer && ytContainer.style.transition.includes("all")) {
            timeout = setTimeout(() => {
                if (ytContainer) ytContainer.style.transition = "opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
            }, 500);
        } else if (ytContainer) {
            ytContainer.style.transition = "opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
        }

        let rafId: number;
        const sync = () => {
            if (videoContainerRef.current && p.video && !(playerState.isModalOpen && playerState.isFullscreen)) {
                activeVideoRect = videoContainerRef.current.getBoundingClientRect();
                const hidden = !playerState.isPlaying && !isHoveredRef.current;
                if (ytContainer) ytContainer.style.opacity = hidden ? "0" : "1";
                updateIframePosition();
            } else if (!(playerState.isModalOpen && playerState.isFullscreen)) {
                iframeMode = "hidden";
                activeVideoRect = null;
                if (ytContainer) ytContainer.style.opacity = "0";
                updateIframePosition();
            }
            rafId = requestAnimationFrame(sync);
        };
        rafId = requestAnimationFrame(sync);
        
        return () => {
            cancelAnimationFrame(rafId);
            clearTimeout(timeout);
        };
    }, [p.video, p.isModalOpen, p.isFullscreen]);

    if (!settings.store.showPopup || !p.video || (p.isModalOpen && p.isFullscreen)) return null;

    const position = settings.store.position || "top";
    const isHidden = !p.isPlaying && !isHovered;

    return (
        <div
            className={`ytd-dynamic-island ytd-pos-${position} ${isHidden ? "ytd-island-hidden" : ""}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => {
                if (p.isModalOpen) return;
                openModal(props => (
                    <ModalRoot {...props} size={ModalSize.DYNAMIC}>
                        <YoutubeModal onClose={props.onClose} startFullscreen={true} />
                    </ModalRoot>
                ));
            }}
        >
            <div className="ytd-island-main">
                <img
                    className={`ytd-island-artwork ${!p.isPlaying ? "ytd-paused" : ""}`}
                    src={p.video.artworkUrl}
                    alt=""
                />
                <div className="ytd-island-info">
                    <div className="ytd-island-title">{p.video.title}</div>
                    <div className="ytd-island-artist">{p.video.author}</div>
                </div>
                <div className={`ytd-island-wave ${!p.isPlaying ? "ytd-wave-paused" : ""}`}>
                    <span /><span /><span /><span />
                </div>
            </div>

            <div className="ytd-island-video-wrap">
                <div ref={videoContainerRef} className="ytd-island-video-target" />
            </div>

            <div className="ytd-island-expanded" onClick={e => e.stopPropagation()}>
                <div className="ytd-island-progress-row">
                    <span className="ytd-island-time">{fmt(p.position)}</span>
                    <input
                        type="range" min={0} max={1000}
                        value={(p.progress || 0) * 1000}
                        className="ytd-island-slider"
                        style={{ "--ytd-progress": `${(p.progress || 0) * 100}%` } as React.CSSProperties}
                        onChange={e => seekTo(Number(e.currentTarget.value) / 1000)}
                    />
                    <span className="ytd-island-time">-{fmt(p.duration - p.position)}</span>
                </div>
                <div className="ytd-island-controls-row">
                    <button className="ytd-island-btn ytd-island-btn-play" onClick={e => togglePlay(e)}>
                        {p.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ÔöÇÔöÇÔöÇ Rich Presence ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

const RPC_APP_ID = "1108588077900898414"; // Shared Midnightcord music/media app ID
const RPC_SOCKET_ID = "youtube_in_discord";
let _rpcLastTitle = "";
let _rpcLastPlaying = false;
let _rpcThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function updateRichPresence() {
    const p = playerState;
    const nowTitle = p.video?.title ?? "";
    const nowPlaying = !!p.video && p.isPlaying;

    // React immediately to track change or play/pause
    if (nowTitle !== _rpcLastTitle || nowPlaying !== _rpcLastPlaying) {
        if (_rpcThrottleTimer) { clearTimeout(_rpcThrottleTimer); _rpcThrottleTimer = null; }
        _doRpc();
        return;
    }

    // Throttle progress-only updates
    if (_rpcThrottleTimer) return;
    _rpcThrottleTimer = setTimeout(() => {
        _rpcThrottleTimer = null;
        _doRpc();
    }, 5000);
}

async function _doRpc() {
    try {
        if (!settings.store.richPresence) {
            clearRichPresence();
            _rpcLastTitle = ""; _rpcLastPlaying = false;
            return;
        }
        const p = playerState;
        if (!p.video || !p.isPlaying) {
            clearRichPresence();
            _rpcLastTitle = ""; _rpcLastPlaying = false;
            return;
        }

        _rpcLastTitle = p.video.title;
        _rpcLastPlaying = true;

        const now = Date.now();
        const elapsed = Math.floor(p.position * 1000);
        const start = now - elapsed;
        const duration = Math.floor(p.duration * 1000);
        const end = start + duration;

        // Proxy artwork URL through Discord (like SoundCord does)
        let large_image: string | undefined;
        if (p.video.artworkUrl) {
            try {
                large_image = (await ApplicationAssetUtils.fetchAssetIds(RPC_APP_ID, [p.video.artworkUrl]))[0];
            } catch {
                large_image = undefined;
            }
        }

        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: RPC_SOCKET_ID,
            activity: {
                application_id: RPC_APP_ID,
                name: "Watch Youtube in NightCord",
                details: p.video.title || "Unknown video",
                state: p.video.author || undefined,
                type: 2, // LISTENING (avoids "Regarde" prefix in French)
                timestamps: duration > 0 ? { start, end } : { start },
                assets: large_image
                    ? { large_image, large_text: p.video.title }
                    : undefined,
                buttons: ["Watch Together", "Download"],
                metadata: {
                    button_urls: [
                        `https://nightcord.st/watch?v=${p.video.id}`,
                        "https://nightcord.st",
                    ],
                },
                flags: 1,
            }
        });
    } catch { }
}

function clearRichPresence() {
    try {
        _rpcLastTitle = ""; _rpcLastPlaying = false;
        if (_rpcThrottleTimer) { clearTimeout(_rpcThrottleTimer); _rpcThrottleTimer = null; }
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: RPC_SOCKET_ID,
            activity: null,
        });
    } catch { }
}

// ÔöÇÔöÇÔöÇ Header Button ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function YTHeaderBarButton() {
    return (
        <HeaderBarButton
            icon={YoutubeIconComponent}
            tooltip="YouTube In Discord"
            onClick={() => openModal(props => (
                <ModalRoot {...props} size={ModalSize.DYNAMIC}>
                    <YoutubeModal onClose={props.onClose} />
                </ModalRoot>
            ))}
        />
    );
}

// ÔöÇÔöÇÔöÇ Settings ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

const settings = definePluginSettings({
    position: {
        type: OptionType.SELECT,
        description: "Dynamic Island Position",
        options: [
            { label: "Top Center", value: "top" },
            { label: "Bottom Right", value: "bottom" },
        ],
        default: "top",
    },
    showPopup: {
        type: OptionType.BOOLEAN,
        description: "Show Dynamic Island player",
        default: true,
    },
    richPresence: {
        type: OptionType.BOOLEAN,
        description: "Show watching activity status",
        default: true,
    },
});

// ÔöÇÔöÇÔöÇ Plugin ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

let islandContainer: HTMLDivElement | null = null;
let islandRoot: any = null;
let rpcUnsub: (() => void) | null = null;

export default definePlugin({
    name: "YoutubeInDiscord",
    enabledByDefault: true,
    description: "Watch YouTube in Discord. Search, Dynamic Island, Watching Together.",
    authors: [EquicordDevs.nobody],
    settings,

    headerBarButton: { icon: YoutubeIconComponent, render: YTHeaderBarButton },

    start() {
        Native.installWatchingTogetherIntercept().catch(() => {});
        initYoutubePlayer();
        clearRichPresence();
        rpcUnsub = playerState.subscribe(() => updateRichPresence());

        window.addEventListener("youtube-watch-together", (e: any) => {
            const ytId = e.detail?.ytId;
            if (!ytId) return;
            Native.resolveVideoDetails(ytId).then(res => {
                loadVideo(JSON.parse(res));
                openModal(props => (
                    <ModalRoot {...props} size={ModalSize.DYNAMIC}>
                        <YoutubeModal onClose={props.onClose} startFullscreen={true} />
                    </ModalRoot>
                ));
            }).catch(console.error);
        });

        islandContainer = document.createElement("div");
        document.body.appendChild(islandContainer);

        if (typeof createRoot === "function") {
            islandRoot = createRoot(islandContainer);
            islandRoot.render(<DynamicIslandPlayer />);
        } else if (ReactDOM?.createRoot) {
            islandRoot = ReactDOM.createRoot(islandContainer);
            islandRoot.render(<DynamicIslandPlayer />);
        } else if (ReactDOM?.render) {
            ReactDOM.render(<DynamicIslandPlayer />, islandContainer);
        }
    },

    stop() {
        if (ytContainer) { ytContainer.remove(); ytContainer = null; }
        stopProgressLoop();
        if (rpcUnsub) { rpcUnsub(); rpcUnsub = null; }
        clearRichPresence();
        if (islandContainer) {
            if (islandRoot?.unmount) islandRoot.unmount();
            else if (ReactDOM?.unmountComponentAtNode) ReactDOM.unmountComponentAtNode(islandContainer);
            islandContainer.remove();
            islandContainer = null;
        }
    },
});
