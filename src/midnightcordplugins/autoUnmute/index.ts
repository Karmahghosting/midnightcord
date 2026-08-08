/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore,PermissionsBits, PermissionStore, UserStore } from "@webpack/common";
import { Constants,RestAPI } from "@webpack/common";

const VoiceStateStore = findStoreLazy("VoiceStateStore");
const VoiceActions = findByPropsLazy("toggleSelfMute");

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    guildId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
    selfVideo: boolean;
    sessionId: string;
    suppress: boolean;
    requestToSpeakTimestamp: string | null;
}

async function unmuteUserViaAPI(userId: string, guildId: string): Promise<void> {
    await RestAPI.patch({
        url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
        body: { mute: false }
    });
}

async function undeafenUserViaAPI(userId: string, guildId: string): Promise<void> {
    await RestAPI.patch({
        url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
        body: { deaf: false }
    });
}

export default definePlugin({
    name: "AutoUnmute",
    enabledByDefault: false,
    description: "Automatically unmutes and undeafens when you are server muted/deafened, if you have permissions",
    authors: [{ name: "Bash",
     id: 1327483363518582784n }],

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) return;
            const currentUserId = currentUser.id;

            for (const state of voiceStates) {
                const { userId, channelId, guildId, mute, selfMute, deaf, selfDeaf } = state;
                if (userId !== currentUserId) continue;
                if (!channelId || !guildId) continue;

                const channel = ChannelStore.getChannel(channelId);
                if (!channel) continue;

                if (mute && !selfMute) {
                    const hasMutePermission = PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);
                    if (hasMutePermission) {
                        setTimeout(async () => {
                            try {
                                await unmuteUserViaAPI(currentUserId, guildId);
                            } catch {
                                try { VoiceActions.toggleSelfMute(); } catch {}
                            }
                        }, 100);
                    }
                }

                if (deaf && !selfDeaf) {
                    const hasDeafenPermission = PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);
                    if (hasDeafenPermission) {
                        setTimeout(async () => {
                            try {
                                await undeafenUserViaAPI(currentUserId, guildId);
                            } catch {
                                try { VoiceActions.toggleSelfDeaf(); } catch {}
                            }
                        }, 100);
                    }
                }
            }
        }
    },

    start() {
    },

    stop() {
    }
});
