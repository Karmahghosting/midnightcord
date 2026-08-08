/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { Button } from "@components/Button";
import { HeadingPrimary, HeadingSecondary } from "@components/Heading";
import { Margins } from "@utils/margins";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import { React, RestAPI, ScrollerThin, Select,useEffect, useRef, useState } from "@webpack/common";

import { t } from "../autoTranslateMidnightcord";

const RelationshipStore = findStoreLazy("RelationshipStore");
const UserStore = findStoreLazy("UserStore");

const DEFAULT_DELAY_MS = 800;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── Observable state shared between modal instances ── */
const state = {
    running: false,
    finished: false,
    done: 0,
    total: 0,
    log: [] as string[],
    aborted: false,
    delayMs: DEFAULT_DELAY_MS,
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

function getFriendIDs(): string[] {
    if (!RelationshipStore) return [];
    try {
        const ids = RelationshipStore.getFriendIDs?.();
        if (Array.isArray(ids) && ids.length > 0) return ids;
    } catch { }
    try {
        const rels = RelationshipStore.getRelationships?.();
        if (rels && typeof rels === "object") {
            return Object.entries(rels).filter(([, v]) => v === 1).map(([k]) => k);
        }
    } catch { }
    return [];
}

async function startSending(message: string, excludedIds: Set<string> = new Set()) {
    if (state.running) return;
    const allFriends = getFriendIDs();
    const friends = allFriends.filter(id => !excludedIds.has(id));
    state.reset();
    state.total = friends.length;
    state.running = true;
    state.notify();

    for (const id of friends) {
        if (state.aborted) {
            state.log.push("⛔ Stopped.");
            state.notify();
            break;
        }
        const user = UserStore?.getUser?.(id);
        const name = user ? (user.globalName || user.username) : id;

        // Remplacement dynamique de @user par la mention réelle
        const personalizedMessage = message.replace(/@user/g, `<@${id}>`);

        try {
            const dmRes = await RestAPI.post({ url: "/users/@me/channels", body: { recipient_id: id } });
            if (!dmRes?.body?.id) {
                state.log.push(`❌ ${name} — channel not found`);
                state.notify();
                continue;
            }
            await RestAPI.post({ url: `/channels/${dmRes.body.id}/messages`, body: { content: personalizedMessage, tts: false } });
            state.done++;
            state.log.push(`✅ ${name}`);
        } catch (e: any) {
            state.log.push(`❌ ${name} — ${e?.message ?? "error"}`);
        }
        state.notify();
        if (!state.aborted) await sleep(state.delayMs);
    }

    state.running = false;
    state.finished = true;
    state.notify();
}

/* ── Hook to subscribe to the observable state ── */
function useObservableState() {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        state.subscribe(listener);
        return () => state.unsubscribe(listener);
    }, []);
    return state;
}

/* ── Icon SVG ── */
function MassDMIcon(props: any) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM9 11H7V9h2v2Zm4 0h-2V9h2v2Zm4 0h-2V9h2v2Z" />
        </svg>
    );
}

/* ── Modal ── */
function MassDMModal({ rootProps }: { rootProps: any; }) {
    const s = useObservableState();
    const [msg, setMsg] = useState("");
    const [editingDelay, setEditingDelay] = useState(false);
    const [delayInput, setDelayInput] = useState(String(s.delayMs / 1000));
    const [searchTerm, setSearchTerm] = useState("");
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const [showMentionHint, setShowMentionHint] = useState(false);

    // Pour le multi-sélecteur premium
    const [isSelectOpen, setIsSelectOpen] = useState(false);
    const logRef = useRef<any>(null);
    const delayInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollToBottom();
    }, [s.log.length]);

    const handleMsgChange = (val: string) => {
        setMsg(val);
        // Affiche l'aide si l'utilisateur tape @
        if (val.endsWith("@")) {
            setShowMentionHint(true);
        } else {
            setShowMentionHint(false);
        }
    };

    const insertMention = () => {
        // Remplace le @ final par @user
        setMsg(prev => prev.slice(0, -1) + "@user ");
        setShowMentionHint(false);
    };

    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const idle = !s.running && !s.finished;

    const friends = getFriendIDs();
    const filteredFriends = friends
        .map(id => ({ id, user: UserStore?.getUser?.(id) }))
        .filter(({ user }) => {
            if (!searchTerm) return true;
            const name = user?.globalName || user?.username || "";
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        });

    const toggleExclude = (id: string) => {
        const next = new Set(excludedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExcludedIds(next);
    };

    return (
        <ModalRoot {...rootProps} className="mdm-modal">
            <ModalHeader>
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <MassDMIcon style={{ marginRight: 8, color: "#fff" }} />
                    <HeadingPrimary style={{ flex: 1, color: "#fff" }}>{t("Mass DM")}</HeadingPrimary>

                    {idle && (
                        <div style={{ marginRight: 12, minWidth: 220 }}>
                            <Select
                                options={friends.map(id => {
                                    const user = UserStore?.getUser?.(id);
                                    return {
                                        value: id,
                                        label: user?.globalName || user?.username || id,
                                    };
                                })}
                                isSelected={(id: string) => excludedIds.has(id)}
                                select={(id: string) => toggleExclude(id)}
                                serialize={(id: string) => id}
                                placeholder={t("Exclude friends...")}
                                closeOnSelect={false}
                                renderOptionLabel={(o: any) => {
                                    const user = UserStore?.getUser?.(o.value);
                                    const avatar = user?.getAvatarURL?.() || "https://cdn.discordapp.com/embed/avatars/0.png";
                                    const isExcluded = excludedIds.has(o.value);
                                    return (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                                            <img src={avatar} style={{ borderRadius: "50%", width: 20, height: 20 }} />
                                            <span style={{ flex: 1, color: isExcluded ? "var(--status-danger)" : "var(--text-normal)" }}>
                                                {o.label}
                                            </span>
                                        </div>
                                    );
                                }}
                                renderOptionValue={() => (
                                    <span style={{ color: excludedIds.size > 0 ? "var(--status-danger)" : "inherit" }}>
                                        {excludedIds.size > 0 ? `${excludedIds.size} excluded` : "Exclude friends..."}
                                    </span>
                                )}
                            />
                        </div>
                    )}

                    {s.running && <span className="mdm-badge">{t("Running...")}</span>}
                    <ModalCloseButton onClick={rootProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent>
                {idle && (
                    <div className="mdm-idle-container">
                        <div className="mdm-full-panel">
                            <HeadingSecondary className={Margins.bottom8} style={{ color: "#fff" }}>{t("Message to send to friends")}</HeadingSecondary>
                            <div style={{ position: "relative" }}>
                                <textarea
                                    className="mdm-textarea-main"
                                    placeholder={t("Write your message here... Use @user to mention the recipient.")}
                                    value={msg}
                                    onChange={e => handleMsgChange(e.currentTarget.value)}
                                    rows={12}
                                />
                                {showMentionHint && (
                                    <div className="mdm-mention-hint" onClick={insertMention}>
                                        <div className="mdm-mention-hint-item">
                                            <strong>@user</strong> — {t("Mention the recipient")}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {idle && (
                    <p className={`mdm-warn ${Margins.top16}`}>
                        ⚠️ {t("Will be sent to")} <strong>{friends.length - excludedIds.size} {t("friends")}</strong> —{" "}
                        {editingDelay ? (
                            <input
                                ref={delayInputRef}
                                className="mdm-delay-input"
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="60"
                                value={delayInput}
                                onChange={e => setDelayInput(e.currentTarget.value)}
                                onBlur={() => {
                                    const val = Math.max(0.1, Math.min(60, parseFloat(delayInput) || 0.8));
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
                                className="mdm-delay-value"
                                onClick={() => { setDelayInput(String(s.delayMs / 1000)); setEditingDelay(true); }}
                                title={t("Click to modify delay")}
                            >
                                {s.delayMs / 1000}s
                            </span>
                        )}
                        {" "}{t("between each.")}
                    </p>
                )}
                {(s.running || s.finished) && (
                    <>
                        <div className="mdm-stats">
                            <span className="mdm-stats-count">{s.done} / {s.total} {t("friends")}</span>
                            <span className="mdm-stats-pct">{pct}%</span>
                        </div>
                        <div className="mdm-bar-bg">
                            <div className="mdm-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        {s.finished && (
                            <p className="mdm-done">✅ {t("Finished — {count} message(s) sent.").replace("{count}", s.done.toString())}</p>
                        )}
                        <ScrollerThin className="mdm-log" ref={logRef}>
                            {s.log.map((line, i) => <div key={i} className="mdm-log-line">{line}</div>)}
                        </ScrollerThin>
                    </>
                )}
            </ModalContent>

            <ModalFooter>
                {idle && (
                    <>
                        <Button variant="secondary" onClick={rootProps.onClose}>{t("Cancel")}</Button>
                        <Button variant="positive" onClick={() => startSending(msg, excludedIds)} disabled={!msg.trim()}>▶ {t("Start")}</Button>
                    </>
                )}
                {s.running && (
                    <>
                        <Button variant="secondary" onClick={rootProps.onClose}>{t("Close (background)")}</Button>
                        <Button variant="dangerPrimary" onClick={() => { state.aborted = true; }}>⛔ {t("Stop")}</Button>
                    </>
                )}
                {s.finished && (
                    <>
                        <Button variant="secondary" onClick={() => state.reset()}>{t("Restart")}</Button>
                        <Button variant="positive" onClick={rootProps.onClose}>{t("Close")}</Button>
                    </>
                )}
            </ModalFooter>
        </ModalRoot>
    );
}

/* ── Header bar button ── */
function MassDMButton() {
    return (
        <HeaderBarButton
            icon={MassDMIcon}
            tooltip={t("Mass DM")}
            onClick={() => openModal(props => <MassDMModal rootProps={props} />)}
        />
    );
}

/* ── Plugin definition ── */
export default definePlugin({
    name: "MassDM",
    enabledByDefault: true,
    description: "Sends a message to all your friends with an anti-rate-limit delay.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    headerBarButton: { icon: MassDMIcon, render: MassDMButton },
    start() { },
    stop() { state.aborted = true; },
});
