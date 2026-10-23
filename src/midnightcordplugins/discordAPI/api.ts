/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildStore, MessageStore, PermissionsBits, PermissionStore, RestAPI, UserStore } from "@webpack/common";

import type { BridgePolicy, BridgeReply, BridgeRequest } from "./types";

const SNOWFLAKE = /^\d{17,20}$/;
const THREAD_TYPES = new Set([10, 11, 12]);

class RequestError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}

function fail(status: number, code: string): never { throw new RequestError(status, code); }
function id(value: unknown): value is string { return typeof value === "string" && SNOWFLAKE.test(value); }
function text(value: unknown, length = 256): string { return typeof value === "string" ? value.slice(0, length) : ""; }
function currentAccount(policy: BridgePolicy): boolean {
    return id(policy.accountId) && UserStore.getCurrentUser()?.id === policy.accountId;
}

function hasPermission(permission: bigint, channel: any): boolean {
    try { return PermissionStore.can(permission, channel); } catch { return false; }
}

/** DMs are always individually approved; a guild grant never authorizes private channels. */
export function canAccessChannel(channelId: string, policy: BridgePolicy, history = false): boolean {
    if (!id(channelId) || !currentAccount(policy)) return false;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel || channel.id !== channelId) return false;
    const explicit = policy.allowedChannelIds.includes(channelId);
    if (!channel.guild_id) return explicit && [1, 3].includes(channel.type);
    if (!id(channel.guild_id) || !GuildStore.getGuild(channel.guild_id)) return false;
    if (!explicit && !policy.allowAllGuilds && !policy.allowedGuildIds.includes(channel.guild_id)) return false;
    return hasPermission(PermissionsBits.VIEW_CHANNEL, channel)
        && (!history || hasPermission(PermissionsBits.READ_MESSAGE_HISTORY, channel));
}

function canAccessGuild(guildId: string, policy: BridgePolicy): boolean {
    if (!id(guildId) || !currentAccount(policy) || !GuildStore.getGuild(guildId)) return false;
    return policy.allowAllGuilds || policy.allowedGuildIds.includes(guildId)
        || policy.allowedChannelIds.some(channelId => ChannelStore.getChannel(channelId)?.guild_id === guildId && canAccessChannel(channelId, policy));
}

function serializeUser(user: any) {
    if (!user || !id(user.id)) return undefined;
    return { id: user.id, username: text(user.username, 80), display_name: text(user.globalName ?? user.global_name ?? user.username, 80), bot: user.bot === true };
}

function serializeChannel(channel: any) {
    return { id: channel.id as string, guild_id: id(channel.guild_id) ? channel.guild_id : null,
        name: text(channel.name), type: Number.isInteger(channel.type) ? channel.type : null,
        parent_id: id(channel.parent_id) ? channel.parent_id : null };
}

function timestamp(value: any): string | null {
    if (typeof value === "string") return value.slice(0, 64);
    try { return typeof value?.toISOString === "function" ? text(value.toISOString(), 64) : null; } catch { return null; }
}

/** Whitelist fields rather than spreading Discord objects or logged message history. */
export function serializeMessage(message: any) {
    if (!message || !id(message.id) || !id(message.channel_id)
        || message.deleted || message.mlDeleted || message.state === "DELETED") return undefined;
    return {
        id: message.id as string, channel_id: message.channel_id as string,
        author: serializeUser(message.author), content: text(message.content, 4000),
        timestamp: timestamp(message.timestamp), edited_timestamp: timestamp(message.edited_timestamp ?? message.editedTimestamp),
        type: Number.isInteger(message.type) ? message.type : 0,
        pinned: message.pinned === true,
        // URLs, embed payloads, attachments, references and edit histories are deliberately omitted.
        attachment_count: Array.isArray(message.attachments) ? message.attachments.filter(a => a && !a.deleted).length : 0
    };
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fields(value: Record<string, unknown>, allowed: string[]): void {
    if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, "unknown_field");
}

function parseLimit(value: unknown, fallback = 25): number {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^(?:[1-9]|[1-4]\d|50)$/.test(value)) fail(400, "invalid_limit");
    return Number(value);
}

function statusOf(error: any): number {
    const status = error?.status ?? error?.statusCode ?? error?.response?.status;
    return Number.isInteger(status) ? status : 0;
}

function isTransient(error: any): boolean {
    const status = statusOf(error);
    return status === 0 || status === 408 || status >= 500 && status <= 599;
}

function restFailure(error: unknown): never {
    const status = statusOf(error);
    if ([401, 403, 404, 429].includes(status)) fail(status, status === 429 ? "discord_rate_limited" : "discord_access_denied");
    fail(502, "discord_unavailable");
}

function messagesForChannel(values: any[], channelId: string, limit: number) {
    const seen = new Set<string>();
    return values.slice(0, 500).flatMap(value => {
        const message = serializeMessage(value);
        if (!message || message.channel_id !== channelId || seen.has(message.id)) return [];
        seen.add(message.id);
        return [message];
    }).slice(0, limit);
}

/** Only this explicit route table may reach Discord's authenticated REST client. */
export async function handleDiscordRequest(req: BridgeRequest, policy: BridgePolicy, assertActive: () => Promise<void>): Promise<BridgeReply> {
    const guard = async (channelId?: string, history = false, write = false) => {
        await assertActive();
        if (!Number.isFinite(req.expiresAt) || Date.now() >= req.expiresAt) fail(408, "request_expired");
        if (!currentAccount(policy)) fail(409, "account_changed");
        if (channelId && !canAccessChannel(channelId, policy, history)) fail(403, "channel_not_allowed");
        if (write) {
            if (!policy.allowWrites) fail(403, "writes_disabled");
            const channel = ChannelStore.getChannel(channelId!);
            const permission = THREAD_TYPES.has(channel.type) ? PermissionsBits.SEND_MESSAGES_IN_THREADS : PermissionsBits.SEND_MESSAGES;
            if (channel.guild_id && !hasPermission(permission, channel)) fail(403, "cannot_send_messages");
        }
    };
    const reply = async (body: unknown, channelId?: string, history = false, write = false): Promise<BridgeReply> => {
        await guard(channelId, history, write);
        return { status: 200, body };
    };
    try {
        await guard();
        if (!object(req.query) || !object(req.body) || typeof req.path !== "string") fail(400, "invalid_request");
        if (Object.values(req.query).some(value => typeof value !== "string")) fail(400, "invalid_query");
        const simple = ["/api/status", "/api/user", "/api/guilds", "/api/dms"].includes(req.path);
        const guildMatch = /^\/api\/guilds\/([^/]+)\/channels$/.exec(req.path);
        const channelMatch = /^\/api\/channels\/([^/]+)(?:\/(messages|search)(?:\/([^/]+))?)?$/.exec(req.path);
        if (!simple && !guildMatch && !channelMatch) fail(404, "unknown_route");
        const channelId = channelMatch?.[1];
        const action = channelMatch?.[2];
        const messageId = channelMatch?.[3];
        if (guildMatch && !id(guildMatch[1]) || channelMatch && (!id(channelId) || messageId !== undefined && !id(messageId))) fail(400, "invalid_id");
        if (action === "search" && messageId !== undefined) fail(404, "unknown_route");
        const send = req.method === "POST" && action === "messages" && messageId === undefined;
        if (req.method !== "GET" && !send) fail(405, "method_not_allowed");
        if (!send) fields(req.body, []);
        if (!channelMatch || !action || messageId) fields(req.query, []);

        if (req.path === "/api/status") return await reply({ connected: true, accountId: policy.accountId, readOnly: !policy.allowWrites });
        if (req.path === "/api/user") return await reply({ user: serializeUser(UserStore.getCurrentUser()) });
        if (req.path === "/api/guilds") {
            const guilds = Object.values(GuildStore.getGuilds()).filter(guild => canAccessGuild(guild.id, policy))
                .map(guild => ({ id: guild.id, name: text(guild.name) }));
            return await reply({ guilds });
        }
        if (req.path === "/api/dms") {
            const channels = policy.allowedChannelIds.filter(value => canAccessChannel(value, policy))
                .map(value => ChannelStore.getChannel(value)).filter(channel => !channel.guild_id).map(serializeChannel);
            return await reply({ channels });
        }
        if (guildMatch) {
            const guildId = guildMatch[1];
            if (!canAccessGuild(guildId, policy)) fail(403, "guild_not_allowed");
            const channels = Object.values(ChannelStore.getMutableGuildChannelsForGuild(guildId))
                .filter(channel => channel.guild_id === guildId && canAccessChannel(channel.id, policy)).map(serializeChannel);
            await guard();
            if (!canAccessGuild(guildId, policy)) fail(403, "guild_not_allowed");
            return { status: 200, body: { channels } };
        }

        if (!channelId) fail(404, "unknown_route");
        await guard(channelId, Boolean(action) && !send, send);
        const channel = ChannelStore.getChannel(channelId);
        if (!action) return await reply({ channel: serializeChannel(channel) }, channelId);

        if (send) {
            fields(req.query, []);
            fields(req.body, ["content", "reply"]);
            const { content, reply: reference } = req.body;
            if (typeof content !== "string" || !content.trim() || content.length > 2000) fail(400, "invalid_content");
            const body: Record<string, unknown> = { content, allowed_mentions: { parse: [], replied_user: false } };
            if (reference !== undefined) {
                if (!object(reference)) fail(400, "invalid_reply");
                fields(reference, ["message_id"]);
                if (!id(reference.message_id)) fail(400, "invalid_reply");
                await guard(channelId, true, true);
                let referenced: any;
                try { referenced = (await RestAPI.get({ url: `/channels/${channelId}/messages/${reference.message_id}` })).body; } catch (error) { restFailure(error); }
                await guard(channelId, true, true);
                if (referenced?.id !== reference.message_id || referenced?.channel_id !== channelId || !serializeMessage(referenced)) fail(400, "invalid_reply");
                body.message_reference = { message_id: reference.message_id, channel_id: channelId, fail_if_not_exists: true };
            }
            await guard(channelId, reference !== undefined, true);
            let sent: any;
            try { sent = (await RestAPI.post({ url: `/channels/${channelId}/messages`, body })).body; } catch (error) { restFailure(error); }
            await guard(channelId, false, true);
            const message = serializeMessage(sent);
            if (!message || message.channel_id !== channelId) fail(502, "invalid_discord_response");
            return await reply({ message }, channelId, false, true);
        }

        if (messageId) {
            let result: any;
            await guard(channelId, true);
            try { result = (await RestAPI.get({ url: `/channels/${channelId}/messages/${messageId}` })).body; } catch (error) { restFailure(error); }
            await guard(channelId, true);
            const message = serializeMessage(result);
            if (!message || message.id !== messageId || message.channel_id !== channelId) fail(404, "message_not_found");
            return await reply({ message }, channelId, true);
        }

        if (action === "search") {
            fields(req.query, ["content", "limit"]);
            const { content } = req.query;
            if (typeof content !== "string" || !content.trim() || content.length > 200) fail(400, "invalid_search");
            const limit = parseLimit(req.query.limit);
            const url = channel.guild_id ? `/guilds/${channel.guild_id}/messages/search` : `/channels/${channelId}/messages/search`;
            const query = channel.guild_id ? { content, channel_id: channelId } : { content };
            let result: any;
            await guard(channelId, true);
            try { result = (await RestAPI.get({ url, query })).body; } catch (error) { restFailure(error); }
            await guard(channelId, true);
            // Search can include surrounding messages. Return only actual hits in the approved channel.
            const candidates = Array.isArray(result?.messages) ? result.messages.slice(0, 50).flatMap(group => Array.isArray(group) ? group.slice(0, 50) : []) : [];
            const messages = messagesForChannel(candidates.filter(message => message?.hit === true), channelId, limit);
            return await reply({ messages, cached: false, partial: true }, channelId, true);
        }

        fields(req.query, ["limit", "before", "after"]);
        const limit = parseLimit(req.query.limit);
        const { before, after } = req.query;
        if (before !== undefined && !id(before) || after !== undefined && !id(after) || before && after) fail(400, "invalid_cursor");
        const query = { limit, ...(before ? { before } : {}), ...(after ? { after } : {}) };
        let values: any[];
        let cached = false;
        await guard(channelId, true);
        try {
            const result = await RestAPI.get({ url: `/channels/${channelId}/messages`, query });
            await guard(channelId, true);
            if (!Array.isArray(result.body)) fail(502, "invalid_discord_response");
            values = result.body;
        } catch (error) {
            if (error instanceof RequestError) throw error;
            await guard(channelId, true);
            if (!isTransient(error)) restFailure(error);
            const stored = MessageStore.getMessages(channelId)?._array;
            if (!Array.isArray(stored)) restFailure(error);
            values = stored.filter(message => id(message?.id)
                && (!before || BigInt(message.id) < BigInt(before)) && (!after || BigInt(message.id) > BigInt(after)))
                .sort((a, b) => BigInt(a.id) < BigInt(b.id) ? 1 : -1);
            cached = true;
        }
        return await reply({ messages: messagesForChannel(values, channelId, limit), cached, partial: true }, channelId, true);
    } catch (error) {
        if (error instanceof RequestError) return { status: error.status, body: { error: error.code } };
        // Never relay raw Discord errors, request headers, tokens or arbitrary exception strings.
        return { status: 503, body: { error: "bridge_unavailable" } };
    }
}
