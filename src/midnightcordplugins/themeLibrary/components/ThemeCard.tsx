/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateId } from "@api/Commands";
import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { HeadingPrimary, HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import type { Theme, ThemeLikeProps } from "@midnightcordplugins/themeLibrary/types";
import { proxyLazy } from "@utils/lazy";
import { Margins } from "@utils/margins";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { User } from "@vencord/discord-types";
import { FluxDispatcher, Parser, React, UserStore, UserUtils } from "@webpack/common";
import { Constructor } from "type-fest";

import { LikesComponent } from "./LikesComponent";
import { ThemeInfoModal } from "./ThemeInfoModal";
import { apiUrl } from "./ThemeTab";

interface ThemeCardProps {
    theme: Theme;
    enabledThemeLinks: string[];
    likedThemes?: ThemeLikeProps;
    setEnabledThemeLinks: (links: string[]) => void;
    removePreview?: boolean;
    removeButtons?: boolean;
}

const UserRecord: Constructor<Partial<User>> = proxyLazy(() => UserStore.getCurrentUser().constructor) as any;

function makeDummyUser(user: { username: string; id?: string; avatar?: string; }) {
    const newUser = new UserRecord({
        username: user.username,
        id: user.id ?? generateId(),
        avatar: user.avatar,
        bot: true,
    });
    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: newUser,
    });
    return newUser;
}

export const ThemeCard: React.FC<ThemeCardProps> = ({ theme, enabledThemeLinks, likedThemes, setEnabledThemeLinks, removeButtons, removePreview }) => {

    const getUser = (id: string, username: string) => UserUtils.getUser(id) ?? makeDummyUser({ username, id });

    const handleAddRemoveTheme = () => {
        const themeUrl = `${apiUrl}/${theme.id}`;
        const isEnabled = enabledThemeLinks.includes(themeUrl);

        if (isEnabled) {
            // Remove from enabledThemeLinks (ThemeLibrary source of truth)
            const nextEnabled = enabledThemeLinks.filter(link => link !== themeUrl);
            setEnabledThemeLinks(nextEnabled);
            Settings.enabledThemeLinks = nextEnabled;
            // Also remove from themeLinks to keep both arrays in sync and avoid
            // the theme re-appearing through the Online Themes tab.
            Settings.themeLinks = Settings.themeLinks.filter(link => link !== themeUrl);
            return;
        }

        // Add to enabledThemeLinks only — Themes.ts merges both arrays automatically.
        // We intentionally do NOT add to themeLinks here to avoid duplicates.
        const nextEnabled = [...enabledThemeLinks, themeUrl];
        setEnabledThemeLinks(nextEnabled);
        Settings.enabledThemeLinks = nextEnabled;
    };

    const handleThemeAttributesCheck = () => {
        const requiresThemeAttributes = theme.requiresThemeAttributes ?? false;

        if (requiresThemeAttributes && !Settings.plugins.ThemeAttributes?.enabled) {
            openModal(modalProps => (
                <ModalRoot {...modalProps} size={ModalSize.SMALL}>
                    <ModalHeader>
                        <HeadingTertiary>Hold on!</HeadingTertiary>
                    </ModalHeader>
                    <ModalContent>
                        <Paragraph style={{ padding: "8px" }}>
                            <p>This theme requires the <b>ThemeAttributes</b> plugin to work properly!</p>
                            <p>Do you want to enable it?</p>
                        </Paragraph>
                    </ModalContent>
                    <ModalFooter>
                        <Button
                            variant="positive"
                            onClick={() => {
                                if (!Settings.plugins.ThemeAttributes) {
                                    modalProps.onClose();
                                    return;
                                }
                                Settings.plugins.ThemeAttributes.enabled = true;
                                modalProps.onClose();
                                handleAddRemoveTheme();
                            }}
                        >
                            Enable Plugin
                        </Button>
                        <Button
                            variant="dangerPrimary"
                            className={Margins.right8}
                            onClick={() => modalProps.onClose()}
                        >
                            Cancel
                        </Button>
                    </ModalFooter>
                </ModalRoot>
            ));
        } else {
            handleAddRemoveTheme();
        }
    };

    const handleViewSource = () => {
        if (theme.source) {
            VencordNative.native.openExternal(theme.source);
        } else {
            VencordNative.native.openExternal(`${apiUrl}/${theme.id}`);
        }
    };

    return (
        <Card style={{ padding: ".5rem", marginBottom: ".5em", marginTop: ".5em", display: "flex", flexDirection: "column", backgroundColor: "var(--background-base-lower-alt)" }} key={theme.id}>
            <HeadingPrimary style={{ overflowWrap: "break-word", marginTop: "8px" }} className="vce-theme-text-title">
                {theme.name}
            </HeadingPrimary>
            <Paragraph className="vce-theme-text-description">
                {Parser.parse(theme.description)}
            </Paragraph>
            {!removePreview && (
                <img role="presentation" src={theme.thumbnail_url} loading="lazy" alt={theme.name} className="vce-theme-info-preview" />
            )}
            <div className="vce-theme-info">
                <div style={{ justifyContent: "flex-start", flexDirection: "column" }}>
                    {theme.tags && (
                        <Paragraph>
                            {theme.tags.map(tag => (
                                <span className="vce-theme-info-tag" key={tag}>
                                    {tag}
                                </span>
                            ))}
                        </Paragraph>
                    )}
                    {!removeButtons && (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "row" }}>
                            <Button
                                onClick={handleThemeAttributesCheck}
                                size="medium"
                                variant={enabledThemeLinks.includes(`${apiUrl}/${theme.id}`) ? "dangerPrimary" : "positive"}
                                className={Margins.right8}
                                disabled={theme.id === "preview"}
                            >
                                {enabledThemeLinks.includes(`${apiUrl}/${theme.id}`) ? "Remove Theme" : "Add Theme"}
                            </Button>
                            <Button
                                onClick={async () => {
                                    const authors = Array.isArray(theme.author)
                                        ? await Promise.all(theme.author.map(author => getUser(author.discord_snowflake, author.discord_name)))
                                        : [await getUser(theme.author.discord_snowflake, theme.author.discord_name)];

                                    openModal(props => <ThemeInfoModal {...props} author={authors} theme={theme} />);
                                }}
                                size="medium"
                                className={Margins.right8}
                            >
                                Theme Info
                            </Button>
                            <LikesComponent themeId={theme.id} likedThemes={likedThemes} />
                            <Button
                                onClick={handleViewSource}
                                size="medium"
                                variant="link"
                                disabled={theme.id === "preview"}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                                View Source
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Card >
    );
};
