/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ChatButton.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";
import { Channel } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { Clickable, Tooltip, useEffect, useState, Popout, useRef } from "@webpack/common";
import { HTMLProps, JSX, MouseEventHandler, ReactNode } from "react";

import { addCompactListener, addStealthListener, isCompactModeEnabled, isStealthModeEnabled, removeCompactListener, removeStealthListener, toggleCompactMode } from "./HeaderBar";
import { useSettings } from "./Settings";

const ButtonWrapperClasses = findCssClassesLazy("button", "buttonWrapper", "notificationDot");
const ChannelTextAreaClasses = findCssClassesLazy("buttonContainer", "channelTextArea", "button");

export interface ChatBarProps {
    channel: Channel;
    disabled: boolean;
    isEmpty: boolean;
    type: {
        analyticsName: string;
        attachments: boolean;
        autocomplete: {
            addReactionShortcut: boolean,
            forceChatLayer: boolean,
            reactions: boolean;
        },
        commands: {
            enabled: boolean;
        },
        drafts: {
            type: number,
            commandType: number,
            autoSave: boolean;
        },
        emojis: {
            button: boolean;
        },
        gifs: {
            button: boolean,
            allowSending: boolean;
        },
        gifts: {
            button: boolean;
        },
        permissions: {
            requireSendMessages: boolean;
        },
        showThreadPromptOnReply: boolean,
        stickers: {
            button: boolean,
            allowSending: boolean,
            autoSuggest: boolean;
        },
        users: {
            allowMentioning: boolean;
        },
        submit: {
            button: boolean,
            ignorePreference: boolean,
            disableEnterToSubmit: boolean,
            clearOnSubmit: boolean,
            useDisabledStylesOnSubmit: boolean;
        },
        uploadLongMessages: boolean,
        upsellLongMessages: {
            iconOnly: boolean;
        },
        showCharacterCount: boolean,
        sedReplace: boolean;
    };
}

export type ChatBarButtonFactory = (props: ChatBarProps & { isMainChat: boolean; isAnyChat: boolean; }) => JSX.Element | null;
export type ChatBarButtonData = {
    render: ChatBarButtonFactory;
    /**
     * This icon is used only for Settings UI. Your render function must still render an icon,
     * and it can be different from this one.
     */
    icon: IconComponent;
};

/**
 * Don't use this directly, use {@link addChatBarButton} and {@link removeChatBarButton} instead.
 */
export const ChatBarButtonMap = new Map<string, ChatBarButtonData>();
const logger = new Logger("ChatButtons");

/**
 * Set of button IDs hidden by the Backpack plugin.
 * Buttons in this set are rendered inside the Backpack popout instead of the main bar.
 */
export const BackpackedButtons = new Set<string>();
export const backpackListeners = new Set<() => void>();
export function notifyBackpackChange() { backpackListeners.forEach(l => l()); }

function VencordChatBarButtons(props: ChatBarProps) {
    const { chatBarButtons } = useSettings(["uiElements.chatBarButtons.*"]).uiElements;
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        addStealthListener(listener);
        addCompactListener(listener);
        window.addEventListener("midnightcord-stealth-change", listener);
        window.addEventListener("midnightcord-compact-change", listener);
        backpackListeners.add(listener);
        return () => {
            removeStealthListener(listener);
            removeCompactListener(listener);
            window.removeEventListener("midnightcord-stealth-change", listener);
            window.removeEventListener("midnightcord-compact-change", listener);
            backpackListeners.delete(listener);
        };
    }, []);

    if (isStealthModeEnabled()) return null;

    if (isCompactModeEnabled()) {
        return (
            <div className="vc-chat-bar-btns" style={{ display: "contents" }}>
                <CompactChatBarToggle chatBarProps={props} />
            </div>
        );
    }

    const { analyticsName } = props.type;
    return (
        <div className="vc-chat-bar-btns" style={{ display: "contents" }}>
            {Array.from(ChatBarButtonMap)
                .filter(([key]) => chatBarButtons[key]?.enabled !== false && !BackpackedButtons.has(key))
                .sort(([a], [b]) => (a === "Backpack" ? -1 : b === "Backpack" ? 1 : 0))
                .map(([key, { render: Button }]) => (
                    <ErrorBoundary noop key={key} onError={e => logger.error(`Failed to render ${key}`, e.error)}>
                        <Button {...props} isMainChat={analyticsName === "normal"} isAnyChat={["normal", "sidebar"].includes(analyticsName)} />
                    </ErrorBoundary>
                ))}
        </div>
    );
}

export function _injectButtons(buttons: ReactNode[], props: ChatBarProps) {
    if (props.disabled || buttons.length === 0) return;
    // Guard: don't inject if already present (patch may fire in multiple bundle modules)
    if ((buttons as any[]).some((b: any) => b?.key === "vencord-chat-buttons")) return;

    buttons.unshift(<VencordChatBarButtons key="vencord-chat-buttons" {...props} />);
}

/**
 * The icon argument is used only for Settings UI. Your render function must still render an icon,
 * and it can be different from this one.
 */
export const addChatBarButton = (id: string, render: ChatBarButtonFactory, icon: IconComponent) => ChatBarButtonMap.set(id, { render, icon });
export const removeChatBarButton = (id: string) => ChatBarButtonMap.delete(id);

export interface ChatBarButtonProps {
    children: ReactNode;
    tooltip: string;
    onClick: MouseEventHandler;
    onContextMenu?: MouseEventHandler;
    onAuxClick?: MouseEventHandler;
    buttonProps?: Omit<HTMLProps<HTMLDivElement>, "size" | "onClick" | "onContextMenu" | "onAuxClick">;
}

export const ChatBarButton = ErrorBoundary.wrap((props: ChatBarButtonProps) => {
    return (
        <Tooltip text={props.tooltip}>
            {({ onMouseEnter, onMouseLeave }) => (
                <div className={`expression-picker-chat-input-button ${ChannelTextAreaClasses?.buttonContainer ?? ""}`}>
                    <Clickable
                        aria-label={props.tooltip}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        className={classes(ButtonWrapperClasses.button, ChannelTextAreaClasses?.button)}
                        onClick={props.onClick}
                        onContextMenu={props.onContextMenu}
                        onAuxClick={props.onAuxClick}
                        {...props.buttonProps}
                    >
                        <div className={ButtonWrapperClasses.buttonWrapper}>
                            {props.children}
                        </div>
                    </Clickable>
                </div>
            )}
        </Tooltip>
    );
}, { noop: true });

/* Vencord Buttons context menu removed — managed by Backpack plugin */

function CompactChatPopout({ chatBarProps, closePopout }: any) {
    const { chatBarButtons } = useSettings(["uiElements.chatBarButtons.*"]).uiElements;
    const { analyticsName } = chatBarProps.type;
    return (
        <div className="compact-popout-container">
            <div className="compact-popout-grid">
                {Array.from(ChatBarButtonMap)
                    .filter(([key]) => chatBarButtons[key]?.enabled !== false)
                    .sort(([a], [b]) => (a === "Backpack" ? -1 : b === "Backpack" ? 1 : 0))
                    .map(([key, { render: Button }]) => (
                        <div key={key} style={{ display: "contents" }} onClick={closePopout}>
                            <ErrorBoundary noop>
                                <Button {...chatBarProps} isMainChat={analyticsName === "normal"} isAnyChat={["normal", "sidebar"].includes(analyticsName)} />
                            </ErrorBoundary>
                        </div>
                    ))}
            </div>
            <div className="compact-popout-divider" />
            <div className="compact-popout-disable" onClick={() => { toggleCompactMode(); closePopout(); }}>
                Disable Compact Mode
            </div>
        </div>
    );
}

function CompactChatBarToggle({ chatBarProps }: any) {
    const [, forceUpdate] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const popoutRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        addCompactListener(listener);
        window.addEventListener("midnightcord-compact-change", listener);
        return () => {
            removeCompactListener(listener);
            window.removeEventListener("midnightcord-compact-change", listener);
        };
    }, []);

    const GridIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
        </svg>
    );

    return (
        <Popout
            targetElementRef={popoutRef}
            renderPopout={() => <CompactChatPopout chatBarProps={chatBarProps} closePopout={() => setIsOpen(false)} />}
            shouldShow={isOpen}
            onRequestClose={() => setIsOpen(false)}
            position="top"
            align="right"
            spacing={8}
        >
            {() => (
                <div ref={popoutRef as any} style={{ display: "flex", alignItems: "center" }}>
                    <ChatBarButton
                        tooltip="Compact Mode"
                        onClick={() => setIsOpen(v => !v)}
                    >
                        <GridIcon />
                    </ChatBarButton>
                </div>
            )}
        </Popout>
    );
}
