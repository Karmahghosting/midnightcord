/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface BridgeRequest {
    id: string;
    method: string;
    path: string;
    body: Record<string, unknown>;
    query: Record<string, string>;
    expiresAt: number;
}

export interface BridgeReply {
    status: number;
    body: unknown;
}

export interface BridgePolicy {
    accountId: string;
    allowAllGuilds: boolean;
    allowedGuildIds: string[];
    allowedChannelIds: string[];
    allowWrites: boolean;
}
