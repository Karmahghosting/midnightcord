/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, FluxDispatcher, Menu, React, Tooltip } from "@webpack/common";
import { t } from "@api/i18n";
import { plugins, stopPlugin } from "@api/PluginManager";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Settings } from "Vencord";
import { Native, setBrowserOpen, settings } from "../index";
import { browserBase64 } from "../icon";

type ExtensionInfo = { id: string; name: string; version: string; description: string; iconUrl: string; dir: string; };

// ─── Extension Panel ─────────────────────────────────────────────────────────

let extPanelEl: HTMLDivElement | null = null;
let extPanelVisible = false;

function closeExtPanel() {
    if (extPanelEl) {
        extPanelEl.style.transform = "translateX(100%)";
        extPanelEl.style.opacity = "0";
        setTimeout(() => { if (extPanelEl) extPanelEl.style.display = "none"; }, 220);
        extPanelVisible = false;
    }
}

function openExtPanel() {
    if (!extPanelEl) return;
    extPanelVisible = true;
    renderExtPanel();
    extPanelEl.style.display = "flex";
    requestAnimationFrame(() => {
        if (extPanelEl) { extPanelEl.style.transform = "translateX(0)"; extPanelEl.style.opacity = "1"; }
    });
}

function toggleExtPanel() {
    if (extPanelVisible) closeExtPanel();
    else openExtPanel();
}

function showExtNotif(msg: string, color: string) {
    const el = document.getElementById("ext-notif");
    if (!el) return;
    el.textContent = msg;
    el.style.backgroundColor = color + "22";
    el.style.color = color;
    el.style.display = "block";
    setTimeout(() => { if (el) el.style.display = "none"; }, 4000);
}

async function renderExtPanel() {
    if (!extPanelEl) return;
    extPanelEl.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;border-bottom:1px solid #1e1f22;flex-shrink:0;";
    const title = document.createElement("div");
    title.style.cssText = "display:flex;align-items:center;gap:8px;color:#dbdee1;font-size:15px;font-weight:600;";
    title.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-4 0 2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 2 2 0 0 1 0 4 2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 1 4 0 2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2 2 2 0 0 1 0-4 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg><span>Extensions</span>`;
    const closeBtn3 = document.createElement("button");
    closeBtn3.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    closeBtn3.style.cssText = "background:transparent;border:none;color:#80848e;cursor:pointer;padding:4px;display:flex;align-items:center;border-radius:4px;";
    closeBtn3.onmouseover = () => closeBtn3.style.color = "#dbdee1";
    closeBtn3.onmouseout = () => closeBtn3.style.color = "#80848e";
    closeBtn3.onclick = closeExtPanel;
    header.appendChild(title);
    header.appendChild(closeBtn3);
    extPanelEl.appendChild(header);

    // Info banner
    const info = document.createElement("div");
    info.style.cssText = "padding:10px 16px;background:#23272a;font-size:11px;color:#80848e;line-height:1.5;flex-shrink:0;border-bottom:1px solid #1e1f22;";
    info.innerHTML = `<strong style="color:#b5bac1">How to install</strong><br>Drop a <code style="background:#111;padding:1px 4px;border-radius:3px">.crx</code> file or select an <strong>unpacked extension folder</strong> (containing manifest.json). Extensions persist across Discord restarts.`;
    extPanelEl.appendChild(info);

    // Actions
    const actionsBar = document.createElement("div");
    actionsBar.style.cssText = "display:flex;gap:8px;padding:12px 16px;flex-shrink:0;border-bottom:1px solid #1e1f22;";

    const installCrxBtn = document.createElement("button");
    installCrxBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 12v9.5"/></svg><span>Install .crx</span>`;
    installCrxBtn.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 10px;background:#404249;border:none;border-radius:6px;color:#dbdee1;font-size:12px;font-weight:500;cursor:pointer;transition:background 0.1s;";
    installCrxBtn.onmouseover = () => installCrxBtn.style.background = "#4e505a";
    installCrxBtn.onmouseout = () => installCrxBtn.style.background = "#404249";
    installCrxBtn.onclick = () => {
        const fi = document.createElement("input");
        fi.type = "file"; fi.accept = ".crx"; fi.style.display = "none";
        fi.onchange = async () => {
            const file = fi.files?.[0];
            if (!file) return;
            const filePath = (file as any).path;
            if (!filePath) { showExtNotif("File path not accessible", "#da373c"); return; }
            installCrxBtn.innerHTML = `<span>Installing...</span>`;
            installCrxBtn.disabled = true;
            try {
                const ext = await Native.installExtension(filePath);
                showExtNotif(`Installed: ${ext.name}`, "#23a55a");
                renderExtPanel();
            } catch (e: any) {
                showExtNotif(`${e?.message || "Install failed"}`, "#da373c");
                installCrxBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 12v9.5"/></svg><span>Install .crx</span>`;
                installCrxBtn.disabled = false;
            }
        };
        document.body.appendChild(fi);
        fi.click();
        document.body.removeChild(fi);
    };

    const installFolderBtn = document.createElement("button");
    installFolderBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/></svg><span>Unpacked Folder</span>`;
    installFolderBtn.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 10px;background:#404249;border:none;border-radius:6px;color:#dbdee1;font-size:12px;font-weight:500;cursor:pointer;transition:background 0.1s;";
    installFolderBtn.onmouseover = () => installFolderBtn.style.background = "#4e505a";
    installFolderBtn.onmouseout = () => installFolderBtn.style.background = "#404249";
    installFolderBtn.onclick = () => {
        Native.pickExtensionFolder().then(async (folderPath: string | null) => {
            if (!folderPath) return;
            installFolderBtn.innerHTML = `<span>Installing...</span>`;
            installFolderBtn.disabled = true;
            try {
                const ext = await Native.installExtension(folderPath);
                showExtNotif(`Installed: ${ext.name}`, "#23a55a");
                renderExtPanel();
            } catch (e: any) {
                showExtNotif(`${e?.message || "Install failed"}`, "#da373c");
            } finally {
                installFolderBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/></svg><span>Unpacked Folder</span>`;
                installFolderBtn.disabled = false;
            }
        }).catch(() => {
            installFolderBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/></svg><span>Unpacked Folder</span>`;
            installFolderBtn.disabled = false;
        });
    };

    actionsBar.appendChild(installCrxBtn);
    actionsBar.appendChild(installFolderBtn);
    extPanelEl.appendChild(actionsBar);

    // Notif
    const notifDiv = document.createElement("div");
    notifDiv.id = "ext-notif";
    notifDiv.style.cssText = "display:none;padding:8px 16px;font-size:12px;font-weight:500;color:#fff;flex-shrink:0;";
    extPanelEl.appendChild(notifDiv);

    // Extension list
    const listDiv = document.createElement("div");
    listDiv.style.cssText = "flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;";
    extPanelEl.appendChild(listDiv);

    let extensions: ExtensionInfo[] = [];
    try { extensions = await Native.listExtensions(); } catch {}

    if (extensions.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "text-align:center;color:#80848e;padding:32px 16px;font-size:13px;line-height:1.6;";
        empty.textContent = "No extensions installed.\nUse the buttons above to add one.";
        listDiv.appendChild(empty);
    } else {
        for (const ext of extensions) {
            const card = document.createElement("div");
            card.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:8px;background:#2a2c31;margin-bottom:2px;";

            // Icon
            const iconEl = document.createElement("div");
            iconEl.style.cssText = "width:36px;height:36px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#383a40;display:flex;align-items:center;justify-content:center;color:#b5bac1;";
            if (ext.iconUrl) {
                const img = document.createElement("img");
                img.src = ext.iconUrl;
                img.style.cssText = "width:36px;height:36px;object-fit:contain;";
                img.onerror = () => { img.style.display = "none"; iconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-4 0 2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 2 2 0 0 1 0 4 2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 1 4 0 2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2 2 2 0 0 1 0-4 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg>`; };
                iconEl.appendChild(img);
            } else {
                iconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-4 0 2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 2 2 0 0 1 0 4 2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 1 4 0 2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2 2 2 0 0 1 0-4 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg>`;
            }

            // Info
            const info2 = document.createElement("div");
            info2.style.cssText = "flex:1;min-width:0;";
            const nameEl = document.createElement("div");
            nameEl.textContent = ext.name;
            nameEl.style.cssText = "color:#dbdee1;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
            const verEl = document.createElement("div");
            verEl.textContent = `v${ext.version}`;
            verEl.style.cssText = "color:#80848e;font-size:11px;margin-top:2px;";
            info2.appendChild(nameEl);
            info2.appendChild(verEl);

            // Remove
            const removeBtn = document.createElement("button");
            removeBtn.title = "Uninstall";
            removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
            removeBtn.style.cssText = "background:transparent;border:none;color:#80848e;cursor:pointer;padding:4px;border-radius:4px;display:flex;align-items:center;flex-shrink:0;";
            removeBtn.onmouseover = () => { removeBtn.style.color = "#da373c"; removeBtn.style.background = "rgba(218,55,60,0.1)"; };
            removeBtn.onmouseout = () => { removeBtn.style.color = "#80848e"; removeBtn.style.background = "transparent"; };
            removeBtn.onclick = async () => {
                removeBtn.disabled = true;
                await Native.removeExtension(ext.id).catch(() => {});
                showExtNotif(`🗑 Removed: ${ext.name}`, "#80848e");
                renderExtPanel();
            };

            card.appendChild(iconEl);
            card.appendChild(info2);
            card.appendChild(removeBtn);
            listDiv.appendChild(card);
        }
    }

    // Footer: open folder
    const footer = document.createElement("div");
    footer.style.cssText = "padding:10px 16px;border-top:1px solid #1e1f22;flex-shrink:0;";
    const openDirBtn = document.createElement("button");
    openDirBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/></svg><span>Open Extensions Folder</span>`;
    openDirBtn.style.cssText = "width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px;background:transparent;border:1px solid #404249;border-radius:6px;color:#80848e;font-size:12px;cursor:pointer;transition:all 0.1s;";
    openDirBtn.onmouseover = () => { openDirBtn.style.borderColor = "#5865f2"; openDirBtn.style.color = "#5865f2"; };
    openDirBtn.onmouseout = () => { openDirBtn.style.borderColor = "#404249"; openDirBtn.style.color = "#80848e"; };
    openDirBtn.onclick = () => Native.openExtensionsDir().catch(() => {});
    footer.appendChild(openDirBtn);
    extPanelEl.appendChild(footer);
}

// ─── Tab State ────────────────────────────────────────────────────────────────

type Tab = { id: string; url: string; title: string; };

const TABS_STORAGE_KEY = "midnightcord_privatebrowser_tabs";
const ACTIVE_TAB_STORAGE_KEY = "midnightcord_privatebrowser_active_tab";

let tabs: Tab[] = [];
let activeTabId = "";
let isSetup = false;

function getHomeUrl(): string {
    const engine = settings.store?.searchEngine ?? "duckduckgo";
    switch (engine) {
        case "google": return "https://www.google.com";
        case "brave": return "https://search.brave.com";
        case "bing": return "https://www.bing.com";
        case "yahoo": return "https://www.yahoo.com";
        default: return "https://duckduckgo.com";
    }
}

function getEngineTitle(): string {
    const engine = settings.store?.searchEngine ?? "duckduckgo";
    switch (engine) {
        case "google": return "Google";
        case "brave": return "Brave Search";
        case "bing": return "Bing";
        case "yahoo": return "Yahoo";
        default: return "DuckDuckGo";
    }
}

function getSearchUrl(query: string): string {
    const engine = settings.store?.searchEngine ?? "duckduckgo";
    const q = encodeURIComponent(query);
    switch (engine) {
        case "google": return `https://www.google.com/search?q=${q}`;
        case "brave": return `https://search.brave.com/search?q=${q}`;
        case "bing": return `https://www.bing.com/search?q=${q}`;
        case "yahoo": return `https://search.yahoo.com/search?p=${q}`;
        default: return `https://duckduckgo.com/?q=${q}`;
    }
}

/** Persist current tabs to localStorage (only when persistTabs is on). */
function saveTabs() {
    if (!settings.store?.persistTabs) {
        // Option is off — wipe any leftover saved state so next startup is always fresh
        try { localStorage.removeItem(TABS_STORAGE_KEY); } catch {}
        try { localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY); } catch {}
        return;
    }
    try {
        localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
    } catch {}
}

/**
 * Try to restore tabs from localStorage.
 * Returns true if tabs were successfully loaded, false otherwise.
 * Also clears storage when persistTabs is disabled (ensures clean startup).
 */
function loadSavedTabs(): boolean {
    if (!settings.store?.persistTabs) {
        try { localStorage.removeItem(TABS_STORAGE_KEY); } catch {}
        try { localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY); } catch {}
        return false;
    }
    try {
        const stored = localStorage.getItem(TABS_STORAGE_KEY);
        if (!stored) return false;
        const parsed: Tab[] = JSON.parse(stored);
        if (!Array.isArray(parsed) || parsed.length === 0) return false;
        tabs = parsed;
        const savedActive = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        activeTabId = (savedActive && tabs.find(t => t.id === savedActive))
            ? savedActive
            : tabs[0].id;
        return true;
    } catch {
        return false;
    }
}

function ensureTabsInitialized() {
    if (tabs.length === 0) {
        // Attempt to restore previously saved tabs (only when persistTabs is enabled).
        // If the setting is off or no saved data exists, always start fresh.
        if (!loadSavedTabs()) {
            const homeUrl = getHomeUrl();
            tabs = [{ id: "tab-" + Date.now(), url: homeUrl, title: getEngineTitle() }];
            activeTabId = tabs[0].id;
        }
    }
}

function getWebviewForTab(tabId: string): HTMLIFrameElement | null {
    const viewport = document.getElementById("browser-viewport");
    if (!viewport) return null;

    let wv = document.getElementById(`webview-${tabId}`) as HTMLIFrameElement | null;
    if (!wv) {
        wv = document.createElement("iframe");
        wv.id = `webview-${tabId}`;
        wv.style.cssText = "width:100%;height:100%;border:none;position:absolute;top:0;left:0;";
        const tab = tabs.find(t => t.id === tabId);
        wv.src = tab?.url || getHomeUrl();

        // Update URL bar and tab title on navigation
        wv.addEventListener("load", () => {
            try {
                const currentUrl = wv!.contentWindow?.location?.href;
                if (currentUrl && currentUrl !== "about:blank") {
                    const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
                    if (urlInput && document.activeElement !== urlInput) {
                        urlInput.value = currentUrl;
                    }
                    const t = tabs.find(t => t.id === tabId);
                    if (t) {
                        t.url = currentUrl;
                        try { t.title = wv!.contentDocument?.title || new URL(currentUrl).hostname.replace("www.", ""); } catch (e) {}
                        renderTabs();
                    }
                }
            } catch (e) {}
        });

        viewport.appendChild(wv);
    }
    return wv;
}

function switchWebviewTab(tabId: string) {
    const viewport = document.getElementById("browser-viewport");
    if (!viewport) return;
    // Hide all webviews
    Array.from(viewport.children).forEach((child: Element) => {
        (child as HTMLElement).style.display = "none";
    });
    // Show (or create) the target webview
    let wv = document.getElementById(`webview-${tabId}`) as HTMLIFrameElement | null;
    if (!wv) {
        wv = getWebviewForTab(tabId);
    }
    if (wv) wv.style.display = "block";
}

// ─── BrowserButton Component ─────────────────────────────────────────────────

export function BrowserButton() {
    const [hovered, setHovered] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);
    
    React.useEffect(() => {
        ensureTabsInitialized();
        if (!isSetup) {
            isSetup = true;
            getWebviewForTab(tabs[0].id);
        }

        // Registry of browser-tab URLs/origins checked by native.ts frameNavigateListener.
        // Without this, every iframe in Discord (MidnightcordNews, YouTube, etc.) would
        // call __privateBrowserOnNavigate and corrupt the URL bar.
        const updateFrameUrls = () => {
            const s = new Set<string>();
            for (const t of tabs) {
                if (!t.url) continue;
                s.add(t.url);
                try { s.add(new URL(t.url).origin); } catch {}
            }
            (window as any).__privateBrowserFrameUrls = s;
        };
        updateFrameUrls();

        // Expose a global function that native.ts calls via executeJavaScript
        (window as any).__privateBrowserNavigate = (url: string) => {
            ensureTabsInitialized();
            const container = document.getElementById("browser-global-container");
            const wv = getWebviewForTab(activeTabId);
            if (wv) wv.src = url;
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.url = url;
                try { tab.title = new URL(url).hostname.replace("www.", ""); } catch (e) {}
            }
            const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
            if (urlInput) urlInput.value = url;
            updateFrameUrls();
            if (container && container.style.display !== "flex") {
                import("../index").then(({ setBrowserOpen }) => setBrowserOpen(true)).catch(() => {});
            }
        };

        (window as any).__privateBrowserOnNavigate = (url: string) => {
            ensureTabsInitialized();
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.url = url;
                try { tab.title = new URL(url).hostname.replace("www.", ""); } catch (e) {}
            }
            const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
            if (urlInput && document.activeElement !== urlInput) {
                urlInput.value = url;
            }
            updateFrameUrls();
            renderTabs();
        };

        const handleToggle = (e: any) => {
            setIsOpen(e.isOpen);
            const container = getOrCreateBrowserContainer();
            
            if (e.isOpen) {
                container.style.display = "flex";
                document.body.classList.add("browser-is-open");
                switchWebviewTab(activeTabId);
            } else {
                container.style.display = "none";
                document.body.classList.remove("browser-is-open");
            }
        };
        
        FluxDispatcher.subscribe("BROWSER_TOGGLE", handleToggle);
        return () => {
            FluxDispatcher.unsubscribe("BROWSER_TOGGLE", handleToggle);
            delete (window as any).__privateBrowserNavigate;
            delete (window as any).__privateBrowserOnNavigate;
        };
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
        setBrowserOpen(!isOpen);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        stopPropagation(e);
        const p = plugins.PrivateBrowser;
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="privatebrowser-context-menu" aria-label="PrivateBrowser Options" onClose={ContextMenuApi.closeContextMenu}>
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
                            setBrowserOpen(false);
                            const homeUrl = getHomeUrl();
                            tabs = [{ id: "tab-" + Date.now(), url: homeUrl, title: getEngineTitle() }];
                            activeTabId = tabs[0].id;
                            const viewport = document.getElementById("browser-viewport");
                            if (viewport) viewport.innerHTML = "";
                            getWebviewForTab(activeTabId);
                            const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
                            if (urlInput) urlInput.value = homeUrl;
                            renderTabs();
                        }}
                    />
                    <Menu.MenuItem
                        id="disable-plugin"
                        label={t("Disable Plugin")}
                        color="danger"
                        action={() => {
                            ContextMenuApi.closeContextMenu();
                            setBrowserOpen(false);
                            if (p) stopPlugin(p);
                            if (Settings.plugins.PrivateBrowser) Settings.plugins.PrivateBrowser.enabled = false;
                        }}
                    />
                </Menu.MenuGroup>
            </Menu.Menu>
        ));
    };

    return (
        <>
            <div
                id="browser-button"
                className="browser-button-container"
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
                onMouseUp={stopPropagation}
                style={{ position: "relative", display: "flex", justifyContent: "center" }}
            >
                <div className="wrapper__58105 overlay__58105" aria-hidden="true">
                    <span className={`item__58105 ${isOpen ? 'visible__58105 selected__58105' : hovered ? 'visible__58105 hovered__58105' : ''}`}></span>
                </div>
                <Tooltip text={<strong>Private Browser</strong>} position="right" hideOnClick={false}>
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
                                width: 48,
                                height: 48,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                            }}
                        >
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                backgroundColor: "var(--background-primary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                                transition: "background-color .15s ease-out"
                            }}>
                                <img src={`data:image/jpeg;base64,${browserBase64}`} style={{ width: 40, height: 40, objectFit: "cover", transform: "scale(1.3)" }} />
                            </div>
                        </div>
                    )}
                </Tooltip>
            </div>
        </>
    );
}

function renderTabs() {
    const tabsContainer = document.getElementById("browser-tabs-container");
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = "";
    
    tabs.forEach(tab => {
        const tabEl = document.createElement("div");
        tabEl.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            height: 32px; min-width: 120px; max-width: 200px; padding: 0 12px;
            background-color: ${tab.id === activeTabId ? '#2b2d31' : '#1e1f22'};
            color: ${tab.id === activeTabId ? '#dbdee1' : '#80848e'};
            border-radius: 8px 8px 0 0;
            cursor: pointer;
            font-size: 13px; font-weight: 500;
            border-right: 1px solid #111214;
            transition: all 0.1s ease;
            -webkit-app-region: no-drag;
        `;
        
        const titleSpan = document.createElement("span");
        titleSpan.textContent = tab.title || "New Tab";
        titleSpan.style.cssText = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;";
        
        const closeBtn = document.createElement("div");
        closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        closeBtn.style.cssText = `
            margin-left: 8px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; opacity: 0.6; transition: all 0.1s;
        `;
        closeBtn.onmouseover = () => { closeBtn.style.backgroundColor = "rgba(255,255,255,0.1)"; closeBtn.style.opacity = "1"; };
        closeBtn.onmouseout = () => { closeBtn.style.backgroundColor = "transparent"; closeBtn.style.opacity = "0.6"; };
        
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (tabs.length === 1) return;
            
            const wv = document.getElementById(`webview-${tab.id}`);
            if (wv) wv.remove();
            
            tabs = tabs.filter(t => t.id !== tab.id);
            if (activeTabId === tab.id) {
                activeTabId = tabs[tabs.length - 1].id;
                const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
                if (urlInput) urlInput.value = tabs.find(t => t.id === activeTabId)?.url || "";
                switchWebviewTab(activeTabId);
            }
            renderTabs();
        };
        
        tabEl.onclick = () => {
            if (activeTabId === tab.id) return;
            activeTabId = tab.id;
            const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
            if (urlInput) urlInput.value = tab.url;
            switchWebviewTab(tab.id);
            renderTabs();
        };
        
        tabEl.appendChild(titleSpan);
        tabEl.appendChild(closeBtn);
        tabsContainer.appendChild(tabEl);
    });
    
    // Add New Tab button
    const newTabBtn = document.createElement("div");
    newTabBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`;
    newTabBtn.style.cssText = `
        display: flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; cursor: pointer; color: #b5bac1;
        border-radius: 50%; margin-left: 8px; transition: background 0.1s;
        -webkit-app-region: no-drag;
    `;
    newTabBtn.onmouseover = () => { newTabBtn.style.backgroundColor = "rgba(255,255,255,0.1)"; };
    newTabBtn.onmouseout = () => { newTabBtn.style.backgroundColor = "transparent"; };
    newTabBtn.onclick = () => {
        const newTab = { id: "tab-" + Date.now(), url: getHomeUrl(), title: getEngineTitle() };
        tabs.push(newTab);
        activeTabId = newTab.id;
        getWebviewForTab(newTab.id);
        switchWebviewTab(newTab.id);
        
        const urlInput = document.getElementById("browser-url-input") as HTMLInputElement;
        if (urlInput) urlInput.value = newTab.url;
        renderTabs();
    };
    
    tabsContainer.appendChild(newTabBtn);

    // Keep the native-side URL allowlist in sync so that did-frame-navigate events
    // from non-browser iframes (MidnightcordNews, YouTube, etc.) are ignored.
    try {
        const s = new Set<string>();
        for (const t of tabs) {
            if (!t.url) continue;
            s.add(t.url);
            try { s.add(new URL(t.url).origin); } catch {}
        }
        (window as any).__privateBrowserFrameUrls = s;
    } catch {}

    // Persist tabs after every mutation (respects the persistTabs setting internally)
    saveTabs();
}


function getOrCreateBrowserContainer(): HTMLDivElement {
    let el = document.getElementById("browser-global-container") as HTMLDivElement | null;
    if (!el) {
        el = document.createElement("div");
        el.id = "browser-global-container";
        el.style.position = "fixed";
        el.style.top = "0px";
        el.style.left = "72px";
        el.style.bottom = "0";
        el.style.right = "0";
        el.style.zIndex = "999";
        el.style.backgroundColor = "#2b2d31";
        el.style.display = "none";
        el.style.flexDirection = "column";

        // Tab Bar
        const tabBar = document.createElement("div");
        tabBar.id = "browser-tabs-container";
        tabBar.style.height = "36px";
        tabBar.style.backgroundColor = "#111214";
        tabBar.style.display = "flex";
        tabBar.style.alignItems = "flex-end";
        tabBar.style.padding = "0 16px";
        tabBar.style.boxSizing = "border-box";
        tabBar.style.borderBottom = "1px solid #1e1f22";
        (tabBar.style as any).webkitAppRegion = "drag";

        // Action Bar
        const topBar = document.createElement("div");
        topBar.style.height = "48px";
        topBar.style.backgroundColor = "#2b2d31";
        topBar.style.display = "flex";
        topBar.style.alignItems = "center";
        topBar.style.padding = "0 16px";
        topBar.style.gap = "8px";
        topBar.style.borderBottom = "1px solid #1e1f22";
        topBar.style.boxSizing = "border-box";
        (topBar.style as any).webkitAppRegion = "drag";

        const btnStyle = "background: transparent; color: #b5bac1; border: none; border-radius: 4px; padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.1s, color 0.1s; -webkit-app-region: no-drag;";

        // Back Button
        const backBtn = document.createElement("button");
        backBtn.title = "Back";
        backBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
        backBtn.style.cssText = btnStyle;
        backBtn.onmouseover = () => { backBtn.style.backgroundColor = "#383a40"; backBtn.style.color = "#dbdee1"; };
        backBtn.onmouseout = () => { backBtn.style.backgroundColor = "transparent"; backBtn.style.color = "#b5bac1"; };
        backBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            Native.navigateFrame("back").catch(() => {});
        };

        // Forward Button
        const forwardBtn = document.createElement("button");
        forwardBtn.title = "Forward";
        forwardBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
        forwardBtn.style.cssText = btnStyle;
        forwardBtn.onmouseover = () => { forwardBtn.style.backgroundColor = "#383a40"; forwardBtn.style.color = "#dbdee1"; };
        forwardBtn.onmouseout = () => { forwardBtn.style.backgroundColor = "transparent"; forwardBtn.style.color = "#b5bac1"; };
        forwardBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            Native.navigateFrame("forward").catch(() => {});
        };

        // Refresh Button
        const refreshBtn = document.createElement("button");
        refreshBtn.title = "Reload";
        refreshBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;
        refreshBtn.style.cssText = btnStyle;
        refreshBtn.onmouseover = () => { refreshBtn.style.backgroundColor = "#383a40"; refreshBtn.style.color = "#dbdee1"; };
        refreshBtn.onmouseout = () => { refreshBtn.style.backgroundColor = "transparent"; refreshBtn.style.color = "#b5bac1"; };
        refreshBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const wv = getWebviewForTab(activeTabId);
            if (wv) {
                const currentSrc = wv.src;
                wv.src = "about:blank";
                requestAnimationFrame(() => { wv.src = currentSrc; });
            }
            Native.navigateFrame("reload").catch(() => {});
        };

        // Home Button
        const homeBtn = document.createElement("button");
        homeBtn.title = "Home";
        homeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
        homeBtn.style.cssText = btnStyle;
        homeBtn.onmouseover = () => { homeBtn.style.backgroundColor = "#383a40"; homeBtn.style.color = "#dbdee1"; };
        homeBtn.onmouseout = () => { homeBtn.style.backgroundColor = "transparent"; homeBtn.style.color = "#b5bac1"; };

        const urlInput = document.createElement("input");
        urlInput.id = "browser-url-input";
        urlInput.type = "text";
        urlInput.placeholder = "Enter a URL or search...";
        urlInput.style.cssText = "flex: 1; height: 32px; background: #1e1f22; color: #dbdee1; border: none; border-radius: 16px; padding: 0 16px; font-size: 14px; outline: none; transition: background 0.2s; -webkit-app-region: no-drag;";
        urlInput.onfocus = () => { urlInput.style.background = "#111214"; urlInput.select(); };
        urlInput.onblur = () => { urlInput.style.background = "#1e1f22"; };

        topBar.appendChild(backBtn);
        topBar.appendChild(forwardBtn);
        topBar.appendChild(refreshBtn);
        topBar.appendChild(homeBtn);
        topBar.appendChild(urlInput);

        // Extensions Button
        const extBtn = document.createElement("button");
        extBtn.title = "Extensions";
        extBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-4 0 2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 2 2 0 0 1 0 4 2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 1 4 0 2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2 2 2 0 0 1 0-4 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg>`;
        extBtn.style.cssText = btnStyle;
        extBtn.onmouseover = () => { extBtn.style.backgroundColor = "#383a40"; extBtn.style.color = "#dbdee1"; };
        extBtn.onmouseout = () => { extBtn.style.backgroundColor = "transparent"; extBtn.style.color = "#b5bac1"; };
        extBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleExtPanel(); };

        // Window Control Buttons
        const controlsContainer = document.createElement("div");
        controlsContainer.style.cssText = "display: flex; align-items: center; gap: 4px; -webkit-app-region: no-drag;";

        const minBtn = document.createElement("button");
        minBtn.title = "Minimize";
        minBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;
        minBtn.style.cssText = btnStyle;
        minBtn.onmouseover = () => { minBtn.style.backgroundColor = "#383a40"; minBtn.style.color = "#dbdee1"; };
        minBtn.onmouseout = () => { minBtn.style.backgroundColor = "transparent"; minBtn.style.color = "#b5bac1"; };
        minBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setBrowserOpen(false); };

        const openExtBrowserBtn = document.createElement("button");
        openExtBrowserBtn.title = "Open in external browser";
        openExtBrowserBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
        openExtBrowserBtn.style.cssText = btnStyle;
        openExtBrowserBtn.onmouseover = () => { openExtBrowserBtn.style.backgroundColor = "#383a40"; openExtBrowserBtn.style.color = "#dbdee1"; };
        openExtBrowserBtn.onmouseout = () => { openExtBrowserBtn.style.backgroundColor = "transparent"; openExtBrowserBtn.style.color = "#b5bac1"; };
        openExtBrowserBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const currentTab = tabs.find(t => t.id === activeTabId);
            const targetUrl = currentTab?.url || getHomeUrl();
            if (typeof VencordNative !== "undefined" && (VencordNative as any)?.native?.openExternal) {
                (VencordNative as any).native.openExternal(targetUrl);
            } else {
                window.open(targetUrl, "_blank");
            }
        };

        const closeBtn = document.createElement("button");
        closeBtn.title = "Close";
        closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
        closeBtn.style.cssText = btnStyle;
        closeBtn.onmouseover = () => { closeBtn.style.backgroundColor = "#da373c"; closeBtn.style.color = "#ffffff"; };
        closeBtn.onmouseout = () => { closeBtn.style.backgroundColor = "transparent"; closeBtn.style.color = "#b5bac1"; };
        closeBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setBrowserOpen(false); };

        controlsContainer.appendChild(minBtn);
        controlsContainer.appendChild(openExtBrowserBtn);
        controlsContainer.appendChild(closeBtn);

        topBar.appendChild(extBtn);
        topBar.appendChild(controlsContainer);

        // Main content area (viewport + extension panel side-by-side)
        const contentArea = document.createElement("div");
        contentArea.style.cssText = "flex:1;display:flex;overflow:hidden;position:relative;";

        // Viewport
        const viewport = document.createElement("div");
        viewport.id = "browser-viewport";
        viewport.style.flex = "1";
        viewport.style.backgroundColor = "#2b2d31";
        viewport.style.width = "100%";
        viewport.style.position = "relative";
        viewport.style.overflow = "hidden";

        // Extension Panel
        const extPanel = document.createElement("div");
        extPanel.id = "browser-ext-panel";
        extPanel.style.cssText = `
            width:320px;flex-shrink:0;
            background:#1e1f22;
            border-left:1px solid #111214;
            display:none;flex-direction:column;
            transform:translateX(100%);opacity:0;
            transition:transform 0.22s cubic-bezier(0.4,0,0.2,1),opacity 0.22s;
            overflow:hidden;
        `;
        extPanelEl = extPanel as HTMLDivElement;

        contentArea.appendChild(viewport);
        contentArea.appendChild(extPanel);

        el.appendChild(tabBar);
        el.appendChild(topBar);
        el.appendChild(contentArea);

        document.body.appendChild(el);
        renderTabs();

        // Event listeners
        homeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const wv = getWebviewForTab(activeTabId);
            const home = getHomeUrl();
            if (wv) wv.src = home;
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.url = home;
                tab.title = getEngineTitle();
                urlInput.value = tab.url;
                renderTabs();
            }
        });

        urlInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                
                let val = urlInput.value.trim();
                if (!val) return;
                
                if (!val.startsWith("http://") && !val.startsWith("https://")) {
                    if (val.includes(".") && !val.includes(" ")) val = "https://" + val;
                    else val = getSearchUrl(val);
                }
                
                const wv = getWebviewForTab(activeTabId);
                if (wv) wv.src = val;
                
                const tab = tabs.find(t => t.id === activeTabId);
                if (tab) {
                    tab.url = val;
                    try {
                        const urlObj = new URL(val);
                        tab.title = urlObj.hostname.replace("www.", "");
                    } catch(e) {}
                }

                urlInput.value = val;
                urlInput.blur();
                renderTabs();
            }
        });
        
        // Periodic URL sync
        setInterval(() => {
            if (activeTabId && el?.style.display === "flex") {
                const wv = document.getElementById(`webview-${activeTabId}`) as HTMLIFrameElement;
                if (wv) {
                    try {
                        const currentUrl = wv.contentWindow?.location?.href;
                        if (currentUrl && currentUrl !== "about:blank" && currentUrl !== urlInput.value && document.activeElement !== urlInput) {
                            urlInput.value = currentUrl;
                            const tab = tabs.find(t => t.id === activeTabId);
                            if (tab) {
                                tab.url = currentUrl;
                                try {
                                    tab.title = wv.contentDocument?.title || new URL(currentUrl).hostname.replace("www.", "");
                                } catch (e) {}
                                renderTabs();
                            }
                        }
                    } catch(e) {}
                }
            }
        }, 1000);

        const style = document.createElement("style");
        style.id = "browser-global-style";
        style.textContent = `
            body.browser-is-open section[class^="panels_"],
            body.browser-is-open div[class^="container_"]:has(> div[class^="nameTag_"]) {
                display: none !important;
            }
            body.browser-is-open div[class*="wrapper_"][class*="overlay_"] {
                opacity: 0 !important;
                visibility: hidden !important;
            }
            body.browser-is-open #browser-button div[class*="wrapper_"][class*="overlay_"] {
                opacity: 1 !important;
                visibility: visible !important;
            }
            #browser-ext-panel::-webkit-scrollbar { width: 6px; }
            #browser-ext-panel::-webkit-scrollbar-track { background: transparent; }
            #browser-ext-panel::-webkit-scrollbar-thumb { background: #404249; border-radius: 3px; }
        `;
        document.head.appendChild(style);
    }
    return el;
}
