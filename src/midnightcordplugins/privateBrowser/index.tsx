/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { PluginNative } from "@utils/types";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { React } from "@webpack/common";
import { BrowserButton } from "./components/BrowserButton";
import ErrorBoundary from "@components/ErrorBoundary";
import { FluxDispatcher } from "@webpack/common";
import { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { forceServerListRerender } from "@midnightcordplugins/_utils/serverListRefresh";

export const Native = VencordNative.pluginHelpers.PrivateBrowser as PluginNative<any>;

export let isBrowserOpen = false;
let updateButtonState: () => void = () => {};

export const settings = definePluginSettings({
    saveData: {
        type: OptionType.BOOLEAN,
        description: "Save browsing data (history, passwords, connections...)",
        default: false
    },
    searchEngine: {
        type: OptionType.SELECT,
        description: "Default Search Engine",
        options: [
            { label: "DuckDuckGo (Native Dark Mode)", value: "duckduckgo", default: true },
            { label: "Google", value: "google" },
            { label: "Brave Search", value: "brave" },
            { label: "Bing", value: "bing" },
            { label: "Yahoo", value: "yahoo" }
        ]
    },
    persistTabs: {
        type: OptionType.BOOLEAN,
        description: "Keep tabs open between sessions",
        default: false
    }
});

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

export function setBrowserOpen(open: boolean) {
    if (isBrowserOpen !== open) {
        if (open) {
            savedPath = window.location.pathname + window.location.search + window.location.hash;
        }
        isBrowserOpen = open;
        updateButtonState();
        FluxDispatcher.dispatch({ type: "BROWSER_TOGGLE", isOpen: open });
        if (!open) {
            restoreSavedPath();
        }
    }
}

function handleDiscordNavigation() {
    setBrowserOpen(false);
}

function handleOtherPluginToggle(e: any) {
    if (e.isOpen) {
        setBrowserOpen(false);
    }
}

function BrowserButtonWrapper() {
    const [, forceUpdate] = React.useState({});
    updateButtonState = () => forceUpdate({});
    
    return <BrowserButton />;
}

const RenderElement = () => <ErrorBoundary><BrowserButtonWrapper /></ErrorBoundary>;

export default definePlugin({
    name: "PrivateBrowser",
    description: "Adds a private browser button to the server list.",
    authors: [{ name: "Midnightcord", id: 1n }],
    dependencies: ["ServerListAPI"],
    settings,
    
    start() {
        addServerListElement(ServerListRenderPosition.Above, RenderElement);
        forceServerListRerender();
        
        FluxDispatcher.subscribe("CHANNEL_SELECT", handleDiscordNavigation);
        FluxDispatcher.subscribe("GUILD_SELECT", handleDiscordNavigation);
        FluxDispatcher.subscribe("QXCHAT_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.subscribe("YOUTUBE_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.subscribe("MIDNIGHTCORDNEWS_TOGGLE", handleOtherPluginToggle);
        
        Native.setup().catch(() => {});
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, RenderElement);
        forceServerListRerender();
        
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", handleDiscordNavigation);
        FluxDispatcher.unsubscribe("GUILD_SELECT", handleDiscordNavigation);
        FluxDispatcher.unsubscribe("QXCHAT_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.unsubscribe("YOUTUBE_TOGGLE", handleOtherPluginToggle);
        FluxDispatcher.unsubscribe("MIDNIGHTCORDNEWS_TOGGLE", handleOtherPluginToggle);
        
        Native.teardown().catch(() => {});
    }
});
