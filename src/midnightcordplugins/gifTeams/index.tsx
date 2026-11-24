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
import FoldersModal from "./FoldersModal";
import { PickerTools, renderFolderContent } from "./picker";
import { settings } from "./settings";
import TeamsModal from "./TeamsModal";

let active = false;
let modalKey: string | undefined;
let foldersModalKey: string | undefined;

export function openGifFolders() {
    if (!active || foldersModalKey) return;
    foldersModalKey = openModal(props => <ErrorBoundary><FoldersModal {...props} /></ErrorBoundary>, {
        onCloseCallback: () => { foldersModalKey = undefined; }
    });
}

export function openGifTeams() {
    if (!active || modalKey) return;
    modalKey = openModal(props => <ErrorBoundary><TeamsModal {...props} onFolders={openGifFolders} /></ErrorBoundary>, {
        onCloseCallback: () => { modalKey = undefined; }
    });
}

const TeamsButton: ChatBarButtonFactory = ({ isAnyChat, disabled }) => isAnyChat && !disabled
    ? <ChatBarButton tooltip="Teams GIF" onClick={openGifTeams}><ImageIcon /></ChatBarButton>
    : null;

export default definePlugin({
    name: "GifTeams",
    description: "Recevez les GIF de vos teams dans vos favoris Discord et partagez tous vos GIF, un dossier ou une sélection.",
    authors: [{ name: "Midnightcord", id: 0n }],
    tags: ["Media", "Chat"],
    searchTerms: ["gif", "team", "favoris", "partage", "groupe", "dossier", "folder"],
    enabledByDefault: false,
    dependencies: ["ChatInputButtonAPI"],
    settings,
    chatBarButton: { icon: ImageIcon, render: TeamsButton },
    settingsAboutComponent: () => <div className="vc-gif-teams-settings"><p>Organisez vos favoris dans des dossiers sur cet appareil. Pour chaque team, partagez tous vos favoris, un dossier ou une sélection. Les dossiers sont aussi accessibles dans le sélecteur de GIF.</p><div className="vc-gif-teams-actions"><Button disabled={!active} onClick={openGifFolders}>Mes dossiers de GIF</Button><Button disabled={!active} onClick={openGifTeams}>Ouvrir mes teams GIF</Button></div></div>,
    toolboxActions: { "Teams GIF": openGifTeams, "Dossiers de GIF": openGifFolders },
    patches: [{
        find: "renderHeaderContent()",
        replacement: [{
            match: "this.renderHeaderContent()",
            replace: "$self.renderPickerHeader(this,this.renderHeaderContent())"
        }, {
            match: "this.renderContent()",
            replace: "$self.renderPickerContent(this,this.renderContent())"
        }]
    }],
    renderPickerHeader(picker, original: ReactNode) {
        return <>{original}<ErrorBoundary noop><PickerTools picker={picker} onFolders={openGifFolders} /></ErrorBoundary></>;
    },
    renderPickerContent: renderFolderContent,
    start() { active = true; gifTeams.start(); },
    stop() {
        active = false;
        gifTeams.stop();
        if (modalKey) closeModal(modalKey);
        if (foldersModalKey) closeModal(foldersModalKey);
        modalKey = undefined;
        foldersModalKey = undefined;
    }
});
