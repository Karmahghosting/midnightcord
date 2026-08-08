/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { copyToClipboard } from "@utils/clipboard";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import type { NavContextMenuPatchCallback } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Alerts, Button, Clickable, FluxDispatcher, IconUtils, Menu, openModal, SettingsRouter, showToast, TextInput, Toasts, useEffect, useState, useStateFromStores, RelationshipStore, ChannelStore, React, ModalRoot, ModalHeader, ModalContent, ModalFooter } from "@webpack/common";
import { NavigationRouter } from "@webpack/common/utils";
import { tPlugin as t } from "@api/pluginI18n";
import type { Channel, User } from "@vencord/discord-types";

const logger = new Logger("SaveThem");

const UserStore = findStoreLazy("UserStore") as any;
const ChannelActionCreators = findByPropsLazy("openPrivateChannel") as any;
const RelationshipActions = findByPropsLazy("removeFriend", "addRelationship", "cancelFriendRequest") as any;

interface SavedUser {
    id: string;
    username: string;
    globalName: string;
    avatarDataUrl: string | null;
    reason: string;
    timestamp: number;
}

interface UserContextProps {
    channel: Channel;
    guildId?: string;
    user: User;
}

// Convert image URL to Base64 data URL
async function imageUrlToBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        logger.error("Failed to convert image to base64", err);
        return null;
    }
}

// Add user to SaveThem list
async function handleSaveUser(user: User) {
    let reason = "";
    Alerts.show({
        title: t(`Save ${user.globalName || user.username}`),
        confirmText: t("Save"),
        cancelText: t("Cancel"),
        body: (
            <div>
                <BaseText size="sm" color="text-muted" style={{ marginBottom: 8 }}>
                    {t("Why are you saving this user? (Add a note or reason)")}
                </BaseText>
                <TextInput
                    placeholder={t("e.g. Nice designer, Met in voice chat...")}
                    autoFocus
                    onChange={(val: string) => { reason = val; }}
                />
            </div>
        ),
        onConfirm: async () => {
            const trimmed = reason.trim();
            if (!trimmed) {
                showToast(t("A reason is required to save a user."), Toasts.Type.FAILURE);
                return;
            }

            try {
                const stored: any = await DataStore.get("SaveThem_users") ?? [];
                
                // PFP base64 encoding to keep it persistent offline
                const avatarUrl = IconUtils.getUserAvatarURL(user, true, 128) || IconUtils.getDefaultAvatarURL(user.id);
                const avatarDataUrl = await imageUrlToBase64(avatarUrl);

                const newUser: SavedUser = {
                    id: user.id,
                    username: user.username,
                    globalName: user.globalName || user.username,
                    avatarDataUrl,
                    reason: trimmed,
                    timestamp: Date.now()
                };

                const filtered = stored.filter((u: any) => u.id !== user.id);
                const updated = [newUser, ...filtered];

                await DataStore.set("SaveThem_users", updated);
                showToast(t(`${user.globalName || user.username} saved successfully!`), Toasts.Type.SUCCESS);
            } catch (err) {
                logger.error("Failed to save user", err);
                showToast(t("Failed to save user."), Toasts.Type.FAILURE);
            }
        }
    });
}

function SaveThemCard({ u, closePluginSettings, handleRemoveUser, handleCopyId }: { u: SavedUser, closePluginSettings: () => void, handleRemoveUser: (id: string, name: string) => void, handleCopyId: (id: string) => void }) {
    const relType = useStateFromStores([RelationshipStore], () => RelationshipStore.getRelationshipType(u.id), [u.id]);

    const isFriend = relType === 1;
    const isOutgoing = relType === 4;
    const isIncoming = relType === 3;

    const handleRelationshipAction = () => {
        try {
            if (isFriend) {
                RelationshipActions.removeFriend(u.id);
                showToast(t("Friend removed."), Toasts.Type.SUCCESS);
            } else if (isOutgoing) {
                RelationshipActions.cancelFriendRequest(u.id);
                showToast(t("Friend request cancelled."), Toasts.Type.SUCCESS);
            } else if (isIncoming) {
                RelationshipActions.removeFriend(u.id); // Decline request
                showToast(t("Friend request declined."), Toasts.Type.SUCCESS);
            } else {
                RelationshipActions.addRelationship({ userId: u.id, context: { location: "SaveThem" } });
                showToast(t("Friend request sent!"), Toasts.Type.SUCCESS);
            }
        } catch (err) {
            logger.error("Failed relationship action", err);
            showToast(t("Could not update relationship."), Toasts.Type.FAILURE);
        }
    };

    const handleDMUser = async () => {
        try {
            const immediateId = ChannelStore.getDMFromUserId?.(u.id);
            if (immediateId) {
                NavigationRouter?.transitionTo(`/channels/@me/${immediateId}`);
                closePluginSettings();
                return;
            }

            // openPrivateChannel takes a plain userId string (not an options object)
            await Promise.resolve(ChannelActionCreators.openPrivateChannel(u.id));
            closePluginSettings();
        } catch (err) {
            logger.error("Failed to open DM", err);
            showToast(t("Could not open DM with this user."), Toasts.Type.FAILURE);
        }
    };

    let friendButtonText = t("Add Friend");
    let friendButtonColor = "GREEN";
    if (isFriend) {
        friendButtonText = t("Remove Friend");
        friendButtonColor = "RED";
    } else if (isOutgoing || isIncoming) {
        friendButtonText = t("Cancel Request");
        friendButtonColor = "SECONDARY";
    }

    return (
        <div className="vc-savethem-card">
            <div className="vc-savethem-profile-row">
                <img
                    className="vc-savethem-avatar"
                    src={u.avatarDataUrl ?? IconUtils.getDefaultAvatarURL(u.id)}
                    alt=""
                    draggable={false}
                />
                <div className="vc-savethem-user-info">
                    <span className="vc-savethem-name">{u.globalName}</span>
                    <span className="vc-savethem-username">@{u.username}</span>
                </div>
            </div>

            <div className="vc-savethem-reason-container">
                <span className="vc-savethem-reason-label">{t("Saved Note / Reason")}</span>
                <span>{u.reason}</span>
            </div>

            <div className="vc-savethem-actions">
                <Button size="small" color={friendButtonColor as any} onClick={handleRelationshipAction}>{friendButtonText}</Button>
                <Button size="small" onClick={handleDMUser}>{t("DM")}</Button>
                <Button size="small" color="PRIMARY" onClick={() => handleCopyId(u.id)}>{t("Copy ID")}</Button>
                <Button size="small" color="RED" onClick={() => handleRemoveUser(u.id, u.globalName)}>{t("Remove")}</Button>
            </div>
        </div>
    );
}

function SaveThemSettings({ closePluginSettings }: { closePluginSettings: () => void; }) {
    const [users, setUsers] = useState<SavedUser[]>([]);

    // Load users
    useEffect(() => {
        DataStore.get("SaveThem_users").then((val: any) => {
            if (Array.isArray(val)) {
                setUsers(val);
            }
        });
    }, []);
    // Copy User ID
    const handleCopyId = (userId: string) => {
        copyToClipboard(userId);
        showToast(t("User ID copied to clipboard!"), Toasts.Type.SUCCESS);
    };

    // Remove user from SaveThem list
    const handleRemoveUser = (userId: string, name: string) => {
        Alerts.show({
            title: t("Remove Saved User"),
            body: t(`Are you sure you want to remove ${name} from your saved users list?`),
            confirmText: t("Remove"),
            confirmVariant: "critical-primary",
            cancelText: t("Cancel"),
            onConfirm: async () => {
                const updated = users.filter(u => u.id !== userId);
                setUsers(updated);
                await DataStore.set("SaveThem_users", updated);
                showToast(t("User removed from list."), Toasts.Type.SUCCESS);
            }
        });
    };

    return (
        <div className="vc-savethem-container">
            <div className="vc-savethem-header">
                <BaseText tag="h3" size="lg" weight="semibold">{t("SaveThem - Saved Contacts")}</BaseText>
            </div>

            {!users.length ? (
                <div className="vc-savethem-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0-8a3 3 0 1 1-3 3 3 3 0 0 1 3-3Zm0 10c-3.53 0-10 1.86-10 5.5V20h20v-2.5c0-3.64-6.47-5.5-10-5.5Zm8 4H4v-.5c0-1.66 4-3.5 8-3.5s8 1.84 8 3.5Z" />
                    </svg>
                    <div>
                        <BaseText tag="h4" size="md" weight="semibold">{t("No saved contacts yet")}</BaseText>
                        <BaseText size="sm" color="text-muted" style={{ marginTop: 4 }}>
                            {t("Right-click on any user in chat or member list, then click \"Save to SaveThem\".")}
                        </BaseText>
                    </div>
                </div>
            ) : (
                <div className="vc-savethem-grid">
                    {users.map(u => (
                        <SaveThemCard 
                            key={u.id} 
                            u={u} 
                            closePluginSettings={closePluginSettings} 
                            handleRemoveUser={handleRemoveUser} 
                            handleCopyId={handleCopyId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user) return;

    children.push(
        <Menu.MenuGroup key="vc-savethem-group">
            <Menu.MenuItem
                id="vc-savethem-save"
                label={t("Save to SaveThem")}
                action={() => {
                    void handleSaveUser(user);
                }}
            />
        </Menu.MenuGroup>
    );
};

export const settings = definePluginSettings({
    presetsManager: {
        type: OptionType.COMPONENT,
        component({ closePluginSettings }) {
            return (
                <ErrorBoundary>
                    <SaveThemSettings closePluginSettings={closePluginSettings} />
                </ErrorBoundary>
            );
        }
    }
});

export default definePlugin({
    name: "SaveThem",
    description: "Allows you to save users with profile backups and a reason, directly from context menus.",
    authors: [{ name: "irritably",
     id: 928787166916640838n }],
    tags: ["Utility", "Chat"],
    contextMenus: {
        "user-context": UserContextMenuPatch
    },
    settings
});
