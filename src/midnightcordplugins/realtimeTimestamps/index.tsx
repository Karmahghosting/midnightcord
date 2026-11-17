/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { moment, useEffect, useReducer } from "@webpack/common";

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Timestamp format displayed on every message timestamp",
        default: "HH:mm:ss",
        options: [
            { label: "15:34:21  (24h)", value: "HH:mm:ss", default: true },
            { label: "15:34:21.123  (24h + milliseconds)", value: "HH:mm:ss.SSS" },
            { label: "3:34:21 PM  (12h)", value: "h:mm:ss A" },
            { label: "3:34:21.123 PM  (12h + milliseconds)", value: "h:mm:ss.SSS A" },
        ],
    },
    showInTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show the full timestamp in the hover tooltip",
        default: true,
    },
    showInCompact: {
        type: OptionType.BOOLEAN,
        description: "Show the full timestamp in compact mode",
        default: true,
    },
});

type TickListener = { fn: () => void; interval: number; };

const tickListeners = new Set<TickListener>();
let globalTickInterval: ReturnType<typeof setInterval> | null = null;
let globalTickDelay = 0;

function refreshGlobalTick() {
    if (tickListeners.size === 0) {
        if (globalTickInterval !== null) {
            clearInterval(globalTickInterval);
            globalTickInterval = null;
            globalTickDelay = 0;
        }
        return;
    }

    let delay = Infinity;
    for (const listener of tickListeners) delay = Math.min(delay, listener.interval);

    if (globalTickInterval !== null && globalTickDelay === delay) return;

    if (globalTickInterval !== null) clearInterval(globalTickInterval);
    globalTickDelay = delay;
    globalTickInterval = setInterval(() => {
        for (const listener of tickListeners) {
            try { listener.fn(); } catch { }
        }
    }, delay);
}

function useTimestampTick(intervalMs: number) {
    const [, tick] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        const listener: TickListener = { fn: tick, interval: intervalMs };
        tickListeners.add(listener);
        refreshGlobalTick();

        return () => {
            tickListeners.delete(listener);
            refreshGlobalTick();
        };
    }, [intervalMs]);
}

function getFormat() {
    return settings.store.format ?? "HH:mm:ss";
}

function getTickInterval(format: string) {
    return format.includes("SSS") ? 50 : 1000;
}

function renderCozyText(date: Date) {
    const fmt = getFormat();
    useTimestampTick(getTickInterval(fmt));
    return moment(date).format(fmt);
}

function renderCompactText(date: Date) {
    const fmt = getFormat();
    useTimestampTick(getTickInterval(fmt));
    return settings.store.showInCompact
        ? moment(date).format(fmt)
        : moment(date).format("LT");
}

function renderTooltipText(date: Date) {
    const fmt = getFormat();
    useTimestampTick(getTickInterval(fmt));
    return settings.store.showInTooltip
        ? moment(date).format(`dddd, MMMM D, YYYY [at] ${fmt}`)
        : moment(date).format("LLLL");
}

export default definePlugin({
    name: "RealtimeTimestamps",
    enabledByDefault: false,
    description: "Replaces Discord timestamps (e.g. 15:31) with live timestamps down to the second or millisecond (e.g. 15:34:21.123).",
    tags: ["Appearance", "Chat", "Utility"],
    authors: [{ name: "Midnightcord",
     id: 253979869n }],
    settings,

    renderCozy(date: Date) {
        return renderCozyText(date);
    },
    renderCompact(date: Date) {
        return renderCompactText(date);
    },
    renderTooltip(date: Date) {
        return renderTooltipText(date);
    },

    stop() {
        tickListeners.clear();
        if (globalTickInterval !== null) {
            clearInterval(globalTickInterval);
            globalTickInterval = null;
            globalTickDelay = 0;
        }
    },

    patches: [
        {
            find: "#{intl::MESSAGE_EDITED_TIMESTAMP_A11Y_LABEL}",
            replacement: [
                {
                    match: /(\i\.useMemo\(.{0,50}"LT".{0,30}\]\))/,
                    replace: "$self.renderCompact(arguments[0].timestamp)",
                },
                {
                    match: /(\i\.useMemo\(.{0,10}\i\.\i\)\(.{0,10}\]\))/,
                    replace: "$self.renderCozy(arguments[0].timestamp)",
                },
                {
                    match: /(__unsupportedReactNodeAsText:).{0,25}"LLLL"\)/,
                    replace: "$1$self.renderTooltip(arguments[0].timestamp)",
                },
            ],
        },
        {
            find: /.full,.{0,15}children:/,
            replacement: {
                match: /(__unsupportedReactNodeAsText:)\i\.full/,
                replace: "$1$self.renderTooltip(new Date(arguments[0].node.timestamp*1000))",
            },
        },
    ],
});
