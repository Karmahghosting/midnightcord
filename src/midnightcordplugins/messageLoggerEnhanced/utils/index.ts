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

import { Settings } from "@api/Settings";
import { findStoreLazy } from "@webpack";
import { ChannelStore, SelectedChannelStore, UserStore } from "@webpack/common";

import { settings } from "../index";
import { LoggedMessageJSON } from "../types";
import { getGuildIdByChannel } from "./misc";

export * from "./cleanUp";
export * from "./misc";

// stolen from mlv2
// https://github.com/1Lighty/BetterDiscordPlugins/blob/master/Plugins/MessageLoggerV2/MessageLoggerV2.plugin.js#L2367
interface Id { id: string, time: number; message?: LoggedMessageJSON; }
export const DISCORD_EPOCH = 14200704e5;

// Guard: vérifie qu'un élément est bien un objet Message (pas un snowflake string/bigint brut).
// Discord peut stocker des IDs bruts dans le tableau de messages (messages partiels, références),
// et faire `'flags' in snowflakeString` crashe avec "Cannot use 'in' operator to search for 'flags' in <snowflake>".
function isMessageObject(m: unknown): m is LoggedMessageJSON {
    return m !== null && typeof m === "object" && typeof (m as any).id === "string";
}

export function reAddDeletedMessages(messages: LoggedMessageJSON[], deletedMessages: LoggedMessageJSON[], channelStart: boolean, channelEnd: boolean) {
    if (!messages.length || !deletedMessages?.length) return;

    // Séparer les objets Message valides des snowflakes/primitives bruts que Discord peut injecter
    const validMessages = messages.filter(isMessageObject);
    const rawItems = messages.filter(m => !isMessageObject(m));

    const existingIds = new Set(validMessages.map(m => m.id));
    const allMessages: Id[] = validMessages.map(m => ({ id: m.id, time: (parseInt(m.id) / 4194304) + DISCORD_EPOCH, message: m }));

    for (const record of deletedMessages) {
        if (record && isMessageObject(record) && !existingIds.has(record.id)) {
            allMessages.push({
                id: record.id,
                time: (parseInt(record.id) / 4194304) + DISCORD_EPOCH,
                message: record
            });
        }
    }

    allMessages.sort((a, b) => b.time - a.time);

    // Modifier l'array d'origine en place pour éviter de casser les références Webpack.
    // Les éléments bruts (snowflakes) sont réinsérés à la fin pour préserver les attentes de Discord.
    messages.length = 0;
    for (const entry of allMessages) {
        messages.push(entry.message!);
    }
    for (const raw of rawItems) {
        messages.push(raw);
    }
}

interface ShouldIgnoreArguments {
    channelId?: string,
    authorId?: string,
    guildId?: string;
    flags?: number,
    bot?: boolean;
    ghostPinged?: boolean;
    isCachedByUs?: boolean;
    webhookId?: string;
    content?: string;
}

const EPHEMERAL = 64;

const UserGuildSettingsStore = findStoreLazy("UserGuildSettingsStore");

/**
  * the function `shouldIgnore` evaluates whether a message should be ignored or kept, following a priority hierarchy: User > Channel > Server.
  * In this hierarchy, whitelisting takes priority; if any element (User, Channel, or Server) is whitelisted, the message is kept.
  * However, if a higher-priority element, like a User, is blacklisted, it will override the whitelisting status of a lower-priority element, such as a Server, causing the message to be ignored.
  * @param {ShouldIgnoreArguments} args - An object containing the message details.
  * @returns {boolean} - True if the message should be ignored, false if it should be kept.
*/
export function shouldIgnore({ channelId, authorId, guildId, flags, bot, ghostPinged, isCachedByUs, webhookId, content }: ShouldIgnoreArguments): boolean {
    const isEphemeral = ((flags ?? 0) & EPHEMERAL) === EPHEMERAL;
    if (isEphemeral) return true; // ignore

    if (content?.startsWith("\u200b\u200c\u200bNC_WP:")) return true; // ignore wallpaper sync commands

    if (channelId && guildId == null)
        guildId = getGuildIdByChannel(channelId);

    const myId = UserStore.getCurrentUser().id;
    const { ignoreUsers, ignoreChannels, ignoreGuilds } = Settings.plugins.MessageLogger;
    const { ignoreBots, ignoreSelf, ignoreWebhooks } = settings.store;

    if (ignoreSelf && authorId === myId)
        return true; // ignore
    if (settings.store.alwaysLogDirectMessages && ChannelStore.getChannel(channelId ?? "-1")?.isDM?.())
        return false; // keep

    const shouldLogCurrentChannel = settings.store.alwaysLogCurrentChannel && SelectedChannelStore.getChannelId() === channelId;

    const ids = [authorId, channelId, guildId];

    const whitelistedIds = (settings.store.whitelistedIds || "").split(",").filter(Boolean);

    const isWhitelisted = whitelistedIds.some(e => ids.includes(e));
    const isAuthorWhitelisted = whitelistedIds.includes(authorId!);
    const isChannelWhitelisted = whitelistedIds.includes(channelId!);
    const isGuildWhitelisted = whitelistedIds.includes(guildId!);

    const blacklistedIds = [
        ...(settings.store.blacklistedIds || "").split(",").filter(Boolean),
        ...(typeof ignoreUsers === "string" ? ignoreUsers.split(",").filter(Boolean) : []),
        ...(typeof ignoreChannels === "string" ? ignoreChannels.split(",").filter(Boolean) : []),
        ...(typeof ignoreGuilds === "string" ? ignoreGuilds.split(",").filter(Boolean) : [])
    ];

    const isBlacklisted = blacklistedIds.some(e => ids.includes(e));
    const isAuthorBlacklisted = blacklistedIds.includes(authorId);
    const isChannelBlacklisted = blacklistedIds.includes(channelId);

    const shouldIgnoreMutedGuilds = settings.store.ignoreMutedGuilds;
    const shouldIgnoreMutedCategories = settings.store.ignoreMutedCategories;
    const shouldIgnoreMutedChannels = settings.store.ignoreMutedChannels;

    if ((ignoreBots && bot) && !isAuthorWhitelisted) return true; // ignore

    if ((ignoreWebhooks && webhookId) && !isAuthorWhitelisted) return true;

    if (ghostPinged) return false; // keep

    // author has highest priority
    if (isAuthorWhitelisted) return false; // keep
    if (isAuthorBlacklisted) return true; // ignore

    if (isChannelWhitelisted) return false; // keep
    if (isChannelBlacklisted) return true; // ignore

    if (shouldLogCurrentChannel) return false; // keep

    if (isWhitelisted) return false; // keep

    if (isCachedByUs && (!settings.store.cacheMessagesFromServers && guildId != null && !isGuildWhitelisted)) return true; // ignore

    if (isBlacklisted && (!isAuthorWhitelisted || !isChannelWhitelisted)) return true; // ignore

    if (guildId != null && shouldIgnoreMutedGuilds && UserGuildSettingsStore.isMuted(guildId)) return true; // ignore
    if (channelId != null && shouldIgnoreMutedCategories && UserGuildSettingsStore.isCategoryMuted(guildId, channelId)) return true; // ignore
    if (channelId != null && shouldIgnoreMutedChannels && UserGuildSettingsStore.isChannelMuted(guildId, channelId)) return true; // ignore

    return false; // keep;
}

export type ListType = "blacklistedIds" | "whitelistedIds";

export function addToXAndRemoveFromOpposite(list: ListType, id: string) {
    const oppositeListType = list === "blacklistedIds" ? "whitelistedIds" : "blacklistedIds";
    removeFromX(oppositeListType, id);

    addToX(list, id);
}

export function addToX(list: ListType, id: string) {
    const items = settings.store[list] ? settings.store[list].split(",") : [];

    if (!items.includes(id)) {
        items.push(id);
        settings.store[list] = items.join(",");
    }
}

export function removeFromX(list: ListType, id: string) {
    const items = settings.store[list] ? settings.store[list].split(",") : [];
    const index = items.indexOf(id);
    if (index !== -1) {
        items.splice(index, 1);
        settings.store[list] = items.join(",");
    }
}
