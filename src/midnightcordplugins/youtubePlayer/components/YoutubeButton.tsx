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
import { setYoutubeOpen } from "../index";
import { youtubeBase64 } from "./icon";

export function YoutubeButton() {
    const [hovered, setHovered] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);
    
    const [hasBeenOpened, setHasBeenOpened] = React.useState(false);
    
    React.useEffect(() => {
        const handleToggle = (e: any) => {
            setIsOpen(e.isOpen);
            if (e.isOpen) setHasBeenOpened(true);
            
            // Toggle vanilla iframe using opacity+visibility instead of display:block/none.
            // display:none would suspend the iframe process in Electron on hide.
            // Keeping the container painted (but invisible) prevents both the
            // blank-page reload AND the flash-of-content on show.
            const iframeContainer = getOrCreateVanillaIframe();
            if (e.isOpen) {
                iframeContainer.style.opacity = "1";
                iframeContainer.style.visibility = "visible";
                iframeContainer.style.pointerEvents = "auto";
                document.body.classList.add("ytd-is-open");
            } else {
                iframeContainer.style.opacity = "0";
                iframeContainer.style.visibility = "hidden";
                iframeContainer.style.pointerEvents = "none";
                document.body.classList.remove("ytd-is-open");
            }
        };
        FluxDispatcher.subscribe("YOUTUBE_TOGGLE", handleToggle);
        return () => FluxDispatcher.unsubscribe("YOUTUBE_TOGGLE", handleToggle);
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
        setYoutubeOpen(!isOpen);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        stopPropagation(e);
        const p = plugins.youtubePlayer;
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="youtubeplayer-context-menu" aria-label="youtubePlayer Options" onClose={ContextMenuApi.closeContextMenu}>
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
                            setYoutubeOpen(false);
                            const iframe = document.getElementById("ytd-global-iframe") as HTMLIFrameElement;
                            if (iframe) iframe.src = "https://www.youtube.com";
                        }}
                    />
                    <Menu.MenuItem
                        id="disable-plugin"
                        label={t("Disable Plugin")}
                        color="danger"
                        action={() => {
                            ContextMenuApi.closeContextMenu();
                            setYoutubeOpen(false);
                            if (p) stopPlugin(p);
                            if (Settings.plugins.youtubePlayer) Settings.plugins.youtubePlayer.enabled = false;
                        }}
                    />
                </Menu.MenuGroup>
            </Menu.Menu>
        ));
    };

    return (
        <>
            <div
                id="youtube-button"
                className="youtube-button-container"
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
                onMouseUp={stopPropagation}
                style={{ position: "relative", display: "flex", justifyContent: "center" }}
            >
                <div className="wrapper__58105 overlay__58105" aria-hidden="true">
                    <span className={`item__58105 ${isOpen ? 'visible__58105 selected__58105' : hovered ? 'visible__58105 hovered__58105' : ''}`}></span>
                </div>
                <Tooltip text={<strong>YouTube</strong>} position="right" hideOnClick={false}>
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
                                backgroundColor: "var(--background-primary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "background-color .15s ease-out",
                                overflow: "hidden"
                            }}
                        >
                            <img src={`data:image/png;base64,${youtubeBase64}`} style={{ width: 40, height: 40, objectFit: "cover", transform: "scale(1.5)" }} />
                        </div>
                    )}
                </Tooltip>
            </div>

            {/* Iframe is now managed purely by vanilla JS outside of React */}
        </>
    );
}

// Manage the global iframe outside of React to prevent state loss or reloads
function getOrCreateVanillaIframe(): HTMLDivElement {
    let el = document.getElementById("ytd-global-iframe-container") as HTMLDivElement | null;
    if (!el) {
        el = document.createElement("div");
        el.id = "ytd-global-iframe-container";
        el.style.position = "fixed";
        el.style.top = "0";
        el.style.left = "72px";
        el.style.bottom = "0";
        el.style.right = "0";
        el.style.zIndex = "999";
        el.style.backgroundColor = "var(--background-primary)";
        // Hidden by default via opacity+visibility (not display:none) so that
        // Electron does NOT suspend the iframe renderer process on hide.
        el.style.opacity = "0";
        el.style.visibility = "hidden";
        el.style.pointerEvents = "none";
        el.style.display = "flex";
        el.style.flexDirection = "column";

        // Top Header Bar
        const topBar = document.createElement("div");
        topBar.style.cssText = "height: 38px; background-color: #111214; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid #1e1f22; box-sizing: border-box; -webkit-app-region: drag;";

        const titleDiv = document.createElement("div");
        titleDiv.style.cssText = "display: flex; align-items: center; gap: 8px; color: #f2f3f5; font-size: 14px; font-weight: 600; -webkit-app-region: no-drag;";
        titleDiv.innerHTML = `<img src="data:image/png;base64,${youtubeBase64}" style="width: 20px; height: 20px; border-radius: 4px; object-fit: cover;" /><span>YouTube</span>`;

        const controlsContainer = document.createElement("div");
        controlsContainer.style.cssText = "display: flex; align-items: center; gap: 4px; -webkit-app-region: no-drag;";

        const btnStyle = "background: transparent; color: #b5bac1; border: none; border-radius: 4px; padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.1s, color 0.1s;";

        // Minimize Button
        const minBtn = document.createElement("button");
        minBtn.title = "Minimiser";
        minBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;
        minBtn.style.cssText = btnStyle;
        minBtn.onmouseover = () => { minBtn.style.backgroundColor = "#383a40"; minBtn.style.color = "#dbdee1"; };
        minBtn.onmouseout = () => { minBtn.style.backgroundColor = "transparent"; minBtn.style.color = "#b5bac1"; };
        minBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            setYoutubeOpen(false);
        };

        // Open in External Browser Button
        const openExtBtn = document.createElement("button");
        openExtBtn.title = "Ouvrir dans le navigateur";
        openExtBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
        openExtBtn.style.cssText = btnStyle;
        openExtBtn.onmouseover = () => { openExtBtn.style.backgroundColor = "#383a40"; openExtBtn.style.color = "#dbdee1"; };
        openExtBtn.onmouseout = () => { openExtBtn.style.backgroundColor = "transparent"; openExtBtn.style.color = "#b5bac1"; };
        openExtBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const iframe = document.getElementById("ytd-global-iframe") as HTMLIFrameElement;
            const targetUrl = iframe?.src || "https://www.youtube.com";
            if (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) {
                VencordNative.native.openExternal(targetUrl);
            } else {
                window.open(targetUrl, "_blank");
            }
        };

        // Close Button
        const closeBtn = document.createElement("button");
        closeBtn.title = "Fermer";
        closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
        closeBtn.style.cssText = btnStyle;
        closeBtn.onmouseover = () => { closeBtn.style.backgroundColor = "#da373c"; closeBtn.style.color = "#ffffff"; };
        closeBtn.onmouseout = () => { closeBtn.style.backgroundColor = "transparent"; closeBtn.style.color = "#b5bac1"; };
        closeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            setYoutubeOpen(false);
        };

        controlsContainer.appendChild(minBtn);
        controlsContainer.appendChild(openExtBtn);
        controlsContainer.appendChild(closeBtn);

        topBar.appendChild(titleDiv);
        topBar.appendChild(controlsContainer);

        const iframe = document.createElement("iframe");
        iframe.id = "ytd-global-iframe";
        iframe.src = "https://www.youtube.com";
        iframe.style.cssText = "flex:1;width:100%;height:100%;border:none;display:block;";
        iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; clipboard-read";
        iframe.setAttribute("allowfullscreen", "true");

        el.appendChild(topBar);
        el.appendChild(iframe);
        document.body.appendChild(el);
        
        // Hide profile panels globally when this is visible
        const style = document.createElement("style");
        style.id = "ytd-global-style";
        style.textContent = `
            body.ytd-is-open section[class^="panels_"],
            body.ytd-is-open div[class^="container_"]:has(> div[class^="nameTag_"]) {
                display: none !important;
            }
            body.ytd-is-open div[class*="wrapper_"][class*="overlay_"] {
                opacity: 0 !important;
                visibility: hidden !important;
            }
            body.ytd-is-open #youtube-button div[class*="wrapper_"][class*="overlay_"] {
                opacity: 1 !important;
                visibility: visible !important;
            }
            #ytd-global-iframe::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
        `;
        document.head.appendChild(style);
    }
    return el;
}
