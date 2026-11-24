/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { ImageIcon } from "@components/Icons";
import { closeModal, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { React } from "@webpack/common";
import type { ReactNode } from "react";

import { gifTeams } from "./controller";
import TeamsModal from "./TeamsModal";

let active = false;
let modalKey: string | undefined;

export function openGifTeams() {
    if (!active || modalKey) return;
    modalKey = openModal(props => <ErrorBoundary><TeamsModal {...props} /></ErrorBoundary>, {
        onCloseCallback: () => { modalKey = undefined; }
    });
}

const TeamsButton: ChatBarButtonFactory = ({ isAnyChat, disabled }) => isAnyChat && !disabled
    ? <ChatBarButton tooltip="Teams GIF" onClick={openGifTeams}><ImageIcon /></ChatBarButton>
    : null;

export default definePlugin({
    name: "GifTeams",
    description: "Partagez vos GIF favoris avec vos teams : tous automatiquement, ou seulement votre sélection.",
    authors: [{ name: "Midnightcord", id: 0n }],
    tags: ["Media", "Chat"],
    searchTerms: ["gif", "team", "favoris", "partage", "groupe"],
    enabledByDefault: false,
    dependencies: ["ChatInputButtonAPI"],
    chatBarButton: { icon: ImageIcon, render: TeamsButton },
    settingsAboutComponent: () => <div className="vc-gif-teams-settings"><p>Créez des teams privées et choisissez, pour chacune, les favoris que vous partagez. Le bouton Teams GIF est aussi disponible à côté de la zone de message.</p><Button disabled={!active} onClick={openGifTeams}>Ouvrir mes teams GIF</Button></div>,
    toolboxActions: { "Teams GIF": openGifTeams },
    patches: [{
        find: "renderHeaderContent()",
        replacement: {
            match: "this.renderHeaderContent()",
            replace: "$self.renderPickerHeader(this.renderHeaderContent())"
        }
    }],
    renderPickerHeader(original: ReactNode) {
        return <>{original}<ErrorBoundary noop><Button size="small" variant="secondary" className="vc-gif-teams-picker-shortcut" onClick={openGifTeams}><ImageIcon width={16} height={16} />Teams</Button></ErrorBoundary></>;
    },
    start() { active = true; gifTeams.start(); },
    stop() {
        active = false;
        gifTeams.stop();
        if (modalKey) closeModal(modalKey);
        modalKey = undefined;
    }
});
