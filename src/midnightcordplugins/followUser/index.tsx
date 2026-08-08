/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { t } from "../autoTranslateMidnightcord";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Menu, React, Toasts, useEffect,useState } from "@webpack/common";

const VoiceStateStore = findStoreLazy("VoiceStateStore");
const ChannelStore = findStoreLazy("ChannelStore");
const UserStore = findStoreLazy("UserStore");
const FluxDispatcher = findByPropsLazy("dispatch", "subscribe");

const DS_KEY = "followuser-v2";

export const settings = definePluginSettings({
    afkTimeout: {
        type: OptionType.SELECT,
        name: t("AFK Timeout"),
        description: t("Inactivity timeout before stopping follow (AFK)"),
        options: [
            { label: t("10 minutes"), value: 10 * 60 * 1000 },
            { label: t("1 hour"), value: 60 * 60 * 1000, default: true },
            { label: t("3 hours"), value: 3 * 60 * 60 * 1000 }
        ]
    }
});

// ── Etat global ───────────────────────────────────────────────────────────────
let followedId: string | null = null;
let followedName: string = "";
let followedChannel: string | null = null;
let fluxUnsub: (() => void) | null = null;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivity: number = 0;

const listeners = new Set<() => void>();
function notifyAll() { listeners.forEach(fn => fn()); }

export function useFollowId(): string | null {
    const [, tick] = useState(0);
    useEffect(() => {
        const fn = () => tick(n => n + 1);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);
    return followedId;
}

async function persist() {
    await DataStore.set(DS_KEY, followedId ? { id: followedId, name: followedName } : null);
}

let fastCheckInterval: ReturnType<typeof setInterval> | null = null;

function getChannelOf(userId: string): string | null {
    try {
        const all: any = VoiceStateStore?.getAllVoiceStates?.() ?? {};
        for (const guildMap of Object.values(all) as any[]) {
            if (guildMap?.[userId]?.channelId) return guildMap[userId].channelId;
        }
        return VoiceStateStore?.getVoiceStateForUser?.(userId)?.channelId ?? null;
    } catch { return null; }
}

function joinChannel(channelId: string) {
    try {
        const ch = ChannelStore?.getChannel?.(channelId);
        // Instant microtask execution so follow happens in 0ms without artificial delay or dispatch-in-dispatch error
        queueMicrotask(() => {
            FluxDispatcher?.dispatch?.({
                type: "VOICE_CHANNEL_SELECT",
                channelId,
                guildId: ch?.guild_id ?? null,
            });
        });
    } catch { }
}

// ── Timer d'inactivite : unfollow auto apres delai d'inactivite ───────────
function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    lastActivity = Date.now();
    const timeout = settings.store.afkTimeout ?? (60 * 60 * 1000);
    inactivityTimer = setTimeout(() => {
        if (followedId) {
            Toasts.show({ 
                message: t("Inactivity timeout: stopped following {}").replace("{}", followedName), 
                type: Toasts.Type.FAILURE, 
                id: Toasts.genId() 
            });
            unfollow();
        }
    }, timeout);
}

function clearInactivityTimer() {
    if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
}

function isUserStreaming(): boolean {
    try {
        const currentUser = UserStore?.getCurrentUser?.();
        if (!currentUser) return false;
        const voiceState = VoiceStateStore?.getVoiceStateForUser?.(currentUser.id);
        return !!(voiceState?.selfStream || voiceState?.selfVideo);
    } catch { return false; }
}

function getCurrentUserChannel(): string | null {
    try {
        const currentUser = UserStore?.getCurrentUser?.();
        if (!currentUser) return null;
        return VoiceStateStore?.getVoiceStateForUser?.(currentUser.id)?.channelId ?? null;
    } catch { return null; }
}

function checkFollowedUser() {
    if (!followedId) return;
    const newCh = getChannelOf(followedId);
    if (newCh !== followedChannel) {
        followedChannel = newCh;
        if (newCh) {
            resetInactivityTimer();
            const myCh = getCurrentUserChannel();
            if (myCh !== newCh) {
                if (isUserStreaming()) {
                    Toasts.show({
                        message: t("Follow suspended: cannot join {name} while streaming").replace("{name}", followedName),
                        type: Toasts.Type.FAILURE,
                        id: Toasts.genId()
                    });
                } else {
                    joinChannel(newCh);
                }
            }
        }
    }
}

// ── Listener voix ─────────────────────────────────────────────────────────────
function onVoiceStateUpdates(data: any) {
    if (!followedId) return;
    const states: any[] = Array.isArray(data?.voiceStates) ? data.voiceStates
        : data?.voiceStates != null ? Array.from(data.voiceStates as any) : [];
    for (const s of states) {
        if (s.userId !== followedId) continue;
        const newCh: string | null = s.channelId ?? null;
        if (newCh !== followedChannel) {
            followedChannel = newCh;
            if (newCh) {
                resetInactivityTimer();
                const myCh = getCurrentUserChannel();
                if (myCh !== newCh) {
                    if (isUserStreaming()) {
                        Toasts.show({
                            message: `Suivi suspendu : impossible de rejoindre ${followedName} pendant que vous streamez`,
                            type: Toasts.Type.FAILURE,
                            id: Toasts.genId()
                        });
                    } else {
                        joinChannel(newCh);
                    }
                }
            }
        }
    }
    checkFollowedUser();
}

function startFlux() {
    if (fluxUnsub) return;
    const handler = (data: any) => onVoiceStateUpdates(data);
    FluxDispatcher?.subscribe?.("VOICE_STATE_UPDATES", handler);
    FluxDispatcher?.subscribe?.("VOICE_STATE_UPDATE", handler);
    try { VoiceStateStore?.addChangeListener?.(checkFollowedUser); } catch { }

    if (fastCheckInterval) clearInterval(fastCheckInterval);
    fastCheckInterval = setInterval(checkFollowedUser, 50);

    fluxUnsub = () => {
        FluxDispatcher?.unsubscribe?.("VOICE_STATE_UPDATES", handler);
        FluxDispatcher?.unsubscribe?.("VOICE_STATE_UPDATE", handler);
        try { VoiceStateStore?.removeChangeListener?.(checkFollowedUser); } catch { }
        if (fastCheckInterval) { clearInterval(fastCheckInterval); fastCheckInterval = null; }
    };
}
function stopFlux() {
    fluxUnsub?.();
    fluxUnsub = null;
    if (fastCheckInterval) { clearInterval(fastCheckInterval); fastCheckInterval = null; }
}

// ── Follow / Unfollow ─────────────────────────────────────────────────────────
export async function follow(userId: string) {
    const user = UserStore?.getUser?.(userId);
    const name = user?.globalName ?? user?.username ?? userId;

    // Si on followait deja quelqu'un d'autre, unfollow silencieux
    if (followedId && followedId !== userId) {
        stopFlux();
        clearInactivityTimer();
    }

    followedId = userId;
    followedName = name;
    followedChannel = getChannelOf(userId);

    await persist();
    startFlux();
    resetInactivityTimer();
    notifyAll();

    // Rejoindre immediatement son vocal si il est deja dans un channel
    if (followedChannel) {
        const myCh = getCurrentUserChannel();
        if (myCh !== followedChannel) {
            if (isUserStreaming()) {
                Toasts.show({
                    message: `Suivi activé, mais impossible de rejoindre ${followedName} pendant que vous streamez`,
                    type: Toasts.Type.FAILURE,
                    id: Toasts.genId()
                });
            } else {
                joinChannel(followedChannel);
            }
        }
    }
}

export async function unfollow() {
    followedId = null; followedName = ""; followedChannel = null;
    stopFlux();
    clearInactivityTimer();
    await persist();
    notifyAll();
}

function joinFollowed() {
    if (!followedChannel) {
        Toasts.show({ message: `${followedName} n'est pas en vocal`, type: Toasts.Type.FAILURE, id: Toasts.genId() });
        return;
    }
    if (isUserStreaming()) {
        Toasts.show({ message: `Impossible de rejoindre pendant que vous streamez`, type: Toasts.Type.FAILURE, id: Toasts.genId() });
        return;
    }
    joinChannel(followedChannel);
    resetInactivityTimer();
}

// ── Icone coeur ───────────────────────────────────────────────────────────────
function HeartIcon({ filled = false }: { filled?: boolean; }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24">
            {filled ? (
                <path fill="white" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            ) : (
                <path fill="currentColor" d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
            )}
        </svg>
    );
}

// ── Bouton HeaderBar ──────────────────────────────────────────────────────────
// Clic gauche = rejoindre son vocal
// Clic droit  = unfollow
function FollowHeaderButton() {
    const fid = useFollowId();
    if (!fid) return null;

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        if (e.button === 2) {
            // Clic droit
            unfollow();
        } else {
            // Clic gauche
            joinFollowed();
        }
    };

    return (
        <HeaderBarButton
            icon={() => <HeartIcon filled={true} />}
            tooltip={t("{name} — Clic: join voice | Right click: unfollow").replace("{name}", followedName)}
            onClick={handleClick}
            onContextMenu={handleClick}
        />
    );
}

// ── Context menu ──────────────────────────────────────────────────────────────
const ctxPatch: NavContextMenuPatchCallback = (children, props) => {
    const userId: string | undefined = props?.user?.id;
    if (!userId) return;
    const isFollowed = followedId === userId;
    children.push(
        <Menu.MenuCheckboxItem
            id="follow-user-ctx"
            label={isFollowed ? t("Unfollow User") : t("Follow User")}
            checked={isFollowed}
            action={() => { if (isFollowed) unfollow(); else follow(userId); }}
        />
    );
};

export default definePlugin({
    name: "FollowUser",
    enabledByDefault: true,
    description: "Follows a user in voice channels. Right-click user → Follow User. White heart in header = active following (left-click = join voice channel, right-click = unfollow). Auto-unfollows after inactivity.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    settings,

    headerBarButton: {
        icon: HeartIcon,
        render: FollowHeaderButton,
        priority: 5,
    },

    async start() {
        const saved = await DataStore.get(DS_KEY) as { id: string; name: string; } | null;
        if (saved?.id) {
            followedId = saved.id;
            followedName = saved.name ?? saved.id;
            followedChannel = getChannelOf(saved.id);
            startFlux();
            resetInactivityTimer();
        }
        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("user-profile-actions", ctxPatch);
        addContextMenuPatch("gdm-context", ctxPatch);
    },

    stop() {
        stopFlux();
        clearInactivityTimer();
        followedId = null; followedName = ""; followedChannel = null;
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("user-profile-actions", ctxPatch);
        removeContextMenuPatch("gdm-context", ctxPatch);
    },
});
