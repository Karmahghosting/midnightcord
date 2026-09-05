/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import { Logger } from "@utils/Logger";
import type { Channel, CloudUpload, CustomEmoji, Message } from "@vencord/discord-types";
import { MessageStore } from "@webpack/common";
import type { Promisable } from "type-fest";

const MessageEventsLogger = new Logger("MessageEvents", "#e5c890");

export interface MessageObject {
    content: string,
    validNonShortcutEmojis: CustomEmoji[];
    invalidEmojis: any[];
    tts: boolean;
}

export interface MessageReplyOptions {
    messageReference: Message["messageReference"];
    allowedMentions?: {
        parse: Array<string>;
        users?: Array<string>;
        roles?: Array<string>;
        repliedUser: boolean;
    };
}

export interface MessageOptions {
    stickers?: string[];
    uploads?: CloudUpload[];
    replyOptions: MessageReplyOptions;
    content: string;
    channel: Channel;
    type?: any;
    openWarningPopout: (props: any) => any;
}

export type MessageSendListener = (channelId: string, messageObj: MessageObject, options: MessageOptions) => Promisable<void | { cancel: boolean; }>;
export type MessageEditListener = (channelId: string, messageId: string, messageObj: MessageObject) => Promisable<void | { cancel: boolean; }>;

export interface MessageValidationContext {
    phase: "before" | "after";
    operation: object;
}

export type MessageSendValidator = (channelId: string, messageObj: MessageObject, options: MessageOptions, context: MessageValidationContext) => ReturnType<MessageSendListener>;
export type MessageEditValidator = (channelId: string, messageId: string, messageObj: MessageObject, context: MessageValidationContext) => ReturnType<MessageEditListener>;

const sendListeners = new Set<MessageSendListener>();
const editListeners = new Set<MessageEditListener>();
const sendValidators = new Set<MessageSendValidator>();
const editValidators = new Set<MessageEditValidator>();

async function validate<T>(validators: readonly T[], run: (validator: T) => ReturnType<MessageSendListener>) {
    for (const validator of validators) {
        try {
            if ((await run(validator))?.cancel) return true;
        } catch {
            MessageEventsLogger.error("Message validation failed; the operation was cancelled.");
            return true;
        }
    }
    return false;
}

export async function _handlePreSend(channelId: string, messageObj: MessageObject, options: MessageOptions, replyOptions: MessageReplyOptions) {
    options.replyOptions = replyOptions;
    const operation = {};
    const validators = [...sendValidators];
    if (await validate(validators, validator => validator(channelId, messageObj, options, { phase: "before", operation }))) return true;
    for (const listener of sendListeners) {
        try {
            const result = await listener(channelId, messageObj, options);
            if (result?.cancel) {
                return true;
            }
        } catch (e) {
            MessageEventsLogger.error("MessageSendHandler: Listener encountered an unknown error\n", e);
        }
    }
    return validate(validators, validator => validator(channelId, messageObj, options, { phase: "after", operation }));
}

export async function _handlePreEdit(channelId: string, messageId: string, messageObj: MessageObject) {
    const operation = {};
    const validators = [...editValidators];
    if (await validate(validators, validator => validator(channelId, messageId, messageObj, { phase: "before", operation }))) return true;
    for (const listener of editListeners) {
        try {
            const result = await listener(channelId, messageId, messageObj);
            if (result?.cancel) {
                return true;
            }
        } catch (e) {
            MessageEventsLogger.error("MessageEditHandler: Listener encountered an unknown error\n", e);
        }
    }
    return validate(validators, validator => validator(channelId, messageId, messageObj, { phase: "after", operation }));
}

/** Validators run before transformations and again before the final send/edit. */
export function addMessagePreSendValidator(validator: MessageSendValidator) {
    sendValidators.add(validator);
    return validator;
}

export function removeMessagePreSendValidator(validator: MessageSendValidator) {
    return sendValidators.delete(validator);
}

export function addMessagePreEditValidator(validator: MessageEditValidator) {
    editValidators.add(validator);
    return validator;
}

export function removeMessagePreEditValidator(validator: MessageEditValidator) {
    return editValidators.delete(validator);
}

/**
 * Note: This event fires off before a message is sent, allowing you to edit the message.
 */
export function addMessagePreSendListener(listener: MessageSendListener) {
    sendListeners.add(listener);
    return listener;
}
/**
 * Note: This event fires off before a message's edit is applied, allowing you to further edit the message.
 */
export function addMessagePreEditListener(listener: MessageEditListener) {
    editListeners.add(listener);
    return listener;
}
export function removeMessagePreSendListener(listener: MessageSendListener) {
    return sendListeners.delete(listener);
}
export function removeMessagePreEditListener(listener: MessageEditListener) {
    return editListeners.delete(listener);
}

// Message clicks
export type MessageClickListener = (message: Message, channel: Channel, event: MouseEvent) => void;

const listeners = new Set<MessageClickListener>();

export function _handleClick(message: Message, channel: Channel, event: MouseEvent) {
    // message object may be outdated, so (try to) fetch latest one
    message = MessageStore.getMessage(channel.id, message.id) ?? message;
    for (const listener of listeners) {
        try {
            listener(message, channel, event);
        } catch (e) {
            MessageEventsLogger.error("MessageClickHandler: Listener encountered an unknown error\n", e);
        }
    }
}

export function addMessageClickListener(listener: MessageClickListener) {
    listeners.add(listener);
    return listener;
}

export function removeMessageClickListener(listener: MessageClickListener) {
    return listeners.delete(listener);
}
