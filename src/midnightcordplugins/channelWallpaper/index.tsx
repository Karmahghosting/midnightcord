/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, Menu, React, RelationshipStore, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

const MessageActions = findByPropsLazy("deleteMessage");
const SYNC_PREFIX = "\u200b\u200c\u200bNC_WP:";

// ── Settings ───────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    wallpapers: {
        type: OptionType.STRING,
        description: "Wallpapers JSON — do not modify manually (managed by plugin)",
        default: "{}",
        hidden: true,
        restartNeeded: false,
        onChange() { _invalidateWpCache(); }
    },
    opacity: {
        type: OptionType.SLIDER,
        description: "Wallpaper opacity (0 = invisible, 1 = full)",
        markers: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        default: 0.3,
        stickToMarkers: false,
        restartNeeded: false,
        onChange(v: number) { _cachedOpacity = v; }
    },
    blur: {
        type: OptionType.SLIDER,
        description: "Wallpaper blur (px)",
        markers: [0, 2, 5, 10, 15, 20],
        default: 0,
        stickToMarkers: false,
        restartNeeded: false,
        onChange(v: number) { _cachedBlur = v; }
    },
    defaultWallpaper: {
        type: OptionType.STRING,
        description: "Default wallpaper URL (for channels without a custom one). Empty = none.",
        default: "",
        restartNeeded: false,
    },
    syncWithFriends: {
        type: OptionType.BOOLEAN,
        description: "Sync wallpapers with Midnightcord friends in DMs.",
        default: true,
        restartNeeded: false,
    },
    vpsUrl: {
        type: OptionType.STRING,
        description: "VPS URL (e.g. ws://your-vps:3000). Empty = use hidden messages.",
        default: "",
        restartNeeded: true,
    },
    vpsPassword: {
        type: OptionType.STRING,
        description: "Password for the sync server.",
        default: "midnightcord",
        restartNeeded: true,
    },
});

let _cachedOpacity = 0.3;
let _cachedBlur = 0;
const cacheWpSettings = () => {
    _cachedOpacity = settings.store.opacity ?? 0.3;
    _cachedBlur = settings.store.blur ?? 0;
};

let _wpCache: Record<string, string> | null = null;
let _wpRaw = "";

function getWallpapers(): Record<string, string> {
    const raw = settings.store.wallpapers || "{}";
    if (raw === _wpRaw && _wpCache !== null) return _wpCache;
    try { _wpCache = JSON.parse(raw); } catch { _wpCache = {}; }
    _wpRaw = raw;
    return _wpCache!;
}

function _invalidateWpCache() { _wpCache = null; _wpRaw = ""; }

function saveWallpaper(channelId: string, url: string, skipSync = false) {
    const wp = getWallpapers();
    if (url) {
        wp[channelId] = url;
    } else {
        delete wp[channelId];
    }
    settings.store.wallpapers = JSON.stringify(wp);
    _invalidateWpCache();
    applyWallpaper(channelId);

    // Peer-to-peer sync
    if (!skipSync) {
        const channel = ChannelStore.getChannel(channelId);
        if (channel?.type === 1) { // 1 = DM
            // VPS Sync (Primary if configured)
            if (settings.store.vpsUrl && vpsSocket?.readyState === WebSocket.OPEN) {
                vpsSocket.send(JSON.stringify({
                    type: "SET",
                    channelId,
                    url,
                    password: settings.store.vpsPassword
                }));
            } else {
                // Ghost Message Sync (Fallback)
                const otherUserId = channel.recipients[0];
                if (RelationshipStore.isFriend(otherUserId)) {
                    const payload = url || "DELETE";
                    sendMessage(channelId, { content: SYNC_PREFIX + payload });
                }
            }
        }
    }
}

function saveLocalWallpaperOnly(channelId: string, url: string) {
    const wp = getWallpapers();
    if (url) wp[channelId] = url;
    else delete wp[channelId];
    settings.store.wallpapers = JSON.stringify(wp);
    _invalidateWpCache();
    if (SelectedChannelStore.getChannelId() === channelId) {
        applyWallpaper(channelId);
    }
}

function getWallpaper(channelId: string): string {
    const wp = getWallpapers();
    return wp[channelId] || settings.store.defaultWallpaper || "";
}

function hasWallpaper(channelId: string): boolean {
    const wp = getWallpapers();
    return !!wp[channelId];
}

// ── File picker (browser input fallback) ───────────────────────────────────────

async function uploadToImgur(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("image", file);
    try {
        const res = await fetch("https://api.imgur.com/3/image", {
            method: "POST",
            headers: { Authorization: "Client-ID 546c25a59c58ad7" },
            body: formData,
        });
        const json = await res.json();
        return json?.data?.link ?? null;
    } catch { return null; }
}

function pickFileRaw(): Promise<File | null> {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*,video/mp4,video/webm,.gif";
        input.style.display = "none";
        input.onchange = () => {
            const file = input.files?.[0];
            resolve(file || null);
            input.remove();
        };
        input.oncancel = () => { resolve(null); input.remove(); };
        document.body.appendChild(input);
        input.click();
    });
}

function promptUrl(): Promise<string | null> {
    return new Promise(resolve => {
        const url = prompt("Enter the URL for the image, gif, or video:");
        resolve(url?.trim() || null);
    });
}

// ── CSS Injection ──────────────────────────────────────────────────────────────

const STYLE_ID = "channel-wallpaper-style";
const CONTAINER_ID = "channel-wallpaper-container";

function removeWallpaperElements() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CONTAINER_ID)?.remove();
}

let activeVideo: HTMLVideoElement | null = null;

function pauseVideo() {
    if (activeVideo && !activeVideo.paused) {
        activeVideo.pause();
    }
}

function playVideo() {
    if (activeVideo && activeVideo.paused && !document.hidden && document.hasFocus()) {
        activeVideo.play().catch(() => {});
    }
}

function handleVisChange() {
    if (document.hidden) pauseVideo();
    else playVideo();
}

function handleFocusChange() {
    if (document.hasFocus()) playVideo();
    else pauseVideo();
}

function applyWallpaper(channelId?: string) {
    removeWallpaperElements();

    const cid = channelId || SelectedChannelStore?.getChannelId?.();
    if (!cid) return;

    const url = getWallpaper(cid);
    if (!url) return;

    const opacity = _cachedOpacity;
    const blur = _cachedBlur;
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.startsWith("data:video/");

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
/* Zone messages : rendre le fond transparent pour laisser le wallpaper apparaître */
[class*="messagesWrapper"],
[class*="chatContent"],
[class*="chat-messages"],
[class*="scroller"][class*="message"] {
    background: transparent !important;
}

#${CONTAINER_ID} {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    opacity: ${opacity};
    ${blur > 0 ? `filter: blur(${blur}px);` : ""}
}

#${CONTAINER_ID} img,
#${CONTAINER_ID} video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* S'assurer que le parent est relatif pour le positionnement du fond */
[class*="messagesWrapper"],
[class*="chatContent"] {
    position: relative !important;
}
`.trim();
        document.head.appendChild(style);
    }

    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    if (isVideo) {
        const video = document.createElement("video");
        video.src = url;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        activeVideo = video;
        container.appendChild(video);
    } else {
        activeVideo = null;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.draggable = false;
        container.appendChild(img);
    }

    const tryInject = () => {
        const target =
            document.querySelector('[class*="messagesWrapper"]') ||
            document.querySelector('[class*="chat-messages"]') ||
            document.querySelector('[class*="chatContent"]') ||
            document.querySelector('[class*="content_"][class*="chat"]');

        if (target && target instanceof HTMLElement) {
            if (!target.closest('[class*="popout"]') && !target.closest('[class*="modal"]')) {
                if (!target.querySelector(`#${CONTAINER_ID}`)) {
                    (target as HTMLElement).style.position = "relative";
                    target.prepend(container);
                }
                return true;
            }
        }
        return false;
    };

    if (!tryInject()) {
        let _injTick = 0;
        const observer = new MutationObserver((_, obs) => {
            if (++_injTick % 3 !== 0) return;
            if (tryInject()) obs.disconnect();
        });
        const root = document.querySelector('[class*="chat"]') || document.body;
        observer.observe(root, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 3000);
    }
}

// ── Context menu actions ───────────────────────────────────────────────────────

async function setWallpaperFromFile(channelId: string) {
    const file = await pickFileRaw();
    if (!file) return;

    showToast(t("Uploading wallpaper to Imgur for sync..."), Toasts.Type.MESSAGE);
    const imgurUrl = await uploadToImgur(file);

    if (imgurUrl) {
        saveWallpaper(channelId, imgurUrl, false);
        showToast(t("Wallpaper uploaded and synced!"), Toasts.Type.SUCCESS);
    } else {
        // Fallback local si l'upload échoue
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            saveWallpaper(channelId, dataUrl, true);
            showToast(t("Imgur upload failed. Wallpaper applied locally only."), Toasts.Type.FAILURE);
        };
        reader.readAsDataURL(file);
    }
}

async function setWallpaperFromUrl(channelId: string) {
    const url = await promptUrl();
    if (url) {
        saveWallpaper(channelId, url, false);
        showToast(t("Wallpaper applied and synced!"), Toasts.Type.SUCCESS);
    }
}

function removeWallpaper(channelId: string) {
    saveWallpaper(channelId, "");
    showToast(t("Wallpaper deleted"), Toasts.Type.SUCCESS);
}

// ── Context Menu Patches ───────────────────────────────────────────────────────

function WallpaperIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v8.5l4-3 3 2.5 4-4 5 4V6H4zm0 12h16v-1.2l-5-4-3.8 3.8L8 14.5l-4 3V18zm5-8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
        </svg>
    );
}

function buildWallpaperMenu(channelId: string): React.ReactElement {
    const has = hasWallpaper(channelId);
    const channel = ChannelStore.getChannel(channelId);
    const isDM = channel?.type === 1;

    return (
        <Menu.MenuItem
            id="channel-wallpaper"
            label={t("Wallpaper")}
            icon={WallpaperIcon}
        >
            <Menu.MenuItem
                id="wallpaper-from-file"
                label={t("📁 From a file...")}
                action={() => setWallpaperFromFile(channelId)}
            />
            <Menu.MenuItem
                id="wallpaper-from-url"
                label={t("🔗 From a URL...")}
                action={() => setWallpaperFromUrl(channelId)}
            />
            {has && (
                <>
                    <Menu.MenuSeparator />
                    <Menu.MenuItem
                        id="wallpaper-remove"
                        label={isDM ? t("🗑️ Delete for both") : t("🗑️ Delete wallpaper")}
                        color="danger"
                        action={() => removeWallpaper(channelId)}
                    />
                </>
            )}
        </Menu.MenuItem>
    );
}

// ── VPS Sync logic ─────────────────────────────────────────────────────────────

let vpsSocket: WebSocket | null = null;
function initVPSSync() {
    if (!settings.store.vpsUrl) return;
    try {
        vpsSocket = new WebSocket(settings.store.vpsUrl);
        vpsSocket.onmessage = e => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === "UPDATE" && data.channelId) {
                    saveLocalWallpaperOnly(data.channelId, data.url);
                }
            } catch { }
        };
        vpsSocket.onopen = () => {
            const channelId = SelectedChannelStore.getChannelId();
            if (channelId) vpsSocket?.send(JSON.stringify({ type: "JOIN", channelId, password: settings.store.vpsPassword }));
        };
        vpsSocket.onclose = () => setTimeout(initVPSSync, 5000);
    } catch (err) {
        console.error("[ChannelWallpaper] VPS Connection failed:", err);
    }
}

// Clic droit sur un user → trouve le DM channel avec cet user spécifique
const userContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: any) => {
    if (!user?.id) return;
    // Résoudre le channel DM avec cet user (pas le channel courant !)
    const channelId = (ChannelStore as any).getDMFromUserId?.(user.id);
    if (!channelId) return;

    children.push(
        buildWallpaperMenu(channelId)
    );
};

// Clic droit sur un channel
const channelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: any) => {
    if (!channel?.id) return;
    children.push(
        buildWallpaperMenu(channel.id)
    );
};

// ── Plugin ─────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "ChannelWallpaper",
    enabledByDefault: true,
    authors: [Devs.rushii, Devs.Nickyux],
    description: "Allows for custom backgrounds for every individual channel.",
    settings,

    contextMenus: {
        "user-context": userContextMenuPatch,
        "channel-context": channelContextMenuPatch,
        "gdm-context": channelContextMenuPatch,
    },

    flux: {
        CHANNEL_SELECT({ channelId }: { channelId: string; }) {
            if (channelId) {
                setTimeout(() => applyWallpaper(channelId), 100);
                if (vpsSocket?.readyState === WebSocket.OPEN) {
                    vpsSocket.send(JSON.stringify({ type: "JOIN", channelId, password: settings.store.vpsPassword }));
                }
            } else {
                removeWallpaperElements();
            }
        },
        MESSAGE_CREATE(data: { channelId: string, message: any; }) {
            if (!settings.store.syncWithFriends) return;
            const { message, channelId } = data;

            if (message.content?.startsWith(SYNC_PREFIX)) {
                const isFromMe = message.author.id === UserStore.getCurrentUser().id;
                const isFromFriend = RelationshipStore.isFriend(message.author.id);

                if (isFromFriend || isFromMe) {
                    const payload = message.content.slice(SYNC_PREFIX.length);
                    const wpUrl = payload === "DELETE" ? "" : payload;
                    saveLocalWallpaperOnly(channelId, wpUrl);
                    if (MessageActions?.deleteMessage) {
                        MessageActions.deleteMessage(channelId, message.id);
                    }
                }
            }
        },
        LOAD_MESSAGES_SUCCESS(d: any) {
            if (!settings.store.syncWithFriends) return;
            const msgs = d.messages || [];
            let changed = false;
            for (const msg of msgs) {
                if (msg.content?.startsWith(SYNC_PREFIX)) {
                    const isFromMe = msg.author.id === UserStore.getCurrentUser().id;
                    const isFromFriend = RelationshipStore.isFriend(msg.author.id);
                    if (isFromFriend || isFromMe) {
                        const payload = msg.content.slice(SYNC_PREFIX.length);
                        saveLocalWallpaperOnly(d.channelId, payload === "DELETE" ? "" : payload);
                        if (MessageActions?.deleteMessage) {
                            MessageActions.deleteMessage(d.channelId, msg.id);
                        }
                        changed = true;
                    }
                }
            }
            if (changed) {
                setTimeout(() => applyWallpaper(d.channelId), 100);
            }
        }
    },

    start() {
        cacheWpSettings();
        if (settings.store.vpsUrl) initVPSSync();
        const cid = SelectedChannelStore.getChannelId();
        if (cid) {
            setTimeout(() => applyWallpaper(cid), 500);
        }
        document.addEventListener("visibilitychange", handleVisChange);
        window.addEventListener("focus", handleFocusChange);
        window.addEventListener("blur", handleFocusChange);
    },

    stop() {
        removeWallpaperElements();
        vpsSocket?.close();
        document.removeEventListener("visibilitychange", handleVisChange);
        window.removeEventListener("focus", handleFocusChange);
        window.removeEventListener("blur", handleFocusChange);
        activeVideo = null;
    }
});
