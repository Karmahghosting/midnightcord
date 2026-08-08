/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { PluginNative } from "@utils/types";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { ErrorBoundary } from "@components/index";
import { FluxDispatcher, ThemeStore, React } from "@webpack/common";
import { forceServerListRerender } from "@midnightcordplugins/_utils/serverListRefresh";

const Native = VencordNative.pluginHelpers.youtubePlayer as PluginNative<any>;

import { YoutubeButton } from "./components/YoutubeButton";

export let isYoutubeOpen = false;
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

export function setYoutubeOpen(open: boolean) {
    if (isYoutubeOpen !== open) {
        if (open) {
            savedPath = window.location.pathname + window.location.search + window.location.hash;
        }
        isYoutubeOpen = open;
        updateButtonState();
        
        // Dispatch an event so the view can update
        FluxDispatcher.dispatch({ type: "YOUTUBE_TOGGLE", isOpen: open });
        if (!open) {
            restoreSavedPath();
        }
    }
}

function handleDiscordNavigation() {
    setYoutubeOpen(false);
}

function handleOtherPluginToggle(e: any) {
    if (e.isOpen) {
        setYoutubeOpen(false);
    }
}

function YoutubeButtonWrapper() {
    const [, forceUpdate] = React.useState({});
    updateButtonState = () => forceUpdate({});
    
    return <YoutubeButton />;
}

const RenderElement = () => <ErrorBoundary><YoutubeButtonWrapper /></ErrorBoundary>;

export default definePlugin({
    name: "youtubePlayer",
    enabledByDefault: false,
    description: "Adds a YouTube button next to the QxChat button",
    authors: [{ name: "Midnightcord", id: 0n }],
    dependencies: ["ServerListAPI"],
    tags: ["Utility"],

    start() {
        const isDark = ThemeStore?.theme?.startsWith("dark") ?? true;
        Native.installWatchingTogetherIntercept(isDark).catch(() => {});
        addServerListElement(ServerListRenderPosition.Above, RenderElement);
        forceServerListRerender();
        
        FluxDispatcher.subscribe("CHANNEL_SELECT", handleDiscordNavigation);
        FluxDispatcher.subscribe("GUILD_SELECT", handleDiscordNavigation);
        FluxDispatcher.subscribe("QXCHAT_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.subscribe("BROWSER_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.subscribe("MIDNIGHTCORDNEWS_TOGGLE", handleOtherPluginToggle);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, RenderElement);
        forceServerListRerender();
        
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", handleDiscordNavigation);
        FluxDispatcher.unsubscribe("GUILD_SELECT", handleDiscordNavigation);
        FluxDispatcher.unsubscribe("QXCHAT_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.unsubscribe("BROWSER_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.unsubscribe("MIDNIGHTCORDNEWS_TOGGLE", handleOtherPluginToggle);
    }
});
