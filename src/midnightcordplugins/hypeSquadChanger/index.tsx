/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { React, ReactDOM, showToast, Toasts, UserStore } from "@webpack/common";

function getDiscordLocale(): string {
    return (window as any).Vencord?.Webpack?.findByProps?.("getLocale")?.getLocale?.() || navigator.language || "fr";
}

let domObserver: MutationObserver | null = null;
let isPluginStarted = false;
const roots = new Map<string, any>(); // track React 18 roots for proper unmount

export async function changeHypeSquadHouse(houseId: number) {
    try {
        const TokenStore = (window as any).Vencord?.Webpack?.findByProps?.("getToken");
        const token = TokenStore?.getToken?.() || (window as any).localStorage?.token?.replace(/"/g, "");
        if (!token) {
            showToast("Impossible de récupérer le token Discord", Toasts.Type.FAILURE);
            return;
        }

        const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
        const houseNames: Record<number, string> = {
            1: "Bravery",
            2: "Brilliance",
            3: "Balance",
            0: isFr ? "Quitté / Aucune" : "Left / None"
        };

        showToast(isFr ? "Changement de maison HypeSquad..." : "Updating HypeSquad house...", Toasts.Type.MESSAGE);

        const res = await fetch("https://discord.com/api/v9/hypesquad/online", {
            method: houseId === 0 ? "DELETE" : "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            },
            body: houseId === 0 ? undefined : JSON.stringify({ house_id: houseId })
        });

        if (res.ok) {
            showToast(
                isFr ? `Maison HypeSquad mise à jour : ${houseNames[houseId] ?? houseId} !` : `HypeSquad House updated: ${houseNames[houseId] ?? houseId}!`,
                Toasts.Type.SUCCESS
            );
            setTimeout(() => location.reload(), 600);
        } else {
            showToast(isFr ? `Erreur lors du changement de maison. Status: ${res.status}` : `Failed to change house. Status: ${res.status}`, Toasts.Type.FAILURE);
        }
    } catch (err: any) {
        showToast(`Erreur HypeSquad: ${err?.message || err}`, Toasts.Type.FAILURE);
    }
}

export function HypeSquadSelectComponent() {
    const isFr = getDiscordLocale().toLowerCase().startsWith("fr");

    const [selectedHouse, setSelectedHouse] = React.useState<number>(() => {
        const currentUser = UserStore.getCurrentUser();
        if (currentUser?.flags) {
            if (currentUser.flags & 64) return 1;
            if (currentUser.flags & 128) return 2;
            if (currentUser.flags & 256) return 3;
        }
        return 0;
    });

    const houses = [
        {
            id: 1,
            name: "Bravery",
            icon: "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png"
        },
        {
            id: 2,
            name: "Brilliance",
            icon: "https://cdn.discordapp.com/badge-icons/011940fd013da3f7fb926e4a1cd2e618.png"
        },
        {
            id: 3,
            name: "Balance",
            icon: "https://cdn.discordapp.com/badge-icons/3aa41de486fa12454c3761e8e223442e.png"
        }
    ];

    const handleClick = (id: number) => {
        if (selectedHouse === id) return;
        setSelectedHouse(id);
        changeHypeSquadHouse(id);
    };

    const handleLeave = () => {
        setSelectedHouse(0);
        changeHypeSquadHouse(0);
    };

    return (
        <div style={{ marginTop: 14, marginBottom: 14, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ color: "var(--header-primary, #f2f3f5)", fontWeight: 700, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.04em", margin: 0 }}>
                    {isFr ? "Maison HypeSquad" : "HypeSquad House"}
                </h3>
                <button
                    onClick={handleLeave}
                    style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        background: selectedHouse === 0 ? "rgba(237, 66, 69, 0.25)" : "rgba(237, 66, 69, 0.12)",
                        color: "#ed4245",
                        border: selectedHouse === 0 ? "1px solid #ed4245" : "1px solid rgba(237, 66, 69, 0.3)",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        outline: "none"
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = "#ed4245";
                        e.currentTarget.style.color = "#ffffff";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = selectedHouse === 0 ? "rgba(237, 66, 69, 0.25)" : "rgba(237, 66, 69, 0.12)";
                        e.currentTarget.style.color = "#ed4245";
                    }}
                >
                    {isFr ? "Retirer le badge (Quitter)" : "Leave (Remove Badge)"}
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                {houses.map(h => {
                    const isSelected = selectedHouse === h.id;
                    return (
                        <button
                            key={h.id}
                            onClick={() => handleClick(h.id)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "8px",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                background: isSelected
                                    ? "var(--background-secondary-alt, rgba(255, 255, 255, 0.12))"
                                    : "var(--background-secondary, rgba(255, 255, 255, 0.05))",
                                border: isSelected
                                    ? "1.5px solid var(--brand-500, #5865f2)"
                                    : "1px solid rgba(255, 255, 255, 0.08)",
                                boxShadow: isSelected ? "0 0 12px rgba(88, 101, 242, 0.35)" : "none",
                                cursor: "pointer",
                                transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                                outline: "none"
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.09)";
                                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.18)";
                                    e.currentTarget.style.transform = "translateY(-1px)";
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = "var(--background-secondary, rgba(255, 255, 255, 0.05))";
                                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                                    e.currentTarget.style.transform = "translateY(0)";
                                }
                            }}
                        >
                            <img
                                src={h.icon}
                                alt={h.name}
                                style={{
                                    width: 22,
                                    height: 22,
                                    filter: isSelected ? "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" : "grayscale(0.15)"
                                }}
                            />
                            <span
                                style={{
                                    fontSize: "13px",
                                    fontWeight: isSelected ? 700 : 600,
                                    color: isSelected ? "#ffffff" : "var(--text-muted, #b5bac1)",
                                    letterSpacing: "0.01em"
                                }}
                            >
                                {h.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function injectHypeSquadChangerIntoNativePanel() {
    // 1. Inject into new User Profile Editing Panel modal (#user-profile-editing-panel)
    const editingPanel = document.querySelector("#user-profile-editing-panel, [class*='editingPanel_']");
    if (editingPanel && !document.getElementById("midnightcord-hypesquad-changer-modal-container")) {
        const scroller = editingPanel.querySelector("[class*='content__523e1'], [class*='scroller_'], [class*='scrollRegion_'] > div");
        if (scroller) {
            const container = document.createElement("div");
            container.id = "midnightcord-hypesquad-changer-modal-container";
            container.className = "group__96e81";
            container.style.marginTop = "12px";
            container.style.marginBottom = "16px";
            container.style.width = "100%";

            const floatingFooter = scroller.querySelector("[class*='floatingFooter_']");
            if (floatingFooter) {
                scroller.insertBefore(container, floatingFooter);
            } else {
                scroller.appendChild(container);
            }

            try {
                const root = (ReactDOM as any).createRoot(container);
                roots.set(container.id, root);
                root.render(<HypeSquadSelectComponent />);
            } catch (e) {
                console.error("[HypeSquadChanger] Modal render failed:", e);
            }
        }
    }

    // 2. Inject into standard User Settings sidebar profile view
    const settingsView = document.querySelector("[class*='standardSidebarView_']");
    if (settingsView && !document.getElementById("midnightcord-hypesquad-changer-container")) {
        const sidebar = settingsView.querySelector("[class*='sidebar_']");
        const selectedItem = sidebar?.querySelector("[class*='selected_']");
        const itemText = selectedItem?.textContent?.toLowerCase() || "";
        const itemId = selectedItem?.getAttribute("data-tab-id")?.toLowerCase() || selectedItem?.id?.toLowerCase() || "";

        const isProfileTab =
            itemText.includes("profil") ||
            itemText.includes("profile") ||
            itemId.includes("profile") ||
            itemId.includes("profiles") ||
            !!settingsView.querySelector("[class*='profileCustomization_'], [class*='customizationSection_']");

        if (isProfileTab) {
            const contentColumn = settingsView.querySelector("[class*='contentColumn_']");
            if (contentColumn) {
                let targetParent: Element | null = contentColumn.querySelector(
                    "[class*='customizationSection_'], [class*='profileCustomization_'], [class*='sectionsContainer_'], [class*='profileSettings_'], [class*='profilePanel_'], [class*='sections_']"
                );

                if (!targetParent) {
                    const flexChildren = Array.from(contentColumn.children).filter(el => el.tagName === "DIV");
                    if (flexChildren.length > 0) {
                        const leftCol = flexChildren.find(el =>
                            el.querySelector("[class*='swatch_'], [class*='avatar_'], [class*='banner_'], [class*='section_'], [class*='option_']")
                        );
                        targetParent = leftCol || flexChildren[0];
                    }
                }

                if (!targetParent) targetParent = contentColumn;

                if (!targetParent.querySelector("#midnightcord-hypesquad-changer-container")) {
                    const container = document.createElement("div");
                    container.id = "midnightcord-hypesquad-changer-container";
                    container.style.marginTop = "16px";
                    container.style.marginBottom = "16px";
                    container.style.width = "100%";
                    targetParent.appendChild(container);

                    try {
                        const root = (ReactDOM as any).createRoot(container);
                        roots.set(container.id, root);
                        root.render(<HypeSquadSelectComponent />);
                    } catch (e) {
                        console.error("[HypeSquadChanger] Settings render failed:", e);
                    }
                }
            }
        }
    }
}

function startDomObserver() {
    stopDomObserver();
    if (!isPluginStarted) return;
    injectHypeSquadChangerIntoNativePanel();
    domObserver = new MutationObserver(() => {
        if (!isPluginStarted) return;
        injectHypeSquadChangerIntoNativePanel();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopDomObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
    for (const id of ["midnightcord-hypesquad-changer-container", "midnightcord-hypesquad-changer-modal-container"]) {
        const root = roots.get(id);
        if (root) {
            try { root.unmount(); } catch {}
            roots.delete(id);
        }
        const elem = document.getElementById(id);
        if (elem) elem.remove();
    }
}

export default definePlugin({
    name: "HypeSquadChanger",
    description: "Allows changing your HypeSquad house (Bravery, Brilliance, Balance) or leaving HypeSquad directly from Discord user profile settings panel or plugin settings.",
    enabledByDefault: true,
    authors: [Devs.Ven],
    settingsAboutComponent: HypeSquadSelectComponent,
    start() {
        isPluginStarted = true;
        startDomObserver();
    },
    stop() {
        isPluginStarted = false;
        stopDomObserver();
    }
});
