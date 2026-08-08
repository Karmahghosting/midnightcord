/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { ErrorBoundary } from "@components/index";
import { FluxDispatcher, React } from "@webpack/common";
import { forceServerListRerender } from "@midnightcordplugins/_utils/serverListRefresh";

import { QxChatButton } from "./components/QxChatButton";

export let isQxChatOpen = false;
let updateButtonState: () => void = () => {};

let savedPath: string | null = null;

function restoreSavedPath() {
    if (savedPath && (window.location.pathname + window.location.search + window.location.hash) !== savedPath) {
        try {
            const WP = (Vencord as any).Webpack;
            const router = WP?.findByProps?.("transitionTo", "replaceWith");
            if (router?.transitionTo) {
                router.transitionTo(savedPath);
            } else {
                window.history.replaceState(null, "", savedPath);
            }
        } catch {
            try { window.history.replaceState(null, "", savedPath); } catch {}
        }
    }
}

export function setQxChatOpen(open: boolean) {
    if (isQxChatOpen !== open) {
        if (open) {
            savedPath = window.location.pathname + window.location.search + window.location.hash;
        }
        isQxChatOpen = open;
        updateButtonState();
        
        // Dispatch an event so the view can update
        FluxDispatcher.dispatch({ type: "QXCHAT_TOGGLE", isOpen: open });
        if (!open) {
            restoreSavedPath();
        }
    }
}

export function registerQxChatUpdate(callback: () => void) {
    updateButtonState = callback;
}

const handleDiscordNavigation = () => {
    if (isQxChatOpen) {
        setQxChatOpen(false);
    }
};

function handleOtherPluginToggle(e: any) {
    if (e.isOpen) {
        setQxChatOpen(false);
    }
}

const QxChatButtonWrapper = () => {
    return <QxChatButton />;
};

const RenderElement = () => <ErrorBoundary><QxChatButtonWrapper /></ErrorBoundary>;

export default definePlugin({
    name: "QxChat",
    description: "A 100% encrypted messaging app directly within Discord.",
    authors: [{ name: "Midnightcord User", id: 0n }],
    dependencies: ["ServerListAPI"],
    tags: ["Utility"],

    start() {
        addServerListElement(ServerListRenderPosition.Above, RenderElement);
        forceServerListRerender();
        
        FluxDispatcher.subscribe("CHANNEL_SELECT", handleDiscordNavigation);
        FluxDispatcher.subscribe("GUILD_SELECT", handleDiscordNavigation);
        FluxDispatcher.subscribe("YOUTUBE_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.subscribe("BROWSER_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.subscribe("MIDNIGHTCORDNEWS_TOGGLE", handleOtherPluginToggle);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, RenderElement);
        forceServerListRerender();
        
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", handleDiscordNavigation);
        FluxDispatcher.unsubscribe("GUILD_SELECT", handleDiscordNavigation);
        FluxDispatcher.unsubscribe("YOUTUBE_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.unsubscribe("BROWSER_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.unsubscribe("MIDNIGHTCORDNEWS_TOGGLE", handleOtherPluginToggle);
    }
});
