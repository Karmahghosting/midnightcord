/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ShieldIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { Menu, React } from "@webpack/common";
import type { ReactNode } from "react";

import { openServerReport, stopReports } from "./reporting";

const MENU_ID = "midnightcord-report-server";
const reportIds = new Set([MENU_ID, "report", "report-server", "report-guild", "server-report", "guild-report"]);

function hasReportEntry(node: ReactNode): boolean {
    if (Array.isArray(node)) return node.some(hasReportEntry);
    if (!React.isValidElement<{ id?: unknown; children?: ReactNode; }>(node)) return false;

    const { id, children } = node.props;
    // Labels are translated by Discord. Check stable IDs instead, including our own entry.
    // Other server-report IDs are defensive compatibility checks, not required dependencies.
    if (typeof id === "string" && reportIds.has(id.replace(/([a-z])([A-Z])/g, "$1-$2").replaceAll("_", "-").toLowerCase())) return true;
    return children != null && hasReportEntry(children);
}

const patchServerMenu: NavContextMenuPatchCallback = (children, props) => {
    const guild = props?.guild;
    if (!Array.isArray(children) || typeof guild?.id !== "string" || !/^[1-9]\d{16,19}$/.test(guild.id) || hasReportEntry(children)) return;

    // Capture only the selected server. Rendering/opening this menu does not send a report.
    const target = { id: guild.id, name: typeof guild.name === "string" && guild.name.trim() ? guild.name : "Serveur Discord" };
    children.push(
        <Menu.MenuGroup key="midnightcord-report-server-group">
            <Menu.MenuItem
                id={MENU_ID}
                label="Signaler le serveur"
                iconLeft={ShieldIcon}
                leadingAccessory={{ type: "icon", icon: ShieldIcon }}
                action={() => openServerReport(target)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "ReportServer",
    description: "Ajoute le signalement d’un serveur aux menus Discord sur ordinateur.",
    authors: [{ name: "Midnightcord", id: 0n }],
    tags: ["Servers", "Utility"],
    searchTerms: ["signalement", "report", "serveur", "guild"],
    enabledByDefault: true,
    stop: stopReports,
    contextMenus: {
        "guild-context": patchServerMenu,
        "guild-header-popout": patchServerMenu
    }
});
