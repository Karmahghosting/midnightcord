import { t } from "../autoTranslateMidnightcord";
/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { Logger } from "@utils/Logger";
import definePlugin, { ReporterTestable } from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { Menu, showToast, Toasts } from "@webpack/common";
import type { ReactElement } from "react";

import { openSecureBookmarksModal, renderSecureBookmarksToolboxMenu } from "./components";
import { settings } from "./settings";
import { DURATIONS, prepareBookmarks, saveMessageBookmark } from "./store";

const logger = new Logger("SecureBookmarks");

interface MessageContextMenuProps {
    message?: Message;
}

function BookmarkIcon({ width = 24, height = 24 }: { width?: number; height?: number; }) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" viewBox="0 0 24 24">
            <path fill="currentColor" fillRule="evenodd" d="M15 2a3 3 0 0 1 3 3v12H5.5a1.5 1.5 0 0 0 0 3h14a.5.5 0 0 0 .5-.5V5h1a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h10Zm-.3 5.7a1 1 0 0 0-1.4-1.4L9 10.58l-2.3-2.3a1 1 0 0 0-1.4 1.42l3 3a1 1 0 0 0 1.4 0l5-5Z" clipRule="evenodd" />
        </svg>
    );
}

function SecureBookmarksButton() {
    return (
        <HeaderBarButton
            icon={BookmarkIcon}
            tooltip={t("SecureBookmarks")}
            onClick={openSecureBookmarksModal}
        />
    );
}

function addBookmarkMenu(children: Array<ReactElement | null>, props: MessageContextMenuProps): void {
    const { message } = props;
    if (!message) return;

    const index = children.length > 2 ? children.length - 2 : 0;
    children.splice(index, 0,
        <Menu.MenuGroup key="secure-bookmarks-group">
            <Menu.MenuItem
                id="secure-bookmarks-save"
                key="secure-bookmarks-save"
                label="Save to SecureBookmarks"
            >
                {DURATIONS.map(duration => (
                    <Menu.MenuItem
                        id={`secure-bookmarks-save-${duration.value}`}
                        key={duration.value}
                        label={duration.label}
                        action={() => {
                            void saveMessageBookmark(message, duration).catch(error => {
                                logger.error("Failed to save bookmark.", error);
                                showToast("Could not save this bookmark.", Toasts.Type.FAILURE);
                            });
                        }}
                    />
                ))}
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
}

export default definePlugin({
    name: "SecureBookmarks",
    description: "Saves encrypted message bookmarks from the message context menu.",
    tags: ["Chat", "Privacy", "Utility"],
    authors: [{ name: "irritably",
     id: 928787166916640838n }],
    dependencies: ["HeaderBarAPI"],
    reporterTestable: ReporterTestable.None,
    settings,

    contextMenus: {
        message: addBookmarkMenu
    },

    toolboxActions() {
        return renderSecureBookmarksToolboxMenu();
    },

    start() {
        void prepareBookmarks().catch(error => logger.error("Failed to prepare bookmarks.", error));
        addHeaderBarButton("secure-bookmarks-btn", () => <SecureBookmarksButton />, 9);
    },

    stop() {
        removeHeaderBarButton("secure-bookmarks-btn");
    }
});

