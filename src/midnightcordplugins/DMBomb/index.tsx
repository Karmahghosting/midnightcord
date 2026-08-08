/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Menu, React, RestAPI, Select, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";
import { GuildMemberStore, GuildRoleStore, GuildStore, UserStore } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── State ── */
const state = {
    running: false,
    finished: false,
    done: 0,
    total: 0,
    log: [] as string[],
    aborted: false,
    delayMs: 1500,
    extraTokens: [] as string[], // Multi-token support
    listeners: new Set<() => void>(),
    notify() { this.listeners.forEach(fn => fn()); },
    subscribe(fn: () => void) { this.listeners.add(fn); },
    unsubscribe(fn: () => void) { this.listeners.delete(fn); },
    reset() {
        this.running = false;
        this.finished = false;
        this.done = 0;
        this.total = 0;
        this.log = [];
        this.aborted = false;
        this.notify();
    },
};

const getMembers = (guildId: string): any[] => {
    try { return Object.values(GuildMemberStore.getMembers(guildId) || {}); } catch { }
    return [];
};

async function sendDMWithToken(token: string | null, recipientId: string, message: string): Promise<boolean> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;

    // 1. Create DM channel
    const chanRes = await fetch("https://discord.com/api/v9/users/@me/channels", {
        method: "POST",
        headers,
        body: JSON.stringify({ recipient_id: recipientId })
    });
    if (!chanRes.ok) return false;
    const chanData = await chanRes.json();
    if (!chanData?.id) return false;

    // 2. Send Message
    const msgRes = await fetch(`https://discord.com/api/v9/channels/${chanData.id}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: message, tts: false })
    });
    return msgRes.ok;
}

async function startBomb(guildId: string, roleId: string | "all", message: string) {
    if (state.running) return;

    let members = getMembers(guildId);
    if (!members.length) {
        showToast(t("No members found in cache, try loading the member list first (scroll through it)."), Toasts.Type.FAILURE);
        return;
    }

    if (roleId !== "all") {
        members = members.filter(m => m.roles.includes(roleId));
    }

    // Filter bots and self
    const meId = UserStore.getCurrentUser()?.id;
    members = members.filter(m => {
        const u = UserStore.getUser(m.userId);
        return u && !u.bot && u.id !== meId;
    });

    state.reset();
    state.total = members.length;
    state.running = true;
    state.notify();

    // Prepare token pool (null represents active client token, extraTokens are secondary accounts)
    const tokenPool = [null, ...state.extraTokens.filter(t => t.trim().length > 10)];
    let tokenIndex = 0;

    for (const m of members) {
        if (state.aborted) {
            state.log.push(`⛔ ${t("Stopped.")}`);
            state.notify();
            break;
        }

        const user = UserStore.getUser(m.userId);
        const name = user ? (user.globalName || user.username) : m.userId;
        const currentToken = tokenPool[tokenIndex % tokenPool.length];
        const accountTag = currentToken ? `[Bot #${(tokenIndex % tokenPool.length) + 1}]` : "[Main Account]";

        try {
            let ok = false;
            if (!currentToken) {
                // Main Account using RestAPI
                const dmRes = await RestAPI.post({ url: "/users/@me/channels", body: { recipient_id: m.userId } });
                if (dmRes?.body?.id) {
                    await RestAPI.post({ url: `/channels/${dmRes.body.id}/messages`, body: { content: message, tts: false } });
                    ok = true;
                }
            } else {
                // Secondary Token
                ok = await sendDMWithToken(currentToken, m.userId, message);
            }

            if (ok) {
                state.done++;
                state.log.push(`✅ ${accountTag} ${name}`);
            } else {
                state.log.push(`❌ ${accountTag} ${name} — ${t("DMs closed or error")}`);
            }
        } catch (e: any) {
            state.log.push(`❌ ${accountTag} ${name} — ${e?.message ?? t("error (rate limit?)")}`);
        }

        tokenIndex++;
        state.notify();
        if (!state.aborted) await sleep(state.delayMs);
    }

    state.running = false;
    state.finished = true;
    state.notify();
}

function useObservableState() {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        state.subscribe(listener);
        return () => state.unsubscribe(listener);
    }, []);
    return state;
}

function BombIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2ZM8 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0ZM19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM21 6.5A1.5 1.5 0 0 1 19.5 8 1.5 1.5 0 0 1 18 6.5 1.5 1.5 0 0 1 19.5 5 1.5 1.5 0 0 1 21 6.5Z" />
        </svg>
    );
}

function DMBombModal({ rootProps, guildId }: { rootProps: any; guildId: string; }) {
    const s = useObservableState();
    const [msg, setMsg] = useState("");
    const [roleId, setRoleId] = useState("all");
    const [editingDelay, setEditingDelay] = useState(false);
    const [delayInput, setDelayInput] = useState(String(s.delayMs / 1000));
    const [tokenInput, setTokenInput] = useState(s.extraTokens.join("\n"));
    const [showTokenSection, setShowTokenSection] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);

    const guild = GuildStore.getGuild(guildId);
    const roles = guild ? GuildRoleStore.getSortedRoles(guildId) : [];
    const members = getMembers(guildId);

    // Calculate counts for eligible members
    const meId = UserStore.getCurrentUser()?.id;
    const eligibleMembers = members.filter(m => {
        const u = UserStore.getUser(m.userId);
        return u && !u.bot && u.id !== meId;
    });

    const countByRole: Record<string, number> = {};
    eligibleMembers.forEach(m => {
        m.roles?.forEach((rId: string) => {
            countByRole[rId] = (countByRole[rId] || 0) + 1;
        });
    });
    const allCount = eligibleMembers.length;

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [s.log.length]);

    const handleTokensChange = (val: string) => {
        setTokenInput(val);
        const tokens = val.split("\n").map(t => t.trim()).filter(t => t.length > 10);
        state.extraTokens = tokens;
    };

    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const idle = !s.running && !s.finished;
    const tokenCount = state.extraTokens.length;

    return (
        <ModalRoot {...rootProps} className="dmb-modal">
            <ModalHeader className="dmb-header">
                <BombIcon style={{ marginRight: 8, color: "#ed4245" }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: "#fff" }}>DM Bomb - {guild?.name ?? t("Server")}</span>
                {s.running && <span className="dmb-badge">{t("Running...")}</span>}
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="dmb-content">
                {idle && (
                    <>
                        <div style={{ marginBottom: 12 }}>
                            <p className="dmb-label">{t("Target:")}</p>
                            <Select
                                options={[
                                    { label: `${t("All members (no safe)")} [${allCount}]`, value: "all" },
                                    ...roles.map((r: any) => ({ label: `@${r.name} [${countByRole[r.id] || 0}]`, value: r.id }))
                                ]}
                                select={setRoleId}
                                serialize={(v: string) => v}
                                isSelected={(v: string) => v === roleId}
                            />
                        </div>

                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <span className="dmb-label">{t("Multi-Account Rotation (Tokens):")}</span>
                                <button
                                    className="dmb-token-toggle"
                                    onClick={() => setShowTokenSection(!showTokenSection)}
                                >
                                    {showTokenSection ? t("Hide Tokens") : `🔑 ${t("Add Secondary Tokens")} (${tokenCount})`}
                                </button>
                            </div>
                            {showTokenSection && (
                                <textarea
                                    className="dmb-textarea dmb-tokens-area"
                                    placeholder={t("Paste Discord tokens here... (1 per line)\nMessages will be automatically rotated across accounts.")}
                                    value={tokenInput}
                                    onChange={e => handleTokensChange(e.currentTarget.value)}
                                    rows={3}
                                />
                            )}
                        </div>

                        <p className="dmb-label">{t("Message:")}</p>
                        <textarea
                            className="dmb-textarea"
                            placeholder={t("Type your message here...")}
                            value={msg}
                            onChange={e => setMsg(e.currentTarget.value)}
                            rows={4}
                        />
                        <p className="dmb-warn">
                            ⚠️ {t("Intensive botting can get your account banned. Delay:")}{" "}
                            {editingDelay ? (
                                <input
                                    className="dmb-delay-input"
                                    type="number"
                                    step="0.1"
                                    min="0.5"
                                    max="60"
                                    value={delayInput}
                                    onChange={e => setDelayInput(e.currentTarget.value)}
                                    onBlur={() => {
                                        const val = Math.max(0.5, Math.min(60, parseFloat(delayInput) || 1.5));
                                        state.delayMs = Math.round(val * 1000);
                                        setDelayInput(String(val));
                                        setEditingDelay(false);
                                        state.notify();
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                                        if (e.key === "Escape") { setDelayInput(String(state.delayMs / 1000)); setEditingDelay(false); }
                                    }}
                                    autoFocus
                                />
                            ) : (
                                <span
                                    className="dmb-delay-value"
                                    onClick={() => { setDelayInput(String(s.delayMs / 1000)); setEditingDelay(true); }}
                                    title={t("Click to modify delay")}
                                >
                                    {s.delayMs / 1000}s
                                </span>
                            )}
                            {tokenCount > 0 && (
                                <span className="dmb-token-active-badge">
                                    {" "}⚡ {t("Rotating across {count} accounts").replace("{count}", String(tokenCount + 1))}
                                </span>
                            )}
                        </p>
                    </>
                )}
                {(s.running || s.finished) && (
                    <>
                        <div className="dmb-stats">
                            <span className="dmb-stats-count">{t("{done} / {total} reached").replace("{done}", String(s.done)).replace("{total}", String(s.total))}</span>
                            <span className="dmb-stats-pct">{pct}%</span>
                        </div>
                        <div className="dmb-bar-bg">
                            <div className="dmb-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        {s.finished && (
                            <p className="dmb-done">✅ {t("Finished with {done} DMs sent.").replace("{done}", String(s.done))}</p>
                        )}
                        <div className="dmb-log" ref={logRef}>
                            {s.log.map((line, i) => <div key={i} className="dmb-log-line">{line}</div>)}
                        </div>
                    </>
                )}
            </ModalContent>

            <ModalFooter className="dmb-footer">
                {idle && (
                    <>
                        <button className="dmb-btn dmb-btn-secondary" onClick={rootProps.onClose}>{t("Cancel")}</button>
                        <button className="dmb-btn dmb-btn-danger" onClick={() => startBomb(guildId, roleId, msg)} disabled={!msg.trim()}>💥 {t("Bombard")}</button>
                    </>
                )}
                {s.running && (
                    <>
                        <button className="mdm-btn mdm-btn-secondary" onClick={rootProps.onClose}>{t("Background")}</button>
                        <button className="dmb-btn dmb-btn-danger" onClick={() => { state.aborted = true; }}>⛔ {t("Stop")}</button>
                    </>
                )}
                {s.finished && (
                    <>
                        <button className="dmb-btn dmb-btn-secondary" onClick={() => state.reset()}>{t("New Bomb")}</button>
                        <button className="dmb-btn dmb-btn-primary" onClick={rootProps.onClose}>{t("Close")}</button>
                    </>
                )}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "DMBomb",
    enabledByDefault: false,
    description: "Sends an aggressive message to ALL server members or a specific role via right click with optional multi-account token rotation.",
    authors: [{ name: "Midnightcord",
     id: 0n }],

    start() {
        addContextMenuPatch("guild-context", this.patchGuildContext);
    },

    stop() {
        removeContextMenuPatch("guild-context", this.patchGuildContext);
    },

    patchGuildContext(children: any[], { guild }: { guild?: any; }) {
        if (!children || !Array.isArray(children)) return;
        try {
            if (!guild) return;

            const bombsItem = (
                <Menu.MenuItem
                    id="dmbomb-btn"
                    key="dmbomb-btn"
                    label={t("DM Bomb")}
                    action={() => openModal(props => <DMBombModal rootProps={props} guildId={guild.id} />)}
                />
            );

            // Find "Fake Friend Request" (from FakeFriends plugin)
            const ffIndex = children.findIndex(c => c?.props?.id === "ff-g-flood");

            if (ffIndex !== -1) {
                children.splice(ffIndex + 1, 0, bombsItem);
            } else {
                children.push(bombsItem);
            }
        } catch (e) {
            console.error("[DMBomb] Context menu patch error:", e);
        }
    }
});
