/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxDispatcher, MessageStore, SelectedChannelStore } from "@webpack/common";

import { Flogger, settings } from ".";
import * as idb from "./db";
import { addMessage } from "./LoggedMessageManager";
import { LoggedMessage, LoggedMessageJSON } from "./types";
import { cleanUpCachedMessage, isGhostPinged, messageJsonToMessageClass } from "./utils";
import { shouldIgnore } from "./utils/index";
import { LimitedMap } from "./utils/LimitedMap";
import { getNative } from "./utils";

export const Native = getNative();
export const cacheSentMessages = new LimitedMap<string, LoggedMessageJSON>();
const handledMessageIds = new Set<string>();
let oldGetMessage: typeof MessageStore.getMessage;

export async function clearLogs(showToast = true) {
    await idb.clearMessagesIDB(showToast);
    cacheSentMessages.clear();
}

async function messageDeleteHandler(payload: any) {
    if (payload.mlDeleted) {
        if ((settings.store as any).permanentlyRemoveLogByDefault)
            await idb.deleteMessageIDB(payload.id);
        return;
    }

    if (handledMessageIds.has(payload.id)) return;

    try {
        handledMessageIds.add(payload.id);

        let message: LoggedMessage | LoggedMessageJSON | null = oldGetMessage?.(payload.channelId, payload.id) as any;
        if (message == null) {
            const cachedMessage = cacheSentMessages.get(`${payload.channelId},${payload.id}`);
            if (!cachedMessage) return;
            message = { ...cachedMessage, deleted: true } as LoggedMessageJSON;
        }

        const ghostPinged = isGhostPinged(message as any);

        if (shouldIgnore({
            channelId: message?.channel_id ?? payload.channelId,
            guildId: payload.guildId ?? (message as any).guildId ?? (message as any).guild_id,
            authorId: message?.author?.id,
            bot: (message as any).bot || message?.author?.bot,
            flags: message?.flags,
            ghostPinged,
            isCachedByUs: (message as LoggedMessageJSON).ourCache,
            webhookId: (message as any).webhookId,
            content: message?.content
        })) {
            return FluxDispatcher.dispatch({
                type: "MESSAGE_DELETE",
                channelId: payload.channelId,
                id: payload.id,
                mlDeleted: true
            });
        }

        if (message == null || message.channel_id == null || !(message as any).deleted) return;
        if (payload.isBulk) return message;

        const currentChannelId = SelectedChannelStore.getChannelId();
        await addMessage(message, ghostPinged ? idb.DBMessageStatus.GHOST_PINGED : idb.DBMessageStatus.DELETED, currentChannelId);
    } finally {
        handledMessageIds.delete(payload.id);
    }
}

async function messageDeleteBulkHandler({ channelId, guildId, ids }: { channelId: string; guildId?: string; ids: string[]; }) {
    const messages: LoggedMessageJSON[] = [];
    for (const id of ids) {
        const msg = await messageDeleteHandler({ type: "MESSAGE_DELETE", channelId, guildId, id, isBulk: true });
        if (msg) messages.push(msg as LoggedMessageJSON);
    }
    await idb.addMessagesBulkIDB(messages);
}

async function messageUpdateHandler(payload: any) {
    const cachedMessage = cacheSentMessages.get(`${payload.message.channel_id},${payload.message.id}`);

    if (shouldIgnore({
        channelId: payload.message?.channel_id,
        guildId: payload.guildId ?? payload?.guild_id,
        authorId: payload.message?.author?.id,
        bot: (payload.message?.author as any)?.bot,
        flags: payload.message?.flags,
        ghostPinged: isGhostPinged(payload.message as any),
        isCachedByUs: cachedMessage?.ourCache ?? false,
        content: payload.message?.content
    })) return;

    let message = oldGetMessage?.(payload.message.channel_id, payload.message.id) as LoggedMessage | LoggedMessageJSON | null;

    if (message == null) {
        if (cachedMessage != null && payload.message.content != null && cachedMessage.content !== payload.message.content) {
            message = {
                ...cachedMessage,
                content: payload.message.content,
                editHistory: [
                    ...(cachedMessage.editHistory ?? []),
                    {
                        content: cachedMessage.content,
                        timestamp: (new Date()).toISOString()
                    }
                ]
            };
            cacheSentMessages.set(`${payload.message.channel_id},${payload.message.id}`, message);
        }
    }

    if (message == null || message.channel_id == null || (message as LoggedMessageJSON).editHistory == null || (message as LoggedMessageJSON).editHistory!.length === 0) return;

    const currentChannelId = SelectedChannelStore.getChannelId();
    await addMessage(message, idb.DBMessageStatus.EDITED, currentChannelId);
}

function messageCreateHandler(payload: any) {
    cacheSentMessages.set(`${payload.message.channel_id},${payload.message.id}`, cleanUpCachedMessage(payload.message));
}

/**
 * Intercepts LOAD_MESSAGES_SUCCESS to inject permanently-saved deleted messages
 * back into the message list. Uses a BOUNDED time window [oldest..newest] from the
 * current batch so that deleted messages from other time periods never bleed in.
 */
async function loadMessagesSuccessHandler(payload: any) {
    try {
        const messages: any[] = payload.messages;
        if (!Array.isArray(messages) || messages.length === 0) return;

        const channelId: string = payload.channelId;
        if (!channelId) return;

        // Discord sorts DESC (newest first), so [0] = newest, [last] = oldest
        const newestMsg = messages[0];
        const oldestMsg = messages[messages.length - 1];

        const newestTs: string = newestMsg.timestamp;
        const oldestTs: string = oldestMsg.timestamp;

        // Query ONLY messages within the exact time window of this batch
        const records = await idb.getMessagesByChannelBetweenTimestampsIDB(channelId, oldestTs, newestTs);
        if (!records.length) return;

        const existingIds = new Set(messages.map((m: any) => m.id));

        // Attach edit history to existing messages
        for (const record of records) {
            if (record.status === idb.DBMessageStatus.EDITED) {
                const existing = messages.find((m: any) => m.id === record.message_id);
                if (existing && record.message.editHistory?.length) {
                    existing.editHistory = record.message.editHistory;
                }
            }
        }

        // Inject deleted messages that are NOT already in the batch
        const toInject = records
            .filter(r =>
                (r.status === idb.DBMessageStatus.DELETED || r.status === idb.DBMessageStatus.GHOST_PINGED) &&
                !existingIds.has(r.message_id)
            )
            .map(r => messageJsonToMessageClass({ message: r.message }));

        if (!toInject.length) return;

        // Insert deleted messages into the array, maintaining timestamp order (DESC)
        const DISCORD_EPOCH = 14200704e5;
        const getTime = (id: string) => (parseInt(id) / 4194304) + DISCORD_EPOCH;

        for (const deleted of toInject) {
            const deletedTime = getTime((deleted as any).id);
            let insertAt = messages.findIndex((m: any) => getTime(m.id) < deletedTime);
            if (insertAt === -1) insertAt = messages.length;
            messages.splice(insertAt, 0, deleted);
        }
    } catch (e) {
        Flogger.error("loadMessagesSuccessHandler failed", e);
    }
}

let didClearLogsOnStartup = false;
const combinedMessageCache = new Map<string, any>();

export async function startEnhanced(this: any) {
    oldGetMessage = MessageStore.getMessage;

    MessageStore.getMessage = (channelId: string, messageId: string) => {
        const MLMessage = idb.cachedMessages.get(messageId);
        if (!MLMessage) return oldGetMessage(channelId, messageId);

        if (combinedMessageCache.has(messageId)) {
            return combinedMessageCache.get(messageId);
        }

        if (MLMessage.deleted) {
            const combined = messageJsonToMessageClass({ message: MLMessage });
            combinedMessageCache.set(messageId, combined);
            return combined;
        }

        const latestMessage = oldGetMessage(channelId, messageId);
        const combined = messageJsonToMessageClass({
            message: { ...MLMessage, ...(latestMessage ?? {}) }
        });

        combinedMessageCache.set(messageId, combined);
        if (combinedMessageCache.size > 1000) {
            combinedMessageCache.delete(combinedMessageCache.keys().next().value!);
        }
        return combined;
    };

    Native.init();

    if ((settings.store as any).clearLogsOnRestart && !didClearLogsOnStartup) {
        try {
            await clearLogs(false);
            didClearLogsOnStartup = true;
        } catch (e) {
            Flogger.error("Failed to clear logs on restart", e);
        }
    }

    try {
        const { imageCacheDir, logsDir } = await Native.getSettings();
        (settings.store as any).imageCacheDir = imageCacheDir;
        (settings.store as any).logsDir = logsDir;
    } catch { /* native might not be available */ }

    FluxDispatcher.subscribe("MESSAGE_DELETE", messageDeleteHandler as any);
    FluxDispatcher.subscribe("MESSAGE_DELETE_BULK", messageDeleteBulkHandler as any);
    FluxDispatcher.subscribe("MESSAGE_UPDATE", messageUpdateHandler as any);
    FluxDispatcher.subscribe("MESSAGE_CREATE", messageCreateHandler as any);
    FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", loadMessagesSuccessHandler as any);
}

export function stopEnhanced() {
    if (oldGetMessage) MessageStore.getMessage = oldGetMessage;
    FluxDispatcher.unsubscribe("MESSAGE_DELETE", messageDeleteHandler as any);
    FluxDispatcher.unsubscribe("MESSAGE_DELETE_BULK", messageDeleteBulkHandler as any);
    FluxDispatcher.unsubscribe("MESSAGE_UPDATE", messageUpdateHandler as any);
    FluxDispatcher.unsubscribe("MESSAGE_CREATE", messageCreateHandler as any);
    FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", loadMessagesSuccessHandler as any);
}
