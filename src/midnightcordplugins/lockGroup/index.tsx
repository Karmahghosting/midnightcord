/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, RestAPI, UserStore } from "@webpack/common";
import { Channel } from "discord-types/general";

const lockedGroups = new Set<string>();

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Debug mode (detailed logs)",
        default: false
    }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function log(_message: string, _level: "info" | "warn" | "error" = "info") {
    // Silent in production
}

function debugLog(_message: string) {
    // Silent in production
}

function interceptAddMember(originalMethod: any) {
    return function (this: any, ...args: any[]) {
        const [requestData] = args;
        if (requestData?.url?.match(/^\/channels\/\d+\/recipients\/\d+$/)) {
            const urlParts = requestData.url.split("/");
            const channelId = urlParts[2];
            const targetUserId = urlParts[4];

            if (lockedGroups.has(channelId)) {
                const channel = ChannelStore.getChannel(channelId);
                const currentUserId = UserStore.getCurrentUser()?.id;

                if (channel && channel.type === 3 && channel.ownerId === currentUserId) {
                    debugLog("\u2705 Propri\u00e9taire autoris\u00e9 \u00e0 ajouter des membres");
                    return originalMethod.apply(this, args);
                }

                if (channel && channel.type === 3) {
                    const channelName = channel.name || "Groupe sans nom";
                    log(`\uD83D\uDEAB Ajout non autoris\u00e9 d\u00e9tect\u00e9 dans "${channelName}" - Auto-kick programm\u00e9`);

                    setTimeout(async () => {
                        try {
                            await RestAPI.del({ url: `/channels/${channelId}/recipients/${targetUserId}` });
                            log(`\u2705 Utilisateur ${targetUserId} automatiquement kick\u00e9 du groupe verrouill\u00e9`);
                            if (settings.store.showNotifications) {
                                showNotification({
                                    title: "\uD83D\uDD12 LockGroup - Auto-kick",
                                    body: `Membre non autoris\u00e9 retir\u00e9 du groupe verrouill\u00e9 "${channelName}"`,
                                    icon: undefined
                                });
                            }
                        } catch (error) {
                            log(`\u274C Error lors du kick automatique: ${error}`, "error");
                        }
                    }, 100);

                    if (settings.store.showNotifications) {
                        showNotification({
                            title: "\uD83D\uDD12 LockGroup - Ajout non autoris\u00e9",
                            body: `Ajout non autoris\u00e9 d\u00e9tect\u00e9 dans "${channelName}" - Auto-kick en cours...`,
                            icon: undefined
                        });
                    }
                }
            }
        }
        return originalMethod.apply(this, args);
    };
}

function toggleGroupLock(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const currentUserId = UserStore.getCurrentUser()?.id;

    if (!channel || channel.type !== 3 || !currentUserId) return;

    const channelName = channel.name || "Groupe sans nom";

    if (channel.ownerId !== currentUserId) {
        if (settings.store.showNotifications) {
            showNotification({
                title: "\u274C LockGroup",
                body: "Seul le propri\u00e9taire du groupe peut verrouiller/d\u00e9verrouiller le groupe",
                icon: undefined
            });
        }
        return;
    }

    const isCurrentlyLocked = lockedGroups.has(channelId);

    if (isCurrentlyLocked) {
        lockedGroups.delete(channelId);
        log(`\uD83D\uDD13 Groupe "${channelName}" d\u00e9verrouill\u00e9`);
        if (settings.store.showNotifications) {
            showNotification({
                title: "\uD83D\uDD13 LockGroup",
                body: `Groupe "${channelName}" d\u00e9verrouill\u00e9 - Ajout de membres autoris\u00e9`,
                icon: undefined
            });
        }
    } else {
        lockedGroups.add(channelId);
        log(`\uD83D\uDD12 Groupe "${channelName}" verrouill\u00e9`);
        if (settings.store.showNotifications) {
            showNotification({
                title: "\uD83D\uDD12 LockGroup",
                body: `Groupe "${channelName}" verrouill\u00e9 - Ajout de membres bloqu\u00e9`,
                icon: undefined
            });
        }
    }
}

const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel || channel.type !== 3) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (channel.ownerId !== currentUserId) return;

    const isLocked = lockedGroups.has(channel.id);
    const group = findGroupChildrenByChildId("leave-channel", children);

    if (group) {
        const menuItems: any[] = [<Menu.MenuSeparator key="separator" />];

        if (!isLocked) {
            menuItems.push(
                <Menu.MenuItem
                    key="lock-group"
                    id="vc-lock-group"
                    label="Verrouiller le groupe"
                    color="danger"
                    action={() => toggleGroupLock(channel.id)}
                    icon={() => (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z" />
                        </svg>
                    )}
                />
            );
        }

        if (isLocked) {
            menuItems.push(
                <Menu.MenuItem
                    key="unlock-group"
                    id="vc-unlock-group"
                    label="D\u00e9verrouiller le groupe"
                    color="brand"
                    action={() => toggleGroupLock(channel.id)}
                    icon={() => (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z" />
                        </svg>
                    )}
                />
            );
        }

        group.push(...menuItems);
    }
};

let originalPutMethod: any = null;

export default definePlugin({
    name: "LockGroup",
    enabledByDefault: true,
    description: "Lock/unlock groups via the context menu (prevents adding members)",
    authors: [{ name: "Bash",
     id: 1327483363518582784n }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: { "gdm-context": GroupContextMenuPatch },

    flux: {
        MESSAGE_CREATE(event: { message: any; }) {
            const { message } = event;
            const currentUserId = UserStore.getCurrentUser()?.id;

            if (message && message.type === 1) {
                const channelId = message.channel_id;
                if (lockedGroups.has(channelId)) {
                    const channel = ChannelStore.getChannel(channelId);
                    if (channel && channel.type === 3 && channel.ownerId === currentUserId) {
                        const channelName = channel.name || "Groupe sans nom";
                        const addedUserId = message.mentions?.[0]?.id;
                        const addedByUserId = message.author?.id;

                        if (addedByUserId === currentUserId) {
                            debugLog("\u2705 Ajout fait par le propri\u00e9taire - Autoris\u00e9");
                            return;
                        }

                        if (addedUserId && addedByUserId !== currentUserId) {
                            setTimeout(async () => {
                                try {
                                    await RestAPI.del({ url: `/channels/${channelId}/recipients/${addedUserId}` });
                                    log(`\uD83D\uDD12 Kick de s\u00e9curit\u00e9 effectu\u00e9 pour ${addedUserId}`);
                                } catch (error) {
                                    debugLog(`Error kick de s\u00e9curit\u00e9: ${error}`);
                                }
                            }, 150);

                            if (settings.store.showNotifications) {
                                showNotification({
                                    title: "\uD83D\uDD12 LockGroup - Ajout non autoris\u00e9",
                                    body: `Membre ajout\u00e9 sans autorisation dans "${channelName}" puis retir\u00e9`,
                                    icon: undefined
                                });
                            }
                        }
                    }
                }
            }
        }
    },

    start() {
        log("\uD83D\uDE80 Plugin LockGroup d\u00e9marr\u00e9");
        if (RestAPI && RestAPI.put) {
            originalPutMethod = RestAPI.put;
            RestAPI.put = interceptAddMember(originalPutMethod);
        }
    },

    stop() {
        log("\uD83D\uDED1 Plugin LockGroup arr\u00eat\u00e9");
        if (originalPutMethod && RestAPI) {
            RestAPI.put = originalPutMethod;
            originalPutMethod = null;
        }
        lockedGroups.clear();
    }
});
