/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { closeModal, ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Menu, React, Text, useEffect, useState, IconUtils } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import {domain} from "../../../DOMAIN.json";

const PresenceStore = findByPropsLazy("getStatus", "isMobileOnline");
const AuthStore = findByPropsLazy("getToken");

type UserStatus = "online" | "idle" | "dnd" | "invisible" | "offline";

function useUserStatus(userId: string): UserStatus {
    const [status, setStatus] = useState<UserStatus>(() => {
        try { return PresenceStore.getStatus(userId) ?? "offline"; } catch { return "offline"; }
    });

    useEffect(() => {
        const update = () => {
            try { setStatus(PresenceStore.getStatus(userId) ?? "offline"); } catch {}
        };
        // PresenceStore dispatches on flux — poll on mount is enough for a modal
        update();
        // Optional: subscribe if PresenceStore exposes an addChangeListener
        if (typeof PresenceStore.addChangeListener === "function") {
            PresenceStore.addChangeListener(update);
            return () => PresenceStore.removeChangeListener?.(update);
        }
    }, [userId]);

    return status;
}

const STATUS_COLOR: Record<UserStatus, string> = {
    online:    "#23a55a",
    idle:      "#f0b232",
    dnd:       "#f23f42",
    invisible: "#80848e",
    offline:   "#80848e",
};

// ─── API ──────────────────────────────────────────────────────────────────────

const API_BASE = `https://api.${domain}/api`;

interface PrevNameEntry {
    timestamp: number;
    date: string;
    name: string;
}

interface PrevNamesResponse {
    userId: string;
    prevnames: PrevNameEntry[];
}

async function fetchPrevNames(userId: string): Promise<PrevNamesResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout
    try {
        const res = await fetch(`${API_BASE}/prevnames/${userId}`, { signal: controller.signal });
        if (res.status === 404) return { userId, prevnames: [] };
        if (res.status === 429) throw new Error("RATE_LIMITED");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } catch (e: any) {
        if (e?.name === "AbortError") throw new Error("TIMEOUT");
        throw e;
    } finally {
        clearTimeout(timeout);
    }
}

function getBannerUrl(userId: string, bannerHash: string | null | undefined, size = 480): string | null {
    if (!bannerHash) return null;
    return IconUtils?.getUserBannerURL({ id: userId, banner: bannerHash, size }) ?? null;
}

function getAvatarUrl(userId: string, avatarHash: string | null | undefined, size = 128): string {
    if (!avatarHash) {
        return IconUtils?.getDefaultAvatarURL(userId) ?? "";
    }
    return IconUtils?.getUserAvatarURL({ id: userId, avatar: avatarHash } as any, false, size) ?? "";
}

function formatRelativeDate(date: Date): string {
    const now = new Date();
    const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

    const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Today at ${timeStr}`;
    if (isYesterday) return `Yesterday at ${timeStr}`;
    return date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) + ` at ${timeStr}`;
}

function HighlightText({ text, search }: { text: string; search: string }) {
    const cleanSearch = search.trim();
    if (!cleanSearch) return <span>{text}</span>;
    const escaped = cleanSearch.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === cleanSearch.toLowerCase()
                    ? <mark key={i} className="vc-pn-highlight">{part}</mark>
                    : part
            )}
        </span>
    );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const CopyIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const CheckIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const AlertIcon = ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const ClockIcon = ({ size = 18, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const CalendarIcon = ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const UserIcon = ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const HistoryIcon = ({ size = 44, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
        <line x1="12" y1="7" x2="12" y2="12" />
        <line x1="12" y1="12" x2="15" y2="14" />
    </svg>
);

const SortIcon = ({ asc }: { asc: boolean }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", transform: asc ? "rotate(180deg)" : "rotate(0deg)" }}>
        <line x1="12" y1="20" x2="12" y2="4" />
        <polyline points="6 10 12 4 18 10" />
    </svg>
);

// ─── CopyBtn ──────────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };

    return (
        <button onClick={copy} title={copied ? "Copied!" : "Copy"} className={`vc-pn-copy-btn ${copied ? "vc-pn-copy-btn--copied" : ""}`}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {label && <span className="vc-pn-copy-label">{copied ? "Copied!" : label}</span>}
        </button>
    );
}

// ─── Name Card ────────────────────────────────────────────────────────────────

function NameCard({ entry, index, isLatest, isOldest, search }: {
    entry: PrevNameEntry; index: number; isLatest: boolean; isOldest: boolean; search: string;
}) {
    const date = new Date(entry.date);

    return (
        <div
            className={`vc-pn-card ${isLatest ? "vc-pn-card--latest" : isOldest ? "vc-pn-card--oldest" : ""}`}
            style={{ animationDelay: `${index * 0.04}s` }}
        >
            {/* Timeline */}
            <div className="vc-pn-timeline-track">
                {/* Ligne au-dessus du dot (sauf premier) */}
                <div className="vc-pn-timeline-line-top" style={{ visibility: isLatest ? "hidden" : "visible" }} />
                {/* Dot */}
                <div className={`vc-pn-timeline-dot ${isLatest ? "vc-pn-timeline-dot--latest" : ""}`} />
                {/* Ligne en-dessous du dot (sauf dernier) */}
                <div className="vc-pn-timeline-line-bottom" style={{ visibility: isOldest ? "hidden" : "visible" }} />
            </div>

            {/* Card body */}
            <div className="vc-pn-card-body">
                <div className="vc-pn-card-inner">
                    {/* Index chip */}
                    <div className={`vc-pn-index-chip ${isLatest ? "vc-pn-index-chip--latest" : ""}`}>
                        {index + 1}
                    </div>

                    {/* Name + meta */}
                    <div className="vc-pn-card-content">
                        <div className="vc-pn-card-name-row">
                            <span className="vc-pn-card-name">
                                <HighlightText text={entry.name} search={search} />
                            </span>
                            {isLatest && <span className="vc-pn-badge vc-pn-badge--latest">Current</span>}
                            {isOldest && !isLatest && <span className="vc-pn-badge vc-pn-badge--oldest">1st</span>}
                        </div>
                        <div className="vc-pn-card-date">
                            <CalendarIcon size={11} color="var(--text-muted)" />
                            <span>{formatRelativeDate(date)}</span>
                        </div>
                    </div>

                    {/* Copy btn */}
                    <div className="vc-pn-card-actions">
                        <CopyBtn text={entry.name} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Skeleton Loading ────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
    return (
        <div className="vc-pn-card" style={{ animationDelay: `${index * 0.06}s`, opacity: 0.6 }}>
            <div className="vc-pn-timeline-track">
                <div className="vc-pn-timeline-dot" />
                {index < 3 && <div className="vc-pn-timeline-line" />}
            </div>
            <div className="vc-pn-card-body">
                <div className="vc-pn-card-inner" style={{ gap: 10 }}>
                    <div className="vc-pn-skeleton" style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div className="vc-pn-skeleton" style={{ width: `${45 + index * 8}%`, height: 14, borderRadius: 6 }} />
                        <div className="vc-pn-skeleton" style={{ width: "55%", height: 10, borderRadius: 4 }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── User Banner ──────────────────────────────────────────────────────────────

function UserBanner({ onClose, userId, bannerHash, accentColor }: {
    onClose: () => void;
    userId: string;
    bannerHash?: string | null;
    accentColor?: number | null;
}) {
    const bannerUrl = getBannerUrl(userId, bannerHash);

    // Fallback color: use accentColor if available, otherwise derive from userId
    const fallbackHue = accentColor
        ? `#${accentColor.toString(16).padStart(6, "0")}`
        : `hsl(${[...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360}, 55%, 30%)`;

    return (
        <div className="vc-pn-banner">
            {bannerUrl ? (
                <img
                    src={bannerUrl}
                    className="vc-pn-banner-canvas"
                    style={{ objectFit: "cover", objectPosition: "center 20%" }}
                    draggable={false}
                />
            ) : (
                <div className="vc-pn-banner-canvas" style={{ background: "#000000" }} />
            )}
            {/* Close */}
            <div className="vc-pn-close-btn">
                <ModalCloseButton onClick={onClose} />
            </div>
        </div>
    );
}

// ─── Status Badge (pixel-perfect Discord style) ───────────────────────────────

function StatusBadge({ userId }: { userId: string }) {
    const status = useUserStatus(userId);
    const color = STATUS_COLOR[status] ?? STATUS_COLOR.offline;

    // DND = solid circle with a horizontal bar (Discord's exact shape)
    // Idle = crescent moon shape via clip-path
    // Offline/Invisible = hollow ring
    // Online = solid circle

    if (status === "dnd") {
        return (
            <div className="vc-pn-status-badge" style={{ background: "#f23f42" }}>
                <div style={{
                    width: 8, height: 2.5,
                    background: "#fff",
                    borderRadius: 2,
                }} />
            </div>
        );
    }

    if (status === "idle") {
        return (
            <div className="vc-pn-status-badge" style={{ background: "#f0b232", overflow: "hidden", position: "relative" }}>
                {/* Crescent: a white circle offset to cover part of the badge */}
                <div style={{
                    position: "absolute",
                    width: 10, height: 10,
                    borderRadius: "50%",
                    background: "var(--background-secondary)",
                    top: -3, right: -3,
                }} />
            </div>
        );
    }

    if (status === "offline" || status === "invisible") {
        return (
            <div className="vc-pn-status-badge" style={{
                background: "var(--background-secondary)",
                boxShadow: "inset 0 0 0 2.5px #80848e",
            }} />
        );
    }

    // online
    return (
        <div className="vc-pn-status-badge" style={{ background: "#23a55a" }} />
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function PrevNamesModal({ modalProps, userId, username, avatarHash }: {
    modalProps: any;
    userId: string;
    username: string;
    avatarHash?: string | null;
}) {
    const [data, setData] = useState<PrevNamesResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [avatarError, setAvatarError] = useState(false);
    const [search, setSearch] = useState("");
    const [sortAsc, setSortAsc] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [bannerHash, setBannerHash] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetchPrevNames(userId)
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    };

    useEffect(() => { load(); }, [userId]);

    // Fetch full Discord profile to get banner hash
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token: string = AuthStore.getToken();
                const res = await fetch(`https://discord.com/api/v9/users/${userId}/profile?with_mutual_guilds=false`, {
                    headers: { Authorization: token },
                });
                if (!res.ok || cancelled) return;
                const json = await res.json();
                const hash: string | null = json?.user?.banner ?? null;
                if (!cancelled) setBannerHash(hash);
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [userId]);

    const all = data?.prevnames
        ? [...data.prevnames].sort((a, b) => sortAsc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp)
        : [];

    const filtered = search.trim()
        ? all.filter(e => e.name.toLowerCase().includes(search.trim().toLowerCase()))
        : all;

    const avatarUrl = getAvatarUrl(userId, avatarHash);
    const hue = [...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    const initial = username[0]?.toUpperCase() ?? "?";
    const isRateLimited = error === "RATE_LIMITED";

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className="vc-pn-modal-root">

            {/* ── Banner ── */}
            <UserBanner onClose={modalProps.onClose} userId={userId} bannerHash={bannerHash} />

            {/* ── Header ── */}
            <div className="vc-pn-header">
                {/* Avatar */}
                <div className="vc-pn-avatar-wrap">
                    <div className="vc-pn-avatar-ring">
                        {!avatarError ? (
                            <img src={avatarUrl} onError={() => setAvatarError(true)} className="vc-pn-avatar-img" />
                        ) : (
                            <div className="vc-pn-avatar-fallback" style={{ background: `hsl(${hue},55%,48%)` }}>
                                {initial}
                            </div>
                        )}
                    </div>
                    <div style={{ position: "absolute", bottom: 0, right: 0 }}>
                        <StatusBadge userId={userId} />
                    </div>
                </div>

                {/* User info */}
                <div className="vc-pn-user-info">
                    <div className="vc-pn-username-row">
                        <span className="vc-pn-username">{username}</span>
                        <CopyBtn text={username} />
                    </div>
                    <div className="vc-pn-userid-row">
                        <code className="vc-pn-userid">{userId}</code>
                        <CopyBtn text={userId} />
                    </div>
                </div>

                {/* Stats pills */}
                {!loading && !error && all.length > 0 && (
                    <div className="vc-pn-stats">
                        <div className="vc-pn-stat vc-pn-stat--blue">
                            <div className="vc-pn-stat-icon vc-pn-stat-icon--blue">
                                <UserIcon size={13} color="#5865F2" />
                            </div>
                            <div className="vc-pn-stat-content">
                                <span className="vc-pn-stat-label">Usernames</span>
                                <span className="vc-pn-stat-value">{all.length}</span>
                            </div>
                        </div>
                        <div className="vc-pn-stat vc-pn-stat--green">
                            <div className="vc-pn-stat-icon vc-pn-stat-icon--green">
                                <CalendarIcon size={13} color="#23a55a" />
                            </div>
                            <div className="vc-pn-stat-content">
                                <span className="vc-pn-stat-label">Since</span>
                                <span className="vc-pn-stat-value">
                                    {all.length > 0
                                        ? new Date(all[all.length - 1].date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                        : "—"}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Content ── */}
            <ModalContent className="vc-pn-content">

                {/* Loading */}
                {loading && (
                    <div>
                        <div className="vc-pn-section-label vc-pn-skeleton" style={{ width: 80, height: 12, borderRadius: 4, marginBottom: 16 }} />
                        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} index={i} />)}
                    </div>
                )}

                {/* Timeout */}
                {!loading && error === "TIMEOUT" && (
                    <div className="vc-pn-alert vc-pn-alert--warn">
                        <div className="vc-pn-alert-icon"><ClockIcon size={20} color="#f0b232" /></div>
                        <div className="vc-pn-alert-body">
                            <span className="vc-pn-alert-title" style={{ color: "#f0b232" }}>Server waking up…</span>
                            <span className="vc-pn-alert-desc" style={{ color: "#ffffff" }}>The API server was sleeping (Render free tier). It usually takes 30–60s to start. Please retry.</span>
                        </div>
                        <button onClick={load} className="vc-pn-retry-btn">Retry</button>
                    </div>
                )}

                {/* Rate limit */}
                {!loading && isRateLimited && (
                    <div className="vc-pn-alert vc-pn-alert--warn">
                        <div className="vc-pn-alert-icon"><ClockIcon size={20} color="#f0b232" /></div>
                        <div className="vc-pn-alert-body">
                            <span className="vc-pn-alert-title" style={{ color: "#f0b232" }}>Rate Limited</span>
                            <span className="vc-pn-alert-desc" style={{ color: "#ffffff" }}>Please wait a few seconds before retrying.</span>
                        </div>
                        <button onClick={load} className="vc-pn-retry-btn">Retry</button>
                    </div>
                )}

                {/* Error */}
                {!loading && error && !isRateLimited && (
                    <div className="vc-pn-alert vc-pn-alert--error">
                        <div className="vc-pn-alert-icon"><AlertIcon size={20} color="#f23f42" /></div>
                        <div className="vc-pn-alert-body">
                            <span className="vc-pn-alert-title" style={{ color: "#f23f42" }}>Connection Error</span>
                            <span className="vc-pn-alert-desc" style={{ color: "#ffffff" }}>Failed to fetch history: {error}</span>
                        </div>
                        <button onClick={load} className="vc-pn-retry-btn">Retry</button>
                    </div>
                )}

                {/* Empty */}
                {!loading && !error && all.length === 0 && (
                    <div className="vc-pn-empty">
                        <div className="vc-pn-empty-icon">
                            <HistoryIcon size={40} color="var(--text-muted)" />
                        </div>
                        <span className="vc-pn-empty-title">No history</span>
                        <span className="vc-pn-empty-desc">
                            No previous usernames recorded for this user.
                        </span>
                    </div>
                )}

                {/* List */}
                {!loading && !error && all.length > 0 && (
                    <div>
                        {/* Toolbar */}
                        <div className="vc-pn-toolbar">
                            {/* Search */}
                            <div className={`vc-pn-search-wrap ${searchFocused ? "vc-pn-search-wrap--focused" : ""}`}>
                                <svg className="vc-pn-search-icon" width="15" height="15" viewBox="0 0 24 24">
                                    <path fill="var(--text-muted)" d="M21.707 20.293l-4.825-4.825A8.46 8.46 0 0019 10.5 8.5 8.5 0 1010.5 19a8.46 8.46 0 004.968-1.618l4.825 4.825a1 1 0 001.414-1.414zM10.5 17A6.5 6.5 0 1117 10.5 6.508 6.508 0 0110.5 17z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search a username…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setSearchFocused(false)}
                                    className="vc-pn-search-input"
                                />
                                {search && (
                                    <button onClick={() => setSearch("")} className="vc-pn-search-clear">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Sort */}
                            <button onClick={() => setSortAsc(v => !v)} className="vc-pn-sort-btn">
                                <SortIcon asc={sortAsc} />
                                <span>{sortAsc ? "Oldest" : "Recent"}</span>
                            </button>
                        </div>

                        {/* Section label */}
                        <div className="vc-pn-section-label">
                            {search && filtered.length !== all.length
                                ? `${filtered.length} result${filtered.length > 1 ? "s" : ""} out of ${all.length}`
                                : `${all.length} username${all.length > 1 ? "s" : ""} recorded`}
                        </div>

                        {/* Cards (timeline layout) */}
                        <div className="vc-pn-list" style={{ position: "relative" }}>
                            {filtered.length === 0 ? (
                                <div className="vc-pn-no-results">
                                    No results for « <strong>{search}</strong> »
                                </div>
                            ) : (
                                filtered.map((entry, i) => (
                                    <NameCard
                                        key={`${entry.timestamp}-${i}`}
                                        entry={entry}
                                        index={i}
                                        isLatest={!sortAsc ? i === 0 : i === filtered.length - 1}
                                        isOldest={!sortAsc ? i === filtered.length - 1 : i === 0}
                                        search={search}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openPrevNamesModal(userId: string, username: string, avatarHash?: string | null) {
    const key = openModal(props => (
        <PrevNamesModal
            modalProps={{ ...props, onClose: () => closeModal(key) }}
            userId={userId}
            username={username}
            avatarHash={avatarHash}
        />
    ));
}

// ─── Context Menu Patch ───────────────────────────────────────────────────────

const userCtxPatch: NavContextMenuPatchCallback = (children, props) => {
    const userId: string | undefined = props?.user?.id;
    if (!userId) return;
    const username = props?.user?.globalName ?? props?.user?.username ?? userId;
    const avatarHash = props?.user?.avatar ?? null;
    children.push(
        <Menu.MenuItem
            id="prevnames-open"
            label="PrevNames"
            action={() => openPrevNamesModal(userId, username, avatarHash)}
        />
    );
};

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "PrevNames",
    description: "Shows the username history of a user. Right-click → PrevNames.",
    authors: [{ name: "you",
     id: 0n }],
    dependencies: ["ContextMenuAPI"],

    start() {
        const style = document.createElement("style");
        style.id = "vc-prevnames-style";
        style.textContent = `
            /* ── Keyframes ── */
            @keyframes vc-pn-spin { to { transform: rotate(360deg); } }
            @keyframes vc-pn-fadeUp {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes vc-pn-shimmer {
                0%   { background-position: -300% 0; }
                100% { background-position: 300% 0; }
            }
            @keyframes vc-pn-dotPop {
                0%   { transform: scale(0); opacity: 0; }
                70%  { transform: scale(1.3); }
                100% { transform: scale(1); opacity: 1; }
            }

            /* ── Modal Root ── */
            .vc-pn-modal-root {
                border-radius: 16px !important;
                overflow: hidden !important;
                border: 1px solid rgba(255,255,255,0.06) !important;
                box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(88,101,242,0.08) !important;
            }

            /* ── Banner ── */
            .vc-pn-banner {
                height: 120px;
                position: relative;
                overflow: hidden;
                border-radius: 16px 16px 0 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
                cursor: default;
            }
            .vc-pn-banner-canvas {
                position: absolute; inset: 0;
                width: 100%; height: 100%;
                display: block;
                object-fit: cover;
                object-position: center 20%;
            }
            .vc-pn-close-btn {
                position: absolute;
                top: 10px; right: 10px;
                z-index: 10;
            }

            /* ── Header ── */
            .vc-pn-header {
                padding: 0 20px 18px 20px;
                background: var(--background-secondary);
                border-bottom: 1px solid rgba(255,255,255,0.04);
                position: relative;
                overflow: visible;
            }

            /* ── Avatar ── */
            .vc-pn-avatar-wrap {
                position: relative;
                margin-top: -44px;
                margin-bottom: 12px;
                display: inline-flex;
                align-self: flex-start;
                width: 86px;
                height: 86px;
            }
            .vc-pn-avatar-ring {
                width: 80px; height: 80px;
                border-radius: 50%;
                padding: 3px;
                background: #ffffff;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                position: relative;
            }
            .vc-pn-avatar-img {
                width: 100%; height: 100%;
                border-radius: 50%;
                object-fit: cover;
                display: block;
                background: var(--background-tertiary);
            }
            .vc-pn-avatar-fallback {
                width: 100%; height: 100%;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-size: 30px; font-weight: 800; color: #fff;
            }
            /* Discord-accurate status badge */
            .vc-pn-status-badge {
                width: 16px; height: 16px;
                border-radius: 50%;
                border: 3px solid var(--background-secondary);
                display: flex; align-items: center; justify-content: center;
                box-sizing: border-box;
                flex-shrink: 0;
            }

            /* ── User info ── */
            .vc-pn-user-info { margin-bottom: 14px; }
            .vc-pn-username-row {
                display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
            }
            .vc-pn-username {
                font-size: 21px; font-weight: 800;
                color: #ffffff;
                letter-spacing: -0.3px;
            }
            .vc-pn-userid-row { display: flex; align-items: center; gap: 6px; }
            .vc-pn-userid {
                font-size: 11.5px;
                color: rgba(255,255,255,0.5);
                font-family: var(--font-code);
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.08);
                padding: 2px 8px; border-radius: 5px;
            }

            /* ── Stats ── */
            .vc-pn-stats { display: flex; gap: 10px; }
            .vc-pn-stat {
                flex: 1;
                display: flex; align-items: center; gap: 10px;
                padding: 9px 13px;
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.05);
                background: rgba(255,255,255,0.02);
                transition: all 0.2s ease;
                cursor: default;
            }
            .vc-pn-stat:hover { transform: translateY(-2px); }
            .vc-pn-stat--blue:hover { border-color: rgba(88,101,242,0.25); box-shadow: 0 4px 16px rgba(88,101,242,0.1); }
            .vc-pn-stat--green:hover { border-color: rgba(35,165,90,0.25); box-shadow: 0 4px 16px rgba(35,165,90,0.1); }
            .vc-pn-stat-icon {
                width: 30px; height: 30px; border-radius: 8px;
                display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            }
            .vc-pn-stat-icon--blue { background: rgba(88,101,242,0.15); }
            .vc-pn-stat-icon--green { background: rgba(35,165,90,0.15); }
            .vc-pn-stat-content { display: flex; flex-direction: column; }
            .vc-pn-stat-label {
                font-size: 9.5px; font-weight: 700;
                color: rgba(255,255,255,0.4);
                text-transform: uppercase; letter-spacing: 0.6px;
            }
            .vc-pn-stat-value { font-size: 13px; font-weight: 700; color: #ffffff; }

            /* ── Content ── */
            .vc-pn-content { padding: 18px 20px 22px !important; }

            /* ── Section label ── */
            .vc-pn-section-label {
                font-size: 10.5px; font-weight: 700;
                color: rgba(255,255,255,0.4);
                text-transform: uppercase; letter-spacing: 0.7px;
                margin-bottom: 14px; padding-left: 2px;
            }

            /* ── Toolbar ── */
            .vc-pn-toolbar {
                display: flex; gap: 8px; margin-bottom: 14px; align-items: stretch;
            }
            .vc-pn-search-wrap {
                flex: 1; position: relative;
                display: flex; align-items: center;
                background: var(--background-tertiary);
                border: 1px solid rgba(255,255,255,0.07);
                border-radius: 9px;
                transition: all 0.2s ease;
            }
            .vc-pn-search-wrap--focused {
                border-color: rgba(88,101,242,0.5);
                box-shadow: 0 0 0 3px rgba(88,101,242,0.12);
            }
            .vc-pn-search-icon {
                position: absolute; left: 11px; pointer-events: none; flex-shrink: 0;
            }
            .vc-pn-search-input {
                width: 100%; padding: 9px 36px 9px 34px;
                background: transparent; border: none; outline: none;
                color: #ffffff; font-size: 13.5px;
                box-sizing: border-box;
            }
            .vc-pn-search-input::placeholder { color: rgba(255,255,255,0.35); }
            .vc-pn-search-clear {
                position: absolute; right: 9px;
                background: none; border: none; cursor: pointer;
                color: var(--text-muted); padding: 4px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 4px;
                transition: color 0.15s, background 0.15s;
            }
            .vc-pn-search-clear:hover { color: var(--text-normal); background: rgba(255,255,255,0.06); }
            .vc-pn-sort-btn {
                display: flex; align-items: center; gap: 6px;
                padding: 0 14px;
                background: var(--background-tertiary);
                border: 1px solid rgba(255,255,255,0.07);
                border-radius: 9px;
                color: #ffffff;
                font-size: 12.5px; font-weight: 700;
                cursor: pointer; white-space: nowrap;
                transition: all 0.2s ease;
            }
            .vc-pn-sort-btn:hover {
                background: rgba(88,101,242,0.12);
                border-color: rgba(88,101,242,0.3);
                color: #5865F2;
                box-shadow: 0 2px 10px rgba(88,101,242,0.12);
            }

            /* ── Timeline list ── */
            .vc-pn-list {
                max-height: 330px;
                overflow-y: auto;
                padding-right: 2px;
            }
            .vc-pn-list::-webkit-scrollbar { width: 5px; }
            .vc-pn-list::-webkit-scrollbar-track { background: transparent; }
            .vc-pn-list::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.07); border-radius: 10px;
            }
            .vc-pn-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }

            /* ── Card (timeline row) ── */
            .vc-pn-card {
                display: flex;
                gap: 0;
                animation: vc-pn-fadeUp 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
                margin-bottom: 4px;
            }
            .vc-pn-timeline-track {
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 24px;
                flex-shrink: 0;
            }
            .vc-pn-timeline-line-top,
            .vc-pn-timeline-line-bottom {
                flex: 1;
                width: 0;
                min-height: 10px;
                border-left: 1.5px dashed rgba(255,255,255,0.12);
            }
            .vc-pn-timeline-dot {
                width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
                background: #3a3d44;
                border: 2px solid rgba(255,255,255,0.2);
                animation: vc-pn-dotPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
                animation-delay: inherit;
            }
            .vc-pn-timeline-dot--latest {
                background: #5865F2;
                border-color: rgba(88,101,242,0.7);
                box-shadow: 0 0 0 3px rgba(88,101,242,0.2);
            }
            .vc-pn-timeline-line { display: none; }
            .vc-pn-card-body { flex: 1; padding-bottom: 6px; }
            .vc-pn-card-inner {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                border-radius: 10px;
                background: rgba(255,255,255,0.012);
                border: 1px solid rgba(255,255,255,0.04);
                margin-left: 8px;
                transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s cubic-bezier(0.22,1,0.36,1);
            }
            .vc-pn-card:hover .vc-pn-card-inner {
                background: rgba(255,255,255,0.03);
                border-color: rgba(255,255,255,0.08);
                box-shadow: 0 4px 18px rgba(0,0,0,0.25);
                transform: translateX(2px);
            }
            .vc-pn-card--latest .vc-pn-card-inner {
                background: rgba(88,101,242,0.06);
                border-color: rgba(88,101,242,0.14);
            }
            .vc-pn-card--latest:hover .vc-pn-card-inner {
                background: rgba(88,101,242,0.1);
                border-color: rgba(88,101,242,0.22);
                box-shadow: 0 4px 20px rgba(88,101,242,0.12);
            }

            /* Index chip */
            .vc-pn-index-chip {
                width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center;
                font-size: 10px; font-weight: 800;
                background: rgba(255,255,255,0.05);
                color: rgba(255,255,255,0.4);
                border: 1px solid rgba(255,255,255,0.06);
            }
            .vc-pn-index-chip--latest {
                background: rgba(88,101,242,0.18);
                color: #8b97ff;
                border-color: rgba(88,101,242,0.3);
            }

            /* Card content */
            .vc-pn-card-content {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            .vc-pn-card-name-row {
                display: flex; align-items: center; gap: 6px;
                flex-wrap: nowrap; overflow: hidden;
            }
            .vc-pn-card-name {
                font-size: 14px; font-weight: 700;
                color: #ffffff;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                flex-shrink: 1; min-width: 0;
            }
            .vc-pn-card-date {
                display: flex; align-items: center; gap: 5px;
                font-size: 11px; color: rgba(255,255,255,0.38);
            }
            .vc-pn-card-actions {
                opacity: 0;
                transform: scale(0.9);
                transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.22,1,0.36,1);
                flex-shrink: 0;
            }
            .vc-pn-card:hover .vc-pn-card-actions { opacity: 1; transform: scale(1); }

            /* Badges */
            .vc-pn-badge {
                font-size: 9px; font-weight: 800;
                padding: 2px 7px; border-radius: 4px;
                text-transform: uppercase; letter-spacing: 0.4px;
                flex-shrink: 0;
            }
            .vc-pn-badge--latest {
                color: #23a55a;
                background: rgba(35,165,90,0.12);
                border: 1px solid rgba(35,165,90,0.22);
            }
            .vc-pn-badge--oldest {
                color: var(--text-muted);
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.07);
            }

            /* Highlight */
            .vc-pn-highlight {
                background: rgba(88,101,242,0.25);
                color: #8b96ff;
                border-radius: 3px;
                padding: 0 1px;
                font-weight: 800;
            }

            /* ── Copy button ── */
            .vc-pn-copy-btn {
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 6px; cursor: pointer;
                padding: 4px 7px;
                display: inline-flex; align-items: center; justify-content: center; gap: 5px;
                color: var(--interactive-normal);
                font-size: 11px; font-weight: 600;
                transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
                flex-shrink: 0;
            }
            .vc-pn-copy-btn:hover {
                background: rgba(255,255,255,0.08);
                border-color: rgba(255,255,255,0.12);
                color: var(--text-normal);
                transform: scale(1.05);
            }
            .vc-pn-copy-btn:active { transform: scale(0.94); }
            .vc-pn-copy-btn--copied {
                background: rgba(35,165,90,0.12) !important;
                border-color: rgba(35,165,90,0.25) !important;
                color: #23a55a !important;
            }
            .vc-pn-copy-label { font-size: 11px; }

            /* ── Alerts ── */
            .vc-pn-alert {
                display: flex; align-items: flex-start; gap: 14px;
                padding: 16px 18px; border-radius: 12px;
                animation: vc-pn-fadeUp 0.3s ease both;
            }
            .vc-pn-alert--warn {
                background: rgba(240,178,50,0.07);
                border: 1px solid rgba(240,178,50,0.18);
            }
            .vc-pn-alert--error {
                background: rgba(242,63,66,0.07);
                border: 1px solid rgba(242,63,66,0.18);
            }
            .vc-pn-alert-icon { flex-shrink: 0; margin-top: 1px; }
            .vc-pn-alert-body {
                flex: 1; display: flex; flex-direction: column; gap: 3px;
            }
            .vc-pn-alert-title { font-size: 14px; font-weight: 700; }
            .vc-pn-alert-desc { font-size: 13px; color: #ffffff; line-height: 1.4; }
            .vc-pn-retry-btn {
                padding: 6px 16px; border-radius: 7px;
                background: #5865F2; border: none;
                color: #fff; font-size: 13px; font-weight: 700;
                cursor: pointer; flex-shrink: 0; align-self: center;
                transition: all 0.2s ease;
            }
            .vc-pn-retry-btn:hover { background: #4752c4; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(88,101,242,0.3); }
            .vc-pn-retry-btn:active { transform: translateY(0); }

            /* ── Empty ── */
            .vc-pn-empty {
                display: flex; flex-direction: column; align-items: center;
                padding: 48px 0; gap: 10px;
                animation: vc-pn-fadeUp 0.3s ease both;
            }
            .vc-pn-empty-icon {
                width: 72px; height: 72px; border-radius: 20px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 6px;
            }
            .vc-pn-empty-title { font-size: 16px; font-weight: 700; color: #ffffff; }
            .vc-pn-empty-desc {
                font-size: 13px; color: rgba(255,255,255,0.4);
                text-align: center; max-width: 260px; line-height: 1.5;
            }

            /* ── No results ── */
            .vc-pn-no-results {
                text-align: center; padding: 28px 0;
                color: rgba(255,255,255,0.4); font-size: 13.5px;
                animation: vc-pn-fadeUp 0.25s ease both;
            }

            /* ── Skeleton ── */
            .vc-pn-skeleton {
                background: linear-gradient(90deg,
                    rgba(255,255,255,0.03) 25%,
                    rgba(255,255,255,0.08) 50%,
                    rgba(255,255,255,0.03) 75%);
                background-size: 300% 100%;
                animation: vc-pn-shimmer 1.6s infinite linear;
                display: block;
            }
        `;
        document.head.appendChild(style);
    },

    stop() {
        document.getElementById("vc-prevnames-style")?.remove();
    },

    contextMenus: {
        "user-context": userCtxPatch,
        "user-profile-actions": userCtxPatch,
        "gdm-context": userCtxPatch,
    },
});