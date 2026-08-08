/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { detailedPluginDescriptions } from "@api/detailedPluginDescriptions";
import { t } from "@api/i18n";
import { showNotice } from "@api/Notices";
import { getStoredToken } from "@api/OAuth2";
import { tPlugin } from "@api/pluginI18n";
import { fetchPluginRatings, PluginLikeData,togglePluginLike } from "@api/PluginLikes";
import { LIKE_AUTH_EVENT } from "@api/PluginLikesAuth";
import { isPluginEnabled, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { Button } from "@components/Button";
import { HeadingPrimary } from "@components/Heading";
import { CogWheel } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize,openModal } from "@utils/modal";
import { OptionType, Plugin } from "@utils/types";
import { React, showToast, Text, Toasts, Tooltip, UserStore } from "@webpack/common";
import { Settings } from "Vencord";

import { PluginMeta } from "~plugins";

import { openPluginModal } from "./PluginModal";
import { getTutorialVideoName } from "./tutorialList";

export function removeEmojis(text: string): string {
    if (!text) return "";
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2B50}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{E000}-\u{F8FF}]/gu, "")
        .replace(/  +/g, " ")
        .trim();
}

const logger = new Logger("PluginCard");
const cl = classNameFactory("vc-plugins-");

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled?: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    hasTutorial?: boolean;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export function PluginCard({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew, hasTutorial }: PluginCardProps) {
    const settings = Settings.plugins[plugin.name];
    const isEnabled = () => isPluginEnabled(plugin.name);

    const [likeData, setLikeData] = React.useState<PluginLikeData | null>(null);
    const [likeLoading, setLikeLoading] = React.useState(false);
    const [isLoggedIn, setIsLoggedIn] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const token = await getStoredToken();
            if (cancelled) return;
            setIsLoggedIn(!!token);
            const ratings = await fetchPluginRatings();
            if (cancelled) return;
            setLikeData(ratings[plugin.name] ?? { likes: 0, likedByMe: false });
        };
        load();
        window.addEventListener(LIKE_AUTH_EVENT, load);
        return () => {
            cancelled = true;
            window.removeEventListener(LIKE_AUTH_EVENT, load);
        };
    }, [plugin.name]);

    async function handleLike(e: React.MouseEvent) {
        e.stopPropagation();
        if (!isLoggedIn || likeLoading) return;
        setLikeLoading(true);
        // Optimistic update
        setLikeData(prev => prev ? {
            likes: prev.likedByMe ? prev.likes - 1 : prev.likes + 1,
            likedByMe: !prev.likedByMe,
        } : null);
        const result = await togglePluginLike(plugin.name);
        if (result) setLikeData(result);
        setLikeLoading(false);
    }

    function doToggleEnabled() {
        const wasEnabled = isEnabled();

        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                return;
            }

            if (restartNeeded) {
                settings.enabled = true;
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        if (pluginRequiresRestart(plugin)) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        if (wasEnabled && !plugin.started) {
            settings.enabled = !wasEnabled;
            return;
        }

        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

        if (!result) {
            settings.enabled = false;

            const msg = `Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`;
            showToast(msg, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM,
            });

            return;
        }

        settings.enabled = !wasEnabled;
    }

    function toggleEnabled() {
        const wasEnabled = isEnabled();
        if (!wasEnabled && plugin.name.toLowerCase() === "autoresponder") {
            openModal(props => (
                <ModalRoot {...props} size={ModalSize.SMALL}>
                    <ModalHeader separator={false}>
                        <Text variant="heading-lg/semibold">{t("Autoresponder Warning")}</Text>
                        <ModalCloseButton onClick={props.onClose} />
                    </ModalHeader>
                    <ModalContent>
                        <Text variant="text-md/normal" style={{ marginBottom: 16 }}>
                            {t("Are you sure you want to enable the Autoresponder plugin? An AI will automatically reply to your DMs when you are unavailable.")}
                        </Text>
                    </ModalContent>
                    <div style={{ padding: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <Button
                            variant="link"
                            onClick={props.onClose}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => {
                                props.onClose();
                                doToggleEnabled();
                            }}
                        >
                            {t("Enable")}
                        </Button>
                    </div>
                </ModalRoot>
            ));
            return;
        }
        doToggleEnabled();
    }

    const openTutorialVideo = (e: React.MouseEvent) => {
        e.stopPropagation();
        // The video filename on disk does not always exactly match plugin.name
        // (case differences, or a handful of fully different names), so resolve it
        // through the mapping instead of assuming they are identical. Also always
        // URL-encode the segment since some filenames contain spaces (e.g. "Fake Voice Option.mp4").
        const videoName = getTutorialVideoName(plugin.name) ?? plugin.name;
        const videoUrl = `https://raw.githubusercontent.com/Karmahghosting/midnightcord/main/tutorials/${encodeURIComponent(videoName)}.mp4`;
        openModal(props => (
            <ModalRoot {...props} size={ModalSize.DYNAMIC} className="nc-tutorial-modal">
                <ModalHeader separator={false}>
                    <Text variant="heading-xl/bold" style={{ flex: 1, color: "#fff" }}>
                        {plugin.name} – Tutorial
                    </Text>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>
                <ModalContent>
                    <div style={{ padding: "0 16px 16px" }}>
                        <video
                            src={videoUrl}
                            controls
                            autoPlay
                            style={{
                                width: "100%",
                                borderRadius: "8px",
                                background: "#000",
                            }}
                            onError={e => {
                                const el = e.currentTarget;
                                el.style.display = "none";
                                const msg = el.parentElement?.querySelector(".nc-video-error") as HTMLElement;
                                if (msg) msg.style.display = "flex";
                            }}
                        />
                        <div
                            className="nc-video-error"
                            style={{
                                display: "none",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "48px 24px",
                                color: "var(--text-muted)",
                                gap: "8px",
                            }}
                        >
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="var(--text-muted)" />
                            </svg>
                            <Text variant="text-md/medium">{t("No video tutorial available for this plugin.")}</Text>
                        </div>
                    </div>
                </ModalContent>
            </ModalRoot>
        ));
    };

    const sourceBadge = (
        <Tooltip text={t("Show Tutorial")}>
            {({ onMouseEnter, onMouseLeave }) => (
                <button
                    className="nc-badge-btn"
                    onClick={openTutorialVideo}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                </button>
            )}
        </Tooltip>
    );

    const likeTooltip = !isLoggedIn ? t("Sign in to like plugins") : likeData?.likedByMe ? t("Unlike") : t("Like");
    const canLike = isLoggedIn && !likeLoading;

    const likeBadge = (
        <Tooltip text={likeTooltip}>
            {({ onMouseEnter, onMouseLeave }) => (
                <button
                    className={[
                        "nc-badge-btn",
                        likeData?.likedByMe && "nc-badge-liked",
                        !isLoggedIn && "nc-badge-btn-disabled",
                    ].filter(Boolean).join(" ")}
                    onClick={e => { if (canLike) handleLike(e); else e.stopPropagation(); }}
                    aria-disabled={!canLike}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    {likeData?.likedByMe ? (
                        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M12.47 21.73a.92.92 0 0 1-.94 0C9.43 20.48 1 15.09 1 8.75A5.75 5.75 0 0 1 6.75 3c2.34 0 3.88.9 5.25 2.26A6.98 6.98 0 0 1 17.25 3 5.75 5.75 0 0 1 23 8.75c0 6.34-8.42 11.73-10.53 12.98Z" />
                        </svg>
                    ) : (
                        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                            <path fill="currentColor" fillRule="evenodd" d="M12 8.07 10.6 6.7A5 5 0 0 0 6.75 5 3.75 3.75 0 0 0 3 8.75c0 2.32 1.59 4.76 3.87 6.96A31.87 31.87 0 0 0 12 19.67c1.2-.74 3.26-2.14 5.13-3.96 2.28-2.2 3.87-4.64 3.87-6.96A3.75 3.75 0 0 0 17.25 5a5 5 0 0 0-3.85 1.69L12 8.07Zm0-2.8A6.98 6.98 0 0 0 6.75 3 5.75 5.75 0 0 0 1 8.75c0 6.34 8.42 11.73 10.53 12.98.29.17.65.17.94 0C14.57 20.48 23 15.09 23 8.75A5.75 5.75 0 0 0 17.25 3c-2.34 0-3.88.9-5.25 2.26Z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            )}
        </Tooltip>
    );

    const openInfoModal = (e: React.MouseEvent) => {
        e.stopPropagation();
        const rawDesc = plugin.detailedDescription
            ? tPlugin(plugin.detailedDescription)
            : (detailedPluginDescriptions[plugin.name] ? tPlugin(detailedPluginDescriptions[plugin.name]) : tPlugin(plugin.description));
        const cleanDesc = removeEmojis(rawDesc);

        openModal(props => (
            <ModalRoot {...props} size={ModalSize.SMALL}>
                <ModalHeader separator={false}>
                    <Text variant="heading-xl/bold" style={{ flex: 1, color: "#fff" }}>
                        {removeEmojis(plugin.name)}
                    </Text>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>
                <ModalContent>
                    <div style={{ padding: "0 16px 16px" }}>
                        <Text variant="text-md/medium" color="text-normal" style={{ whiteSpace: "pre-wrap" }}>
                            {cleanDesc}
                        </Text>
                    </div>
                </ModalContent>
            </ModalRoot>
        ));
    };

    const infoBadge = (
        <Tooltip text={t("Plugin Info")}>
            {({ onMouseEnter, onMouseLeave }) => (
                <button
                    className="nc-badge-btn"
                    onClick={openInfoModal}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <svg className="vc-ic-save-icon" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="transparent" />
                        <path fill="currentColor" fillRule="evenodd" d="M12 23a11 11 0 1 0 0-22 11 11 0 0 0 0 22Zm-.28-16c-.98 0-1.81.47-2.27 1.14A1 1 0 1 1 7.8 7.01 4.73 4.73 0 0 1 11.72 5c2.5 0 4.65 1.88 4.65 4.38 0 2.1-1.54 3.77-3.52 4.24l.14 1a1 1 0 0 1-1.98.27l-.28-2a1 1 0 0 1 .99-1.14c1.54 0 2.65-1.14 2.65-2.38 0-1.23-1.1-2.37-2.65-2.37ZM13 17.88a1.13 1.13 0 1 1-2.25 0 1.13 1.13 0 0 1 2.25 0Z" clipRule="evenodd" />
                    </svg>
                </button>
            )}
        </Tooltip>
    );

    const isMidnightcord = !PluginMeta[plugin.name]?.userPlugin;
    const iconType = isMidnightcord ? "midnightcord" : "other";

    // Le système de like ne s'applique qu'aux plugins Midnightcord (pas Vencord/Equicord,
    // pas User Plugins), et jamais aux plugins required (y compris ceux affichés comme
    // required parce qu'une dépendance active en a besoin, d'où le check sur `disabled`).
    const isMidnightcordFolderPlugin = PluginMeta[plugin.name]?.folderName?.startsWith("src/midnightcordplugins/") ?? false;
    const canShowLikeBadge = isMidnightcordFolderPlugin && !plugin.required && !disabled;

    function openCreditsModal() {
        openModal(props => (
            <ModalRoot {...props} size={ModalSize.SMALL}>
                <ModalHeader>
                    <HeadingPrimary>Credits - {removeEmojis(plugin.name)}</HeadingPrimary>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>
                <ModalContent style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" } as any}>
                    {isMidnightcord ? (
                        <a href="https://github.com/Karmahghosting/midnightcord" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none", color: "var(--text-normal)", fontSize: "20px", fontWeight: 600 }}>
                            Midnightcord
                        </a>
                    ) : (
                        plugin.authors?.map(a => {
                            const user = UserStore.getUser(a.id.toString());
                            const avatarUrl = user ? user.getAvatarURL(undefined, 128) : `https://cdn.discordapp.com/avatars/${a.id}/${a.id}.png`;
                            return (
                                <div key={a.id.toString()} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "20px", fontWeight: 600, color: "var(--text-normal)" }}>
                                    <img src={avatarUrl} alt={a.name} style={{ width: 64, height: 64, borderRadius: "50%" }} />
                                    <span>{a.name}</span>
                                </div>
                            );
                        })
                    )}
                </ModalContent>
            </ModalRoot>
        ));
    }

    const hasSettings = !!plugin.settingsAboutComponent || (plugin.settings?.def && Object.values(plugin.settings.def).some(s => s.type !== OptionType.CUSTOM && !s.hidden));

    const PluginIcon = plugin.headerBarButton?.icon ||
                       plugin.chatBarButton?.icon ||
                       plugin.messagePopoverButton?.icon ||
                       plugin.userAreaButton?.icon;

    return (
        <AddonCard
            name={plugin.name}
            iconType={iconType}
            customIcon={PluginIcon}
            sourceBadge={<>{hasTutorial && sourceBadge}{canShowLikeBadge && likeBadge}</>}
            description={tPlugin(plugin.description)}
            isNew={isNew}
            enabled={isEnabled()}
            setEnabled={plugin.required ? () => { } : toggleEnabled}
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            infoButton={
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {(plugin.name === "DynamicIslande" || plugin.name === "StereoInstaller" || plugin.name === "ClientDiagnostics" || plugin.name === "SecureBookmarks" || plugin.name === "StatusCycler" || plugin.name === "Surveillance" || plugin.name === "MutualScanner") && (
                        <Tooltip text="This plugin comes from our partner (Illegalcord) then was modified by Midnightcord.">
                            {({ onMouseEnter, onMouseLeave }) => (
                                <button
                                    role="button"
                                    className={cl("info-button")}
                                    onMouseEnter={onMouseEnter}
                                    onMouseLeave={onMouseLeave}
                                    onClick={() => window.open("https://github.com/ImHisako/Illegalcord", "_blank")}
                                >
                                    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM18.44 17.27c.15.43.54.73 1 .73h1.06c.83 0 1.5-.67 1.5-1.5a7.5 7.5 0 0 0-6.5-7.43c-.55-.08-.99.38-1.1.92-.06.3-.15.6-.26.87-.23.58-.05 1.3.47 1.63a9.53 9.53 0 0 1 3.83 4.78ZM12.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 20.5a7.5 7.5 0 0 1 15 0c0 .83-.67 1.5-1.5 1.5a.2.2 0 0 1-.2-.16c-.2-.96-.56-1.87-.88-2.54-.1-.23-.42-.15-.42.1v2.1a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5Z" />
                                    </svg>
                                </button>
                            )}
                        </Tooltip>
                    )}
                    {hasSettings && (
                        <button
                            role="button"
                            onClick={() => openPluginModal(plugin, onRestartNeeded)}
                            className={cl("info-button")}
                        >
                            <CogWheel className={cl("info-icon")} width={20} height={20} />
                        </button>
                    )}
                </div>
            } />
    );
}
