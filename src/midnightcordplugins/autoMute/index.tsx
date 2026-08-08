/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Constants, GuildStore, Menu, React, RestAPI, showToast, Toasts, PermissionsBits, PermissionStore } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

// Key format: `${guildId}:${userId}`
const autoMutedUsers = new Set<string>();

async function loadAutoMuted() {
    try {
        const saved = await DataStore.get<string[]>("AutoMute_users");
        if (Array.isArray(saved)) {
            autoMutedUsers.clear();
            saved.forEach(k => autoMutedUsers.add(k));
        }
    } catch { }
}

async function saveAutoMuted() {
    try {
        await DataStore.set("AutoMute_users", Array.from(autoMutedUsers));
    } catch { }
}

async function setServerMute(guildId: string, userId: string, mute: boolean): Promise<boolean> {
    try {
        await RestAPI.patch({
            url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
            body: { mute }
        });
        return true;
    } catch (e: any) {
        console.error("[AutoMute] Server mute failed:", e);
        return false;
    }
}

interface VoiceState {
    userId: string;
    guildId?: string;
    channelId?: string;
    mute: boolean;
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { user?: any; guildId?: string; channel?: any; } = {}) => {
    const { user, channel } = ctx;
    if (!user || !Array.isArray(children)) return;

    const guildId = ctx.guildId ?? channel?.guild_id ?? GuildStore.getGuildId();
    if (!guildId) return;

    const guild = GuildStore.getGuild(guildId);
    if (!guild) return;

    const context = channel || guild;
    if (!PermissionStore.can(PermissionsBits.MUTE_MEMBERS, context)) return;

    const key = `${guildId}:${user.id}`;
    const isAutoMuted = autoMutedUsers.has(key);

    const menuItem = (
        <Menu.MenuCheckboxItem
            key="auto-mute-toggle"
            id="vc-auto-mute-toggle"
            label={t("Auto Mute")}
            color="danger"
            checked={isAutoMuted}
            action={async () => {
                const next = !isAutoMuted;
                if (next) {
                    autoMutedUsers.add(key);
                    await saveAutoMuted();
                    showToast(t("Auto Mute enabled for ") + (user.username || user.tag || "user"), Toasts.Type.SUCCESS);
                    const ok = await setServerMute(guildId, user.id, true);
                    if (!ok) {
                        showToast(t("Failed to server mute (check permissions)"), Toasts.Type.FAILURE);
                    }
                } else {
                    autoMutedUsers.delete(key);
                    await saveAutoMuted();
                    showToast(t("Auto Mute disabled for ") + (user.username || user.tag || "user"), Toasts.Type.INFO);
                    await setServerMute(guildId, user.id, false);
                }
            }}
        />
    );

    const targetGroup = findGroupChildrenByChildId("server-mute", children)
        ?? findGroupChildrenByChildId("server-deafen", children)
        ?? findGroupChildrenByChildId("disconnect", children)
        ?? findGroupChildrenByChildId("mod-view", children);

    if (targetGroup && Array.isArray(targetGroup)) {
        targetGroup.push(menuItem);
    } else {
        children.push(<Menu.MenuGroup>{menuItem}</Menu.MenuGroup>);
    }
};

export default definePlugin({
    name: "AutoMute",
    description: "Automatically server mutes selected users and re-mutes them instantly if they unmute.",
    authors: [
        { name: "Midnightcord", id: 0n }
    ],
    enabledByDefault: false,

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!Array.isArray(voiceStates)) return;

            for (const state of voiceStates) {
                const { userId, guildId, mute } = state;
                if (!userId || !guildId) continue;

                const key = `${guildId}:${userId}`;
                if (autoMutedUsers.has(key)) {
                    // If user is currently NOT server-muted, mute them back instantly!
                    if (!mute) {
                        setServerMute(guildId, userId, true).catch(() => {});
                    }
                }
            }
        }
    },

    start() {
        loadAutoMuted();
    },

    stop() {
        autoMutedUsers.clear();
    }
});
