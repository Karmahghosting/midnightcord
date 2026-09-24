/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { tPlugin as t } from "@api/pluginI18n";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, FluxDispatcher, showToast, Toasts, UserStore } from "@webpack/common";

import { isWithinQuietHours, parseClock, parseVipUserIds } from "./quietHours";

const logger = new Logger("QuietHours");
const DIGEST_KEY_PREFIX = "midnightcord_quiet_hours_digest_v1:";
const SUPPRESS_NOTIFICATIONS = 1 << 12;
const SCHEDULE_CHECK_MS = 15_000;

let scheduleTimer: ReturnType<typeof setInterval> | undefined;
let wasQuiet = false;
let digestQueue = Promise.resolve();

function currentUserId() {
    return UserStore.getCurrentUser()?.id;
}

function isQuietNow() {
    return settings.store.quietHoursEnabled
        && isWithinQuietHours(new Date(), settings.store.quietStart, settings.store.quietEnd);
}

function enqueueDigest(operation: () => Promise<void>) {
    digestQueue = digestQueue.then(operation).catch(error => logger.error("Could not update quiet-hours summary", error));
    return digestQueue;
}

function recordMutedNotification(userId: string) {
    const key = `${DIGEST_KEY_PREFIX}${userId}`;
    void enqueueDigest(async () => {
        const previous = await DataStore.get<number>(key);
        const count = Number.isSafeInteger(previous) && (previous as number) > 0 ? previous as number : 0;
        await DataStore.set(key, count + 1);
    });
}

function flushDigest() {
    if (!settings.store.quietDigest) return;
    const userId = currentUserId();
    if (!userId) return;
    const key = `${DIGEST_KEY_PREFIX}${userId}`;
    void enqueueDigest(async () => {
        const count = await DataStore.get<number>(key);
        if (!Number.isSafeInteger(count) || (count as number) < 1) return;
        await DataStore.del(key);
        showToast(t("During quiet hours, %count notifications were muted.").replace("%count", String(count)), Toasts.Type.MESSAGE);
    });
}

function clearDigest() {
    const userId = currentUserId();
    if (userId) void enqueueDigest(() => DataStore.del(`${DIGEST_KEY_PREFIX}${userId}`));
}

function updateScheduleState() {
    const quiet = isQuietNow();
    if (wasQuiet && !quiet) flushDigest();
    wasQuiet = quiet;
}

function isNotifiable(event: any, message: any, userId: string) {
    const mentionsUser = message.mentions?.some((mention: any) => mention.id === userId)
        || message.mention_everyone
        || (message.mention_roles?.length ?? 0) > 0;
    const channelId = event.channelId ?? message.channel_id;
    const type = channelId ? ChannelStore.getChannel(channelId)?.type : undefined;
    const isDirectMessage = type === 1 || type === 3;
    return Boolean(event.isPushNotification || mentionsUser || isDirectMessage);
}

const settings = definePluginSettings({
    quietHoursEnabled: {
        type: OptionType.BOOLEAN,
        description: t("Mute incoming message notifications during the local quiet-hours schedule."),
        default: false,
        onChange: updateScheduleState
    },
    quietStart: {
        type: OptionType.STRING,
        description: t("Local time when quiet hours begin, in 24-hour HH:MM format."),
        default: "22:00",
        isValid: (value: string) => parseClock(value) !== null || t("Enter a time from 00:00 to 23:59."),
        onChange: updateScheduleState
    },
    quietEnd: {
        type: OptionType.STRING,
        description: t("Local time when quiet hours end, in 24-hour HH:MM format."),
        default: "08:00",
        isValid: (value: string) => parseClock(value) !== null || t("Enter a time from 00:00 to 23:59."),
        onChange: updateScheduleState
    },
    quietVipUsers: {
        type: OptionType.STRING,
        description: t("Comma-separated Discord user IDs that can still notify you during quiet hours."),
        default: ""
    },
    quietDigest: {
        type: OptionType.BOOLEAN,
        description: t("Show a count-only summary when quiet hours end. Message content is never stored."),
        default: true,
        onChange(value: boolean) {
            if (!value) clearDigest();
        }
    }
});

export default definePlugin({
    name: "QuietHours",
    description: "Schedule quiet hours, let selected VIP contacts through, and see a count-only summary afterwards.",
    authors: [{ name: "Midnightcord", id: 0n }],
    tags: ["Utility", "Notifications"],
    settings,

    start() {
        wasQuiet = isQuietNow();
        if (!wasQuiet) flushDigest();
        scheduleTimer = setInterval(updateScheduleState, SCHEDULE_CHECK_MS);
        FluxDispatcher.subscribe("CONNECTION_OPEN", updateScheduleState);
    },

    stop() {
        if (scheduleTimer) clearInterval(scheduleTimer);
        scheduleTimer = undefined;
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", updateScheduleState);
    },

    flux: {
        MESSAGE_CREATE(event: any) {
            const message = event?.message;
            const userId = currentUserId();
            if (!message || !userId || message.author?.id === userId || !isQuietNow()) return;
            if (parseVipUserIds(settings.store.quietVipUsers).has(message.author?.id)) return;
            if (!isNotifiable(event, message, userId)) return;

            event.isPushNotification = false;
            event.silent = true;
            message.flags = (message.flags ?? 0) | SUPPRESS_NOTIFICATIONS;
            if (settings.store.quietDigest) recordMutedNotification(userId);
        }
    }
});
