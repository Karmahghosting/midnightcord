/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, MessageStore, showToast, Toasts, Menu, React } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

const Native = VencordNative.pluginHelpers.SaveVideos as PluginNative<typeof import("./native")>;
const logger = new Logger("SaveVideos");

interface MessageContextProps {
    message?: Message;
    channel?: any;
}

interface MediaItem {
    url: string;
    filename: string;
}

const SaveIcon = () => (
    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" />
    </svg>
);

function sanitizeFilename(name: string): string {
    const withoutQuery = name.split("?")[0];
    let decoded = withoutQuery;
    try { decoded = decodeURIComponent(withoutQuery); } catch { }
    return decoded.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(-200) || "file";
}

function getFilenameFromUrl(url: string, fallback: string): string {
    try {
        const pathname = new URL(url).pathname;
        const part = pathname.split("/").pop() || "";
        const clean = sanitizeFilename(part);
        if (clean && clean.length >= 3) return clean;
    } catch { }
    return fallback;
}

function getMediaFromMessage(message: Message): MediaItem[] {
    const media: MediaItem[] = [];
    const seenUrls = new Set<string>();

    if (!message) return media;
    const rawMsg = message as any;

    // Attachments — use proxy_url (works without auth, no CORS issues)
    if (message.attachments && Array.isArray(message.attachments)) {
        for (const attachment of message.attachments) {
            const url = attachment.proxy_url || attachment.url;
            if (!url || seenUrls.has(url)) continue;
            seenUrls.add(url);
            const filename = sanitizeFilename(
                attachment.filename || getFilenameFromUrl(url, `file_${attachment.id || media.length}`)
            );
            media.push({ url, filename });
        }
    }

    // Embeds — images, videos (proxy_url only — no CORS)
    if (message.embeds && Array.isArray(message.embeds)) {
        let embedIndex = 0;
        for (const embed of message.embeds) {
            // Image embed — use proxy_url (works for external images via Discord proxy)
            if (embed.image) {
                const url = embed.image.proxy_url || embed.image.url;
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    const srcUrl = embed.image.url || url;
                    const filename = getFilenameFromUrl(srcUrl, `image_${message.id}_${embedIndex}.png`);
                    media.push({ url, filename });
                    embedIndex++;
                }
            }

            // Video embed — only if Discord provides proxy_url (skips YouTube etc.)
            if (embed.video) {
                const url = embed.video.proxy_url;
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    const srcUrl = embed.video.url || url;
                    const filename = getFilenameFromUrl(srcUrl, `video_${message.id}_${embedIndex}.mp4`);
                    media.push({ url, filename });
                    embedIndex++;
                }
            }

            if (embed.thumbnail && !embed.image && !embed.video) {
                const url = embed.thumbnail.proxy_url;
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    const srcUrl = embed.thumbnail.url || url;
                    const filename = getFilenameFromUrl(srcUrl, `thumb_${message.id}_${embedIndex}.png`);
                    media.push({ url, filename });
                    embedIndex++;
                }
            }
        }
    }

    // Deep inspection helper for any object that might represent a message or snapshot
    function extractMediaFromObj(obj: any) {
        if (!obj || typeof obj !== "object") return;

        // Direct message inside snapshot
        if (obj.message && typeof obj.message === "object" && obj.message !== obj) {
            extractMediaFromObj(obj.message);
        }

        // Attachments
        const attachments = obj.attachments || obj.attachment;
        if (attachments && Array.isArray(attachments)) {
            for (const attachment of attachments) {
                const url = attachment.proxy_url || attachment.proxyUrl || attachment.url;
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    const filename = sanitizeFilename(
                        attachment.filename || getFilenameFromUrl(url, `file_${attachment.id || media.length}`)
                    );
                    media.push({ url, filename });
                }
            }
        }

        // Embeds
        const embeds = obj.embeds || obj.embed;
        if (embeds && Array.isArray(embeds)) {
            let embedIndex = 0;
            for (const embed of embeds) {
                if (embed.image) {
                    const url = embed.image.proxy_url || embed.image.proxyUrl || embed.image.url;
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        const srcUrl = embed.image.url || url;
                        const filename = getFilenameFromUrl(srcUrl, `image_${obj.id || "forward"}_${embedIndex}.png`);
                        media.push({ url, filename });
                        embedIndex++;
                    }
                }
                if (embed.video) {
                    const url = embed.video.proxy_url || embed.video.proxyUrl || embed.video.url;
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        const srcUrl = embed.video.url || url;
                        const filename = getFilenameFromUrl(srcUrl, `video_${obj.id || "forward"}_${embedIndex}.mp4`);
                        media.push({ url, filename });
                        embedIndex++;
                    }
                }
                if (embed.thumbnail && !embed.image && !embed.video) {
                    const url = embed.thumbnail.proxy_url || embed.thumbnail.proxyUrl || embed.thumbnail.url;
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        const srcUrl = embed.thumbnail.url || url;
                        const filename = getFilenameFromUrl(srcUrl, `thumb_${obj.id || "forward"}_${embedIndex}.png`);
                        media.push({ url, filename });
                        embedIndex++;
                    }
                }
            }
        }
    }

    // 1. Check messageSnapshots / message_snapshots
    const snapshots = rawMsg.messageSnapshots || rawMsg.message_snapshots;
    if (snapshots && Array.isArray(snapshots)) {
        for (const snapshot of snapshots) {
            extractMediaFromObj(snapshot);
        }
    }

    // 2. Check referenced_message / referencedMessage
    const refMsg = rawMsg.referenced_message || rawMsg.referencedMessage?.message || rawMsg.referencedMessage;
    if (refMsg && typeof refMsg === "object" && refMsg !== message) {
        extractMediaFromObj(refMsg);
    }

    return media;
}

function getChannelMessages(channelId: string): Message[] {
    try {
        const cache = MessageStore.getMessages(channelId) as any;
        if (!cache) return [];
        if (Array.isArray(cache)) return cache;
        if (typeof cache.toArray === "function") return cache.toArray();
        if (Array.isArray(cache._array)) return cache._array;
        if (typeof cache.values === "function") return Array.from(cache.values());
        if (typeof cache === "object") return Object.values(cache);
    } catch (e) {
        logger.error("Failed to get messages:", e);
    }
    return [];
}

function deduplicateByUrl(items: MediaItem[]): MediaItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

async function downloadMedia(media: MediaItem[]) {
    media = deduplicateByUrl(media);

    if (!media.length) {
        showToast("No downloadable media found.", Toasts.Type.FAILURE);
        return;
    }

    // Use Electron native dialog — works in servers, DMs, and group DMs
    const dir = await Native.pickDirectory();
    if (!dir) return; // user cancelled

    const total = media.length;
    let succeeded = 0;
    let failed = 0;

    // Deduplicate filenames
    const usedNames = new Map<string, number>();
    function uniqueName(original: string): string {
        const count = usedNames.get(original) ?? 0;
        usedNames.set(original, count + 1);
        if (count === 0) return original;
        const dot = original.lastIndexOf(".");
        return dot === -1
            ? `${original}_${count}`
            : `${original.slice(0, dot)}_${count}${original.slice(dot)}`;
    }

    const tasks = media.map(v => ({ url: v.url, filename: uniqueName(v.filename) }));

    showToast(`Downloading ${total} file(s)…`, Toasts.Type.MESSAGE);

    for (let i = 0; i < tasks.length; i++) {
        const { url, filename } = tasks[i];

        const result = await Native.downloadFile(url, dir, filename);
        if (result.ok) {
            succeeded++;
            logger.info(`Saved: ${filename}`);
        } else {
            failed++;
            logger.warn(`Failed ${filename}:`, result.error);
        }
    }

    if (failed === 0) {
        showToast(`✅ Done! Saved ${succeeded} file(s).`, Toasts.Type.SUCCESS);
    } else {
        showToast(`⚠️ Done! Saved ${succeeded} / ${total}. ${failed} failed.`, Toasts.Type.SUCCESS);
    }
}

const MessageContextMenuPatch = (children: any[], props: MessageContextProps) => {
    const message = props?.message;
    if (!message) return;

    const channelId = message.channel_id || props.channel?.id;
    const channel = props.channel || (channelId ? ChannelStore.getChannel(channelId) : null);

    const media = getMediaFromMessage(message);
    if (!media.length) return;

    children.push(
        <Menu.MenuGroup key="save-videos-msg-group">
            <Menu.MenuItem
                id="save-videos-download-message-media"
                label={t("Download Message Media")}
                action={() => { void downloadMedia(media); }}
            />
            {channel && (
                <Menu.MenuItem
                    id="save-videos-download-user-channel-media"
                    label={t("Download User's Media in Channel")}
                    action={() => {
                        const allMessages = getChannelMessages(channel.id);
                        const userMessages = allMessages.filter((m: any) => m.author?.id === message.author.id);
                        const allUserMedia = userMessages.flatMap((m: any) => getMediaFromMessage(m));
                        if (!allUserMedia.length) {
                            showToast(t("No media found from this user in this channel."), Toasts.Type.FAILURE);
                            return;
                        }
                        void downloadMedia(allUserMedia);
                    }}
                />
            )}
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "SaveVideos",
    description: "Download all media (images & videos) from a message, or all media from a user in a channel.",
    authors: [{ name: "midnightcord", id: 0n }],
    dependencies: ["MessagePopoverAPI"],
    enabledByDefault: false,

    contextMenus: {
        "message": MessageContextMenuPatch,
        "message-actions": MessageContextMenuPatch
    },

    messagePopoverButton: {
        icon: SaveIcon,
        render(message: Message) {
            const media = getMediaFromMessage(message);
            if (!media.length) return null;
            return {
                label: t("Download Message Media"),
                icon: SaveIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => downloadMedia(media)
            };
        }
    }
});
