/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { SettingsAbout } from "./components/Modals";

export default definePlugin({
    name: "IconViewer",
    enabledByDefault: true,
    description: "Adds a new tab to settings to preview all icons.",
    authors: [Devs.iamme],
    dependencies: ["Settings"],
    startAt: StartAt.WebpackReady,
    toolboxActions: {
        "Open Icons Tab"() {
            SettingsRouter.openUserSettings("equicord_icon_viewer_panel");
        },
    },
    settingsAboutComponent: SettingsAbout,
});
