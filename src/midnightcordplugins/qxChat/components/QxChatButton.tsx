/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, FluxDispatcher, Menu, React, ReactDOM, Tooltip } from "@webpack/common";
import { t } from "@api/i18n";
import { plugins, stopPlugin } from "@api/PluginManager";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Settings } from "Vencord";
import { setQxChatOpen } from "../index";

export function QxChatIcon(height: number, width: number, className?: string) {
    // Extracted from qxchat.svg - removed the background rect and adjusted viewBox
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 16 16"
            version="1.1"
            className={className}
        >
            <g transform="translate(16 0) scale(-1 1)">
                <g transform="translate(0 1)" fill="#ffffff">
                    <path d="M5.939 0C2.666 0 0.009 1.987 0.009 4.438c0 2.236 2.215 4.082 5.092 4.387L3.88 11.26l4.249-2.7C10.318 7.906 12 6.309 12 4.438 12 1.988 9.213 0 5.939 0Z" />
                    <path d="M15.947 8.89c0-1.124-1.062-2.288-2.289-2.868-.344 1.95-1.924 3.745-4.417 4.447l-1.187.642c.454.34 1.01.611 1.634.788l3.638 1.971-1.303-1.776c2.217-.225 3.924-1.571 3.924-3.204Z" />
                </g>
            </g>
        </svg>
    );
}

export function QxChatButton() {
    const [hovered, setHovered] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);
    
    React.useEffect(() => {
        const handleToggle = (e: any) => setIsOpen(e.isOpen);
        FluxDispatcher.subscribe("QXCHAT_TOGGLE", handleToggle);
        return () => FluxDispatcher.unsubscribe("QXCHAT_TOGGLE", handleToggle);
    }, []);

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent) {
            e.nativeEvent.stopImmediatePropagation?.();
        }
    };

    const handlePress = (e: any) => {
        stopPropagation(e);
        setQxChatOpen(!isOpen);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        stopPropagation(e);
        const p = plugins.QxChat;
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="qxchat-context-menu" aria-label="QxChat Options" onClose={ContextMenuApi.closeContextMenu}>
                <Menu.MenuGroup>
                    {p && (
                        <Menu.MenuItem
                            id="open-settings"
                            label={t("Plugin Settings")}
                            action={() => {
                                ContextMenuApi.closeContextMenu();
                                openPluginModal(p);
                            }}
                        />
                    )}
                    <Menu.MenuItem
                        id="reset-page"
                        label={t("Reset Page")}
                        color="danger"
                        action={() => {
                            ContextMenuApi.closeContextMenu();
                            setQxChatOpen(false);
                            const iframe = document.querySelector("iframe[src*='qxch.at']") as HTMLIFrameElement;
                            if (iframe) iframe.src = "https://qxch.at/app/";
                        }}
                    />
                    <Menu.MenuItem
                        id="disable-plugin"
                        label={t("Disable Plugin")}
                        color="danger"
                        action={() => {
                            ContextMenuApi.closeContextMenu();
                            setQxChatOpen(false);
                            if (p) stopPlugin(p);
                            if (Settings.plugins.QxChat) Settings.plugins.QxChat.enabled = false;
                        }}
                    />
                </Menu.MenuGroup>
            </Menu.Menu>
        ));
    };

    return (
        <>
            <div
                id="qxchat-button"
                className="qxchat-button-container"
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
                onMouseUp={stopPropagation}
                style={{ position: "relative", display: "flex", justifyContent: "center" }}
            >
                <div className="wrapper__58105 overlay__58105" aria-hidden="true">
                    <span className={`item__58105 ${isOpen ? 'visible__58105 selected__58105' : hovered ? 'visible__58105 hovered__58105' : ''}`}></span>
                </div>
                <Tooltip text={<strong>QxChat</strong>} position="right" hideOnClick={false}>
                    {(tooltipProps: any) => (
                        <div 
                            {...tooltipProps}
                            onClick={handlePress}
                            onMouseDown={stopPropagation}
                            onMouseUp={stopPropagation}
                            onContextMenu={handleContextMenu}
                            onMouseEnter={(e: any) => { setHovered(true); tooltipProps?.onMouseEnter?.(e); }} 
                            onMouseLeave={(e: any) => { setHovered(false); tooltipProps?.onMouseLeave?.(e); }}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                backgroundColor: "#1c71d8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "background-color .15s ease-out"
                            }}
                        >
                            {QxChatIcon(28, 28)}
                        </div>
                    )}
                </Tooltip>
            </div>

            {ReactDOM.createPortal(
                <div style={{ 
                    position: "fixed", 
                    top: 0, 
                    left: 72, 
                    bottom: 0, 
                    right: 0, 
                    zIndex: 999, 
                    backgroundColor: "var(--background-primary)",
                    display: isOpen ? "flex" : "none",
                    flexDirection: "column"
                }}>
                    {isOpen && (
                        <style>{`
                            /* Hide the profile bar/panels when QxChat is open */
                            section[class^="panels_"],
                            div[class^="container_"]:has(> div[class^="nameTag_"]) {
                                display: none !important;
                            }
                            /* Hide all native discord pills, except our own */
                            div[class*="guilds_"] [class*="pill_"] span,
                            div[class*="guilds_"] [class*="item_"],
                            [data-list-item-id="guildsnav___home"] [class*="pill_"] span,
                            [data-list-item-id="guildsnav___home"] [class*="item_"],
                            div[class*="wrapper_"][class*="overlay_"] span {
                                opacity: 0 !important;
                                visibility: hidden !important;
                                height: 0px !important;
                                transform: scale(0) !important;
                            }
                            #qxchat-button [class*="pill_"] span,
                            #qxchat-button [class*="item_"],
                            #qxchat-button div[class*="wrapper_"][class*="overlay_"],
                            #qxchat-button div[class*="wrapper_"][class*="overlay_"] span {
                                opacity: 1 !important;
                                visibility: visible !important;
                                height: 40px !important;
                                transform: none !important;
                            }
                        `}</style>
                    )}
                    {/* Top Header Bar */}
                    <div style={{
                        height: 38,
                        backgroundColor: "#111214",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 12px",
                        borderBottom: "1px solid #1e1f22",
                        boxSizing: "border-box",
                        WebkitAppRegion: "drag" as any
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f2f3f5", fontSize: 14, fontWeight: 600, WebkitAppRegion: "no-drag" as any }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: "#1c71d8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {QxChatIcon(14, 14)}
                            </div>
                            <span>QxChat</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, WebkitAppRegion: "no-drag" as any }}>
                            <button
                                title="Minimiser"
                                style={{ background: "transparent", color: "#b5bac1", border: "none", borderRadius: 4, padding: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.1s, color 0.1s" }}
                                onMouseOver={(e: any) => { e.currentTarget.style.backgroundColor = "#383a40"; e.currentTarget.style.color = "#dbdee1"; }}
                                onMouseOut={(e: any) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#b5bac1"; }}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQxChatOpen(false); }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                            </button>
                            <button
                                title="Ouvrir dans le navigateur"
                                style={{ background: "transparent", color: "#b5bac1", border: "none", borderRadius: 4, padding: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.1s, color 0.1s" }}
                                onMouseOver={(e: any) => { e.currentTarget.style.backgroundColor = "#383a40"; e.currentTarget.style.color = "#dbdee1"; }}
                                onMouseOut={(e: any) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#b5bac1"; }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const targetUrl = "https://qxch.at/app/";
                                    if (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) {
                                        VencordNative.native.openExternal(targetUrl);
                                    } else {
                                        window.open(targetUrl, "_blank");
                                    }
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </button>
                            <button
                                title="Fermer"
                                style={{ background: "transparent", color: "#b5bac1", border: "none", borderRadius: 4, padding: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.1s, color 0.1s" }}
                                onMouseOver={(e: any) => { e.currentTarget.style.backgroundColor = "#da373c"; e.currentTarget.style.color = "#ffffff"; }}
                                onMouseOut={(e: any) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#b5bac1"; }}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQxChatOpen(false); }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                    </div>
                    <iframe 
                        ref={(el: any) => {
                            if (el) {
                                el.setAttribute("allow", "camera *; microphone *; display-capture *; fullscreen *; clipboard-read *; clipboard-write *; autoplay *");
                                el.setAttribute("allowfullscreen", "true");
                            }
                        }}
                        src="https://qxch.at/app/" 
                        style={{ width: "100%", height: "100%", border: "none", display: "block", flex: 1 }} 
                    />
                </div>,
                document.body
            )}
        </>
    );
}
