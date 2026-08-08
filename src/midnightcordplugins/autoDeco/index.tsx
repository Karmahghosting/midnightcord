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
const autoDecoedUsers = new Set<string>();

async function loadAutoDecoed() {
    try {
        const saved = await DataStore.get<string[]>("AutoDeco_users");
        if (Array.isArray(saved)) {
            autoDecoedUsers.clear();
            saved.forEach(k => autoDecoedUsers.add(k));
        }
    } catch { }
}

async function saveAutoDecoed() {
    try {
        await DataStore.set("AutoDeco_users", Array.from(autoDecoedUsers));
    } catch { }
}

async function setServerDisconnect(guildId: string, userId: string): Promise<boolean> {
    try {
        await RestAPI.patch({
            url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
            body: { channel_id: null }
        });
        return true;
    } catch (e: any) {
        console.error("[AutoDeco] Server disconnect failed:", e);
        return false;
    }
}

interface VoiceState {
    userId: string;
    guildId?: string;
    channelId?: string | null;
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { user?: any; guildId?: string; channel?: any; } = {}) => {
    const { user, channel } = ctx;
    if (!user || !Array.isArray(children)) return;

    const guildId = ctx.guildId ?? channel?.guild_id ?? GuildStore.getGuildId();
    if (!guildId) return;

    const guild = GuildStore.getGuild(guildId);
    if (!guild) return;

    const context = channel || guild;
    if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, context)) return;

    const key = `${guildId}:${user.id}`;
    const isAutoDecoed = autoDecoedUsers.has(key);

    const menuItem = (
        <Menu.MenuCheckboxItem
            key="auto-deco-toggle"
            id="vc-auto-deco-toggle"
            label={t("Auto Deco")}
            color="danger"
            checked={isAutoDecoed}
            action={async () => {
                const next = !isAutoDecoed;
                if (next) {
                    autoDecoedUsers.add(key);
                    await saveAutoDecoed();
                    showToast(t("Auto Deco enabled for ") + (user.username || user.tag || "user"), Toasts.Type.SUCCESS);
                    const ok = await setServerDisconnect(guildId, user.id);
                    if (!ok) {
                        showToast(t("Failed to disconnect user (check permissions)"), Toasts.Type.FAILURE);
                    }
                } else {
                    autoDecoedUsers.delete(key);
                    await saveAutoDecoed();
                    showToast(t("Auto Deco disabled for ") + (user.username || user.tag || "user"), Toasts.Type.INFO);
                }
            }}
        />
    );

    const targetGroup = findGroupChildrenByChildId("vc-auto-mute-toggle", children)
        ?? findGroupChildrenByChildId("server-mute", children)
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
    name: "AutoDeco",
    description: "Automatically disconnects selected users whenever they join a voice channel.",
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
                const { userId, guildId, channelId } = state;
                if (!userId || !guildId) continue;

                const key = `${guildId}:${userId}`;
                if (autoDecoedUsers.has(key)) {
                    // If user is currently in a voice channel, disconnect them instantly!
                    if (channelId) {
                        setServerDisconnect(guildId, userId).catch(() => {});
                    }
                }
            }
        }
    },

    start() {
        loadAutoDecoed();
    },

    stop() {
        autoDecoedUsers.clear();
    }
});
