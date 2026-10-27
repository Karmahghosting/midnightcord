/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addMessagePopoverButton as addButton, removeMessagePopoverButton as removeButton } from "@api/MessagePopover";
import { definePluginSettings } from "@api/Settings";
import { PencilIcon } from "@components/Icons";
import { assertPreservedAttachments, preserveSilentAttachments, SilentAttachment } from "@utils/silentMessageAttachments";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, Constants, Menu, MessageStore, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

import { t } from "./autoTranslateMidnightcord";

const MessageActions = findByPropsLazy("deleteMessage", "startEditMessage");

const settings = definePluginSettings({
    deleteOriginalMessage: {
        type: OptionType.BOOLEAN,
        description: t("Delete the original server-side message after silent edit. If disabled, the original message will reappear after client reload."),
        default: true
    },
    deleteDelay: {
        type: OptionType.NUMBER,
        description: t("Delay (in milliseconds) before deleting the original message if enabled."),
        default: 500
    },
    suppressNotifications: {
        type: OptionType.BOOLEAN,
        description: t("Recommended for use in DMs to prevent pinging users."),
        default: false
    }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface EditSession {
    channelId: string;
    messageId: string;
    authorId: string;
    controller: AbortController;
    original: typeof MessageActions.editMessage;
    wrapper: typeof MessageActions.editMessage;
    awaitingStart: boolean;
    pending: boolean;
    postAttempted: boolean;
    operation?: Promise<any>;
}

let session: EditSession | undefined;

function restoreEdit(current: EditSession) {
    if (MessageActions.editMessage === current.wrapper) MessageActions.editMessage = current.original;
    if (session === current) session = undefined;
}

function cancelEdit() {
    if (!session) return;
    const current = session;
    restoreEdit(current);
    current.controller.abort(new Error("Silent edit cancelled; the original message was kept."));
}

function assertAccount(current: EditSession) {
    current.controller.signal.throwIfAborted();
    if (UserStore.getCurrentUser()?.id !== current.authorId)
        throw new Error("The account changed; the original message was kept.");
}

function assertOwner(current: EditSession) {
    assertAccount(current);
    const message = MessageStore.getMessage(current.channelId, current.messageId);
    if (!message || message.deleted || message.author?.id !== current.authorId)
        throw new Error("The message or account changed; the original message was kept.");
    return message;
}

function attachmentRevision(attachments: SilentAttachment[]) {
    return JSON.stringify(attachments.map(({ id, filename, size, description, spoiler, is_spoiler, flags }) => ({
        id, filename, size, description: description ?? "",
        spoiler: Boolean(spoiler || is_spoiler || (Number(flags) & 8) || filename.startsWith("SPOILER_"))
    })));
}

async function sendReplacement(current: EditSession, edited: { content?: string; }) {
    // Read again when saving: native attachment removal can update the message while its editor is open.
    const message = assertOwner(current);
    const attachments = (message.attachments ?? []).map(attachment => ({ ...attachment })) as SilentAttachment[];
    const originalContent = message.content;
    const revision = attachmentRevision(attachments);
    const assertUnchanged = () => {
        const latest = assertOwner(current);
        if (latest.content !== originalContent || attachmentRevision((latest.attachments ?? []) as SilentAttachment[]) !== revision)
            throw new Error("The original message changed during the edit and was kept.");
    };
    if (typeof edited?.content !== "string") throw new Error("The edited message is invalid.");
    const uploaded = await preserveSilentAttachments(attachments, current.channelId, current.controller.signal, async () => {
        assertOwner(current);
        const response = await RestAPI.get({ url: Constants.Endpoints.MESSAGE(current.channelId, current.messageId) });
        if (response.body?.author?.id !== current.authorId || !Array.isArray(response.body?.attachments))
            throw new Error("Could not refresh the original attachments.");
        return response.body.attachments;
    });
    assertUnchanged();
    const { suppressNotifications } = settings.store;
    const body: any = {
        content: edited.content,
        flags: (Number(message.flags) & 4) | (suppressNotifications ? 4096 : 0),
        mobile_network_type: "unknown",
        nonce: current.messageId,
        tts: false,
        attachments: uploaded,
        // Recreating a message must not notify every original mention for a second time.
        allowed_mentions: { parse: [], replied_user: false }
    };

    const messageReference = message.messageReference ?? (message as any).message_reference;
    if (messageReference) {
        body.message_reference = {
            channel_id: messageReference.channel_id,
            message_id: messageReference.message_id,
            guild_id: messageReference.guild_id
        };
    }

    current.postAttempted = true;
    const response = await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(current.channelId),
        body
    });
    if (response.ok === false || response.status >= 400 || response.hasErr || !response.body?.id
        || response.body.id === current.messageId || response.body.channel_id !== current.channelId || response.body.author?.id !== current.authorId)
        throw new Error("Discord did not confirm the replacement message; the original message was kept.");
    assertPreservedAttachments(response.body.attachments ?? [], attachments, uploaded);
    assertAccount(current);

    if (settings.store.deleteOriginalMessage) {
        const delay = Number(settings.store.deleteDelay);
        await sleep(Number.isFinite(delay) ? Math.max(0, Math.min(delay, 60_000)) : 500);
        assertAccount(current);
        // The reused nonce can replace the original local cache entry when Gateway receives the
        // replacement. Verify the server-side original instead of treating that cache change as failure.
        const original = await RestAPI.get({ url: Constants.Endpoints.MESSAGE(current.channelId, current.messageId) });
        assertAccount(current);
        if (original.ok === false || original.status >= 400 || original.body?.id !== current.messageId || original.body.channel_id !== current.channelId
            || original.body.author?.id !== current.authorId || original.body.content !== originalContent
            || !Array.isArray(original.body.attachments) || attachmentRevision(original.body.attachments) !== revision)
            throw new Error("The server-side original could not be verified and was kept.");
        const deletion = await RestAPI.del({ url: Constants.Endpoints.MESSAGE(current.channelId, current.messageId) });
        if (deletion.ok === false || deletion.status >= 400 || deletion.hasErr)
            throw new Error("The replacement was sent, but the original message could not be deleted.");
    }
    restoreEdit(current);
    try { MessageActions.endEditMessage(current.channelId, response); } catch (error) { console.warn("[SilentEdit] Could not close the message editor", error); }
    return response;
}

const triggerSilentEdit = (msg: any) => {
    if (!msg || msg.deleted || msg.author?.id !== UserStore.getCurrentUser()?.id) return;
    if (session?.pending) {
        showToast(t("A silent edit is already in progress."), Toasts.Type.FAILURE);
        return;
    }
    cancelEdit();
    const current: EditSession = {
        channelId: msg.channel_id, messageId: msg.id, authorId: msg.author.id,
        controller: new AbortController(), original: MessageActions.editMessage, wrapper: undefined,
        awaitingStart: true, pending: false, postAttempted: false
    };
    current.wrapper = function (channelId: string, messageId: string, content: any) {
        if (channelId !== current.channelId || messageId !== current.messageId)
            return current.original.apply(this, arguments as any);
        if (session !== current) {
            // A stale editor callback must not turn into an ordinary edit or send again.
            if (current.operation) return current.operation;
            const cancelled = Promise.reject(current.controller.signal.reason ?? new Error("Silent edit is no longer active."));
            void cancelled.catch(() => {});
            return cancelled;
        }
        // Discord may submit twice while a slow upload is in progress. Reuse the same operation.
        if (current.operation) {
            if (!current.pending && current.postAttempted)
                showToast(t("This silent edit may already have been sent. Check the conversation before starting another silent edit."), Toasts.Type.FAILURE);
            return current.operation;
        }
        current.pending = true;
        current.operation = sendReplacement(current, content).catch(error => {
            if (!current.controller.signal.aborted) {
                console.error("[SilentEdit] Error:", error);
                const notice = current.postAttempted
                    ? t("Silent edit could not be confirmed. A replacement may already exist. Check the conversation before starting another silent edit.")
                    : t("Silent edit failed before sending. The original message was kept.") + " " + (error instanceof Error ? error.message : "");
                showToast(notice, Toasts.Type.FAILURE);
            }
            throw error;
        }).finally(() => {
            current.pending = false;
            // Retain the wrapper while the session remains active: retrying must never
            // silently fall back to a normal edit. Only a pre-send failure is safe to retry.
            if (session === current && !current.postAttempted) current.operation = undefined;
        });
        // Some Discord callers fire-and-forget this action. Keep the returned rejection observable
        // to awaiters, but mark it handled so a failed upload does not create an unhandled rejection.
        void current.operation.catch(() => {});
        return current.operation;
    };
    session = current;
    MessageActions.editMessage = current.wrapper;
    try { MessageActions.startEditMessage(msg.channel_id, msg.id, msg.content); } catch (error) { cancelEdit(); throw error; }
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (!message || message.author?.id !== UserStore.getCurrentUser()?.id || message.deleted) return;

    const group = findGroupChildrenByChildId("edit", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="silent-edit"
            color="danger"
            label={t("Silent Edit")}
            action={() => triggerSilentEdit(message)}
            iconLeft={PencilIcon}
            leadingAccessory={{ type: "icon", icon: PencilIcon }}
        />
    );
};

export default definePlugin({
    name: "SilentEdit",
    description: "\"Silently\" edit a message without showing the edit tag and bypass Vencord's message logger.",
    authors: [{ name: "Aurick", id: 1348025017233047634n }],
    dependencies: ["MessagePopoverAPI"],
    settings,
    enabledByDefault: true,

    contextMenus: {
        "message": messageContextMenuPatch
    },

    start() {
        addButton("SilentEdit", msg => {
            if (msg.author?.id !== UserStore.getCurrentUser()?.id || msg.deleted) return null;

            return {
                label: t("Silent Edit"),
                icon: PencilIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: () => triggerSilentEdit(msg)
            };
        }, PencilIcon);
    },

    stop() {
        cancelEdit();
        removeButton("SilentEdit");
    },

    flux: {
        MESSAGE_END_EDIT({ channelId }) {
            if (!session || session.channelId !== channelId) return;
            // Discord closes its editor immediately after invoking editMessage, without
            // awaiting the save. That UI event must not abort our upload or replacement.
            if (!session.pending) cancelEdit();
        },
        MESSAGE_START_EDIT({ channelId, messageId }) {
            if (!session) return;
            // Flux queues nested dispatches. startEditMessage can return before this event
            // reaches us, so consume our first matching start instead of timing its call.
            if (session.awaitingStart && session.channelId === channelId && session.messageId === messageId) {
                session.awaitingStart = false;
                return;
            }
            cancelEdit();
        },
        CHANNEL_SELECT({ channelId }) {
            if (session && session.channelId !== channelId) cancelEdit();
        },
        LOGOUT: cancelEdit
    }
});
