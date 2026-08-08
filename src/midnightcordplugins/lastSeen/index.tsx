/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { BaseText } from "@components/BaseText";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, React, useStateFromStores } from "@webpack/common";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { t } from "../autoTranslateMidnightcord";

const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");
const PresenceStore = findByPropsLazy("getStatus", "getActivities");

// ── Settings ───────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        description: "Language for the date/time display",
        options: [
            { label: "English", value: "en", default: true },
            { label: "Français", value: "fr" }
        ]
    }
});

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "midnightcord_lastseen_";

const lastWrittenCache = new Map<string, number>();

function setLastSeen(userId: string, ts: number) {
    try {
        const lastWritten = lastWrittenCache.get(userId) || 0;
        // Only write to IndexedDB if it's been more than 60 seconds since the last write for this user
        if (ts - lastWritten > 60000) {
            lastWrittenCache.set(userId, ts);
            DataStore.set(STORAGE_PREFIX + userId, ts).catch(() => {});
        }
    } catch (e) {
        console.error(`[LastSeen ERROR] Failed to save timestamp for ${userId}:`, e);
    }
}

// ── Format ─────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
    const now = new Date();
    const date = new Date(ts);
    const lang = settings.store.language;
    const locale = lang === "fr" ? "fr-FR" : "en-US";
    
    // Include seconds
    const timeStr = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return t("Today at {time}").replace("{time}", timeStr);
    if (isYesterday) return t("Yesterday at {time}").replace("{time}", timeStr);
    
    const dateStr = date.toLocaleDateString(locale, { day: "numeric", month: "short" });
    return t("{date} at {time}").replace("{date}", dateStr).replace("{time}", timeStr);
}

// ── Handlers ───────────────────────────────────────────────────────────────

// Handle a single presence entry — called from multiple events
function handlePresenceEntry(entry: any) {
    if (!entry) return;

    const userId: string | undefined =
        entry?.user?.id ??
        entry?.userId ??
        entry?.user_id;

    if (!userId) return;

    if (userId === "1462402007305425039") {
    }

    // Whatever the event is (online, idle, dnd, offline), it means Discord
    // just sent us an update about them. So they were "seen" right now!
    setLastSeen(userId, Date.now());
}

// PRESENCE_UPDATE — may dispatch single user or array
function onPresenceUpdate(data: any) {
    if (Array.isArray(data?.updates)) {
        for (const entry of data.updates) handlePresenceEntry(entry);
    } else {
        handlePresenceEntry(data);
    }
}

// Also listen to PRESENCE_UPDATES (plural)
function onPresenceUpdates(data: any) {
    if (Array.isArray(data?.updates)) {
        for (const entry of data.updates) handlePresenceEntry(entry);
    } else if (Array.isArray(data)) {
        for (const entry of data) handlePresenceEntry(entry);
    } else {
        handlePresenceEntry(data);
    }
}

function onMessageCreate(data: any) {
    const userId: string | undefined =
        data?.message?.author?.id ??
        data?.message?.author_id ??
        data?.author?.id;
    if (userId) setLastSeen(userId, Date.now());
}

function onVoiceStateUpdates(data: any) {
    for (const state of data?.voiceStates ?? []) {
        const userId: string | undefined = state?.userId ?? state?.user_id;
        if (userId) setLastSeen(userId, Date.now());
    }
}

function onTypingStart(data: any) {
    const userId: string | undefined = data?.userId ?? data?.user_id;
    if (userId) setLastSeen(userId, Date.now());
}

function onReactionAdd(data: any) {
    const userId: string | undefined = data?.userId ?? data?.user_id;
    if (userId) setLastSeen(userId, Date.now());
}

// ── Component ──────────────────────────────────────────────────────────────

function LastSeenText({ userId }: { userId: string; }) {
    const status = useStateFromStores([PresenceStore], () => PresenceStore.getStatus(userId));
    const [lastSeen, setLastSeenState] = React.useState<number | null>(null);

    // Fetch data from DataStore asynchronously when component mounts or status changes
    React.useEffect(() => {
        DataStore.get(STORAGE_PREFIX + userId).then((val: any) => {
            if (val) setLastSeenState(Number(val));
        }).catch(() => {});
    }, [status, userId]);

    const isOnline = status && status !== "offline" && status !== "invisible";

    let content: string;
    let color: string;

    if (isOnline) {
        if (status === "idle") content = t("Idle");
        else if (status === "dnd") content = t("Do Not Disturb");
        else if (status === "streaming") content = t("Streaming");
        else content = t("Online");
    } else if (lastSeen) {
        content = formatDate(lastSeen);
    } else {
        content = t("Not tracked yet");
    }

    return (
        <BaseText size="sm" color="text-normal" style={{ userSelect: "text" }}>
            {content}
        </BaseText>
    );
}

const LastSeenSection = ErrorBoundary.wrap(
    ({ userId }: { userId: string; }) => <LastSeenText userId={userId} />,
    { noop: true }
);

// ── Plugin ─────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "LastSeen",
    enabledByDefault: false,
    description: "Shows when a user was last seen online, in their profile.",
    authors: [{ name: "midnightcord",
     id: 0n }],
    settings,

    patches: [
        {
            find: "#{intl::PROVISIONAL_ACCOUNT}),headingIcon:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id)}\)}\))/,
                replace: "$1,$self.renderLastSeen({userId:$2,isSideBar:true})",
            }
        },
        {
            find: ",applicationRoleConnection:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderLastSeen({userId:$2,isSideBar:false}),",
            }
        },
        {
            find: ".MODAL_V2,onClose:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderLastSeen({userId:$2,isSideBar:false}),",
            }
        }
    ],

    start() {
        FluxDispatcher.subscribe("PRESENCE_UPDATE", onPresenceUpdate);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", onPresenceUpdates);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdates);
        FluxDispatcher.subscribe("TYPING_START", onTypingStart);
        FluxDispatcher.subscribe("MESSAGE_REACTION_ADD", onReactionAdd);
    },

    stop() {
        FluxDispatcher.unsubscribe("PRESENCE_UPDATE", onPresenceUpdate);
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", onPresenceUpdates);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdates);
        FluxDispatcher.unsubscribe("TYPING_START", onTypingStart);
        FluxDispatcher.unsubscribe("MESSAGE_REACTION_ADD", onReactionAdd);
    },

    renderLastSeen({ userId, isSideBar }: { userId: string; isSideBar: boolean; }) {
        if (!userId) return null;
        return (
            <Section
                heading={t("Last Seen")}
                headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
                headingColor={isSideBar ? "text-strong" : "text-default"}
            >
                <LastSeenSection userId={userId} />
            </Section>
        );
    },
});
