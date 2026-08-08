/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";

export const settings = definePluginSettings({
    blockedKeywords: {
        type: OptionType.STRING,
        default: "",
        description: "Keywords to filter (separated by commas)",
    },
    blockedUsers: {
        type: OptionType.STRING,
        default: "",
        description: "User IDs to ignore (separated by commas)",
    },
    blockEveryone: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Block @everyone and @here pings",
    },
    blockMode: {
        type: OptionType.SELECT,
        default: "silent",
        description: "Blocking mode",
        options: [
            { label: "Silent (Keep red badge but mute sound)", value: "silent" },
            { label: "Ghost (Completely remove the mention)", value: "ghost" }
        ]
    }
});

export default definePlugin({
    name: "SmartPingFilters",
    description: "Smartly filter pings by keywords or users.",
    authors: [{ name: "Midnightcord", id: 0n }],
    settings,
    flux: {
        MESSAGE_CREATE(event: any) {
            const message = event?.message;
            if (!message) return;

            const currentUser = UserStore?.getCurrentUser?.();
            const myId = currentUser?.id;
            if (!myId) return;

            // Verify if the current user is mentioned
            const isMentioned = message.mentions?.some((m: any) => m.id === myId) || 
                                message.mention_everyone || 
                                (message.mention_roles && message.mention_roles.length > 0);

            if (!isMentioned) return;

            const content = (message.content || "").toLowerCase();
            const authorId = message.author?.id;

            let shouldBlock = false;

            // 1. Check if @everyone/@here is blocked
            if (settings.store.blockEveryone && message.mention_everyone) {
                shouldBlock = true;
            }

            // 2. Check blocked keywords
            if (!shouldBlock && settings.store.blockedKeywords.trim().length > 0) {
                const keywords = settings.store.blockedKeywords.split(",").map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
                if (keywords.some(k => content.includes(k))) {
                    shouldBlock = true;
                }
            }

            // 3. Check blocked users
            if (!shouldBlock && authorId && settings.store.blockedUsers.trim().length > 0) {
                const users = settings.store.blockedUsers.split(",").map(u => u.trim()).filter(u => u.length > 0);
                if (users.includes(authorId)) {
                    shouldBlock = true;
                }
            }

            // Apply filter
            if (shouldBlock) {
                if (settings.store.blockMode === "ghost") {
                    // Remove mention completely
                    if (message.mentions) {
                        message.mentions = message.mentions.filter((m: any) => m.id !== myId);
                    }
                    message.mention_everyone = false;
                    message.mention_roles = [];
                } else {
                    // Silent Mode (Suppress sound and push notification, but keep the badge)
                    event.isPushNotification = false;
                    event.silent = true;
                    // Apply SUPPRESS_NOTIFICATIONS flag (1 << 12 = 4096)
                    message.flags = (message.flags || 0) | 4096;
                }
            }
        }
    }
});
