/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Midnightcord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, MessageStore, SelectedChannelStore, UserStore } from "@webpack/common";

import { settings, setOnAutoTranslateReceivedToggled } from "./settings";
import { setShouldShowTranslateEnabledTooltip, TranslateChatBarIcon, TranslateIcon } from "./TranslateIcon";
import { handleTranslate, TranslationAccessory } from "./TranslationAccessory";
import { translate } from "./utils";
import { t } from "../autoTranslateMidnightcord";


const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    const content = getMessageContent(message);
    if (!content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-trans"
            label={t("Translate")}
            icon={TranslateIcon}
            action={async () => {
                const trans = await translate("received", content);
                handleTranslate(message.id, trans);
            }}
        />
    ));
};

function getMessageContent(message: Message) {
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription || "";
}

let tooltipTimeout: any;

// Tracks which messages have already been auto-translated
const translatedMessageIds = new Set<string>();
const translatingMessageIds = new Set<string>();
const originalMessageContents = new Map<string, { channelId: string; content: string; }>();

function revertAllTranslations() {
    for (const [messageId, data] of originalMessageContents.entries()) {
        try {
            const stored = MessageStore.getMessage(data.channelId, messageId);
            if (stored) {
                stored.content = data.content;
                try { (stored as any)._contentParsed = undefined; } catch {}
                FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: stored, guildId: stored.guild_id ?? undefined });
            }
        } catch {}
    }
    originalMessageContents.clear();
    translatedMessageIds.clear();
    translatingMessageIds.clear();
}

function translateChannelMessages(channelId: string) {
    if (!settings.store.autoTranslateReceived) return;
    const collection = MessageStore.getMessages(channelId);
    if (!collection) return;
    const messages = collection.toArray?.() ?? collection._array ?? [];
    for (const msg of messages) {
        autoTranslateMessage(msg);
    }
}


async function autoTranslateMessage(message: any) {
    if (!settings.store.autoTranslateReceived) return;
    if (!message?.content?.trim()) return;
    if (translatedMessageIds.has(message.id) || translatingMessageIds.has(message.id)) return;

    // Skip messages sent by the current user
    const me = UserStore.getCurrentUser();
    if (me && message.author?.id === me.id) return;

    const channelId: string = message.channel_id || message.channelId;
    if (!channelId) return;

    translatingMessageIds.add(message.id);
    try {
        const originalContent = message.content;
        const res = await translate("received", message.content);
        if (!res?.text || res.text === message.content) {
            translatingMessageIds.delete(message.id);
            return;
        }

        translatedMessageIds.add(message.id);
        translatingMessageIds.delete(message.id);
        originalMessageContents.set(message.id, { channelId, content: originalContent });

        // Wait for the message to be stored, then update it
        const applyTranslation = () => {
            const stored = MessageStore.getMessage(channelId, message.id);
            if (!stored) return false;
            stored.content = res.text;
            // Bust parsed content cache
            try { (stored as any)._contentParsed = undefined; } catch {}
            // Trigger a re-render
            FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message: stored, guildId: stored.guild_id ?? undefined });
            return true;
        };

        if (!applyTranslation()) {
            let attempts = 0;
            const iv = setInterval(() => {
                if (applyTranslation() || ++attempts > 30) clearInterval(iv);
            }, 100);
        }
    } catch {
        translatingMessageIds.delete(message.id);
    }
}


// Flux subscriber for incoming messages only
function onMessageCreate(event: any) {
    if (!settings.store.autoTranslateReceived) return;
    const msg = event?.message;
    if (msg) autoTranslateMessage(msg);
}

function onChannelSelect(event: any) {
    const channelId = event.channelId;
    if (channelId) {
        setTimeout(() => {
            translateChannelMessages(channelId);
        }, 100);
    }
}

function onLoadMessagesSuccess(event: any) {
    const channelId = event.channelId;
    if (channelId) {
        translateChannelMessages(channelId);
    }
}


export default definePlugin({
    name: "Translate",
    enabledByDefault: true,
    description: "Translate messages with Google Translate or DeepL",
    authors: [Devs.Ven, Devs.AshtonMemer],
    settings,
    contextMenus: {
        "message": messageCtxPatch
    },
    // not used, just here in case some other plugin wants it or w/e
    translate,

    renderMessageAccessory(props: any) {
        const message = props?.message;
        if (!message) return null;

        if (translatedMessageIds.has(message.id)) {
            return (
                <span style={{
                    color: "var(--text-muted)",
                    fontSize: "0.72em",
                    opacity: 0.65,
                    fontStyle: "italic",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    marginTop: "2px",
                    userSelect: "none"
                }}>
                    <svg viewBox="0 96 960 960" width="10" height="10" fill="currentColor">
                        <path d="m475 976 181-480h82l186 480h-87l-41-126H604l-47 126h-82Zm151-196h142l-70-194h-2l-70 194Zm-466 76-55-55 204-204q-38-44-67.5-88.5T190 416h87q17 33 37.5 62.5T361 539q45-47 75-97.5T487 336H40v-80h280v-80h80v80h280v80H567q-22 69-58.5 135.5T419 598l98 99-30 81-127-122-200 200Z" />
                    </svg>
                    ({t("translate")})
                </span>
            );
        }

        return <TranslationAccessory message={message} />;
    },

    start() {
        // Force disable outgoing auto-translate — only incoming is supported
        settings.store.autoTranslate = false;

        setOnAutoTranslateReceivedToggled((enabled) => {
            if (enabled) {
                const channelId = SelectedChannelStore.getChannelId();
                if (channelId) {
                    translateChannelMessages(channelId);
                }
            } else {
                revertAllTranslations();
            }
        });

        // Subscribe only to new incoming messages
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onLoadMessagesSuccess);

        const startChannelId = SelectedChannelStore.getChannelId();
        if (startChannelId) {
            translateChannelMessages(startChannelId);
        }
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onLoadMessagesSuccess);
        setOnAutoTranslateReceivedToggled(() => {});
        revertAllTranslations();
    },

    chatBarButton: {
        icon: TranslateIcon,
        render: TranslateChatBarIcon
    },

    messagePopoverButton: {
        icon: TranslateIcon,
        render(message: Message) {
            const content = getMessageContent(message);
            if (!content) return null;

            return {
                label: t("Translate"),
                icon: TranslateIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: async () => {
                    const trans = await translate("received", content);
                    handleTranslate(message.id, trans);
                }
            };
        }
    },

    async onBeforeMessageSend(_, message) {
        if (!settings.store.autoTranslate) return;
        if (!message.content) return;

        setShouldShowTranslateEnabledTooltip?.(true);
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => setShouldShowTranslateEnabledTooltip?.(false), 2000);

        const trans = await translate("sent", message.content);
        message.content = trans.text;
    }
});
