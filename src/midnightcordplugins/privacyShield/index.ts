/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { tPlugin as t } from "@api/pluginI18n";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

import { shouldSuppressNotification } from "./privacyShield";

const StreamStore = findByPropsLazy("getActiveStreamForUser", "getAllActiveStreams");
const RTCConnectionStore = findByPropsLazy("getMediaSessionId");
const MUTED_MESSAGE_FLAG = 1 << 12;
const BODY_CLASSES = [
    "midnightcord-privacy-shield-active",
    "midnightcord-privacy-shield-identities",
    "midnightcord-privacy-shield-content",
    "midnightcord-privacy-shield-dms",
    "midnightcord-privacy-shield-notifications"
] as const;

let shieldActive = false;
let mutedNotificationCount = 0;

function isSharingScreen() {
    try {
        const user = UserStore.getCurrentUser();
        if (!user) return false;

        if (StreamStore?.getActiveStreamForUser?.(user.id)) return true;
        const streams = StreamStore?.getAllActiveStreams?.();
        if (Array.isArray(streams) && streams.some((stream: any) => stream.ownerId === user.id)) return true;

        const mediaSessionId = RTCConnectionStore?.getMediaSessionId?.();
        return Boolean(mediaSessionId && RTCConnectionStore?.getState?.()?.context === "stream");
    } catch {
        return false;
    }
}

function syncShieldClasses() {
    const { body } = document;
    if (!body) return;

    const options = settings.store;
    body.classList.toggle(BODY_CLASSES[0], shieldActive);
    body.classList.toggle(BODY_CLASSES[1], shieldActive && options.maskIdentities);
    body.classList.toggle(BODY_CLASSES[2], shieldActive && options.maskMessageContent);
    body.classList.toggle(BODY_CLASSES[3], shieldActive && options.maskDmList);
    body.classList.toggle(BODY_CLASSES[4], shieldActive && options.hideNotificationPreviews);
}

function showMutedSummary() {
    if (!mutedNotificationCount) return;
    const count = mutedNotificationCount;
    mutedNotificationCount = 0;
    showToast(t("Privacy Shield hid %count message notifications during your stream.").replace("%count", String(count)), Toasts.Type.MESSAGE);
}

function updateShield() {
    const next = isSharingScreen();
    const wasActive = shieldActive;
    shieldActive = next;
    syncShieldClasses();
    if (wasActive && !next) showMutedSummary();
}

function handleMessageCreate(event: any) {
    if (!event?.message || !shieldActive) return;

    const { message } = event;
    const channelId = event.channelId ?? message.channel_id;
    const channelType = channelId ? ChannelStore.getChannel(channelId)?.type : undefined;
    const isDirectMessage = channelType === 1 || channelType === 3;
    if (!shouldSuppressNotification({
        active: shieldActive,
        enabled: settings.store.hideNotificationPreviews,
        event,
        message,
        currentUserId: UserStore.getCurrentUser()?.id,
        isDirectMessage
    })) return;

    event.isPushNotification = false;
    event.silent = true;
    message.flags = (message.flags ?? 0) | MUTED_MESSAGE_FLAG;
    mutedNotificationCount++;
}

const settings = definePluginSettings({
    maskIdentities: {
        type: OptionType.BOOLEAN,
        description: t("Blur usernames, avatars and profile names while your screen is shared."),
        default: true,
        onChange: syncShieldClasses
    },
    maskMessageContent: {
        type: OptionType.BOOLEAN,
        description: t("Blur message text, images, files and embeds while your screen is shared."),
        default: true,
        onChange: syncShieldClasses
    },
    maskDmList: {
        type: OptionType.BOOLEAN,
        description: t("Blur the direct-message list while your screen is shared."),
        default: true,
        onChange: syncShieldClasses
    },
    hideNotificationPreviews: {
        type: OptionType.BOOLEAN,
        description: t("Hide in-app notification previews and suppress incoming message alerts while your screen is shared."),
        default: true,
        onChange: syncShieldClasses
    }
});

export default definePlugin({
    name: "PrivacyShield",
    description: "Automatically masks private Discord content and message notifications while you share your screen.",
    authors: [{ name: "Midnightcord", id: 0n }],
    tags: ["Privacy", "Utility"],
    settings,

    start() {
        updateShield();
    },

    stop() {
        shieldActive = false;
        mutedNotificationCount = 0;
        syncShieldClasses();
    },

    flux: {
        STREAM_START: updateShield,
        STREAM_STOP: updateShield,
        STREAM_CREATE: updateShield,
        STREAM_DELETE: updateShield,
        RTC_CONNECTION_STATE: updateShield,
        MESSAGE_CREATE: handleMessageCreate
    }
});
