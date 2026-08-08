/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings, useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadphonesIcon, Microphone } from "@components/Icons";
import { settings as musicControlsSettings } from "@midnightcordplugins/musicControls/settings";
import { SpotifyStore } from "@midnightcordplugins/musicControls/spotify/SpotifyStore";
import { classNameFactory } from "@utils/css";
import { useFixedTimer } from "@utils/react";
import { formatDurationMs } from "@utils/text";
import definePlugin, { OptionType } from "@utils/types";
import { t } from "../autoTranslateMidnightcord";
import type { Message, Stream } from "@vencord/discord-types";
import { ApplicationStreamingStore, ChannelStore, Clickable, FluxDispatcher, GuildMemberStore, IconUtils, MediaEngineStore, MessageStore, ReactDOM, RelationshipStore, SelectedChannelStore, useEffect, useRef, UserGuildSettingsStore, UserStore, useState, useStateFromStores, VoiceStateStore } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import type { MouseEvent, PointerEvent, ReactNode, SVGProps } from "react";
import { follow, unfollow, useFollowId } from "../followUser";
const IS_WEB = typeof window !== "undefined" && typeof (window as any).VencordNative === "undefined";

const IslandVoiceActions = findByPropsLazy("toggleSelfMute");
const IslandChannelActions = findByPropsLazy("selectVoiceChannel");
const RelationshipActions = findByPropsLazy("removeFriend", "addRelationship", "cancelFriendRequest");
const ChannelActionCreators = findByPropsLazy("openPrivateChannel");

interface ControlButtonProps {
    active?: boolean;
    children: ReactNode;
    compact?: boolean;
    danger?: boolean;
    label: string;
    onClick(): void;
}

interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string;
}

interface IslandNotification {
    avatarUrl: string;
    body: string;
    id: string;
    title: string;
}

interface DynamicIslandRuntime {
    activeModule: symbol;
    notification: IslandNotification | null;
    notificationListeners: Set<() => void>;
    notificationTimeoutId: number | undefined;
    owner: symbol | null;
    portalListeners: Set<() => void>;
}

interface MessageWithMentions extends Omit<Message, "mentionEveryone" | "mentionRoles" | "mentions"> {
    mention_everyone: boolean;
    mention_roles: string[];
    mentions: Array<string | { id: string; }>;
}

interface SwipeStart {
    pointerId: number;
    startedAt: number;
    x: number;
    y: number;
}

const IslandType = {
    ScreenShare: "screen-share",
    SoundCord: "soundcord",
    Spotify: "spotify",
    Voice: "voice"
} as const;

type IslandType = typeof IslandType[keyof typeof IslandType];

const cl = classNameFactory("vc-illegalcord-dynamic-island-");
const NOTIFICATION_DURATION = 5000;
const RUNTIME_KEY = Symbol.for("IllegalcordDynamicIsland.runtime");
const SPOTIFY_IDLE_DURATION = 60_000;
const SWIPE_MIN_DISTANCE = 48;
const SWIPE_MIN_DURATION = 120;
const portalModule = Symbol();
let isDynamicIslandActive = false;
const runtime = (Reflect.get(globalThis, RUNTIME_KEY) as DynamicIslandRuntime | undefined) ?? {
    activeModule: portalModule,
    notification: null,
    notificationListeners: new Set(),
    notificationTimeoutId: undefined,
    owner: null,
    portalListeners: new Set()
};
runtime.activeModule = portalModule;
runtime.owner = null;
Reflect.set(globalThis, RUNTIME_KEY, runtime);
runtime.portalListeners.forEach(listener => listener());
const settings = definePluginSettings({
    islandColor: {
        description: t("Choose the Dynamic Island color."),
        type: OptionType.SELECT,
        options: [
            { label: t("Frosted Glass"), value: "blur", default: true },
            { label: t("Transparent"), value: "transparent" },
            { label: t("Discord theme"), value: "theme" },
            { label: t("AMOLED"), value: "amoled" },
            { label: t("White"), value: "white" },
            { label: t("Light blue"), value: "blue" },
            { label: t("Pink"), value: "pink" }
        ]
    },
    keepIslandVisible: {
        description: t("Keep the Dynamic Island visible when no activity is active."),
        type: OptionType.BOOLEAN,
        default: false
    },
    showSpotifyIsland: {
        description: t("Show Spotify activity in the Dynamic Island."),
        type: OptionType.BOOLEAN,
        default: true
    },
    showSoundCordIsland: {
        description: t("Show SoundCord activity in the Dynamic Island."),
        type: OptionType.BOOLEAN,
        default: true
    },
    showVoiceIsland: {
        description: t("Show Discord call controls in the Dynamic Island."),
        type: OptionType.BOOLEAN,
        default: true
    },
    showScreenShareIsland: {
        description: t("Show screen sharing status, timer, and quick stop controls in the Dynamic Island."),
        type: OptionType.BOOLEAN,
        default: true
    },
    morphNotifications: {
        description: t("Temporarily morph the Dynamic Island for direct messages and mentions."),
        type: OptionType.BOOLEAN,
        default: true
    },
    showSpotifyPanel: {
        description: t("Show the Spotify player in the Discord user panel."),
        type: OptionType.BOOLEAN,
        default: false,
        onChange: value => { musicControlsSettings.store.showSpotifyControls = value; }
    },
    showCallControls: {
        description: t("Show main call controls (Mute, Deafen, Disconnect) in the call section."),
        type: OptionType.BOOLEAN,
        default: true
    },
    showCallParticipants: {
        description: t("Show the list of voice call participants."),
        type: OptionType.BOOLEAN,
        default: true
    },
    showParticipantButtons: {
        description: t("Show quick action buttons (Mute, Follow, Friend, DM) next to participants."),
        type: OptionType.BOOLEAN,
        default: true
    }
});
const SETTINGS_KEYS = ["islandColor", "keepIslandVisible", "showSpotifyIsland", "showSoundCordIsland", "showVoiceIsland", "showScreenShareIsland", "morphNotifications", "showCallControls", "showCallParticipants", "showParticipantButtons"] satisfies Array<keyof typeof settings.store>;

function setIslandNotification(notification: IslandNotification | null) {
    if (runtime.notificationTimeoutId !== undefined) clearTimeout(runtime.notificationTimeoutId);
    runtime.notification = notification;
    runtime.notificationTimeoutId = notification
        ? window.setTimeout(() => setIslandNotification(null), NOTIFICATION_DURATION)
        : undefined;
    runtime.notificationListeners.forEach(listener => listener());
}

function Glyph({ path, size: _, ...props }: IconProps & { path: string; }) {
    return (
        <svg {...props} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={path} />
        </svg>
    );
}

function IslandIcon(props: IconProps) {
    return <Glyph {...props} path="M12 3a9 9 0 1 0 9 9h-3a6 6 0 1 1-6-6V3Zm2 0v10.2a3 3 0 1 0 2 2.8V8h5V3h-7Z" />;
}

function ScreenShareIcon(props: IconProps) {
    return <Glyph {...props} path="M3 4h18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-7v2h3v2H7v-2h3v-2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v11h18V6H3Zm8 2 5 3.5-5 3.5V8Z" />;
}

function getStreamKey(stream: Stream) {
    return stream.streamType === "guild"
        ? `guild:${stream.guildId}:${stream.channelId}:${stream.ownerId}`
        : `call:${stream.channelId}:${stream.ownerId}`;
}

function stopScreenShare(stream: Stream) {
    FluxDispatcher.dispatch({
        type: "STREAM_STOP",
        streamKey: getStreamKey(stream),
        appContext: "APP"
    });
}

function ControlButton({ active, children, compact, danger, label, onClick }: ControlButtonProps) {
    return (
        <Button
            aria-label={label}
            className={cl("control", { "control-active": active, "control-compact": compact, "control-danger": danger })}
            size="iconOnly"
            variant="none"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onClick();
            }}
            onPointerDown={event => event.stopPropagation()}
        >
            {children}
        </Button>
    );
}

function ScreenShareTimer({ startedAt }: { startedAt: number; }) {
    const elapsed = Date.now() - startedAt;
    const time = useFixedTimer({ initialTime: startedAt });
    return <>{formatDurationMs(time > 0 ? time : elapsed)}</>;
}

function VoiceIcon({ children, slashed }: { children: ReactNode; slashed: boolean; }) {
    return (
        <span className={cl("voice-icon", { "voice-icon-slashed": slashed })}>
            {children}
            <span className={cl("slash")} />
        </span>
    );
}

const SOUNDCORD_STATE_PATHS = [
    "plugins.SoundCordPlayer.enableDynamicIsland"
] as const;

const SOUNDCORD_SECTION_PATHS = [
    "plugins.SoundCordPlayer.showSoundCordControls",
    "plugins.SoundCordPlayer.showSoundCordVolume"
] as const;

function useSoundCordState() {
    const [state, setState] = useState({ playing: null as any, isPlaying: false, favorites: [] as any[], favIndex: -1, volume: 80 });
    
    useEffect(() => {
        const handleUpdate = (e: any) => {
            if (e.state) setState(e.state);
        };
        // Request initial state in case the player is already running
        FluxDispatcher.dispatch({ type: "SOUNDCORD_REQUEST_STATE" });
        
        FluxDispatcher.subscribe("SOUNDCORD_STATE_UPDATE", handleUpdate);
        return () => {
            FluxDispatcher.unsubscribe("SOUNDCORD_STATE_UPDATE", handleUpdate);
        };
    }, []);
    
    return state;
}

function SoundCordSection({ sc }: { sc: ReturnType<typeof useSoundCordState> }) {
    const track = sc.playing;
    const isPlaying = sc.isPlaying;
    // hooks MUST be called before any conditional returns (React rules of hooks)
    const soundCordSettings = useSettings(SOUNDCORD_SECTION_PATHS as any).plugins?.SoundCordPlayer ?? { showSoundCordControls: true, showSoundCordVolume: true };
    const showControls = soundCordSettings.showSoundCordControls ?? true;
    const showVolume = soundCordSettings.showSoundCordVolume ?? true;

    if (!track) return null;
    const hasPrevNext = sc.favorites.length > 1;

    return (
        <section className={cl("section")} aria-label="SoundCord controls" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, width: "100%" }}>
                <div className={cl("section-info")}>
                    <img className={cl("cover")} src={track.artworkUrl} alt="" draggable={false} />
                    <div className={cl("copy")}>
                        <strong>{track.title}</strong>
                        <span>{track.artist}</span>
                    </div>
                </div>
                {showControls && (
                    <div className={cl("controls")}>
                        {hasPrevNext && (
                            <ControlButton label={t("Previous track")} onClick={() => {
                                FluxDispatcher.dispatch({ type: "SOUNDCORD_COMMAND", command: "prev" });
                            }}>
                                <Glyph path="M6 5h2v14H6V5Zm3 7 9-7v14l-9-7Z" />
                            </ControlButton>
                        )}
                        <ControlButton label={isPlaying ? t("Pause") : t("Play")} active={isPlaying} onClick={() => {
                            FluxDispatcher.dispatch({ type: "SOUNDCORD_COMMAND", command: "toggle" });
                        }}>
                            <Glyph path={isPlaying ? "M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" : "M8 5v14l11-7L8 5Z"} />
                        </ControlButton>
                        {hasPrevNext && (
                            <ControlButton label={t("Next track")} onClick={() => {
                                FluxDispatcher.dispatch({ type: "SOUNDCORD_COMMAND", command: "next" });
                            }}>
                                <Glyph path="M16 5h2v14h-2V5ZM6 5l9 7-9 7V5Z" />
                            </ControlButton>
                        )}
                    </div>
                )}
            </div>
            
            {showVolume && (
                <div style={{ padding: "0 4px" }}>
                    <input 
                        type="range" 
                        min={0} 
                        max={100} 
                        value={sc.volume} 
                        className="vc-illegalcord-dynamic-island-volume-slider"
                        style={{ "--value-percent": `${sc.volume}%` } as React.CSSProperties}
                        onChange={(e: any) => {
                            FluxDispatcher.dispatch({ type: "SOUNDCORD_COMMAND", command: "volume", value: Number(e.currentTarget.value) });
                        }}
                    />
                </div>
            )}
        </section>
    );
}

function SpotifySection() {
    const track = useStateFromStores([SpotifyStore], () => SpotifyStore.device?.is_active ? SpotifyStore.track : null);
    const isPlaying = useStateFromStores([SpotifyStore], () => SpotifyStore.isPlaying);
    if (!track) return null;

    return (
        <section className={cl("section")} aria-label={t("Spotify controls")}>
            <div className={cl("section-info")}>
                <img className={cl("cover")} src={track.album.image.url} alt="" draggable={false} />
                <div className={cl("copy")}>
                    <strong>{track.name}</strong>
                    <span>{track.artists.map(artist => artist.name).join(", ")}</span>
                </div>
            </div>
            <div className={cl("controls")}>
                <ControlButton label={t("Previous track")} onClick={() => SpotifyStore.prev()}>
                    <Glyph path="M6 5h2v14H6V5Zm3 7 9-7v14l-9-7Z" />
                </ControlButton>
                <ControlButton label={isPlaying ? t("Pause") : t("Play")} active={isPlaying} onClick={() => SpotifyStore.setPlaying(!isPlaying)}>
                    <Glyph path={isPlaying ? "M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" : "M8 5v14l11-7L8 5Z"} />
                </ControlButton>
                <ControlButton label={t("Next track")} onClick={() => SpotifyStore.next()}>
                    <Glyph path="M16 5h2v14h-2V5ZM6 5l9 7-9 7V5Z" />
                </ControlButton>
            </div>
        </section>
    );
}

function ParticipantRow({ p, channel, currentUser }: { p: { user: any; member: any }; channel: any; currentUser: any; }) {
    const relType = useStateFromStores([RelationshipStore], () => RelationshipStore.getRelationshipType(p.user.id), [p.user.id]);
    const isFriend = relType === 1;
    const isOutgoing = relType === 4;
    const isIncoming = relType === 3;
    const followedId = useFollowId();
    const isFollowingUser = followedId === p.user.id;
    const isSelf = currentUser && p.user.id === currentUser.id;
    const { showParticipantButtons } = settings.use(["showParticipantButtons"]);

    const isMuted = isSelf
        ? useStateFromStores([MediaEngineStore], () => MediaEngineStore.isSelfMute())
        : useStateFromStores([MediaEngineStore], () => MediaEngineStore.isLocalMute(p.user.id), [p.user.id]);

    const avatarUrl = typeof p.user.getAvatarURL === "function" 
        ? p.user.getAvatarURL(channel?.guild_id, 32)
        : p.user.avatarURL;

    return (
        <div 
            className="vc-illegalcord-dynamic-island-participant-row"
            onContextMenu={(e) => {
                e.preventDefault();
                const copy = (window as any).DiscordNative?.clipboard?.copy;
                if (copy) copy(p.user.id);
                else navigator.clipboard.writeText(p.user.id);
            }}
            style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "10px", 
                padding: "6px 8px", 
                borderRadius: "8px",
                cursor: "context-menu",
                transition: "background-color 0.15s ease"
            }}
            title={t("Right click to copy ID")}
        >
            <img 
                src={avatarUrl} 
                style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover" }} 
                alt=""
            />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.2", flexGrow: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.member?.nick ?? p.user.globalName ?? p.user.username}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.user.username}
                </span>
            </div>
            
            {showParticipantButtons && (
                <div 
                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                >
                    {/* Mute Button */}
                    <ControlButton 
                        label={isMuted ? t("Unmute") : t("Mute")} 
                        danger={isMuted} 
                        compact 
                        onClick={() => {
                            if (isSelf) IslandVoiceActions.toggleSelfMute();
                            else IslandVoiceActions.toggleLocalMute(p.user.id);
                        }}
                    >
                        <VoiceIcon slashed={isMuted}><Microphone size="14" /></VoiceIcon>
                    </ControlButton>

                    {!isSelf && (
                        <>
                            {/* Follow Button */}
                            <ControlButton 
                                label={isFollowingUser ? t("Unfollow") : t("Follow")} 
                                compact 
                                active={isFollowingUser}
                                danger={isFollowingUser}
                                onClick={() => {
                                    if (isFollowingUser) unfollow();
                                    else follow(p.user.id);
                                }}
                            >
                                {isFollowingUser ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path fill="currentColor" d="M12.47 21.73a.92.92 0 0 1-.94 0C9.43 20.48 1 15.09 1 8.75A5.75 5.75 0 0 1 6.75 3c2.34 0 3.88.9 5.25 2.26A6.98 6.98 0 0 1 17.25 3 5.75 5.75 0 0 1 23 8.75c0 6.34-8.42 11.73-10.53 12.98Z" />
                                    </svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path fill="currentColor" fillRule="evenodd" d="M12 8.07 10.6 6.7A5 5 0 0 0 6.75 5 3.75 3.75 0 0 0 3 8.75c0 2.32 1.59 4.76 3.87 6.96A31.87 31.87 0 0 0 12 19.67c1.2-.74 3.26-2.14 5.13-3.96 2.28-2.2 3.87-4.64 3.87-6.96A3.75 3.75 0 0 0 17.25 5a5 5 0 0 0-3.85 1.69L12 8.07Zm0-2.8A6.98 6.98 0 0 0 6.75 3 5.75 5.75 0 0 0 1 8.75c0 6.34 8.42 11.73 10.53 12.98.29.17.65.17.94 0C14.57 20.48 23 15.09 23 8.75A5.75 5.75 0 0 0 17.25 3c-2.34 0-3.88.9-5.25 2.26Z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </ControlButton>

                            {/* Friend Button */}
                            <ControlButton 
                                label={isFriend ? t("Remove Friend") : (isOutgoing || isIncoming ? t("Cancel Request") : t("Add Friend"))} 
                                compact 
                                onClick={() => {
                                    if (isFriend) RelationshipActions.removeFriend(p.user.id);
                                    else if (isOutgoing) RelationshipActions.cancelFriendRequest(p.user.id);
                                    else if (isIncoming) RelationshipActions.removeFriend(p.user.id);
                                    else RelationshipActions.addRelationship({ userId: p.user.id, context: { location: "Dynamic Island" } });
                                }}
                            >
                                {isFriend || isOutgoing || isIncoming ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path fill="currentColor" d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM18.17 16a.52.52 0 0 1-.45-.26 9.55 9.55 0 0 0-3.1-3.25c-.53-.33-.71-1.05-.48-1.63.11-.27.2-.57.26-.87.11-.54.55-1 1.1-.92a7.5 7.5 0 0 1 6.43 6.4c.04.28-.2.53-.48.53h-3.28ZM15.19 15.61c.13.16.02.39-.19.39a3 3 0 0 0-1.52 5.59c.2.12.26.41.02.41h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5a7.5 7.5 0 0 1 13.19-4.89ZM9.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15.5 22Z" />
                                        <path fill="currentColor" d="M15 18a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-8Z" />
                                    </svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path fill="currentColor" d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM16.62 13.17c-.22.29-.65.37-.92.14-.34-.3-.7-.57-1.09-.82-.52-.33-.7-1.05-.47-1.63.11-.27.2-.57.26-.87.11-.54.55-1 1.1-.92 1.6.2 3.04.92 4.15 1.98.3.27-.25.95-.65.95a3 3 0 0 0-2.38 1.17ZM15.19 15.61c.13.16.02.39-.19.39a3 3 0 0 0-1.52 5.59c.2.12.26.41.02.41h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5a7.5 7.5 0 0 1 13.19-4.89ZM9.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15.5 22Z" />
                                        <path fill="currentColor" d="M19 14a1 1 0 0 1 1 1v3h3a1 1 0 0 1 0 2h-3v3a1 1 0 0 1-2 0v-3h-3a1 1 0 1 1 0-2h3v-3a1 1 0 0 1 1-1Z" />
                                    </svg>
                                )}
                            </ControlButton>

                            {/* DM Button */}
                            <ControlButton label={t("Send DM")} compact onClick={() => ChannelActionCreators.openPrivateChannel({ recipientIds: [p.user.id] })}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                    <path fill="currentColor" d="M6.6 10.02 14 11.4a.6.6 0 0 1 0 1.18L6.6 14l-2.94 5.87a1.48 1.48 0 0 0 1.99 1.98l17.03-8.52a1.48 1.48 0 0 0 0-2.64L5.65 2.16a1.48 1.48 0 0 0-1.99 1.98l2.94 5.88Z" />
                                </svg>
                            </ControlButton>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function VoiceSection({ channelId }: { channelId: string; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(channelId), [channelId]);
    const voiceStates = useStateFromStores([VoiceStateStore], () => VoiceStateStore.getVoiceStatesForChannel(channelId), [channelId]);
    const participantCount = Object.keys(voiceStates).length;
    const isMuted = useStateFromStores([MediaEngineStore], () => MediaEngineStore.isSelfMute());
    const isDeafened = useStateFromStores([MediaEngineStore], () => MediaEngineStore.isSelfDeaf());
    const [expanded, setExpanded] = useState(false);
    const currentUser = UserStore.getCurrentUser();
    const { showCallControls, showCallParticipants } = settings.use(["showCallControls", "showCallParticipants"]);

    const participants = (showCallParticipants && expanded) ? Object.keys(voiceStates).map(uid => {
        if (currentUser && uid === currentUser.id) return null;
        const user = UserStore.getUser(uid);
        const member = channel?.guild_id ? GuildMemberStore.getMember(channel.guild_id, uid) : null;
        return user ? { user, member } : null;
    }).filter(Boolean) as { user: any, member: any }[] : [];

    return (
        <div 
            className={cl("section")} 
            style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "stretch", 
                padding: 0, 
                gap: 0 
            }}
        >
            <div 
                aria-label={t("Discord call controls")}
                style={{ 
                    display: "flex", 
                    minWidth: 0, 
                    padding: "8px", 
                    alignItems: "center", 
                    gap: "10px" 
                }}
            >
                <div 
                    className={cl("section-info")} 
                    onClick={() => {
                        if (showCallParticipants) setExpanded(!expanded);
                    }}
                    style={{ cursor: showCallParticipants ? "pointer" : "default", flex: 1 }}
                    title={showCallParticipants ? t("Click to toggle participants list") : undefined}
                >
                    <div className={cl("call-indicator")}><span /></div>
                    <div className={cl("copy")}>
                        <strong>{channel?.name || t("Discord call")}</strong>
                        <span>{participantCount} {participantCount === 1 ? t("participant") : t("participants")}</span>
                    </div>
                </div>
                {showCallControls && (
                    <div className={cl("controls")}>
                        <ControlButton label={isMuted ? t("Unmute") : t("Mute")} danger={isMuted} onClick={() => IslandVoiceActions.toggleSelfMute()}>
                            <VoiceIcon slashed={isMuted}><Microphone /></VoiceIcon>
                        </ControlButton>
                        <ControlButton label={isDeafened ? t("Undeafen") : t("Deafen")} danger={isDeafened} onClick={() => IslandVoiceActions.toggleSelfDeaf()}>
                            <VoiceIcon slashed={isDeafened}><HeadphonesIcon /></VoiceIcon>
                        </ControlButton>
                        <ControlButton label={t("Disconnect")} danger onClick={() => IslandChannelActions.selectVoiceChannel(null)}>
                            <Glyph path="m21.5 16.6-.13.14a.88.88 0 0 1-.97.2l-4.09-1.7a.99.99 0 0 1-.57-1.18l.73-2.7c-2.24-3-6.7-3-8.94 0l.7 2.1a.99.99 0 0 1-.48 1.19l-4.13 2.2a.87.87 0 0 1-1.03-.15l-.1-.1a5.18 5.18 0 0 1-.32-6.92 12.67 12.67 0 0 1 19.66 0 5.18 5.18 0 0 1-.32 6.92Z" />
                        </ControlButton>
                    </div>
                )}
            </div>
            
            {showCallParticipants && expanded && participants.length > 0 && (
                <div 
                    className="vc-illegalcord-dynamic-island-voice-participants-list"
                    style={{ 
                        display: "flex", 
                        flexDirection: "column", 
                        gap: "6px", 
                        padding: "4px 8px 8px 8px",
                        maxHeight: "220px",
                        overflowY: "auto",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)"
                    }}
                >
                    {participants.map(p => (
                        <ParticipantRow key={p.user.id} p={p} channel={channel} currentUser={currentUser} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ScreenShareSection({ startedAt, stream }: { startedAt: number; stream: Stream; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(stream.channelId), [stream.channelId]);
    const viewerCount = useStateFromStores([ApplicationStreamingStore], () => ApplicationStreamingStore.getViewerIds(stream).length, [stream]);

    return (
        <section className={cl("section", "screen-section")} aria-label={t("Screen sharing controls")}>
            <div className={cl("section-info")}>
                <div className={cl("stream-indicator")}><ScreenShareIcon /></div>
                <div className={cl("copy")}>
                    <strong>{channel.name || t("Screen sharing")}</strong>
                    <span><ScreenShareTimer startedAt={startedAt} /> · {viewerCount} {viewerCount === 1 ? t("viewer") : t("viewers")}</span>
                </div>
            </div>
            <div className={cl("controls")}>
                <ControlButton label={t("Stop sharing")} danger onClick={() => stopScreenShare(stream)}>
                    <Glyph path="M7 7h10v10H7V7Z" />
                </ControlButton>
            </div>
        </section>
    );
}

function DynamicIsland({ onlySoundCord }: { onlySoundCord?: boolean }) {
    if (!isDynamicIslandActive && !onlySoundCord) return null;
    const [expanded, setExpanded] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [notification, setNotification] = useState(runtime.notification);
    const [primaryIsland, setPrimaryIsland] = useState<IslandType>(IslandType.ScreenShare);
    const [spotifyIdle, setSpotifyIdle] = useState(false);
    const [streamStartedAt, setStreamStartedAt] = useState(Date.now());
    const swipeStartRef = useRef<SwipeStart | null>(null);
    const suppressClickRef = useRef(false);
    const { islandColor, keepIslandVisible, morphNotifications, showScreenShareIsland, showSoundCordIsland, showSpotifyIsland, showVoiceIsland } = settings.use(SETTINGS_KEYS);
    const spotifyTrack = useStateFromStores([SpotifyStore], () => SpotifyStore.device?.is_active ? SpotifyStore.track : null);
    const isPlaying = useStateFromStores([SpotifyStore], () => SpotifyStore.isPlaying);
    const spotifyTrackId = spotifyTrack?.id;
    const soundCordState = useSoundCordState();
    const activeStream = useStateFromStores([ApplicationStreamingStore], () => ApplicationStreamingStore.getCurrentUserActiveStream());
    const currentUser = UserStore.getCurrentUser();
    const voiceState = useStateFromStores([VoiceStateStore], () => VoiceStateStore.getVoiceStateForUser(currentUser.id));
    const soundCordSettings = useSettings(SOUNDCORD_STATE_PATHS as any).plugins?.SoundCordPlayer ?? { enableDynamicIsland: true };
    const soundCordIslandEnabled = soundCordSettings.enableDynamicIsland ?? true;

    const track = !onlySoundCord && showSpotifyIsland && !spotifyIdle ? spotifyTrack : null;
    const channelId = !onlySoundCord && showVoiceIsland ? voiceState?.channelId : undefined;
    const stream = !onlySoundCord && showScreenShareIsland ? activeStream : null;
    // show paused SoundCord only when another island (call, screen share, Spotify) is also active
    const hasOtherActivity = !!(track || channelId || stream);
    const scTrackBase = (showSoundCordIsland || onlySoundCord) && soundCordIslandEnabled ? soundCordState.playing : null;
    const scTrack = scTrackBase;
    const streamKey = stream ? getStreamKey(stream) : null;
    const activeIslands: IslandType[] = [];
    if (stream) activeIslands.push(IslandType.ScreenShare);
    if (track) activeIslands.push(IslandType.Spotify);
    if (scTrack) activeIslands.push(IslandType.SoundCord);
    if (channelId) activeIslands.push(IslandType.Voice);
    const primary = activeIslands.includes(primaryIsland) ? primaryIsland : activeIslands[0];
    const primaryStream = primary === IslandType.ScreenShare ? stream : null;
    const primaryTrack = primary === IslandType.Spotify ? track : null;
    const primarySoundCord = primary === IslandType.SoundCord ? scTrack : null;
    const primaryChannelId = primary === IslandType.Voice ? channelId : undefined;
    const idle = !track && !scTrack && !channelId && !stream;

    const [now, setNow] = useState(new Date());
    useEffect(() => {
        if (!idle) return;
        const intervalId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(intervalId);
    }, [idle]);

    useEffect(() => {
        if (streamKey) setStreamStartedAt(Date.now());
    }, [streamKey]);

    useEffect(() => {
        setSpotifyIdle(false);
        if (!showSpotifyIsland || !spotifyTrackId || isPlaying) return;

        const timeoutId = window.setTimeout(() => setSpotifyIdle(true), SPOTIFY_IDLE_DURATION);
        return () => clearTimeout(timeoutId);
    }, [isPlaying, showSpotifyIsland, spotifyTrackId]);

    useEffect(() => {
        const updateNotification = () => setNotification(runtime.notification);
        runtime.notificationListeners.add(updateNotification);
        updateNotification();
        return () => { runtime.notificationListeners.delete(updateNotification); };
    }, []);

    useEffect(() => {
        if (!morphNotifications) {
            setIslandNotification(null);
            return;
        }

        const handleMessage = ({ message }: { message: MessageWithMentions; }) => {
            const me = UserStore.getCurrentUser();
            if (!me) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            const storedMessage = MessageStore.getMessage(message.channel_id, message.id);
            if (!channel || message.author.id === me.id || storedMessage?.blocked) return;
            // don't notify if the user is already viewing this channel
            if (SelectedChannelStore.getChannelId() === message.channel_id) return;

            const directlyMentioned = message.mentions.some(mention => typeof mention === "string" ? mention === me.id : mention.id === me.id);
            const memberRoles = channel.guild_id ? GuildMemberStore.getMember(channel.guild_id, me.id)?.roles ?? [] : [];
            const roleMentioned = channel.guild_id != null
                && !UserGuildSettingsStore.isSuppressRolesEnabled(channel.guild_id)
                && message.mention_roles.some(roleId => memberRoles.includes(roleId));
            const everyoneMentioned = channel.guild_id != null
                && !UserGuildSettingsStore.isSuppressEveryoneEnabled(channel.guild_id)
                && message.mention_everyone;
            const mentioned = storedMessage?.mentioned === true || directlyMentioned || roleMentioned || everyoneMentioned;
            if (channel.guild_id && !mentioned) return;

            const author = UserStore.getUser(message.author.id) ?? message.author;
            setIslandNotification({
                avatarUrl: IconUtils.getUserAvatarURL(author, false, 64),
                body: message.content.trim() || (message.attachments.length ? t("Sent an attachment.") : t("Sent a message.")),
                id: message.id,
                title: author.globalName ?? author.username
            });
        };

        FluxDispatcher.subscribe("MESSAGE_CREATE", handleMessage);
        return () => FluxDispatcher.unsubscribe("MESSAGE_CREATE", handleMessage);
    }, [morphNotifications]);

    useEffect(() => {
        if (idle) setExpanded(false);
    }, [idle]);

    if (idle && !notification && !keepIslandVisible) return null;

    const activateSummary = () => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }

        setIslandNotification(null);
        setExpanded(value => !value);
    };

    const cyclePrimary = (direction: 1 | -1) => {
        if (activeIslands.length < 2 || !primary) return;

        const currentIndex = activeIslands.indexOf(primary);
        const nextIndex = (currentIndex + direction + activeIslands.length) % activeIslands.length;
        setPrimaryIsland(activeIslands[nextIndex]);
    };

    const beginSwipe = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        swipeStartRef.current = {
            pointerId: event.pointerId,
            startedAt: Date.now(),
            x: event.clientX,
            y: event.clientY
        };
        suppressClickRef.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
        const start = swipeStartRef.current;
        swipeStartRef.current = null;
        if (!start || start.pointerId !== event.pointerId) return;

        const distanceX = event.clientX - start.x;
        const distanceY = event.clientY - start.y;
        if (Date.now() - start.startedAt < SWIPE_MIN_DURATION || Math.abs(distanceX) < SWIPE_MIN_DISTANCE || Math.abs(distanceX) <= Math.abs(distanceY)) return;

        suppressClickRef.current = true;
        cyclePrimary(distanceX > 0 ? 1 : -1);
    };

    const primaryIsPlaying = primary === IslandType.Spotify ? isPlaying : primary === IslandType.SoundCord ? soundCordState.isPlaying : false;
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div 
            className={cl("root", `color-${islandColor}`, {
                "root-expanded": expanded || isHovered,
                "root-idle": idle,
                "root-notification": notification != null,
                "root-playing": primaryIsPlaying && (primary === IslandType.Spotify || primary === IslandType.SoundCord),
                "root-sharing": primary === IslandType.ScreenShare
            })}
            onMouseEnter={() => IS_WEB && setIsHovered(true)}
            onMouseLeave={() => IS_WEB && setIsHovered(false)}
        >
            <Clickable
                className={cl("summary")}
                aria-expanded={expanded}
                aria-label={t("Dynamic Island")}
                onClick={activateSummary}
                onPointerCancel={() => { swipeStartRef.current = null; }}
                onPointerDown={beginSwipe}
                onPointerUp={finishSwipe}
            >
                {notification
                    ? <img key={notification.id} className={cl("notification-avatar")} src={notification.avatarUrl} alt="" draggable={false} />
                    : primaryStream
                        ? <ScreenShareIcon className={cl("summary-icon", "stream-icon")} />
                        : primaryTrack
                            ? <img key={primaryTrack.album.image.url} className={cl("summary-cover")} src={primaryTrack.album.image.url} alt="" draggable={false} />
                            : primarySoundCord
                                ? <img key={primarySoundCord.artworkUrl} className={cl("summary-cover")} src={primarySoundCord.artworkUrl} alt="" draggable={false} />
                                : <IslandIcon className={cl("summary-icon")} />}
                <div key={notification?.id ?? primary ?? "idle"} className={cl("summary-copy")}>
                    <strong>{notification?.title ?? (primaryStream ? t("You are sharing your screen") : primaryTrack?.name ?? primarySoundCord?.title ?? (primaryChannelId ? t("Discord call") : (idle ? timeString : t("Dynamic Island"))))}</strong>
                    <span>{notification?.body ?? (primaryStream
                        ? <>{t("Live for")}<ScreenShareTimer startedAt={streamStartedAt} /></>
                        : primaryTrack
                            ? primaryTrack.artists.map(artist => artist.name).join(", ")
                            : primarySoundCord
                                ? primarySoundCord.artist
                                : primaryChannelId ? t("Call controls available") : (idle ? dateString : t("Ready for your activities")))}</span>
                </div>
                {!notification && (primaryTrack || primarySoundCord) && (
                    <span className={cl("visualizer")} aria-label={primaryIsPlaying ? t("Playing") : t("Paused")}>
                        <span /><span /><span />
                    </span>
                )}
                {!notification && primaryStream && (
                    <ControlButton compact label={t("Stop sharing")} danger onClick={() => stopScreenShare(primaryStream)}>
                        <Glyph path="M7 7h10v10H7V7Z" />
                    </ControlButton>
                )}
                {!notification && primaryChannelId && <span className={cl("live-dot")} aria-label={t("Call active")} />}
                {!notification && activeIslands.length > 1 && (
                    <span className={cl("pages")} aria-label={`${activeIslands.length} active Islands`}>
                        {activeIslands.map(type => <span key={type} className={cl("page", { "page-active": type === primary })} />)}
                    </span>
                )}
            </Clickable>
            {notification && <span key={notification.id} className={cl("notification-progress")} />}
            <div className={cl("panel-shell")} aria-hidden={!expanded}>
                <div className={cl("panel-clip")}>
                    <div className={cl("panel")}>
                        {stream && <ScreenShareSection stream={stream} startedAt={streamStartedAt} />}
                        {track && <SpotifySection />}
                        {scTrack && <SoundCordSection sc={soundCordState} />}
                        {channelId && <VoiceSection channelId={channelId} />}
                        {idle && <div className={cl("empty")}>{t("Enable an Island type, play music, or join a call to show controls.")}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function DynamicIslandPortal({ onlySoundCord }: { onlySoundCord?: boolean }) {
    const owner = useRef(Symbol()).current;
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const syncPortal = () => {
            if (runtime.activeModule === portalModule && runtime.owner == null) runtime.owner = owner;
            forceUpdate(value => value + 1);
        };

        runtime.portalListeners.add(syncPortal);
        syncPortal();
        return () => {
            runtime.portalListeners.delete(syncPortal);
            if (runtime.owner !== owner) return;
            runtime.owner = null;
            runtime.portalListeners.forEach(listener => listener());
        };
    }, [owner]);

    return runtime.activeModule === portalModule && runtime.owner === owner && (isDynamicIslandActive || onlySoundCord)
        ? ReactDOM.createPortal(<DynamicIsland onlySoundCord={onlySoundCord} />, document.body)
        : null;
}

export const SafeDynamicIsland = ErrorBoundary.wrap(DynamicIslandPortal, { noop: true });

export default definePlugin({
    name: "DynamicIslande",
    description: "Adds a Dynamic Island for Spotify, SoundCord, calls, screen sharing, and notifications.",
    authors: [{ name: "irritably",
     id: 928787166916640838n }],
    tags: ["Media", "Voice"],
    dependencies: ["HeaderBarAPI", "MusicControls"],
    settings,

    start() {
        isDynamicIslandActive = true;
        musicControlsSettings.store.showSpotifyControls = settings.store.showSpotifyPanel;
    },

    stop() {
        isDynamicIslandActive = false;
        setIslandNotification(null);
    },

    headerBarButton: {
        icon: IslandIcon,
        render: () => <SafeDynamicIsland />,
        priority: 10_000
    }
});
