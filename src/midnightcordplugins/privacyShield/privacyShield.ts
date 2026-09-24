/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface IncomingMessage {
    author?: { id?: string; };
    mentions?: Array<{ id?: string; }>;
    mention_everyone?: boolean;
    mention_roles?: unknown[];
}

export function shouldSuppressNotification({
    active,
    enabled,
    event,
    message,
    currentUserId,
    isDirectMessage
}: {
    active: boolean;
    enabled: boolean;
    event: { isPushNotification?: boolean; };
    message: IncomingMessage;
    currentUserId?: string;
    isDirectMessage: boolean;
}) {
    if (!active || !enabled || !currentUserId || message.author?.id === currentUserId) return false;
    const mentionsUser = message.mentions?.some(mention => mention.id === currentUserId)
        || message.mention_everyone
        || (message.mention_roles?.length ?? 0) > 0;
    return Boolean(event.isPushNotification || mentionsUser || isDirectMessage);
}
