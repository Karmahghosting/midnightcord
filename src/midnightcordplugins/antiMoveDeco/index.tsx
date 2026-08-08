/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserAreaButton } from "@api/UserArea";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, React, UserStore } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

// Modules Webpack
const ChannelActions = findByPropsLazy("selectVoiceChannel", "disconnect");
const SelectedChannelStore = findByPropsLazy("getVoiceChannelId", "getChannelId");

let enabled = false;
let targetChannelId: string | null = null;

function onVoiceStateUpdate({ voiceStates }: { voiceStates: any[]; }) {
    if (!enabled || !targetChannelId) return;

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;
    const myId = currentUser.id;

    // Chercher si mon état a changé dans cet update
    const myState = voiceStates.find(s => s.userId === myId);

    // Si on a un update me concernant
    if (myState) {
        // Si le nouveau channelId est différent de celui qu'on protège (ou null si déco)
        if (myState.channelId !== targetChannelId) {
            setTimeout(() => {
                if (enabled && targetChannelId) {
                    try {
                        ChannelActions?.selectVoiceChannel?.(targetChannelId);
                    } catch { }
                }
            }, 500);
        }
    }
}

function AntiMoveDecoIcon({ enabled }: { enabled: boolean; }) {
    const color = enabled ? "#39FF14" : "currentColor"; // Vert fluo si activé
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke={color} strokeWidth="2.5" />
        </svg>
    );
}

function AntiMoveDecoButton() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    const toggle = () => {
        if (!enabled) {
            const channelId = SelectedChannelStore?.getVoiceChannelId?.();
            if (!channelId) {
                // Pas en vocal, on ne peut pas activer
                return;
            }
            targetChannelId = channelId;
            enabled = true;
        } else {
            enabled = false;
            targetChannelId = null;
        }
        forceUpdate();
    };

    return (
        <UserAreaButton
            onClick={toggle}
            tooltipText={enabled ? t("Disable AntiMove&Deco") : t("Enable AntiMove&Deco")}
            icon={<AntiMoveDecoIcon enabled={enabled} />}
        />
    );
}

export default definePlugin({
    name: "AntiMoveDeco",
    enabledByDefault: true,
    description: "Adds a button to prevent being moved or disconnected from a voice channel.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    dependencies: ["UserAreaAPI"],

    userAreaButton: {
        icon: () => <AntiMoveDecoIcon enabled={enabled} />,
        render: AntiMoveDecoButton
    },

    start() {
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
    },
    stop() {
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        enabled = false;
        targetChannelId = null;
    }
});
