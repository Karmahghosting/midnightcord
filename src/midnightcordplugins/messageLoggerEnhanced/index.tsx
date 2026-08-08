/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const Native = getNative();

import "./styles.css";

import { LogIcon as LogsIcon } from "@components/Icons";
import { Devs, EquicordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, MessageStore, SelectedChannelStore, UserStore } from "@webpack/common";

import { OpenLogsButton } from "./components/LogsButton";
import { openLogModal } from "./components/LogsModal";
import * as idb from "./db";
import * as LoggedMessageManager from "./LoggedMessageManager";
import { addMessage } from "./LoggedMessageManager";
import { settings } from "./settings";
import { FetchMessagesResponse, LoadMessagePayload, LoggedMessage, LoggedMessageJSON, MessageCreatePayload, MessageDeleteBulkPayload, MessageDeletePayload, MessageUpdatePayload } from "./types";
import { cleanUpCachedMessage, cleanupUserObject, getNative, isGhostPinged, mapTimestamp, messageJsonToMessageClass, reAddDeletedMessages } from "./utils";
import { removeContextMenuBindings, setupContextMenuPatches } from "./utils/contextMenu";
import { shouldIgnore } from "./utils/index";
import { LimitedMap } from "./utils/LimitedMap";
import { doesMatch } from "./utils/parseQuery";
import * as imageUtils from "./utils/saveImage";
import * as ImageManager from "./utils/saveImage/ImageManager";
export { settings };

export const Flogger = new Logger("MessageLoggerEnhanced", "#f26c6c");

export const cacheSentMessages = new LimitedMap<string, LoggedMessageJSON>();
export const cl = classNameFactory("vc-msg-logger-enhanced-");

let didClearLogsOnStartup = false;

const cacheThing = findByPropsLazy("commit", "getOrCreate");

export async function clearLogs(showToast = true) {
    await idb.clearMessagesIDB(showToast);
    cacheSentMessages.clear();
}

let oldGetMessage: typeof MessageStore.getMessage;

const handledMessageIds = new Set();
async function messageDeleteHandler(payload: MessageDeletePayload & { isBulk: boolean; }) {
    if (payload.mlDeleted) {
        if (settings.store.permanentlyRemoveLogByDefault)
            await idb.deleteMessageIDB(payload.id);

        return;
    }

    if (handledMessageIds.has(payload.id)) {
        return;
    }

    try {
        handledMessageIds.add(payload.id);

        let message: LoggedMessage | LoggedMessageJSON | null =
            oldGetMessage?.(payload.channelId, payload.id);
        if (message == null) {
            // most likely an edited message
            const cachedMessage = cacheSentMessages.get(`${payload.channelId},${payload.id}`);
            if (!cachedMessage) return;

            message = { ...cacheSentMessages.get(`${payload.channelId},${payload.id}`), deleted: true } as LoggedMessageJSON;
        }

        const ghostPinged = isGhostPinged(message as any);

        if (
            shouldIgnore({
                channelId: message?.channel_id ?? payload.channelId,
                guildId: payload.guildId ?? (message as any).guildId ?? (message as any).guild_id,
                authorId: message?.author?.id,
                bot: message?.bot || message?.author?.bot,
                flags: message?.flags,
                ghostPinged,
                isCachedByUs: (message as LoggedMessageJSON).ourCache,
                webhookId: message?.webhookId,
                content: message?.content
            })
        ) {
            return FluxDispatcher.dispatch({
                type: "MESSAGE_DELETE",
                channelId: payload.channelId,
                id: payload.id,
                mlDeleted: true
            });
        }

        if (message == null || message.channel_id == null || !message.deleted) return;
        if (payload.isBulk)
            return message;

        const currentChannelId = SelectedChannelStore.getChannelId();
        await addMessage(message, ghostPinged ? idb.DBMessageStatus.GHOST_PINGED : idb.DBMessageStatus.DELETED, currentChannelId);
    }
    finally {
        handledMessageIds.delete(payload.id);
    }
}

async function messageDeleteBulkHandler({ channelId, guildId, ids }: MessageDeleteBulkPayload) {
    const messages = [] as LoggedMessageJSON[];
    for (const id of ids) {
        const msg = await messageDeleteHandler({ type: "MESSAGE_DELETE", channelId, guildId, id, isBulk: true });
        if (msg) messages.push(msg as LoggedMessageJSON);
    }

    await idb.addMessagesBulkIDB(messages);

    if (messages.length > 0 && settings.store.timeBasedCleanupMinutes > 0) {
        const currentChannelId = SelectedChannelStore.getChannelId();
        const cutoffTime = new Date(Date.now() - settings.store.timeBasedCleanupMinutes * 60 * 1000).toISOString();
        const oldGuildMessages = await idb.getOlderThanTimestampForGuildsIDB(cutoffTime, currentChannelId, settings.store.preserveCurrentChannel);

        if (oldGuildMessages.length > 0) {
            Flogger.info(`Deleting ${oldGuildMessages.length} old server messages older than ${settings.store.timeBasedCleanupMinutes} minutes (bulk cleanup)`);
            await idb.deleteMessagesBulkIDB(oldGuildMessages.map(m => m.message_id));
        }
    }
}

async function messageUpdateHandler(payload: MessageUpdatePayload) {
    const cachedMessage = cacheSentMessages.get(`${payload.message.channel_id},${payload.message.id}`);
    if (
        shouldIgnore({
            channelId: payload.message?.channel_id,
            guildId: payload.guildId ?? (payload as any).guild_id,
            authorId: payload.message?.author?.id,
            bot: (payload.message?.author as any)?.bot,
            flags: payload.message?.flags,
            ghostPinged: isGhostPinged(payload.message as any),
            isCachedByUs: cachedMessage?.ourCache ?? false,
            content: payload.message?.content
        })
    ) {
        const cache = cacheThing.getOrCreate(payload.message.channel_id);
        const message = cache.get(payload.message.id);
        if (message) {
            message.editHistory = [];
            cacheThing.commit(cache);
        }
        return;
    }

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

    if (message == null || message.channel_id == null || message.editHistory == null || message.editHistory.length === 0) return;

    const currentChannelId = SelectedChannelStore.getChannelId();
    await addMessage(message, idb.DBMessageStatus.EDITED, currentChannelId);
}

function messageCreateHandler(payload: MessageCreatePayload) {
    if (!settings.store.cacheMessagesFromServers && payload.guildId != null) {
        const ids = [payload.channelId, payload.message?.author?.id, payload.guildId];
        const isWhitelisted =
            settings.store.whitelistedIds
                .split(",")
                .some(e => ids.includes(e));
        if (!isWhitelisted) {
            return;
        }
    }

    cacheSentMessages.set(`${payload.message.channel_id},${payload.message.id}`, cleanUpCachedMessage(payload.message));
}

async function processMessageFetch(response: FetchMessagesResponse) {
    try {
        if (!response.ok) {
            Flogger.error("Failed to fetch messages", response);
            return;
        }

        if (!Array.isArray(response.body)) {
            Flogger.error("Failed to fetch messages: response body is not an array", response);
            return;
        }

        if (response.body.length === 0) return;

        const newestMsg = response.body[0];
        const oldestMsg = response.body[response.body.length - 1];
        
        // Fetch up to the future so we catch deleted messages that are newer than newestMsg
        const endTimestamp = new Date(Date.now() + 86400000 * 30).toISOString();
        const messages = await idb.getMessagesByChannelBetweenTimestampsIDB(oldestMsg.channel_id, oldestMsg.timestamp, endTimestamp);

        if (!messages.length) return;

        const deletedMessages = messages.filter(m =>
            m.status === idb.DBMessageStatus.DELETED ||
            m.status === idb.DBMessageStatus.GHOST_PINGED
        );

        for (const recivedMessage of response.body) {
            const record = messages.find(m => m.message_id === recivedMessage.id);

            if (record == null) continue;

            if (record.message.editHistory && record.message.editHistory.length > 0) {
                recivedMessage.editHistory = record.message.editHistory;
            }
        }

        const fetchUser = (id: string) => UserStore.getUser(id) || response.body.find(e => e.author.id === id);

        for (let i = 0, len = messages.length; i < len; i++) {
            const record = messages[i];
            if (!record) continue;

            const { message } = record;

            for (let j = 0, len2 = message.mentions.length; j < len2; j++) {
                const user = message.mentions[j];
                const cachedUser = fetchUser((user as any).id || user);
                if (cachedUser) {
                    (message.mentions[j] as any) = cleanupUserObject(cachedUser);
                } else if (typeof user === "string") {
                    (message.mentions[j] as any) = { id: user, username: "Unknown User", discriminator: "0000", avatar: null, bot: false, public_flags: 0 };
                }
            }

            const authorId = typeof message.author === "string" ? message.author : message.author?.id;
            const author = fetchUser(authorId);
            if (author) {
                (message.author as any) = cleanupUserObject(author);
            } else if (authorId) {
                (message.author as any) = { id: authorId, username: "Unknown User", discriminator: "0000", avatar: null, bot: false, public_flags: 0 };
            } else {
                continue;
            }
        }

        response.body.extra = deletedMessages.map(m => m.message);

    } catch (e) {
        Flogger.error("Failed to fetch messages", e);
    }
}

// Guard: vérifie qu'un élément est bien un objet Message complet.
// Discord peut inclure des snowflakes bruts (strings/numbers) dans payload.messages
// pour représenter des messages en lazy-loading non encore chargés.
// Faire `'flags' in primitive` provoque un TypeError immédiat dans _handleLoadMessagesSuccess.
function isMessageObject(m: unknown): m is LoggedMessageJSON {
    return m !== null && typeof m === "object" && typeof (m as any).id === "string";
}

export default definePlugin({
    name: "MessageLoggerEnhanced",
    enabledByDefault: true,
    required: false,
    authors: [Devs.Aria, EquicordDevs.keircn],
    description: "Improves MessageLogger with edited message history, ghost ping detection and more",
    tags: ["Chat", "Servers"],
    dependencies: ["MessageLogger", "HeaderBarAPI"],

    patches: [
        {
            find: "_tryFetchMessagesCached",
            replacement: [
                {
                    match: /(?<=\.get\({url.+?then\()(\i)=>\(/,
                    replace: "async $1=>(await $self.processMessageFetch($1),"
                },
                {
                    match: /(?<=type:"LOAD_MESSAGES_SUCCESS",.{1,100})messages:(\i)/,
                    replace: "get messages() {return $self.coolReAddDeletedMessages($1, this);}"
                }

            ]
        },
        {
            find: ".PREMIUM_REFERRAL&&(",
            replacement: {
                match: /deleted:\i\.deleted, editHistory:\i\.editHistory,/,
                replace: "deleted:$self.getDeleted(...arguments), editHistory:$self.getEdited(...arguments),"
            }
        },
        // MessagePreview component in LogsModal
        {
            find: "=!0,disableInteraction:",
            replacement: {
                match: /childrenHeader:.{0,100}childrenMessageContent/,
                replace: "childrenAccessories:arguments[0].childrenAccessories || null,$&"
            }
        },
        // fix videos failing because there are no thumbnails
        {
            find: ".handleImageLoad)",
            replacement: {
                match: /(componentDidMount\(\){)(.{1,150}===(.+?)\.LOADING)/,
                replace:
                    "$1if(this.props?.src?.startsWith('blob:') && this.props?.item?.type === 'VIDEO')" +
                    "return this.setState({readyState: $3.READY});$2"
            }
        },

        // dont fetch messages for channels in modal
        {
            find: "Using PollReferenceMessageContext without",
            replacement: {
                match: /(?:\i\.)?\i\.(?:default\.)?focusMessage\(/,
                replace: "!(arguments[0]?.message?.deleted || arguments[0]?.message?.editHistory?.length > 0) && $&"
            }
        },

        // only check for expired attachments if the message is not deleted
        {
            find: "\"/ephemeral-attachments/\"",
            replacement: {
                match: /\i\.attachments\.some\(\i\)\|\|\i\.embeds\.some/,
                replace: "!arguments[0].deleted && $&"
            }
        }
    ],
    settings,

    processMessageFetch,
    openLogModal,
    doesMatch,
    reAddDeletedMessages,
    LoggedMessageManager,
    ImageManager,
    imageUtils,
    idb,

    coolReAddDeletedMessages: (messages: LoggedMessageJSON[] & { extra: LoggedMessageJSON[]; }, payload: LoadMessagePayload) => {
        try {
            if (messages.extra && messages.length > 0) {
                const isAtBottom = !payload.hasMoreAfter && !payload.isBefore;
                const oldestId = messages[messages.length - 1].id;
                const newestId = messages[0].id;
                
                const validExtra = messages.extra.filter(msg => {
                    if (isAtBottom) return BigInt(msg.id) >= BigInt(oldestId);
                    return BigInt(msg.id) >= BigInt(oldestId) && BigInt(msg.id) <= BigInt(newestId);
                });
                
                reAddDeletedMessages(messages, validExtra, isAtBottom, !payload.hasMoreBefore && !payload.isAfter);
            }
        }
        catch (e) {
            Flogger.error("Failed to re-add deleted messages", e);
        }
        finally {
            // Discord peut inclure des snowflakes bruts (strings) dans ce tableau pour des
            // messages partiels/non-charges. Un seul element non-objet fait planter Discord
            // plus tard avec "Cannot use 'in' operator to search for 'flags' in <id>".
            // On filtre TOUJOURS, meme quand il n'y a pas de messages supprimes a reinjecter
            // (c'est le cas le plus frequent, donc le bug le plus frequent).
            const extra = (messages as any).extra;
            let w = 0;
            for (let i = 0; i < messages.length; i++) {
                if (isMessageObject(messages[i])) messages[w++] = messages[i];
            }
            messages.length = w;
            if (extra !== undefined) (messages as any).extra = extra;
        }
        return messages;
    },

    isDeletedMessage: (id: string) => cacheSentMessages.get(id)?.deleted ?? false,

    getDeleted(m1, m2) {
        const deleted = m2?.deleted;
        if (deleted == null && m1?.deleted != null) return m1.deleted;
        return deleted;
    },

    getEdited(m1, m2) {
        const editHistory = m2?.editHistory;
        if (editHistory == null && m1?.editHistory != null && m1.editHistory.length > 0)
            return m1.editHistory.map(mapTimestamp);
        return editHistory;
    },

    flux: {
        "MESSAGE_DELETE": messageDeleteHandler as any,
        "MESSAGE_DELETE_BULK": messageDeleteBulkHandler,
        "MESSAGE_UPDATE": messageUpdateHandler,
        "MESSAGE_CREATE": messageCreateHandler
    },

    async start() {
        this.oldGetMessage = oldGetMessage = MessageStore.getMessage;

        // Cache pour éviter de recréer les classes de messages à chaque appel (très fréquent au scroll)
        const combinedMessageCache = new Map<string, any>();

        MessageStore.getMessage = (channelId: string, messageId: string) => {
            const MLMessage = idb.cachedMessages.get(messageId);
            if (!MLMessage)
                return this.oldGetMessage(channelId, messageId);

            if (combinedMessageCache.has(messageId)) {
                return combinedMessageCache.get(messageId);
            }

            if (MLMessage.deleted) {
                const combined = messageJsonToMessageClass({ message: MLMessage });
                combinedMessageCache.set(messageId, combined);
                return combined;
            }

            const latestMessage = this.oldGetMessage(channelId, messageId);
            const combined = messageJsonToMessageClass({
                message: {
                    ...MLMessage,
                    ...(latestMessage ?? {}),
                }
            });

            combinedMessageCache.set(messageId, combined);

            if (combinedMessageCache.size > 1000) {
                const firstKey = combinedMessageCache.keys().next().value;
                combinedMessageCache.delete(firstKey);
            }

            return combined;
        };

        Native.init();

        if (settings.store.clearLogsOnRestart && !didClearLogsOnStartup) {
            try {
                await clearLogs(false);
                didClearLogsOnStartup = true;
            } catch (e) {
                Flogger.error("Failed to clear logs on restart", e);
            }
        }

        const { imageCacheDir, logsDir } = await Native.getSettings();
        settings.store.imageCacheDir = imageCacheDir;
        settings.store.logsDir = logsDir;

        setupContextMenuPatches();
    },

    stop() {
        removeContextMenuBindings();
        MessageStore.getMessage = this.oldGetMessage;
    }
});
