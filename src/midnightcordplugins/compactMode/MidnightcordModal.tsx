/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { ModalContent, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, useState } from "@webpack/common";

import { ThemesTab, ChangelogTab, PluginsTab, BackupAndRestoreTab, UpdaterTab, VencordTab, SyncTab, LanguageTab } from "@components/settings/tabs";
import IconsTab from "@midnightcordplugins/iconViewer/components/IconsTab";
import { CreateThemeTab } from "@components/settings/tabs/createTheme/CreateThemeTab";

// ── Tab definitions ──────────────────────────────────────────────────────────

interface TabDef {
    id: string;
    label: string;
    icon: string;
    description: string;
}

const TABS: TabDef[] = [
    {
        id: "midnightcord",
        label: "Midnightcord",
        icon: "M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.8-1.37 1.16-2.53.98-.45-.07-.93.18-.99.64a11.1 11.1 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.1 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.7-1.43 2.49-1.1.8.33 1.16 1.37.98 2.53-.07.45.18.93.64.99a11.1 11.1 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.1.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.8 1.37-1.16 2.53-.98.45.07.93-.18.99-.64a11.1 11.1 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33-.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a11.07 11.07 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.8-.33-1.16-1.37-.98-2.53.07-.45-.18-.93-.64-.99a11.1 11.1 0 0 0-2.88 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
        description: "Quick actions, client settings, compact & stealth mode",
    },
    {
        id: "plugins",
        label: "Plugins",
        icon: "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z",
        description: "Enable, disable and configure plugins",
    },
    {
        id: "themes",
        label: "Themes",
        icon: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
        description: "Apply and manage CSS themes",
    },
    {
        id: "createTheme",
        label: "Create Theme",
        icon: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
        description: "Build and preview your own theme",
    },
    {
        id: "updater",
        label: "Updater",
        icon: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
        description: "Check for and install updates",
    },
    {
        id: "changelog",
        label: "Changelog",
        icon: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
        description: "See what changed in recent updates",
    },
    {
        id: "backup",
        label: "Backup & Restore",
        icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z",
        description: "Import or export your settings",
    },
    {
        id: "iconFinder",
        label: "Icon Finder",
        icon: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
        description: "Browse all Discord icons",
    },
    {
        id: "sync",
        label: "Synchronization",
        icon: "M16.8333 19H5.16667C3.16667 19 1.5 17.3333 1.5 15.3333C1.5 13.4 2.96667 11.8667 4.83333 11.6667V11.3333C4.83333 7.86667 7.7 5 11.1667 5C14.0333 5 16.5667 6.93333 17.3 9.66667C19.7 9.86667 21.5 11.8667 21.5 14.3333C21.5 16.9333 19.4333 19 16.8333 19Z",
        description: "Sync Midnightcord settings across devices",
    },
    {
        id: "language",
        label: "Language",
        icon: "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z",
        description: "Change Midnightcord's interface language",
    },
];

// ── Modal inner ───────────────────────────────────────────────────────────────

function MidnightcordModalInner({ onClose }: { onClose: () => void; }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>(null);

    function openTab(tabId: string) {
        setActiveTab(tabId);
    }

    let TabContent = null;
    switch (activeTab) {
        case "midnightcord": TabContent = <VencordTab />; break;
        case "plugins": TabContent = <PluginsTab />; break;
        case "themes": TabContent = <ThemesTab />; break;
        case "createTheme": TabContent = <CreateThemeTab />; break;
        case "updater": TabContent = <UpdaterTab />; break;
        case "changelog": TabContent = <ChangelogTab />; break;
        case "backup": TabContent = <BackupAndRestoreTab />; break;
        case "iconFinder": TabContent = <IconsTab />; break;
        case "sync": TabContent = <SyncTab />; break;
        case "language": TabContent = <LanguageTab />; break;
    }

    return (
        <div className="nc-modal-root theme-dark" data-theme="dark" style={{ color: "var(--text-normal, #dbdee1)" }}>
            {/* Sidebar */}
            <div className="nc-modal-sidebar">
                <div className="nc-modal-sidebar-header">
                    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" style={{ opacity: 0.85 }}>
                        <path fillRule="evenodd" clipRule="evenodd" d="M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.8-1.37 1.16-2.53.98-.45-.07-.93.18-.99.64a11.1 11.1 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.1 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.7-1.43 2.49-1.1.8.33 1.16 1.37.98 2.53-.07.45.18.93.64.99a11.1 11.1 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.1.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.8 1.37-1.16 2.53-.98.45.07.93-.18.99-.64a11.1 11.1 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33-.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a11.07 11.07 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.8-.33-1.16-1.37-.98-2.53.07-.45-.18-.93-.64-.99a11.1 11.1 0 0 0-2.88 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
                    </svg>
                    <span>Midnightcord Settings</span>
                </div>
                <div className="nc-modal-sidebar-nav" style={{ padding: "6px 0" }}>
                    {TABS.map(tab => (
                        <div
                            key={tab.id}
                            className={`nc-modal-sidebar-item${hovered === tab.id ? " nc-modal-sidebar-item--active" : ""}`}
                            onClick={() => openTab(tab.id)}
                            onMouseEnter={() => setHovered(tab.id)}
                            onMouseLeave={() => setHovered(null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === "Enter" && openTab(tab.id)}
                        >
                            <svg
                                className="nc-modal-sidebar-item-icon"
                                viewBox="0 0 24 24"
                                width={18}
                                height={18}
                                fill="currentColor"
                            >
                                <path d={tab.icon} />
                            </svg>
                            <span className="nc-modal-sidebar-item-label">{tab.label}</span>
                            <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" style={{ marginLeft: "auto", opacity: 0.35, flexShrink: 0 }}>
                                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                            </svg>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right side — content */}
            <div className="nc-modal-content">
                <div className="nc-modal-content-header">
                    <span className="nc-modal-content-title">
                        {activeTab ? TABS.find(t => t.id === activeTab)?.label : "Quick Access"}
                    </span>
                    <div
                        className="nc-modal-close-btn"
                        onClick={onClose}
                        role="button"
                        tabIndex={0}
                        aria-label="Close"
                    >
                        <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </div>
                </div>
                <div className="nc-modal-content-body">
                    {activeTab ? (
                        <div style={{ animation: "fade-in 0.2s ease", paddingBottom: "32px" }}>
                            {TabContent}
                        </div>
                    ) : (
                        <div className="nc-modal-cards-grid">
                            {TABS.map(tab => (
                                <div
                                    key={tab.id}
                                    className="nc-modal-card"
                                    onClick={() => openTab(tab.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === "Enter" && openTab(tab.id)}
                                >
                                    <div className="nc-modal-card-icon">
                                        <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
                                            <path d={tab.icon} />
                                        </svg>
                                    </div>
                                    <div className="nc-modal-card-info">
                                        <div className="nc-modal-card-title">{tab.label}</div>
                                        <div className="nc-modal-card-desc">{tab.description}</div>
                                    </div>
                                    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" className="nc-modal-card-arrow">
                                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                                    </svg>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function MidnightcordModal({ modalProps }: { modalProps: ModalProps; }) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE} className="nc-modal-wrapper">
            <ModalContent className="nc-modal-modal-content">
                <ErrorBoundary message="Failed to render Midnightcord Settings modal.">
                    <MidnightcordModalInner onClose={modalProps.onClose} />
                </ErrorBoundary>
            </ModalContent>
        </ModalRoot>
    );
}

export function openMidnightcordModal() {
    openModal(modalProps => <MidnightcordModal modalProps={modalProps} />);
}
