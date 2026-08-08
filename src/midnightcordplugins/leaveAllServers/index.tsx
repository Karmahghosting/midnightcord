/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { t } from "../autoTranslateMidnightcord";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Forms, Menu, React, showToast, Toasts, GuildStore, UserStore, IconUtils } from "@webpack/common";

const { useState, useEffect, useMemo } = React;

const GuildActions = findByPropsLazy("leaveGuild");

interface GuildEntry {
    id: string;
    name: string;
    icon: string | null;
    ownerId: string;
}

const settings = definePluginSettings({
    safeMode: {
        description: "Do not show or select servers you own",
        type: OptionType.BOOLEAN,
        default: true
    }
});

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
            <path d="M21.71 20.29l-5.01-5.01A7.94 7.94 0 0 0 18 10a8 8 0 1 0-8 8 7.94 7.94 0 0 0 5.28-1.3l5.01 5.01a1 1 0 0 0 1.42-1.42ZM4 10a6 6 0 1 1 6 6 6 6 0 0 1-6-6Z" />
        </svg>
    );
}

function LeaveAllServersModal({ rootProps }: { rootProps: any; }) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
    const [progress, setProgress] = useState("");
    const [currentIdx, setCurrentIdx] = useState(0);

    const myId = useMemo(() => UserStore?.getCurrentUser()?.id, []);

    const allGuilds = useMemo<GuildEntry[]>(() => {
        const raw = GuildStore?.getGuilds?.() ?? {};
        return (Object.values(raw) as GuildEntry[]).sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    // Exclure les serveurs owned si safeMode
    const availableGuilds = useMemo(() =>
        settings.store.safeMode ? allGuilds.filter(g => g.ownerId !== myId) : allGuilds,
        [allGuilds, myId]
    );

    const filtered = useMemo(() => {
        if (!search.trim()) return availableGuilds;
        const q = search.toLowerCase();
        return availableGuilds.filter(g => g.name.toLowerCase().includes(q));
    }, [availableGuilds, search]);

    // Sélectionner tout par défaut
    useEffect(() => {
        setSelected(new Set(availableGuilds.map(g => g.id)));
    }, [availableGuilds]);

    const toggleGuild = (id: string) => {
        if (status === "running") return;
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(availableGuilds.map(g => g.id)));
    const selectNone = () => setSelected(new Set());

    const handleLeave = async () => {
        if (selected.size === 0) return;
        setStatus("running");
        const ids = Array.from(selected);
        let count = 0;

        for (let i = 0; i < ids.length; i++) {
            const guild = GuildStore.getGuild(ids[i]);
            if (!guild) continue;
            setCurrentIdx(i + 1);
            setProgress(`[${i + 1}/${ids.length}] Leaving: ${guild.name}...`);
            try {
                await GuildActions.leaveGuild(ids[i]);
                count++;
            } catch (e) {
                console.error(`[LeaveAllServers] Failed to leave ${guild.name}:`, e);
            }
            await new Promise(r => setTimeout(r, 800));
        }

        setStatus("done");
        setProgress(`${count} server${count > 1 ? "s" : ""} left successfully`);
        showToast(`${count} servers left successfully!`, Toasts.Type.SUCCESS);
    };

    function getGuildIcon(g: GuildEntry) {
        if (g.icon) return IconUtils?.getGuildIconURL({ id: g.id, icon: g.icon, size: 64 });
        return null;
    }

    const pct = selected.size > 0 && status === "running"
        ? Math.round((currentIdx / selected.size) * 100) : 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
                    {t("Leave All Servers")}
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="las-content">

                {/* Barre de recherche */}
                <div className="las-search-bar">
                    <SearchIcon />
                    <input
                        className="las-search-input"
                        type="text"
                        placeholder={t("Search a server...")}
                        value={search}
                        onChange={e => setSearch(e.currentTarget.value)}
                        autoFocus
                    />
                    {search && (
                        <button className="las-search-clear" onClick={() => setSearch("")}>✕</button>
                    )}
                </div>

                {/* Header liste + boutons tout/rien */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Forms.FormTitle tag="h5" className="las-label">{t("SELECT SERVERS")}</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button className="las-mini-btn" onClick={selectAll} disabled={status === "running"}>{t("All")}</button>
                        <button className="las-mini-btn" onClick={selectNone} disabled={status === "running"}>{t("None")}</button>
                    </div>
                </div>

                {/* Liste serveurs */}
                <div className="las-guild-list">
                    {filtered.length === 0 && (
                        <div className="las-empty">
                            {search ? t("No results for \"{search}\"").replace("{search}", search) : t("No servers found")}
                        </div>
                    )}
                    {filtered.map(g => {
                        const av = getGuildIcon(g);
                        const isSel = selected.has(g.id);
                        return (
                            <div
                                key={g.id}
                                className={`las-guild-row ${isSel ? "las-guild-row--selected" : ""}`}
                                onClick={() => toggleGuild(g.id)}
                            >
                                {av
                                    ? <img src={av} className="las-avatar" alt="" />
                                    : <div className="las-avatar-placeholder">{g.name.replace(/\s+/g, "").slice(0, 2).toUpperCase()}</div>
                                }
                                <span className="las-guild-name">{g.name}</span>
                                {isSel && <span className="las-check">✓</span>}
                            </div>
                        );
                    })}
                </div>

                {/* Status */}
                {status !== "idle" && (
                    <div className={`las-status las-status--${status}`}>{progress}</div>
                )}

                {/* Compteur */}
                <div className="las-footer-info">
                    <span>{t("{count} servers selected").replace("{count}", selected.size.toString())}</span>
                    {settings.store.safeMode && (
                        <span className="las-safe-note">{t("· Safe mode active (owners excluded)")}</span>
                    )}
                </div>

                {/* Bouton principal */}
                <button
                    className="las-leave-btn"
                    onClick={handleLeave}
                    disabled={selected.size === 0 || status === "running"}
                >
                    {status === "running"
                        ? t("In progress... ({pct}%)").replace("{pct}", pct.toString())
                        : t("Leave {count} servers").replace("{count}", selected.size.toString())}
                </button>

            </ModalContent>
        </ModalRoot>
    );
}

const patchGuildContext: NavContextMenuPatchCallback = (children, { guild }) => {
    if (!children || !Array.isArray(children)) return;
    try {
        if (!guild) return;

        const group = findGroupChildrenByChildId("leave-guild", children) ?? children;
        const item = (
            <Menu.MenuItem
                id="leave-all-servers"
                key="leave-all-servers"
                label={t("Leave All Servers")}
                color="danger"
                action={() => openModal(props => <LeaveAllServersModal rootProps={props} />)}
            />
        );

        if (Array.isArray(group)) {
            const idx = group.findIndex((c: any) => c?.props?.id === "leave-guild");
            if (idx >= 0) {
                group.splice(idx + 1, 0, item);
            } else {
                group.push(item);
            }
        }
    } catch (e) {
        console.error("[LeaveAllServers] Context menu patch error:", e);
    }
};

export default definePlugin({
    name: "LeaveAllServers",
    enabledByDefault: false,
    description: "Leaves all selected servers. Accessible via right-click on a server.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    settings,

    start() {
        addContextMenuPatch("guild-context", patchGuildContext);
    },

    stop() {
        removeContextMenuPatch("guild-context", patchGuildContext);
    }
});
