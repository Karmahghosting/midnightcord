/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { proxyLazy } from "@utils/lazy";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { StartAt, OptionType } from "@utils/types";
import { findAll, filters, findByCodeLazy, findByProps, findByPropsLazy, findComponentByCodeLazy, findStore, waitFor } from "@webpack";
import { ChannelActionCreators, ChannelStore, DisplayProfileUtils, FluxDispatcher, i18n, IconUtils, React, SelectedChannelStore, SnowflakeUtils, UsernameUtils, UserProfileActions, UserStore } from "@webpack/common";
import ErrorBoundary from "@components/ErrorBoundary";
import { BaseText } from "@components/BaseText";
import { MIDNIGHTCORD_AVATAR_BASE64 } from "./avatarData";

export const MIDNIGHTCORD_USER_ID = "999999999999999999";
export const MIDNIGHTCORD_CHANNEL_ID = "999999999999999990";

const LS_LAST_SEEN = "midnightcord_official_dm_last_seen";
const LS_LAST_TS = "midnightcord_official_dm_last_ts";

export const settings = definePluginSettings({
    isDmClosed: {
        type: OptionType.BOOLEAN,
        description: "Whether the official DM is closed",
        default: false,
        hidden: true,
    }
});

const API_URLS = [
    "https://social.nightcord.st/api/v1/timelines/public?local=true&limit=20",
    "https://social.nightcord.st/api/v1/timelines/public?limit=20"
];

function getItemSafe(key: string): string | null {
    try {
        if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    } catch {}
    return null;
}

function setItemSafe(key: string, val: string): void {
    try {
        if (typeof localStorage !== "undefined") localStorage.setItem(key, val);
    } catch {}
}

let lastSeenPostId = getItemSafe(LS_LAST_SEEN) || "";
let lastPostTimestamp = Number(getItemSafe(LS_LAST_TS) || 0);
let pollInterval: ReturnType<typeof setInterval> | null = null;
let unreadCount = 0;
let domObserver: MutationObserver | null = null;
let isAppLoaded = false;

const midnightcordAvatarUrl = MIDNIGHTCORD_AVATAR_BASE64;

const createChannelRecordFromServer = findByCodeLazy(".GUILD_TEXT]", "fromServer)");
const createMessageRecord = findByCodeLazy(".createFromServer(", ".isBlockedForMessage", "messageReference:");

function replaceDiscordWithMidnightcord(text: string): string {
    if (!text || typeof text !== "string") return text;
    return text
        .replace(/Official Discord Message/gi, "Official Midnightcord Message")
        .replace(/Message officiel de Discord/gi, "Message officiel de Midnightcord")
        .replace(/Team Discord/gi, "Team Midnightcord")
        .replace(/l'équipe Discord/gi, "l'équipe Midnightcord")
        .replace(/official Discord notifications/gi, "official Midnightcord notifications")
        .replace(/notifications officielles de Discord/gi, "notifications officielles de Midnightcord")
        .replace(/Discord ne vous demandera/gi, "Midnightcord ne vous demandera")
        .replace(/Discord ne te demandera/gi, "Midnightcord ne te demandera")
        .replace(/Discord will never ask/gi, "Midnightcord will never ask");
}

function isMidnightcordContext(node: Node): boolean {
    if (SelectedChannelStore.getChannelId() === MIDNIGHTCORD_CHANNEL_ID) return true;

    let curr: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    while (curr) {
        if (curr.getAttribute) {
            const href = curr.getAttribute("href");
            if (href && (href.includes(MIDNIGHTCORD_CHANNEL_ID) || href.includes(MIDNIGHTCORD_USER_ID))) return true;
            const ariaLabel = curr.getAttribute("aria-label");
            if (ariaLabel && ariaLabel.toLowerCase().includes("midnightcord")) return true;
            const dataId = curr.getAttribute("data-list-item-id") || curr.getAttribute("data-channel-id");
            if (dataId && (dataId.includes(MIDNIGHTCORD_CHANNEL_ID) || dataId.includes(MIDNIGHTCORD_USER_ID))) return true;
        }
        curr = curr.parentElement;
    }
    return false;
}

let isUpdatingDom = false;

function patchTextNodes(node: Node) {
    if (isUpdatingDom) return;
    if (!isMidnightcordContext(node)) return;

    isUpdatingDom = true;
    try {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue && /Discord/i.test(node.nodeValue)) {
                const newText = replaceDiscordWithMidnightcord(node.nodeValue);
                if (newText !== node.nodeValue) {
                    node.nodeValue = newText;
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;

            // Fix aria-label or title attributes if present (e.g. tooltips and aria-labels in DM list)
            ["aria-label", "title"].forEach(attr => {
                const val = el.getAttribute(attr);
                if (val && /Discord/i.test(val)) {
                    el.setAttribute(attr, replaceDiscordWithMidnightcord(val));
                }
            });

            const fixImg = (img: Element) => {
                const currentSrc = (img as HTMLImageElement).src || img.getAttribute("href") || img.getAttribute("xlink:href");
                if (currentSrc && !currentSrc.startsWith("data:image")) {
                    if (currentSrc.includes(MIDNIGHTCORD_USER_ID) || currentSrc.includes("midnightcord_avatar") || currentSrc.includes("social.nightcord.st/favicon")) {
                        if (img instanceof HTMLImageElement) img.src = midnightcordAvatarUrl;
                        img.setAttribute("href", midnightcordAvatarUrl);
                        img.setAttribute("xlink:href", midnightcordAvatarUrl);
                    }
                }
            };
            const tag = el.tagName?.toUpperCase();
            if (tag === "IMG" || tag === "IMAGE") fixImg(el);
            el.querySelectorAll("img, image").forEach(fixImg);

            for (const child of Array.from(el.childNodes)) {
                patchTextNodes(child);
            }
        }
    } finally {
        isUpdatingDom = false;
    }
}

function startDomObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver(mutations => {
        for (const mut of mutations) {
            if (mut.type === "childList") {
                mut.addedNodes.forEach(patchTextNodes);
            } else if (mut.type === "characterData") {
                patchTextNodes(mut.target);
            } else if (mut.type === "attributes") {
                patchTextNodes(mut.target);
            }
        }
    });
    domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "title"],
    });
    patchTextNodes(document.body);
}

function stopDomObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
}

function handleGlobalClick(e: MouseEvent) {
    if (SelectedChannelStore.getChannelId() !== MIDNIGHTCORD_CHANNEL_ID) return;
    const target = e.target as HTMLElement;
    if (!target) return;

    const btn = target.closest("button") || target.closest("a");
    if (btn) {
        const txt = btn.textContent?.trim().toLowerCase();
        if (txt === "learn more" || txt === "en savoir plus") {
            e.preventDefault();
            e.stopPropagation();
            window.open("https://nightcord.st", "_blank");
        }
    }
}

const rawMidnightcordUser = {
    id: MIDNIGHTCORD_USER_ID,
    username: "midnightcord",
    discriminator: "0",
    globalName: "Midnightcord",
    global_name: "Midnightcord",
    avatar: "midnightcord_avatar",
    avatarURL: midnightcordAvatarUrl,
    accentColor: 5793266, // #5865F2 Blue
    accent_color: 5793266,
    bannerColor: "#5865f2",
    banner_color: "#5865f2",
    bot: true,
    system: true,
    publicFlags: 1, // 1 << 0 STAFF
    public_flags: 1,
    flags: 1,
    premiumType: 0,
    mfaEnabled: false,
    verified: true,
    email: null,
    phone: null,
    nsfwAllowed: true,
    createdAt: new Date("2009-11-07T12:00:00.000Z"),
    getCreatedAt: () => new Date("2009-11-07T12:00:00.000Z"),
    isSystemUser: () => true,
    isVerifiedBot: () => true,
    isOfficialSystem: () => true,
    isStaff: () => true,
    isStaffPersonal: () => true,
    isBot: () => true,
    isNonUserBot: () => true,
    isObfuscated: () => false,
    hasUniqueUsername: () => true,
    hasFlag: (flag: number) => (flag & 1) !== 0,
    hasPublicFlag: (flag: number) => (flag & 1) !== 0,
    getAvatarURL: () => midnightcordAvatarUrl,
    getAvatarSource: () => ({ uri: midnightcordAvatarUrl }),
    getAvatarDecorationURL: () => null,
    getBannerURL: () => null,
    toString: () => `<@${MIDNIGHTCORD_USER_ID}>`,
};

const rawMidnightcordUserProxy = new Proxy(rawMidnightcordUser, {
    get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "string") {
            if (prop.startsWith("is") || prop.startsWith("has") || prop.startsWith("can")) {
                return () => false;
            }
            if (prop.startsWith("get")) {
                return () => null;
            }
        }
        return undefined;
    }
});

export const MIDNIGHTCORD_USER = proxyLazy(() => {
    try {
        const URec: any = UserStore.getCurrentUser()?.constructor;
        if (URec) {
            const u = new URec({
                id: MIDNIGHTCORD_USER_ID,
                username: "midnightcord",
                discriminator: "0",
                globalName: "Midnightcord",
                global_name: "Midnightcord",
                avatar: "midnightcord_avatar",
                accent_color: 5793266,
                accentColor: 5793266,
                banner_color: "#5865f2",
                bannerColor: "#5865f2",
                bot: true,
                system: true,
                public_flags: 1,
                flags: 1,
                verified: true,
            });
            u.isSystemUser = () => true;
            u.isVerifiedBot = () => true;
            u.isOfficialSystem = () => true;
            u.isStaff = () => true;
            u.isStaffPersonal = () => true;
            u.hasFlag = (flag: number) => (flag & 1) !== 0;
            u.hasPublicFlag = (flag: number) => (flag & 1) !== 0;
            u.getAvatarURL = () => midnightcordAvatarUrl;
            u.getAvatarSource = () => ({ uri: midnightcordAvatarUrl });
            u.createdAt = new Date("2009-11-07T12:00:00.000Z");
            u.getCreatedAt = () => new Date("2009-11-07T12:00:00.000Z");
            u.accentColor = 5793266;
            u.bannerColor = "#5865f2";
            return u;
        }
    } catch {}
    return rawMidnightcordUserProxy;
});

const rawMidnightcordChannel = {
    id: MIDNIGHTCORD_CHANNEL_ID,
    type: 1, // DM
    name: "Midnightcord",
    guild_id: null,
    guildId: null,
    getGuildId: () => null,
    getRecipientId: () => MIDNIGHTCORD_USER_ID,
    recipients: [MIDNIGHTCORD_USER_ID],
    rawRecipients: [MIDNIGHTCORD_USER],
    isSystem: () => true,
    isOfficialSystem: () => true,
    isSystemDM: () => true,
    isDM: () => true,
    isGroupDM: () => false,
    isMultiUserDM: () => false,
    isPrivate: () => true,
    isArchivedThread: () => false,
    isThread: () => false,
    isSpam: () => false,
    isMessageRequest: () => false,
    isSystemMessage: () => false,
    isNsfw: () => false,
    isNSFW: () => false,
    isObfuscated: () => false,
    isVS: () => false,
    isDirectory: () => false,
    isManaged: () => false,
    isOwner: () => false,
    isGuildVocal: () => false,
    isVoice: () => false,
    isCategory: () => false,
    isGuildStageVoice: () => false,
    isMediaChannel: () => false,
    isForumLikeChannel: () => false,
    isForumPost: () => false,
    isRoleSubscriptionTemplateSupported: () => false,
    isListenable: () => false,
    isVocal: () => false,
    flags: 0,
    hasFlag: () => false,
    hasPublicFlag: () => false,
    getApplicationId: () => null,
    isGuildVoice: () => false,
    isGuildText: () => false,
    isGuildAnnouncement: () => false,
    isModeratorReportChannel: () => false,
    computedPosition: 0,
    position: 0,
    permissionOverwrites: {},
};

const rawMidnightcordChannelProxy = new Proxy(rawMidnightcordChannel, {
    get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "string") {
            if (prop.startsWith("is") || prop.startsWith("has") || prop.startsWith("can")) {
                return () => false;
            }
            if (prop.startsWith("get")) {
                return () => null;
            }
        }
        return undefined;
    }
});

export const MIDNIGHTCORD_CHANNEL = proxyLazy(() => {
    try {
        if (typeof createChannelRecordFromServer === "function") {
            const ch = createChannelRecordFromServer({
                id: MIDNIGHTCORD_CHANNEL_ID,
                type: 1, // DM
                name: "Midnightcord",
                recipients: [MIDNIGHTCORD_USER],
                rawRecipients: [MIDNIGHTCORD_USER],
                is_spam: false,
                is_message_request: false,
            });
            if (ch) {
                ch.isSystem = () => true;
                ch.isOfficialSystem = () => true;
                ch.isSystemDM = () => true;
                ch.getRecipientId = () => MIDNIGHTCORD_USER_ID;
                return ch;
            }
        }
    } catch {}
    return rawMidnightcordChannelProxy;
});

let unpatchUserStore: (() => void) | null = null;
let unpatchUserStoreGetUsers: (() => void) | null = null;
let unpatchChannelStore: (() => void) | null = null;
let unpatchChannelStoreGetPrivate: (() => void) | null = null;
let unpatchPrivateChannelSortStore: (() => void) | null = null;
let unpatchFetchMessages: (() => void) | null = null;
let unpatchHTTPGet: (() => void) | null = null;
let unpatchHTTPPost: (() => void) | null = null;
let unpatchOpenPrivateChannel: (() => void) | null = null;
let unpatchClosePrivateChannel: (() => void) | null = null;
let unpatchFluxDispatch: (() => void) | null = null;
let unpatchReadStateGetMention: (() => void) | null = null;
let unpatchReadStateGetUnread: (() => void) | null = null;
let unpatchReadStateHasUnread: (() => void) | null = null;
let unpatchIntlString: (() => void) | null = null;
let unpatchIntlFormat: (() => void) | null = null;
let unpatchUserProfileStore: (() => void) | null = null;
let unpatchSnowflakeUtils: (() => void) | null = null;
let unpatchDisplayProfile: (() => void) | null = null;
let unpatchSectionStores: (() => void)[] = [];
let unpatchAvatarFns: (() => void)[] = [];

function htmlToMarkdown(html: string): string {
    if (!html) return "";
    let text = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p><p>/gi, "\n\n")
        .replace(/<p>/gi, "")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
        .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
        .replace(/<b>(.*?)<\/b>/gi, "**$1**")
        .replace(/<em>(.*?)<\/em>/gi, "*$1*")
        .replace(/<i>(.*?)<\/i>/gi, "*$1*")
        .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
        .replace(/<[^>]+>/g, "");

    text = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    return text.trim();
}

async function fetchMastodonFeed(): Promise<any[]> {
    for (const url of API_URLS) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) return data;
            }
        } catch {}
    }
    return [];
}

async function checkAndInjectPosts(isInitialLoad = false) {
    if (settings.store.isDmClosed) return;
    try {
        const posts = await fetchMastodonFeed();
        if (!Array.isArray(posts) || posts.length === 0) return;

        if (!settings.store.isDmClosed) {
            setTimeout(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "CHANNEL_CREATE",
                        channel: MIDNIGHTCORD_CHANNEL,
                    });
                } catch {}
            }, 0);
        }

        // Keep posts ordered NEWEST FIRST (descending timestamp order) for LOAD_MESSAGES_SUCCESS
        const sortedPosts = [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        let newPostCount = 0;
        const messageRecords: any[] = [];

        if (sortedPosts.length > 0) {
            const newestDate = new Date(sortedPosts[0].created_at).getTime();
            if (newestDate > lastPostTimestamp) {
                lastPostTimestamp = newestDate;
                setItemSafe(LS_LAST_TS, String(lastPostTimestamp));
            }
        }

        for (const post of sortedPosts) {
            const postId = String(post.id);

            const embeds: any[] = [];
            if (Array.isArray(post.media_attachments)) {
                for (const att of post.media_attachments) {
                    if (att.type === "image" || att.type === "gifv") {
                        const w = att.meta?.original?.width || att.meta?.small?.width;
                        const h = att.meta?.original?.height || att.meta?.small?.height;
                        const imageObj: any = { url: att.url, proxy_url: att.url };
                        if (w && h) {
                            imageObj.width = w;
                            imageObj.height = h;
                        }
                        embeds.push({
                            type: "image",
                            url: att.url,
                            image: imageObj
                        });
                    }
                }
            }

            const rawMsg = {
                id: postId,
                channel_id: MIDNIGHTCORD_CHANNEL_ID,
                author: MIDNIGHTCORD_USER,
                content: htmlToMarkdown(post.content),
                timestamp: new Date(post.created_at).toISOString(),
                edited_timestamp: null,
                tts: false,
                mention_everyone: false,
                mentions: [{ id: UserStore.getCurrentUser()?.id || "0" }],
                mention_roles: [],
                attachments: [],
                embeds,
                pinned: false,
                type: 0,
                flags: 0,
            };

            let msgRecord = rawMsg;
            try {
                if (typeof createMessageRecord === "function") {
                    msgRecord = createMessageRecord(rawMsg);
                }
            } catch {}

            messageRecords.push(msgRecord);

            const isNew = Boolean(lastSeenPostId) && (function() {
                try { return BigInt(postId) > BigInt(lastSeenPostId); } catch { return postId !== lastSeenPostId; }
            })();

            if (isNew && !isInitialLoad) {
                newPostCount++;
            }

            if (!lastSeenPostId || isNew) {
                lastSeenPostId = postId;
                setItemSafe(LS_LAST_SEEN, lastSeenPostId);
            }
        }

        setTimeout(() => {
            try {
                FluxDispatcher.dispatch({
                    type: "LOAD_MESSAGES_SUCCESS",
                    channelId: MIDNIGHTCORD_CHANNEL_ID,
                    messages: messageRecords,
                    isBefore: false,
                    isAfter: false,
                    hasMoreBefore: false,
                    hasMoreAfter: false,
                    limit: 50,
                });
            } catch {}

            if (newPostCount > 0) {
                if (!settings.store.isDmClosed && SelectedChannelStore.getChannelId() !== MIDNIGHTCORD_CHANNEL_ID) {
                    unreadCount += newPostCount;
                    try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
                    try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                    try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                }
            }
        }, 10);
    } catch (e) {
        console.warn("[MidnightcordOfficialDM] Error checking posts:", e);
    }
}

function handleChannelClose(e: any) {
    const id = typeof e === "string" ? e : (e?.channelId || e?.channel_id || e?.channel?.id || e?.id || (typeof e?.channel === "string" ? e.channel : null));
    if (id === MIDNIGHTCORD_CHANNEL_ID || id === "999999999999999990") {
        settings.store.isDmClosed = true;
                unreadCount = 0;
        if (SelectedChannelStore.getChannelId() === MIDNIGHTCORD_CHANNEL_ID) {
            try {
                FluxDispatcher.dispatch({
                    type: "CHANNEL_SELECT",
                    channelId: null,
                    guildId: null,
                });
            } catch {}
        }
        try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
        try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
        try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
    }
}

function handleChannelSelect(e: any) {
    const id = typeof e === "string" ? e : (e?.channelId || e?.channel_id || e?.channel?.id || e?.id);
    if (id === MIDNIGHTCORD_CHANNEL_ID || id === "999999999999999990") {
        if (settings.store.isDmClosed) {
            // Reopen the DM — remove isAppLoaded guard so this works from search too
            settings.store.isDmClosed = false;
            setTimeout(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "CHANNEL_CREATE",
                        channel: MIDNIGHTCORD_CHANNEL,
                    });
                } catch {}
                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
            }, 0);
        }
        unreadCount = 0;
        setTimeout(() => {
            try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
        }, 0);
        checkAndInjectPosts(true);
    }
}

const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");


const MidnightcordProfileSections = ErrorBoundary.wrap(({ isSideBar }: { isSideBar: boolean }) => (
    <>
        <Section
            heading="Nom d'utilisateur"
            headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
            headingColor={isSideBar ? "text-strong" : "text-default"}
        >
            <BaseText size="sm" color="text-normal" style={{ userSelect: "text" }}>
                @midnightcord
            </BaseText>
        </Section>
        <Section
            heading="Compte créé le"
            headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
            headingColor={isSideBar ? "text-strong" : "text-default"}
        >
            <BaseText size="sm" color="text-normal">
                {formatDate(MIDNIGHTCORD_CREATED_AT)}
            </BaseText>
        </Section>
    </>
), { noop: true });

export function MidnightcordSystemBanner() {
    return (
        <div className="midnightcord-official-banner">
            <div className="midnightcord-official-banner-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#5865F2" fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z" clipRule="evenodd" />
                </svg>
                <div>
                    <div className="midnightcord-official-banner-title">
                        Ce salon est réservé aux notifications officielles de Midnightcord.
                    </div>
                    <div className="midnightcord-official-banner-sub">
                        Midnightcord ne te demandera jamais ton mot de passe ou ton token de compte.
                    </div>
                </div>
            </div>
            <button
                className="midnightcord-official-banner-btn"
                onClick={() => window.open("https://nightcord.st", "_blank")}
            >
                En savoir plus
            </button>
        </div>
    );
}

export default definePlugin({
    name: "MidnightcordOfficialDM",
    description: "Official Midnightcord System DM channel with verified badge and Mastodon feed integration",
    enabledByDefault: true,
    required: true,
    startAt: StartAt.WebpackReady,
    authors: [{ name: "Midnightcord", id: 0n }],
    settings,

    flux: {
        CHANNEL_DELETE: handleChannelClose,
        CHANNEL_CLOSE: handleChannelClose,
        PRIVATE_CHANNEL_CLOSE: handleChannelClose,
        CHANNEL_SELECT: handleChannelSelect,
    },

    patches: [
        {
            find: '"sticker")',
            replacement: {
                match: /0===(\i)\.length(?=.{0,25}?\(0,\i\.jsxs?\)\(.{0,75}?children:\1)/,
                replace: "(Vencord.Api.ChatButtons._injectButtons($1,arguments[0]),$self.isMidnightcordChannel(arguments[0])?$self.renderBanner():$&)"
            }
        },
        // Inject username + creation date in DM sidebar profile panel
        {
            find: "#{intl::PROVISIONAL_ACCOUNT}),headingIcon:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id)}\)}\))/,
                replace: "$1,$self.renderMidnightcordProfileSections({userId:$2,isSideBar:true})"
            }
        },
        // Inject in profile modal
        {
            find: ",applicationRoleConnection:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderMidnightcordProfileSections({userId:$2,isSideBar:false}),"
            }
        },
        // Inject in profile modal v2
        {
            find: ".MODAL_V2,onClose:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderMidnightcordProfileSections({userId:$2,isSideBar:false}),"
            }
        },
        // Direct React Component patch for DM list — filters out Midnightcord DM when closed
        {
            find: '"dm-quick-launcher"===',
            replacement: {
                match: /privateChannelIds:([^,]+)(?=,listRef:)/,
                replace: "privateChannelIds:$self.filterMidnightcordDm($1)"
            }
        }
    ],

    filterMidnightcordDm(channelIds: any) {
        if (!Array.isArray(channelIds)) return channelIds;
        const closed = settings.store.isDmClosed;
        if (closed) {
            return channelIds.filter((id: string) => id !== MIDNIGHTCORD_CHANNEL_ID);
        }
        return channelIds;
    },

    renderMidnightcordProfileSections({ userId, isSideBar }: { userId: string, isSideBar: boolean }) {
        if (userId !== MIDNIGHTCORD_USER_ID) return null;
        return <MidnightcordProfileSections isSideBar={isSideBar} />;
    },

    isMidnightcordChannel(props: any) {
        return props?.channel?.id === MIDNIGHTCORD_CHANNEL_ID || SelectedChannelStore.getChannelId() === MIDNIGHTCORD_CHANNEL_ID;
    },

    renderBanner() {
        return <MidnightcordSystemBanner />;
    },

    start() {
        window.addEventListener("click", handleGlobalClick, true);

        // --- Core fix: intercept FluxDispatcher.dispatch ---
        // When settings.store.isDmClosed=true, we must NEVER let CHANNEL_CREATE for our fake channel
        // reach Discord's stores, otherwise Discord caches it in IndexedDB and shows
        // it again on next startup even before our other patches fire.
        try {
            const origDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
            (FluxDispatcher as any).dispatch = function(action: any) {
                // Block CHANNEL_CREATE for our fake channel when the DM is closed
                if (
                    action?.type === "CHANNEL_CREATE" &&
                    (action?.channel?.id === MIDNIGHTCORD_CHANNEL_ID || action?.channelId === MIDNIGHTCORD_CHANNEL_ID) &&
                    settings.store.isDmClosed
                ) {
                    return Promise.resolve();
                }
                return origDispatch(action);
            };
            unpatchFluxDispatch = () => { (FluxDispatcher as any).dispatch = origDispatch; };
        } catch {}

        // If the DM was closed, purge any stale entry Discord may have cached
        // in its IndexedDB from a previous session where the DM was open.
        if (settings.store.isDmClosed) {
            setTimeout(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "CHANNEL_DELETE",
                        channelId: MIDNIGHTCORD_CHANNEL_ID,
                        channel: { id: MIDNIGHTCORD_CHANNEL_ID, type: 1 },
                    });
                } catch {}
                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
            }, 500);
        }


        // Safely patch SnowflakeUtils as soon as loaded
        waitFor(["fromTimestamp", "extractTimestamp"], (m: any) => {
            if (m && typeof m.extractTimestamp === "function" && !unpatchSnowflakeUtils) {
                const origExtract = m.extractTimestamp;
                m.extractTimestamp = function(snowflake: string) {
                    if (snowflake === MIDNIGHTCORD_USER_ID || snowflake === "999999999999999999") {
                        return new Date("2009-11-07T12:00:00Z").getTime();
                    }
                    return origExtract.apply(this, arguments as any);
                };
                unpatchSnowflakeUtils = () => { m.extractTimestamp = origExtract; };
            }
        });

        // Safely patch UsernameUtils as soon as loaded
        waitFor(["useName", "getGlobalName"], (m: any) => {
            if (m && typeof m.formatForDisplay === "function") {
                const origFmt = m.formatForDisplay;
                m.formatForDisplay = function(user: any, ...args: any[]) {
                    const id = typeof user === "string" ? user : user?.id;
                    if (id === MIDNIGHTCORD_USER_ID || id === "999999999999999999") return "midnightcord";
                    return origFmt.apply(this, arguments as any);
                };
            }
        });

        // Patch DisplayProfileUtils for blue profile theme
        try {
            if (DisplayProfileUtils?.getDisplayProfile) {
                const origGetDP = DisplayProfileUtils.getDisplayProfile;
                DisplayProfileUtils.getDisplayProfile = function(userId: string, ...args: any[]) {
                    if (userId === MIDNIGHTCORD_USER_ID || userId === "999999999999999999") {
                        const dp = origGetDP.apply(this, arguments as any) || {};
                        dp.accentColor = 5793266;
                        dp.banner = null;
                        dp.themeColors = [5793266, 5793266];
                        return dp;
                    }
                    return origGetDP.apply(this, arguments as any);
                };
                unpatchDisplayProfile = () => { DisplayProfileUtils.getDisplayProfile = origGetDP; };
            }
        } catch {}

        // Patch IconUtils and all Webpack modules that have getUserAvatarURL or getAvatarURL
        try {
            if (IconUtils) {
                if (typeof IconUtils.getUserAvatarURL === "function") {
                    const orig = IconUtils.getUserAvatarURL;
                    IconUtils.getUserAvatarURL = function(user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === MIDNIGHTCORD_USER_ID || id === "999999999999999999") return midnightcordAvatarUrl;
                        return orig.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { IconUtils.getUserAvatarURL = orig; });
                }
                if (typeof (IconUtils as any).getAvatarURL === "function") {
                    const origAv = (IconUtils as any).getAvatarURL;
                    (IconUtils as any).getAvatarURL = function(guildId: any, user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === MIDNIGHTCORD_USER_ID || id === "999999999999999999") return midnightcordAvatarUrl;
                        return origAv.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { (IconUtils as any).getAvatarURL = origAv; });
                }
                if (typeof (IconUtils as any).getDefaultAvatarURL === "function") {
                    const origDef = (IconUtils as any).getDefaultAvatarURL;
                    (IconUtils as any).getDefaultAvatarURL = function(user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === MIDNIGHTCORD_USER_ID || id === "999999999999999999") return midnightcordAvatarUrl;
                        return origDef.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { (IconUtils as any).getDefaultAvatarURL = origDef; });
                }
            }

            const modsWithAvatar = findAll(filters.byProps("getUserAvatarURL"));
            for (const mod of modsWithAvatar) {
                if (mod && typeof mod.getUserAvatarURL === "function") {
                    const origFn = mod.getUserAvatarURL;
                    mod.getUserAvatarURL = function(user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === MIDNIGHTCORD_USER_ID || id === "999999999999999999") return midnightcordAvatarUrl;
                        return origFn.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { mod.getUserAvatarURL = origFn; });
                }
            }

            const URec: any = UserStore.getCurrentUser()?.constructor;
            if (URec?.prototype) {
                if (typeof URec.prototype.getAvatarURL === "function") {
                    const origProto = URec.prototype.getAvatarURL;
                    URec.prototype.getAvatarURL = function(this: any, ...args: any[]) {
                        if (this?.id === MIDNIGHTCORD_USER_ID || this?.id === "999999999999999999") return midnightcordAvatarUrl;
                        return origProto.apply(this, args as any);
                    };
                    unpatchAvatarFns.push(() => { URec.prototype.getAvatarURL = origProto; });
                }
                if (typeof URec.prototype.getAvatarSource === "function") {
                    const origProtoSrc = URec.prototype.getAvatarSource;
                    URec.prototype.getAvatarSource = function(this: any, ...args: any[]) {
                        if (this?.id === MIDNIGHTCORD_USER_ID || this?.id === "999999999999999999") return { uri: midnightcordAvatarUrl };
                        return origProtoSrc.apply(this, args as any);
                    };
                    unpatchAvatarFns.push(() => { URec.prototype.getAvatarSource = origProtoSrc; });
                }
            }
        } catch {}

        // Patch UserProfileStore to return Staff badge, blue banner and Midnightcord profile
        try {
            const UserProfileStore = (findStore("UserProfileStore") || findByProps("getUserProfile")) as any;
            if (UserProfileStore) {
                const origGetProfile = UserProfileStore.getUserProfile;
                UserProfileStore.getUserProfile = function(userId: string) {
                    if (userId === MIDNIGHTCORD_USER_ID || userId === "999999999999999999") {
                        const createdAt = new Date("2009-11-07T12:00:00.000Z");
                        return {
                            user: MIDNIGHTCORD_USER,
                            connectedAccounts: [],
                            connected_accounts: [],
                            premiumSince: null,
                            premiumType: null,
                            accentColor: 5793266,
                            accent_color: 5793266,
                            banner: null,
                            banner_color: "#5865f2",
                            themeColors: [5793266, 5793266],
                            theme_colors: [5793266, 5793266],
                            profileSince: createdAt,
                            memberSince: createdAt,
                            createdAt: createdAt,
                            badges: [
                                {
                                    id: "staff",
                                    description: "Discord Staff",
                                    icon: "5e74e9b61934fc1f67c65515d1f7e60d",
                                    link: "https://discord.com/company"
                                }
                            ],
                            bio: null,
                            userProfile: {
                                bio: null,
                                accentColor: 5793266,
                                banner: null,
                                themeColors: [5793266, 5793266],
                                profileSince: createdAt,
                                memberSince: createdAt,
                                createdAt: createdAt,
                            },
                            user_profile: {
                                bio: null,
                                accent_color: 5793266,
                                banner: null,
                                theme_colors: [5793266, 5793266],
                                profile_since: createdAt.toISOString(),
                                member_since: createdAt.toISOString(),
                                created_at: createdAt.toISOString(),
                            }
                        };
                    }
                    return origGetProfile.apply(this, arguments as any);
                };
                unpatchUserProfileStore = () => { UserProfileStore.getUserProfile = origGetProfile; };

                if (typeof UserProfileStore.isFetchingProfile === "function") {
                    const origFetch = UserProfileStore.isFetchingProfile;
                    UserProfileStore.isFetchingProfile = function(userId: string) {
                        if (userId === MIDNIGHTCORD_USER_ID) return false;
                        return origFetch.apply(this, arguments as any);
                    };
                }

                if (typeof UserProfileStore.getUserProfileFetchStatus === "function") {
                    const origStat = UserProfileStore.getUserProfileFetchStatus;
                    UserProfileStore.getUserProfileFetchStatus = function(userId: string) {
                        if (userId === MIDNIGHTCORD_USER_ID) return "SUCCESS";
                        return origStat.apply(this, arguments as any);
                    };
                }
            }
        } catch {}

        // Patch i18n intl methods ONLY for Midnightcord channel
        try {
            if (i18n?.intl?.string) {
                const origString = i18n.intl.string;
                i18n.intl.string = function(descriptor: any) {
                    const res = origString.apply(this, arguments as any);
                    if (SelectedChannelStore.getChannelId() === MIDNIGHTCORD_CHANNEL_ID) {
                        if (typeof res === "string") return replaceDiscordWithMidnightcord(res);
                    }
                    return res;
                };
                unpatchIntlString = () => { i18n.intl.string = origString; };
            }

            if (i18n?.intl?.format) {
                const origFormat = i18n.intl.format;
                i18n.intl.format = function(descriptor: any, values: any) {
                    const res = origFormat.apply(this, arguments as any);
                    if (SelectedChannelStore.getChannelId() === MIDNIGHTCORD_CHANNEL_ID) {
                        if (typeof res === "string") return replaceDiscordWithMidnightcord(res);
                        if (Array.isArray(res)) return res.map(item => typeof item === "string" ? replaceDiscordWithMidnightcord(item) : item);
                    }
                    return res;
                };
                unpatchIntlFormat = () => { i18n.intl.format = origFormat; };
            }
        } catch {}

        startDomObserver();

        // Patch ReadStateStore to show red ping badge for new unread Midnightcord posts
        try {
            const ReadStateStore = findStore("ReadStateStore") as any;
            if (ReadStateStore) {
                const origGetMentionCount = ReadStateStore.getMentionCount;
                ReadStateStore.getMentionCount = function(channelId: string) {
                    if (channelId === MIDNIGHTCORD_CHANNEL_ID) return unreadCount;
                    return origGetMentionCount.apply(this, arguments as any);
                };
                unpatchReadStateGetMention = () => { ReadStateStore.getMentionCount = origGetMentionCount; };

                const origGetUnreadCount = ReadStateStore.getUnreadCount;
                ReadStateStore.getUnreadCount = function(channelId: string) {
                    if (channelId === MIDNIGHTCORD_CHANNEL_ID) return unreadCount;
                    return origGetUnreadCount.apply(this, arguments as any);
                };
                unpatchReadStateGetUnread = () => { ReadStateStore.getUnreadCount = origGetUnreadCount; };

                const origHasUnread = ReadStateStore.hasUnread;
                ReadStateStore.hasUnread = function(channelId: string) {
                    if (channelId === MIDNIGHTCORD_CHANNEL_ID) return unreadCount > 0;
                    return origHasUnread.apply(this, arguments as any);
                };
                unpatchReadStateHasUnread = () => { ReadStateStore.hasUnread = origHasUnread; };
            }
        } catch {}

        // Intercept MessageActions.fetchMessages to prevent 404 REST calls
        try {
            const MessageActions = findByProps("fetchMessages", "sendMessage") as any;
            if (MessageActions?.fetchMessages) {
                const origFetchMessages = MessageActions.fetchMessages;
                MessageActions.fetchMessages = function(opts: any) {
                    if (opts?.channelId === MIDNIGHTCORD_CHANNEL_ID) {
                        checkAndInjectPosts(true);
                        return Promise.resolve();
                    }
                    return origFetchMessages.apply(this, arguments as any);
                };
                unpatchFetchMessages = () => { MessageActions.fetchMessages = origFetchMessages; };
            }
        } catch {}

        // Intercept HTTP.get and HTTP.post REST calls to prevent 404 errors for fake channel/user ID
        try {
            const HTTP = (findByProps("get", "post", "put", "del") || findByProps("get", "post")) as any;
            if (HTTP) {
                if (HTTP.get) {
                    const origGet = HTTP.get;
                    HTTP.get = function(opts: any) {
                        const url = typeof opts === "string" ? opts : opts?.url;
                        if (url && (url.includes(MIDNIGHTCORD_CHANNEL_ID) || url.includes(MIDNIGHTCORD_USER_ID) || url.includes("999999999999999999"))) {
                            if (url.includes("/profile")) {
                                return Promise.resolve({
                                    ok: true,
                                    status: 200,
                                    body: {
                                        user: {
                                            id: MIDNIGHTCORD_USER_ID,
                                            username: "midnightcord",
                                            global_name: "Midnightcord",
                                            avatar: "midnightcord_avatar",
                                            bot: true,
                                            system: true,
                                            public_flags: 1,
                                            flags: 1,
                                            accent_color: 5793266,
                                            banner_color: "#5865f2",
                                        },
                                        connected_accounts: [],
                                        premium_since: null,
                                        premium_type: null,
                                        accent_color: 5793266,
                                        banner_color: "#5865f2",
                                        theme_colors: [5793266, 5793266],
                                        badges: [
                                            {
                                                id: "staff",
                                                description: "Discord Staff",
                                                icon: "5e74e9b61934fc1f67c65515d1f7e60d",
                                                link: "https://discord.com/company"
                                            }
                                        ]
                                    },
                                    text: "{}",
                                    headers: {},
                                });
                            }
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                body: [],
                                text: "[]",
                                headers: {},
                            });
                        }
                        return origGet.apply(this, arguments as any);
                    };
                    unpatchHTTPGet = () => { HTTP.get = origGet; };
                }

                if (HTTP.post) {
                    const origPost = HTTP.post;
                    HTTP.post = function(opts: any) {
                        const url = typeof opts === "string" ? opts : opts?.url;
                        if (url && (url.includes(MIDNIGHTCORD_CHANNEL_ID) || url.includes(MIDNIGHTCORD_USER_ID) || url.includes("999999999999999999"))) {
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                body: {
                                    id: MIDNIGHTCORD_CHANNEL_ID,
                                    type: 1,
                                    last_message_id: null,
                                    recipients: [MIDNIGHTCORD_USER],
                                },
                                text: "{}",
                                headers: {},
                            });
                        }
                        return origPost.apply(this, arguments as any);
                    };
                    unpatchHTTPPost = () => { HTTP.post = origPost; };
                }

                const httpAny = HTTP as any;
                if (httpAny.del || httpAny.delete) {
                    const fnName = httpAny.del ? "del" : "delete";
                    const origDel = httpAny[fnName];
                    httpAny[fnName] = function(opts: any) {
                        const url = typeof opts === "string" ? opts : opts?.url;
                        if (url && (url.includes(MIDNIGHTCORD_CHANNEL_ID) || url.includes(MIDNIGHTCORD_USER_ID) || url.includes("999999999999999999"))) {
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                body: {},
                                text: "{}",
                                headers: {},
                            });
                        }
                        return origDel.apply(this, arguments as any);
                    };
                }
            }
        } catch {}

        // Patch UserStore.getUser
        const origGetUser = UserStore.getUser;
        UserStore.getUser = function(id: string) {
            if (id === MIDNIGHTCORD_USER_ID || id === "999999999999999999") return MIDNIGHTCORD_USER;
            return origGetUser.apply(this, arguments as any);
        };
        unpatchUserStore = () => { UserStore.getUser = origGetUser; };

        // Patch UserStore.getUsers if exists
        if ((UserStore as any).getUsers) {
            const origGetUsers = (UserStore as any).getUsers;
            (UserStore as any).getUsers = function() {
                const users = origGetUsers.apply(this, arguments as any) || {};
                if (!users[MIDNIGHTCORD_USER_ID]) {
                    return { ...users, [MIDNIGHTCORD_USER_ID]: MIDNIGHTCORD_USER };
                }
                return users;
            };
            unpatchUserStoreGetUsers = () => { (UserStore as any).getUsers = origGetUsers; };
        }

        // Patch ChannelActionCreators & ChannelActionsMod methods (closePrivateChannel, closeChannel, deletePrivateChannel, closeDM)
        try {
            const actionMods = [ChannelActionCreators, findByProps("closePrivateChannel"), findByProps("openPrivateChannel")].filter(Boolean);
            actionMods.forEach((mod: any) => {
                const closeMethods = ["closePrivateChannel", "closeChannel", "deletePrivateChannel", "closeDM"];
                closeMethods.forEach(methodName => {
                    if (typeof mod[methodName] === "function" && !mod[methodName].__midnightcordPatched) {
                        const orig = mod[methodName];
                        mod[methodName] = function(...args: any[]) {
                            const arg = args[0];
                            const targetId = typeof arg === "string" ? arg : (arg?.channelId || arg?.id || arg?.channel_id || arg?.userId || arg?.recipientId);
                            if (targetId === MIDNIGHTCORD_CHANNEL_ID || targetId === "999999999999999990") {
                                settings.store.isDmClosed = true;
                                                                unreadCount = 0;
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_CLOSE",
                                        channelId: MIDNIGHTCORD_CHANNEL_ID,
                                    });
                                } catch {}
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_DELETE",
                                        channelId: MIDNIGHTCORD_CHANNEL_ID,
                                        channel: { id: MIDNIGHTCORD_CHANNEL_ID, type: 1 },
                                    });
                                } catch {}
                                if (SelectedChannelStore.getChannelId() === MIDNIGHTCORD_CHANNEL_ID) {
                                    try {
                                        FluxDispatcher.dispatch({
                                            type: "CHANNEL_SELECT",
                                            channelId: null,
                                            guildId: null,
                                        });
                                    } catch {}
                                }
                                try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
                                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                                return;
                            }
                            return orig.apply(this, args);
                        };
                        mod[methodName].__midnightcordPatched = true;
                    }
                });

                if (typeof mod.openPrivateChannel === "function" && !mod.openPrivateChannel.__midnightcordPatched) {
                    const origOpen = mod.openPrivateChannel;
                    mod.openPrivateChannel = function(...args: any[]) {
                        const arg = args[0];
                        const targetId = typeof arg === "string" ? arg : (arg?.recipientId || arg?.userId || arg?.id || arg?.channelId);
                        if (targetId === MIDNIGHTCORD_USER_ID || targetId === "999999999999999999") {
                            settings.store.isDmClosed = false;
                                                        unreadCount = 0;
                            setTimeout(() => {
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_CREATE",
                                        channel: MIDNIGHTCORD_CHANNEL,
                                    });
                                } catch {}
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_SELECT",
                                        channelId: MIDNIGHTCORD_CHANNEL_ID,
                                        guildId: null,
                                    });
                                } catch {}
                                try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
                                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                            }, 0);
                            return Promise.resolve(MIDNIGHTCORD_CHANNEL_ID);
                        }
                        return origOpen.apply(this, args);
                    };
                    mod.openPrivateChannel.__midnightcordPatched = true;
                }
            });
        } catch {}

        // Patch ChannelStore.getChannel & getDMFromUserId
        const origGetChannel = ChannelStore.getChannel;
        ChannelStore.getChannel = function(id: string) {
            if (id === MIDNIGHTCORD_CHANNEL_ID) {
                // Always return the channel so navigation works (even when closed)
                // Visibility in the DM list sidebar is handled by filterMidnightcordDm
                return MIDNIGHTCORD_CHANNEL;
            }
            return origGetChannel.apply(this, arguments as any);
        };
        unpatchChannelStore = () => { ChannelStore.getChannel = origGetChannel; };

        const channelStoreAny = ChannelStore as any;
        if (typeof channelStoreAny.getDMFromUserId === "function") {
            const origGetDM = channelStoreAny.getDMFromUserId;
            channelStoreAny.getDMFromUserId = function(userId: string) {
                if (userId === MIDNIGHTCORD_USER_ID || userId === "999999999999999999") {
                    // Always return channel ID so Discord can navigate to it
                    return MIDNIGHTCORD_CHANNEL_ID;
                }
                return origGetDM.apply(this, arguments as any);
            };
        }

        // Patch ChannelStore.getMutablePrivateChannels / getPrivateChannels if exists
        if (channelStoreAny.getMutablePrivateChannels) {
            const origGetMut = channelStoreAny.getMutablePrivateChannels;
            channelStoreAny.getMutablePrivateChannels = function() {
                const chs = origGetMut.apply(this, arguments as any) || {};
                const closed = settings.store.isDmClosed;
                if (!closed && !chs[MIDNIGHTCORD_CHANNEL_ID]) {
                    return { ...chs, [MIDNIGHTCORD_CHANNEL_ID]: MIDNIGHTCORD_CHANNEL };
                }
                if (closed && chs[MIDNIGHTCORD_CHANNEL_ID]) {
                    const copy = { ...chs };
                    delete copy[MIDNIGHTCORD_CHANNEL_ID];
                    return copy;
                }
                return chs;
            };
            unpatchChannelStoreGetPrivate = () => { channelStoreAny.getMutablePrivateChannels = origGetMut; };
        }

        if (channelStoreAny.getPrivateChannels) {
            const origGetPriv = channelStoreAny.getPrivateChannels;
            channelStoreAny.getPrivateChannels = function() {
                const chs = origGetPriv.apply(this, arguments as any) || {};
                const closed = settings.store.isDmClosed;
                if (!closed && !chs[MIDNIGHTCORD_CHANNEL_ID]) {
                    return { ...chs, [MIDNIGHTCORD_CHANNEL_ID]: MIDNIGHTCORD_CHANNEL };
                }
                if (closed && chs[MIDNIGHTCORD_CHANNEL_ID]) {
                    const copy = { ...chs };
                    delete copy[MIDNIGHTCORD_CHANNEL_ID];
                    return copy;
                }
                return chs;
            };
        }

function getChannelTimestamp(channelId: string): number {
    try {
        const MessageStore = findStore("MessageStore") as any;
        const lastMsg = MessageStore?.getLastMessage?.(channelId);
        if (lastMsg?.timestamp) return new Date(lastMsg.timestamp).getTime();
        if (lastMsg?.id) return SnowflakeUtils.extractTimestamp(lastMsg.id);
        const ChannelStore = findStore("ChannelStore") as any;
        const ch = ChannelStore?.getChannel?.(channelId);
        if (ch?.lastMessageId) return SnowflakeUtils.extractTimestamp(ch.lastMessageId);
        if (ch?.id) return SnowflakeUtils.extractTimestamp(ch.id);
    } catch {}
    return 0;
}

        // Robust patch for PrivateChannelSortStore
        const patchPrivateChannelSortStore = (SortStore: any) => {
            if (!SortStore || (SortStore as any).__midnightcordPatched) return;
            (SortStore as any).__midnightcordPatched = true;
            const sortUnpatches: (() => void)[] = [];
            const patchSortFn = (fnName: string) => {
                if (typeof SortStore[fnName] === "function") {
                    const orig = SortStore[fnName];
                    SortStore[fnName] = function(...args: any[]) {
                        let ids: any = orig.apply(this, args) || [];
                        // Always filter our fake channel first
                        if (Array.isArray(ids)) {
                            ids = ids.filter((item: any) => {
                                const id = typeof item === "string" ? item : (item?.id || item?.channelId);
                                return id !== MIDNIGHTCORD_CHANNEL_ID;
                            });
                        }
                        // If DM is closed, return without adding it back
                        if (settings.store.isDmClosed) return ids;

                        if (unreadCount > 0) {
                            ids.unshift(MIDNIGHTCORD_CHANNEL_ID);
                            return ids;
                        }

                        try {
                            const MessageStore = findStore("MessageStore") as any;
                            const midnightcordLastMsg = MessageStore?.getLastMessage?.(MIDNIGHTCORD_CHANNEL_ID);
                            let midnightcordTs = lastPostTimestamp;
                            if (midnightcordLastMsg?.timestamp) {
                                midnightcordTs = new Date(midnightcordLastMsg.timestamp).getTime();
                            }

                            if (midnightcordTs > 0) {
                                let inserted = false;
                                for (let i = 0; i < ids.length; i++) {
                                    const item = ids[i];
                                    const itemId = typeof item === "string" ? item : (item?.id || item?.channelId);
                                    const chTs = getChannelTimestamp(itemId);
                                    if (midnightcordTs >= chTs) {
                                        ids.splice(i, 0, MIDNIGHTCORD_CHANNEL_ID);
                                        inserted = true;
                                        break;
                                    }
                                }
                                if (!inserted) {
                                    ids.push(MIDNIGHTCORD_CHANNEL_ID);
                                }
                            } else {
                                ids.push(MIDNIGHTCORD_CHANNEL_ID);
                            }
                        } catch {
                            ids.push(MIDNIGHTCORD_CHANNEL_ID);
                        }

                        return ids;
                    };
                    sortUnpatches.push(() => {
                        SortStore[fnName] = orig;
                        delete (SortStore as any).__midnightcordPatched;
                    });
                }
            };

            ["getPrivateChannelIds", "getSortedPrivateChannels", "getSortedPrivateChannelIds"].forEach(patchSortFn);
            unpatchPrivateChannelSortStore = () => { sortUnpatches.forEach(fn => fn()); };
        };

        const existingSortStore = (findStore("PrivateChannelSortStore") || findByProps("getPrivateChannelIds")) as any;
        if (existingSortStore) {
            patchPrivateChannelSortStore(existingSortStore);
        }
        waitFor(["getPrivateChannelIds"], (store: any) => {
            patchPrivateChannelSortStore(store);
        });


        // Patch MessageRequestStore to explicitly exclude MIDNIGHTCORD_CHANNEL_ID from spam / message requests
        try {
            const MsgReqStore = findByPropsLazy("getMessageRequestsCount", "isSpam", "isMessageRequest") as any;
            if (MsgReqStore) {
                if (typeof MsgReqStore.isSpam === "function") {
                    const origIsSpam = MsgReqStore.isSpam;
                    MsgReqStore.isSpam = function(channelId: string) {
                        if (channelId === MIDNIGHTCORD_CHANNEL_ID) return false;
                        return origIsSpam.apply(this, arguments);
                    };
                }
                if (typeof MsgReqStore.isMessageRequest === "function") {
                    const origIsMsgReq = MsgReqStore.isMessageRequest;
                    MsgReqStore.isMessageRequest = function(channelId: string) {
                        if (channelId === MIDNIGHTCORD_CHANNEL_ID) return false;
                        return origIsMsgReq.apply(this, arguments);
                    };
                }
            }
        } catch {}

        FluxDispatcher.subscribe("CHANNEL_DELETE", handleChannelClose);
        FluxDispatcher.subscribe("CHANNEL_CLOSE", handleChannelClose);
        FluxDispatcher.subscribe("PRIVATE_CHANNEL_CLOSE", handleChannelClose);
        FluxDispatcher.subscribe("CHANNEL_SELECT", handleChannelSelect);

        setTimeout(() => {
            isAppLoaded = true;
        }, 3000);

        // Initial check and start polling
        checkAndInjectPosts(true);
        pollInterval = setInterval(() => checkAndInjectPosts(false), 30000);
    },

    stop() {
        window.removeEventListener("click", handleGlobalClick, true);
        stopDomObserver();

        if (unpatchUserStore) unpatchUserStore();
        if (unpatchUserStoreGetUsers) unpatchUserStoreGetUsers();
        if (unpatchChannelStore) unpatchChannelStore();
        if (unpatchChannelStoreGetPrivate) unpatchChannelStoreGetPrivate();
        if (unpatchPrivateChannelSortStore) unpatchPrivateChannelSortStore();
        if (unpatchFetchMessages) unpatchFetchMessages();
        if (unpatchHTTPGet) unpatchHTTPGet();
        if (unpatchHTTPPost) unpatchHTTPPost();
        if (unpatchOpenPrivateChannel) unpatchOpenPrivateChannel();
        if (unpatchClosePrivateChannel) unpatchClosePrivateChannel();
        if (unpatchFluxDispatch) unpatchFluxDispatch();
        if (unpatchReadStateGetMention) unpatchReadStateGetMention();
        if (unpatchReadStateGetUnread) unpatchReadStateGetUnread();
        if (unpatchReadStateHasUnread) unpatchReadStateHasUnread();
        if (unpatchIntlString) unpatchIntlString();
        if (unpatchIntlFormat) unpatchIntlFormat();
        if (unpatchUserProfileStore) unpatchUserProfileStore();
        if (unpatchSnowflakeUtils) unpatchSnowflakeUtils();
        if (unpatchDisplayProfile) unpatchDisplayProfile();

        unpatchSectionStores.forEach(fn => { try { fn(); } catch {} });
        unpatchSectionStores = [];

        unpatchAvatarFns.forEach(fn => { try { fn(); } catch {} });
        unpatchAvatarFns = [];

        FluxDispatcher.unsubscribe("CHANNEL_DELETE", handleChannelClose);
        FluxDispatcher.unsubscribe("PRIVATE_CHANNEL_CLOSE", handleChannelClose);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", handleChannelSelect);

        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }
});
