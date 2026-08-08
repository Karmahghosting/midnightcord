/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import definePlugin from "@utils/types";
import { React, ChannelStore, UserStore, ReactDOM, createRoot, FluxDispatcher, Constants } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { sendMessage } from "@utils/discord";
import ErrorBoundary from "@components/ErrorBoundary";
import { t } from "../autoTranslateMidnightcord";

// ── Stores ─────────────────────────────────────────────────────────────────

const ReadStateStore = findByPropsLazy("getUnreadCount", "getMentionCount");
const MessageStore = findByPropsLazy("getMessages");
const ChannelStoreVencord = findByPropsLazy("getChannel", "hasChannel");
const ReadStateUtils = findByPropsLazy("ack", "ackChannel");
const MessageActions = findByPropsLazy("fetchMessages", "sendMessage");
const PresenceStore = findByPropsLazy("getStatus", "getState");
const SelectedChannelStore = findByPropsLazy("getChannelId", "getVoiceChannelId");
const RestAPI = findByPropsLazy("get", "post");
const Endpoints = findByPropsLazy("MESSAGES");

// ── Helpers ────────────────────────────────────────────────────────────────

function getAvatarUrl(user: any): string {
    if (!user) return "https://cdn.discordapp.com/embed/avatars/0.png";
    if (typeof user.getAvatarURL === "function") {
        try {
            const url = user.getAvatarURL(undefined, 80, true);
            if (url) return url;
        } catch { }
    }
    const id = user.id ?? "0";
    const hash = user.avatar;
    if (!hash) {
        const index = Number((BigInt(id) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    }
    const ext = hash.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=80`;
}

function formatHeaderTime(ts: string | number | Date): string {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Aujourd'hui à ${timeStr}`;

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Hier à ${timeStr}`;

    return `${d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" })} ${timeStr}`;
}

function formatCompactTime(ts: string | number | Date): string {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateDivider(ts: string | number | Date): string {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

// ── Tooltip Component ──────────────────────────────────────────────────────

function Tooltip({ channelId, rect }: { channelId: string; rect: DOMRect; }) {
    const [messages, setMessages] = React.useState<any[]>([]);
    const [replyText, setReplyText] = React.useState("");
    const [sending, setSending] = React.useState(false);
    const scrollerRef = React.useRef<HTMLDivElement>(null);

    // Hide immediately if user is inside this conversation
    const activeChannelId = SelectedChannelStore?.getChannelId?.();
    if (activeChannelId === channelId) return null;

    const channel = React.useMemo(() => {
        try { return ChannelStore?.getChannel(channelId) ?? ChannelStoreVencord?.getChannel(channelId); } catch { return null; }
    }, [channelId]);

    const unread: number = React.useMemo(() => {
        try { return ReadStateStore.getUnreadCount(channelId) ?? 0; } catch { return 0; }
    }, [channelId]);

    React.useEffect(() => {
        let isMounted = true;

        const loadMessages = async () => {
            const msgs = MessageStore?.getMessages(channelId);

            if (msgs && msgs._array && msgs._array.length > 0) {
                if (isMounted) {
                    const count = Math.max(unread, 6);
                    setMessages(msgs._array.slice(-count));
                    setTimeout(() => {
                        if (scrollerRef.current) {
                            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
                        }
                    }, 50);
                }
                return;
            }

            try {
                const url = Constants?.Endpoints?.MESSAGES
                    ? Constants.Endpoints.MESSAGES(channelId)
                    : (Endpoints?.MESSAGES ? Endpoints.MESSAGES(channelId) : `/channels/${channelId}/messages`);

                const res = await RestAPI?.get?.({
                    url,
                    query: { limit: 10 },
                    retries: 2
                });

                if (isMounted && res?.body && Array.isArray(res.body)) {
                    const rawList = [...res.body].reverse();
                    setMessages(rawList);
                    setTimeout(() => {
                        if (scrollerRef.current) {
                            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
                        }
                    }, 50);
                    return;
                }
            } catch (e) {
                console.warn("[PreviewMessage] RestAPI fetch failed, trying fallback", e);
            }

            // Fallback: fetch via MessageActions if RestAPI direct fetch failed or was empty
            try {
                await MessageActions?.fetchMessages({ channelId, limit: 10 });
                const retryMsgs = MessageStore?.getMessages(channelId);
                if (isMounted && retryMsgs && retryMsgs._array) {
                    const count = Math.max(unread, 6);
                    setMessages(retryMsgs._array.slice(-count));
                    setTimeout(() => {
                        if (scrollerRef.current) {
                            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
                        }
                    }, 50);
                }
            } catch (e) {
                console.warn("[PreviewMessage] Fallback fetch failed", e);
            }
        };

        loadMessages();
        return () => { isMounted = false; };
    }, [channelId, unread]);

    // Recipient info
    const recipientUser = React.useMemo(() => {
        if (!channel) return null;
        if (channel.type === 1 || channel.recipients?.length === 1) {
            const rId = channel.recipients?.[0] ?? channel.rawRecipients?.[0]?.id;
            if (rId) return UserStore?.getUser(rId);
        }
        return null;
    }, [channel]);

    const title = recipientUser
        ? (recipientUser.globalName ?? recipientUser.username)
        : (channel?.name ?? t("Aperçu du chat"));

    const channelAvatar = recipientUser
        ? getAvatarUrl(recipientUser)
        : "https://cdn.discordapp.com/embed/avatars/0.png";

    // Status
    const status = React.useMemo(() => {
        if (recipientUser && PresenceStore?.getStatus) {
            try { return PresenceStore.getStatus(recipientUser.id); } catch { return null; }
        }
        return null;
    }, [recipientUser]);

    if (unread === 0 && messages.length === 0) return null;

    // Position: compact dimensions (W: 310, H: 280)
    const W = 310, H = 280, OFFSET = 12;
    let left = rect.right + OFFSET;
    let top = rect.top + rect.height / 2 - H / 2;
    if (left + W > window.innerWidth - 10) left = rect.left - W - OFFSET;
    if (left < 10) left = 10;
    if (top + H > window.innerHeight - 10) top = window.innerHeight - H - 10;
    if (top < 10) top = 10;

    const handleSend = async () => {
        const val = replyText.trim();
        if (!val || sending) return;
        setSending(true);
        try {
            await sendMessage(channelId, { content: val });
            const c = ChannelStoreVencord?.getChannel(channelId) ?? ChannelStore?.getChannel(channelId);
            if (c) ReadStateUtils?.ackChannel?.(c);
            setReplyText("");
            hide(0);
        } catch (err) {
            console.error("[PreviewMessage] Failed to send reply", err);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="pm-tooltip-container" style={{ top, left, width: W }}>
            <div className="pm-chat-popover">
                {/* Real Discord Header */}
                <div className="pm-chat-header">
                    <div className="pm-header-avatar-wrapper">
                        <img className="pm-header-avatar" src={channelAvatar} alt="" />
                        {status && <div className={`pm-status-dot pm-status-${status}`} />}
                    </div>
                    <div className="pm-header-info">
                        <span className="pm-header-name">{title}</span>
                        <span className="pm-header-sub">
                            {unread > 0 ? `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : t("Discussion en direct")}
                        </span>
                    </div>
                    {unread > 0 && <div className="pm-unread-pill">{unread > 99 ? "99+" : unread}</div>}
                </div>

                {/* Real Discord Messages List */}
                <div className="pm-chat-scroller" ref={scrollerRef}>
                    <ol className="pm-chat-messages-inner" role="list">
                        {messages.length === 0 ? (
                            <div className="pm-empty-chat">
                                <div className="pm-empty-spinner" />
                                <span>{t("Chargement...")}</span>
                            </div>
                        ) : (
                            messages.map((m, idx) => {
                                const prev = messages[idx - 1];
                                const author = m.author;
                                const authorName = author?.global_name ?? author?.globalName ?? author?.username ?? "User";
                                const avatar = getAvatarUrl(author);

                                // Grouping
                                const isGroupStart = !prev
                                    || prev.author?.id !== author?.id
                                    || (new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime() > 5 * 60 * 1000)
                                    || Boolean(m.referencedMessage);

                                const showDateDivider = !prev || (new Date(m.timestamp).toDateString() !== new Date(prev.timestamp).toDateString());

                                return (
                                    <React.Fragment key={m.id || idx}>
                                        {showDateDivider && (
                                            <div className="pm-date-divider">
                                                <span className="pm-date-content">{formatDateDivider(m.timestamp)}</span>
                                            </div>
                                        )}
                                        <li className={`pm-message-item ${isGroupStart ? "pm-group-start" : "pm-consecutive"}`}>
                                            <div className="pm-message-wrapper">
                                                {/* Reply Context */}
                                                {m.referencedMessage && (
                                                    <div className="pm-reply-context">
                                                        <img src={getAvatarUrl(m.referencedMessage.author)} className="pm-reply-avatar" alt="" />
                                                        <span className="pm-reply-name">@{m.referencedMessage.author?.global_name ?? m.referencedMessage.author?.username ?? "User"}</span>
                                                        <span className="pm-reply-content">
                                                            {m.referencedMessage.content || (m.referencedMessage.attachments?.length ? "📎 [Pièce jointe]" : "...")}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="pm-message-body">
                                                    {isGroupStart ? (
                                                        <>
                                                            <img className="pm-message-avatar" src={avatar} alt="" />
                                                            <div className="pm-message-header">
                                                                <span className="pm-message-author">{authorName}</span>
                                                                <span className="pm-message-timestamp">{formatHeaderTime(m.timestamp)}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="pm-message-compact-time">{formatCompactTime(m.timestamp)}</div>
                                                    )}

                                                    <div className="pm-message-content">
                                                        {m.content && <span>{m.content}</span>}
                                                    </div>

                                                    {/* Attachments */}
                                                    {m.attachments?.length > 0 && (
                                                        <div className="pm-message-attachments">
                                                            {m.attachments.map((att: any, aIdx: number) => {
                                                                const isImg = att.content_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(att.filename || att.url || "");
                                                                return isImg ? (
                                                                    <img key={att.id || aIdx} src={att.proxy_url || att.url} alt="" className="pm-attachment-img" />
                                                                ) : (
                                                                    <div key={att.id || aIdx} className="pm-attachment-file">
                                                                        <span>📎 {att.filename}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Embeds */}
                                                    {m.embeds?.length > 0 && (
                                                        <div className="pm-message-embeds">
                                                            {m.embeds.map((emb: any, eIdx: number) => (
                                                                <div key={eIdx} className="pm-embed-card" style={{ borderLeftColor: emb.color ? `#${emb.color.toString(16).padStart(6, "0")}` : "#5865f2" }}>
                                                                    {emb.title && <div className="pm-embed-title">{emb.title}</div>}
                                                                    {emb.description && <div className="pm-embed-desc">{emb.description}</div>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    </React.Fragment>
                                );
                            })
                        )}
                    </ol>
                </div>

                {/* Real Discord Chat Input */}
                <div className="pm-chat-input-bar">
                    <div className="pm-input-wrapper">
                        <input
                            type="text"
                            className="pm-input-field"
                            placeholder={t("Répondre à {name}...").replace("{name}", title)}
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button className="pm-send-button" onClick={handleSend} disabled={!replyText.trim() || sending}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const SafeTooltip = ErrorBoundary.wrap(Tooltip, { noop: true });

// ── Tooltip portal ─────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null;
let hideTimer: any = null;
let renderFn: ((node: React.ReactNode) => void) | null = null;

function ensurePortal() {
    if (container) return;
    container = document.createElement("div");
    container.id = "nc-pm-root";
    document.body.appendChild(container);

    if (createRoot) {
        const root = createRoot(container);
        renderFn = node => root.render(node as any);
    } else if (ReactDOM?.render) {
        renderFn = node => ReactDOM.render(node, container);
    }
}

function show(channelId: string, rect: DOMRect) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    ensurePortal();
    renderFn?.(<SafeTooltip channelId={channelId} rect={rect} />);
}

function hide(delay = 150) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    hideTimer = setTimeout(() => renderFn?.(null), delay);
}

// ── DOM Scanning ───────────────────────────────────────────────────────────

function getChannelId(el: Element): string | null {
    const anchor = el.matches("a[href]") ? el : el.querySelector("a[href]");
    if (!anchor) return null;
    const m = anchor.getAttribute("href")?.match(/\/channels\/@me\/(\d{10,21})/);
    return m?.[1] ?? null;
}

function shouldShow(channelId: string): boolean {
    // 1. Hide if user is currently in this channel
    try {
        if (SelectedChannelStore?.getChannelId?.() === channelId) return false;
    } catch { }

    // 2. Hide if no unread messages
    try {
        const unread = ReadStateStore?.getUnreadCount?.(channelId) ?? 0;
        if (unread === 0) return false;
    } catch { return false; }

    return true;
}

function attachHandlers(el: HTMLElement) {
    if (el.dataset.pmHooked) return;
    el.dataset.pmHooked = "1";

    el.addEventListener("mouseenter", () => {
        const channelId = getChannelId(el);
        if (!channelId) return;
        if (!shouldShow(channelId)) return;
        show(channelId, el.getBoundingClientRect());
    });

    el.addEventListener("mouseleave", () => hide(150));

    // Hide immediately when clicking into the conversation
    el.addEventListener("click", () => hide(0));
}

function scan(root: Document | Element = document) {
    root.querySelectorAll<HTMLElement>("li").forEach(li => {
        if (getChannelId(li)) attachHandlers(li);
    });
}

// ── MutationObserver ───────────────────────────────────────────────────────

let observer: MutationObserver | null = null;

function startObserver() {
    observer = new MutationObserver(muts => {
        if (document.visibilityState === "hidden") return;
        for (const m of muts)
            for (const node of m.addedNodes)
                if (node instanceof HTMLElement) scan(node);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan(document);
}

function _onDocMouseEnter(e: Event) {
    if ((e.target as HTMLElement)?.closest?.("#nc-pm-root")) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }
}

function _onDocMouseLeave(e: Event) {
    if ((e.target as HTMLElement)?.closest?.("#nc-pm-root")) hide(150);
}

function _onChannelSelect() {
    hide(0);
}

// ── Plugin ─────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "PreviewMessage",
    enabledByDefault: false,
    description: "Hover over a DM in your inbox to preview unread messages without opening the conversation. Only shows when there are unread messages.",
    authors: [{
        name: "midnightcord",
        id: 0n
    }],
    tags: ["Chat", "Utility"],

    start() {
        startObserver();

        document.addEventListener("mouseenter", _onDocMouseEnter, true);
        document.addEventListener("mouseleave", _onDocMouseLeave, true);

        try {
            FluxDispatcher?.subscribe?.("CHANNEL_SELECT", _onChannelSelect);
        } catch { }
    },

    stop() {
        observer?.disconnect(); observer = null;
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        renderFn?.(null);
        container?.remove(); container = null; renderFn = null;

        document.removeEventListener("mouseenter", _onDocMouseEnter, true);
        document.removeEventListener("mouseleave", _onDocMouseLeave, true);

        try {
            FluxDispatcher?.unsubscribe?.("CHANNEL_SELECT", _onChannelSelect);
        } catch { }

        document.querySelectorAll<HTMLElement>("[data-pm-hooked]").forEach(el => {
            delete el.dataset.pmHooked;
        });
    },
});
