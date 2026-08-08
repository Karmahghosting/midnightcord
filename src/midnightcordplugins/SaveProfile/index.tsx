/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { Alerts, Button, Clickable, FluxDispatcher, IconUtils, Menu, openModal, RestAPI, SettingsRouter, showToast, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import { tPlugin as t } from "@api/pluginI18n";

const logger = new Logger("SaveProfile");

const UserProfileSettingsStore = findStoreLazy("UserProfileSettingsStore") as any;
const UserStore = findStoreLazy("UserStore") as any;
const UserProfileStore = findStoreLazy("UserProfileStore") as any;
const CustomStatusSettings = getUserSettingLazy("status", "customStatus");

interface SavedProfileConfig {
    id: string;
    name: string;
    timestamp: number;
    globalName: string | null;
    bio: string | null;
    avatarDataUrl: string | null;
    bannerDataUrl: string | null;
    avatarHash?: string | null;
    bannerHash?: string | null;
    accentColor: number | null;
    themeColors: number[] | null;
    avatarDecoration: any | null;
    customStatus: {
        text: string;
        emojiId: string;
        emojiName: string;
        expiresAtMs: string;
    } | null;
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

// Helper to convert integer colors to RGB
function intToColor(colorInt: number): string {
    const r = (colorInt >> 16) & 255;
    const g = (colorInt >> 8) & 255;
    const b = colorInt & 255;
    return `rgb(${r}, ${g}, ${b})`;
}

// Helper to render emoji in custom status
function StatusEmoji({ emojiId, emojiName }: { emojiId: string; emojiName: string; }) {
    if (!emojiId || emojiId === "0") {
        return emojiName ? <span style={{ marginRight: 4 }}>{emojiName}</span> : null;
    }
    const isAnimated = emojiName.startsWith("a_") || false;
    const url = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? "gif" : "png"}?size=32`;
    return <img src={url} alt={emojiName} style={{ width: 16, height: 16, objectFit: "contain", marginRight: 4 }} />;
}

function SaveProfileSettings({ closePluginSettings }: { closePluginSettings: () => void; }) {
    const [presets, setPresets] = useState<SavedProfileConfig[]>([]);
    const [newPresetName, setNewPresetName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Load presets
    useEffect(() => {
        DataStore.get("SaveProfile_presets").then((val: any) => {
            if (Array.isArray(val)) {
                setPresets(val);
            }
        });
    }, []);

    // Save current profile configuration
    const handleSaveCurrentProfile = async () => {
        const name = newPresetName.trim();
        if (!name) {
            showToast(t("Please enter a name for the profile configuration."), Toasts.Type.FAILURE);
            return;
        }

        setIsSaving(true);
        try {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) throw new Error("Current user not found");

            // Fetch user profile from store
            const userProfile = UserProfileStore.getUserProfile(currentUser.id);

            // Get avatar image base64
            const avatarUrl = IconUtils.getUserAvatarURL(currentUser, true, 256) || IconUtils.getDefaultAvatarURL(currentUser.id);
            const avatarDataUrl = await imageUrlToBase64(avatarUrl);

            // Get banner image base64 (if user has custom banner)
            let bannerDataUrl = null;
            if (userProfile?.banner) {
                const isAnimated = userProfile.banner.startsWith("a_");
                const bannerUrl = `https://cdn.discordapp.com/banners/${currentUser.id}/${userProfile.banner}.${isAnimated ? "gif" : "png"}?size=480`;
                bannerDataUrl = await imageUrlToBase64(bannerUrl);
            }

            // Get custom status
            const statusSetting = CustomStatusSettings?.getSetting();
            const customStatus = statusSetting
                ? {
                    text: statusSetting.text ?? "",
                    emojiId: statusSetting.emojiId ?? "0",
                    emojiName: statusSetting.emojiName ?? "",
                    expiresAtMs: statusSetting.expiresAtMs ?? "0"
                }
                : null;

            const newPreset: SavedProfileConfig = {
                id: Math.random().toString(36).substring(2, 9),
                name,
                timestamp: Date.now(),
                globalName: currentUser.globalName ?? currentUser.username,
                bio: userProfile?.bio ?? null,
                avatarDataUrl,
                bannerDataUrl,
                avatarHash: currentUser.avatar ?? null,
                bannerHash: userProfile?.banner ?? null,
                accentColor: userProfile?.accentColor ?? null,
                themeColors: userProfile?.themeColors ?? null,
                avatarDecoration: currentUser.avatarDecorationData ?? null,
                customStatus
            };

            const updatedPresets = [newPreset, ...presets];
            setPresets(updatedPresets);
            await DataStore.set("SaveProfile_presets", updatedPresets);
            setNewPresetName("");
            showToast(t("Profile configuration saved successfully!"), Toasts.Type.SUCCESS);
        } catch (err) {
            logger.error("Failed to save profile", err);
            showToast(t("Could not save profile configuration."), Toasts.Type.FAILURE);
        } finally {
            setIsSaving(false);
        }
    };

    // Apply saved profile directly via Discord REST API — no "Edit Profile → Save" needed
    const handleLoadProfile = async (preset: SavedProfileConfig) => {
        try {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) {
                showToast(t("Could not load profile configuration."), Toasts.Type.FAILURE);
                return;
            }
            const userProfile = UserProfileStore.getUserProfile(currentUser.id);

            showToast(t("Applying profile…"), Toasts.Type.MESSAGE);

            let anyError = false;

            // ── 1. Custom status (instant, no REST needed) ───────────────────
            if (preset.customStatus && CustomStatusSettings) {
                try {
                    CustomStatusSettings.updateSetting({
                        text: preset.customStatus.text ?? "",
                        expiresAtMs: preset.customStatus.expiresAtMs ?? "0",
                        emojiId: preset.customStatus.emojiId ?? "0",
                        emojiName: preset.customStatus.emojiName ?? ""
                    });
                } catch (e) {
                    logger.error("Failed to update custom status", e);
                }
            }

            // ── 2. Nitro colors (theme_colors, accent_color) ─────────────────
            // Discord REST rejects these for non-real-Nitro accounts with 500.
            // Apply them locally via FluxDispatcher so they show immediately
            // without hitting the API (same approach as customProfile plugin).
            if (preset.themeColors !== undefined || preset.accentColor !== undefined) {
                try {
                    const colorPayload: Record<string, any> = {};
                    if (preset.themeColors !== undefined) colorPayload.pendingThemeColors = preset.themeColors;
                    if (preset.accentColor !== undefined) colorPayload.pendingAccentColor = preset.accentColor;
                    FluxDispatcher.dispatch({
                        type: "USER_PROFILE_SETTINGS_SET_PENDING_CHANGES",
                        ...colorPayload
                    });
                    // Also try to persist via REST (will only succeed with real Nitro)
                    const nitroBody: Record<string, any> = {};
                    if (preset.themeColors !== undefined) nitroBody.theme_colors = preset.themeColors ?? null;
                    if (preset.accentColor !== undefined) nitroBody.accent_color = preset.accentColor ?? null;
                    RestAPI.patch({ url: "/users/@me/profile", body: nitroBody }).catch(() => {
                        // Silently fail — non-Nitro accounts can't persist colors via REST
                    });
                } catch (e) {
                    logger.error("Failed to apply Nitro colors", e);
                }
            }

            // ── 3. PATCH /users/@me  (global name + avatar) ─────────────────
            // Discord accepts: global_name, avatar (base64)
            const userPatch: Record<string, any> = {};

            if (preset.globalName !== undefined && preset.globalName !== currentUser.globalName) {
                userPatch.global_name = preset.globalName;
            }
            // avatar lives on /users/@me, NOT on /users/@me/profile
            if (preset.avatarDataUrl && preset.avatarHash !== currentUser.avatar) {
                userPatch.avatar = preset.avatarDataUrl;
            }

            if (Object.keys(userPatch).length) {
                try {
                    await RestAPI.patch({ url: "/users/@me", body: userPatch });
                } catch (e: any) {
                    const msg = e?.body?.message ?? e?.message ?? String(e);
                    logger.error("Failed to patch /users/@me", e);
                    showToast(`Avatar/name error: ${msg}`, Toasts.Type.FAILURE);
                    anyError = true;
                }
            }

            // ── 4. PATCH /users/@me/profile  (bio + banner only) ─────────────
            // Do NOT send theme_colors / accent_color here — causes 500 for non-Nitro
            const profilePatch: Record<string, any> = {};

            // bio: send empty string to clear, or the saved value
            if (preset.bio !== undefined) {
                profilePatch.bio = preset.bio ?? "";
            }

            // banner — only upload if hash differs; send null to clear banner
            if (preset.bannerDataUrl && userProfile && preset.bannerHash !== userProfile.banner) {
                profilePatch.banner = preset.bannerDataUrl;
            } else if (preset.bannerHash === null && userProfile?.banner) {
                profilePatch.banner = null; // explicitly clear the banner
            }

            if (Object.keys(profilePatch).length) {
                try {
                    await RestAPI.patch({ url: "/users/@me/profile", body: profilePatch });
                } catch (e: any) {
                    const msg = e?.body?.message ?? e?.message ?? String(e);
                    logger.error("Failed to patch /users/@me/profile", e);
                    showToast(`Bio/Banner error: ${msg}`, Toasts.Type.FAILURE);
                    anyError = true;
                }
            }

            if (!anyError) {
                showToast(t("Profile applied instantly! ✔"), Toasts.Type.SUCCESS);
            }
        } catch (err) {
            logger.error("Failed to load profile", err);
            showToast(t("Could not load profile configuration."), Toasts.Type.FAILURE);
        }
    };


    // Delete saved configuration
    const handleDeleteProfile = (id: string) => {
        Alerts.show({
            title: t("Delete Profile Configuration"),
            body: t("Are you sure you want to delete this profile configuration?"),
            confirmText: t("Delete"),
            confirmVariant: "critical-primary",
            cancelText: t("Cancel"),
            onConfirm: async () => {
                const updatedPresets = presets.filter(p => p.id !== id);
                setPresets(updatedPresets);
                await DataStore.set("SaveProfile_presets", updatedPresets);
                showToast(t("Profile configuration deleted."), Toasts.Type.SUCCESS);
            }
        });
    };

    // Rename saved configuration
    const handleRenameProfile = (preset: SavedProfileConfig) => {
        let name = preset.name;
        Alerts.show({
            title: t("Rename Profile Configuration"),
            body: (
                <TextInput
                    value={name}
                    placeholder={t("Enter new name…")}
                    onChange={(val) => name = val}
                />
            ),
            confirmText: t("Rename"),
            cancelText: t("Cancel"),
            onConfirm: async () => {
                const trimmed = name.trim();
                if (!trimmed) return;
                const updatedPresets = presets.map(p => p.id === preset.id ? { ...p, name: trimmed } : p);
                setPresets(updatedPresets);
                await DataStore.set("SaveProfile_presets", updatedPresets);
                showToast(t("Profile configuration renamed."), Toasts.Type.SUCCESS);
            }
        });
    };

    return (
        <div className="vc-saveprofile-container">
            <div className="vc-saveprofile-header">
                <div style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%" }}>
                    <TextInput
                        value={newPresetName}
                        placeholder={t("Configuration Name (e.g. Work, Gaming, Halloween)...")}
                        onChange={setNewPresetName}
                        style={{ flex: 1 }}
                    />
                    <Button
                        onClick={handleSaveCurrentProfile}
                        disabled={isSaving || !newPresetName.trim()}
                    >
                        {isSaving ? t("Saving current profile...") : t("Save my profile")}
                    </Button>
                </div>
            </div>

            {!presets.length ? (
                <div className="vc-saveprofile-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h-2v-2h2Zm0-4h-2V7h2Z" />
                    </svg>
                    <div>
                        <BaseText tag="h4" size="md" weight="semibold">{t("No saved profiles yet")}</BaseText>
                        <BaseText size="sm" color="text-muted" style={{ marginTop: 4 }}>
                            {t("Enter a name above and click \"Save my profile\" to add your first backup!")}
                        </BaseText>
                    </div>
                </div>
            ) : (
                <div className="vc-saveprofile-grid">
                    {presets.map(preset => {
                        const hasTheme = !!(preset.themeColors && preset.themeColors.length >= 2) || !!preset.accentColor;
                        const cardClass = `vc-saveprofile-card${hasTheme ? " has-theme" : ""}`;

                        const cardStyle = preset.themeColors && preset.themeColors.length >= 2
                            ? { background: `linear-gradient(180deg, ${intToColor(preset.themeColors[0])} 0%, ${intToColor(preset.themeColors[1])} 100%)` }
                            : preset.accentColor
                                ? { background: `linear-gradient(180deg, ${intToColor(preset.accentColor)} 0%, var(--background-secondary) 100%)` }
                                : {};

                        const bannerStyle = preset.bannerDataUrl
                            ? { backgroundImage: `url(${preset.bannerDataUrl})` }
                            : preset.accentColor
                                ? { backgroundColor: intToColor(preset.accentColor) }
                                : { backgroundColor: "var(--background-tertiary)" };

                        const primaryColor = preset.themeColors?.[0] != null ? intToColor(preset.themeColors[0]) : null;
                        const secondaryColor = preset.themeColors?.[1] != null ? intToColor(preset.themeColors[1]) : null;

                        return (
                            <div className={cardClass} style={cardStyle} key={preset.id}>
                                <div className="vc-saveprofile-banner" style={bannerStyle}>
                                    <div className="vc-saveprofile-badge">{t("Config: ")}{preset.name}</div>
                                    <div className="vc-saveprofile-avatar-container">
                                        <img
                                            className="vc-saveprofile-avatar"
                                            src={preset.avatarDataUrl ?? IconUtils.getDefaultAvatarURL("0")}
                                            alt=""
                                            draggable={false}
                                        />
                                    </div>
                                </div>
                                <div className="vc-saveprofile-card-body">
                                    <div className="vc-saveprofile-name-row">
                                        <span className="vc-saveprofile-name">{preset.globalName}</span>
                                    </div>

                                    {preset.customStatus && (preset.customStatus.text || (preset.customStatus.emojiId && preset.customStatus.emojiId !== "0") || preset.customStatus.emojiName) && (
                                        <div className="vc-saveprofile-status">
                                            <StatusEmoji emojiId={preset.customStatus.emojiId} emojiName={preset.customStatus.emojiName} />
                                            <span className="vc-saveprofile-status-text">{preset.customStatus.text}</span>
                                        </div>
                                    )}

                                    {preset.bio ? (
                                        <div className="vc-saveprofile-bio">{preset.bio}</div>
                                    ) : (
                                        <div className="vc-saveprofile-bio" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>{t("No bio saved.")}</div>
                                    )}

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                                        {preset.themeColors && (
                                            <div className="vc-saveprofile-colors">
                                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("Colors:")}</span>
                                                {primaryColor && <div className="vc-saveprofile-color-dot" style={{ backgroundColor: primaryColor }} title={t("Primary Theme Color")} />}
                                                {secondaryColor && <div className="vc-saveprofile-color-dot" style={{ backgroundColor: secondaryColor }} title={t("Secondary Theme Color")} />}
                                            </div>
                                        )}
                                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                                            {new Date(preset.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <div className="vc-saveprofile-card-actions">
                                        <Button size="small" onClick={() => handleLoadProfile(preset)}>{t("Load")}</Button>
                                        <Button size="small" color="PRIMARY" onClick={() => handleRenameProfile(preset)}>{t("Rename")}</Button>
                                        <Button size="small" color="RED" onClick={() => handleDeleteProfile(preset.id)}>{t("Delete")}</Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export const settings = definePluginSettings({
    presetsManager: {
        type: OptionType.COMPONENT,
        component({ closePluginSettings }) {
            return (
                <ErrorBoundary>
                    <SaveProfileSettings closePluginSettings={closePluginSettings} />
                </ErrorBoundary>
            );
        }
    }
});

export default definePlugin({
    name: "SaveProfile",
    description: "Allows you to save and load profile backups, including global name, pfp, banner, status, nitro colors and bio.",
    authors: [{ name: "irritably",
     id: 928787166916640838n }],
    tags: ["Appearance", "Customisation", "Utility"],
    settings
});
