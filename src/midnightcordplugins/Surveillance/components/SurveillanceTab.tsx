import { t } from "../../autoTranslateMidnightcord";
/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingPrimary, HeadingTertiary } from "@components/Heading";
import { SettingsTab, wrapTab } from "@components/settings";
import { copyToClipboard } from "@utils/clipboard";
import { classNameFactory } from "@utils/css";
import { fetchUserProfile, openUserProfile } from "@utils/discord";
import { classes } from "@utils/misc";
import type { RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, GuildStore, IconUtils, Modal, openModal, React, RelationshipStore, ScrollerThin, TextInput, Toasts, useEffect, useMemo, UserProfileStore, UserStore, useState, useStateFromStores } from "@webpack/common";
import { tPlugin as t } from "@api/pluginI18n";


import { addServerTarget, getServerTargets, getTargets, removeServerTarget, removeTarget, setServerTargets, setTargets, settings, subscribeServerTargets, subscribeTargets } from "..";
import { clearEvents, getEvents, loadEvents, subscribe } from "../store";
import type { SurveillanceEvent, SurveillanceEventType, VoiceParticipant } from "../types";

type EventFilter = "all" | "activity" | "message" | "presence" | "reaction" | "server" | "typing" | "voice";
type SurveillancePage = "user" | "server";
type TargetMutualState = "idle" | "checking" | "match" | "no-match" | "unavailable" | "error";

interface CachedUser {
    id: string;
    username: string;
    globalName?: string | null;
}

const EVENT_PAGE_SIZE = 100;
const SEARCH_RESULT_LIMIT = 30;
const TARGET_LIST_LIMIT = 50;
const cl = classNameFactory("vc-surveillance-");

const filterOptions: Array<{ label: string; value: EventFilter; }> = [
    { label: "All", value: "all" },
    { label: "Messages", value: "message" },
    { label: "Server", value: "server" },
    { label: "Reactions", value: "reaction" },
    { label: "Presence", value: "presence" },
    { label: "Voice", value: "voice" },
    { label: "Activities", value: "activity" },
    { label: "Typing", value: "typing" },
];

const pageOptions: Array<{ label: string; value: SurveillancePage; }> = [
    { label: "User Surveillance", value: "user" },
    { label: "Server Surveillance", value: "server" },
];

const typeLabels: Record<SurveillanceEventType, string> = {
    activity_start: "Activity",
    activity_stop: "Activity",
    activity_update: "Activity",
    channel_create: "Channel",
    channel_delete: "Channel",
    channel_update: "Channel",
    guild_member_add: "Member",
    guild_member_remove: "Member",
    guild_member_update: "Member",
    guild_update: "Server",
    message: "Message",
    message_delete: "Deleted",
    message_edit: "Edited",
    reaction_add: "Reaction",
    reaction_remove: "Reaction",
    reaction_remove_all: "Reaction",
    role_create: "Role",
    role_delete: "Role",
    role_update: "Role",
    status: "Status",
    thread_create: "Thread",
    thread_delete: "Thread",
    thread_update: "Thread",
    typing: "Typing",
    voice_join: "Voice",
    voice_leave: "Voice",
    voice_move: "Voice",
    voice_update: "Voice",
};

const getBadgeClass = (type: SurveillanceEventType) => {
    if (type.startsWith("activity_")) return cl("event-play");
    if (type === "message_delete") return cl("event-deleted");
    return cl(`event-${type}`);
};

const isCachedUser = (value: unknown): value is CachedUser => {
    if (typeof value !== "object" || value == null) return false;

    const user = value as Record<string, unknown>;
    return typeof user.id === "string" && typeof user.username === "string";
};

const getCachedUsers = () => {
    const users = UserStore.getUsers?.();
    if (typeof users !== "object" || users == null) return [];

    return Object.values(users).filter(isCachedUser);
};

const areStringArraysEqual = (first: string[], second: string[]) =>
    first.length === second.length && first.every((value, index) => value === second[index]);

const eventMatchesPage = (event: SurveillanceEvent, page: SurveillancePage) =>
    page === "server" ? event.scope === "server" : event.scope !== "server";

const eventMatchesFilter = (event: SurveillanceEvent, filter: EventFilter) => {
    if (filter === "all") return true;
    if (filter === "presence") return event.type === "status";
    if (filter === "server") return event.scope === "server" || ["channel_", "thread_", "guild_", "role_"].some(prefix => event.type.startsWith(prefix));
    return event.type.startsWith(filter);
};

const eventMatchesQuery = (event: SurveillanceEvent, query: string) => {
    if (!query) return true;

    const value = query.toLowerCase();
    return [
        event.username,
        event.userId,
        event.details,
        event.channelName,
        event.guildName,
        event.content,
        event.before,
        event.after,
    ].some(part => part?.toLowerCase().includes(value));
};

const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString();

const formatLabel = (label: string) =>
    label.replace(/[A-Z]/g, match => ` ${match}`).replace(/^./, match => match.toUpperCase());

const toast = (message: string, type: string = Toasts.Type.SUCCESS) =>
    Toasts.show({
        type,
        message,
        id: Toasts.genId(),
    });

const getMutualFriendId = (value: unknown) => {
    if (typeof value !== "object" || value == null) return;

    const entry = value as Record<string, unknown>;
    const user = typeof entry.user === "object" && entry.user != null ? entry.user as Record<string, unknown> : undefined;

    if (typeof user?.id === "string") return user.id;
    if (typeof entry.key === "string") return entry.key;
};

const getTargetMutualStateLabel = (state: TargetMutualState, targetName: string) => {
    switch (state) {
        case "checking":
            return t("Checking mutual friends...");
        case "match":
            return t("Mutual with {targetName}.").replace("{targetName}", targetName);
        case "no-match":
            return t("{targetName} was not found in mutual friends.").replace("{targetName}", targetName);
        case "unavailable":
            return t("Discord did not expose the mutual friend list.");
        case "error":
            return t("Could not check mutual friends.");
        default:
            return "";
    }
};

function DetailField({ label, value, wide, preserve }: { label: string; value?: string | number | boolean | null; wide?: boolean; preserve?: boolean; }) {
    if (value == null || value === "") return null;

    const text = String(value);

    return (
        <div className={classes(cl("modal-field"), wide && cl("modal-wide"))}>
            <strong>{label}</strong>
            {preserve ? <pre>{text}</pre> : <span>{text}</span>}
        </div>
    );
}

function VoiceParticipantBadge({ participant }: { participant: VoiceParticipant; }) {
    const isFriend = useStateFromStores([RelationshipStore], () => RelationshipStore.isFriend(participant.userId), [participant.userId]);

    return (
        <span className={classes(cl("voice-badge"), isFriend && cl("voice-badge-friend"))}>
            {participant.displayName}
            <small>{isFriend ? t("Your friend") : t("Not your friend")}</small>
        </span>
    );
}

function VoiceParticipantCard({ participant, targetUserId }: { participant: VoiceParticipant; targetUserId?: string; }) {
    const user = UserStore.getUser(participant.userId);
    const targetUser = targetUserId ? UserStore.getUser(targetUserId) : undefined;
    const isFriend = useStateFromStores([RelationshipStore], () => RelationshipStore.isFriend(participant.userId), [participant.userId]);
    const username = user?.username ?? participant.username;
    const targetName = targetUser?.username ?? "target";
    const [targetMutualState, setTargetMutualState] = useState<TargetMutualState>("idle");

    const checkTargetMutual = async () => {
        if (!targetUserId || targetMutualState === "checking") return;

        setTargetMutualState("checking");

        try {
            await fetchUserProfile(participant.userId, { with_mutual_friends_count: true }, false);

            const mutualFriends = UserProfileStore.getMutualFriends(participant.userId) as unknown;
            if (!Array.isArray(mutualFriends)) {
                setTargetMutualState("unavailable");
                return;
            }

            setTargetMutualState(mutualFriends.some(friend => getMutualFriendId(friend) === targetUserId) ? "match" : "no-match");
        } catch {
            setTargetMutualState("error");
        }
    };

    return (
        <div className={cl("voice-participant")}>
            <div className={cl("voice-person")}>
                <div className={cl("voice-name-row")}>
                    <strong>{participant.displayName}</strong>
                    <span className={classes(cl("voice-status"), isFriend && cl("voice-status-friend"))}>
                        {isFriend ? t("Your friend") : t("Not your friend")}
                    </span>
                </div>
                <span className={cl("voice-username")}>@{username}</span>
                <small className={cl("voice-id")}>ID {participant.userId}</small>
                {targetUserId && targetMutualState !== "idle" ? (
                    <div className={classes(
                        cl("voice-mutual-state"),
                        targetMutualState === "match" && cl("voice-mutual-state-friend"),
                        (targetMutualState === "unavailable" || targetMutualState === "error") && cl("voice-mutual-state-muted")
                    )}>
                        {getTargetMutualStateLabel(targetMutualState, targetName)}
                    </div>
                ) : null}
            </div>
            <div className={cl("voice-actions")}>
                {targetUserId ? (
                    <button className={cl("action")} disabled={targetMutualState === "checking"} onClick={() => void checkTargetMutual()} type="button">
                        {t("Check Mutual")}
                    </button>
                ) : null}
                <button className={cl("action")} onClick={() => void openUserProfile(participant.userId)} type="button">
                    {t("Open Profile")}
                </button>
            </div>
        </div>
    );
}

function VoiceParticipantsPreview({ participants }: { participants?: VoiceParticipant[]; }) {
    if (!participants) return null;

    if (!participants.length) {
        return (
            <div className={cl("voice-preview")}>
                <span className={cl("voice-badge")}>{t("No one else in voice")}</span>
            </div>
        );
    }

    const shownParticipants = participants.slice(0, 3);
    const hiddenCount = participants.length - shownParticipants.length;

    return (
        <div className={cl("voice-preview")}>
            {shownParticipants.map(participant => (
                <VoiceParticipantBadge key={participant.userId} participant={participant} />
            ))}
            {hiddenCount > 0 ? <span className={cl("voice-badge")}>{hiddenCount} {t("more")}</span> : null}
        </div>
    );
}

function VoiceParticipantsPanel({ participants, targetUserId }: { participants?: VoiceParticipant[]; targetUserId?: string; }) {
    const [collapsed, setCollapsed] = useState(false);

    if (!participants) return null;

    const participantCount = participants.length === 1 ? t("1 person") : `${participants.length} ${t("people")}`;

    return (
        <div className={cl("voice-panel")}>
            <div className={cl("voice-panel-head")}>
                <strong>{t("People in voice")}</strong>
                <button className={cl("action")} onClick={() => setCollapsed(value => !value)} type="button">
                    {collapsed ? t("Open") : t("Close")}
                </button>
            </div>
            {collapsed ? (
                <span className={cl("voice-collapsed")}>{t("{count} saved in this event.").replace("{count}", participantCount)}</span>
            ) : participants.length ? (
                <div className={cl("voice-list")}>
                    {participants.map(participant => (
                        <VoiceParticipantCard key={participant.userId} participant={participant} targetUserId={targetUserId} />
                    ))}
                </div>
            ) : <span className={cl("empty")}>{t("No one else was in voice.")}</span>}
        </div>
    );
}


const EventDetailsModal = ErrorBoundary.wrap(function EventDetailsModal({ event, modalProps }: { event: SurveillanceEvent; modalProps: RenderModalProps; }) {
    const channel = event.channelId ? ChannelStore.getChannel(event.channelId) : undefined;
    const guild = event.guildId ? GuildStore.getGuild(event.guildId) : undefined;
    const metadata = Object.entries(event.metadata ?? {}).filter(([, value]) => value != null);
    const user = UserStore.getUser(event.userId);
    const avatarUrl = user
        ? IconUtils.getUserAvatarURL(user, false, 80)
        : IconUtils.getDefaultAvatarURL(event.userId);

    const badgeClass = getBadgeClass(event.type);
    const typeLabel = t(typeLabels[event.type]);

    const copyEvent = () => {
        try {
            void Promise.resolve(copyToClipboard(JSON.stringify(event, null, 2))).then(
                () => toast(t("Event copied.")),
                () => toast(t("Failed to copy event."), Toasts.Type.FAILURE)
            );
        } catch {
            toast(t("Failed to copy event."), Toasts.Type.FAILURE);
        }
    };

    return (
        <Modal
            {...modalProps}
            size="md"
        >
            {/* User banner / header */}
            <div className={cl("modal-user-banner")}>
                <div className={cl("modal-user-banner-bg")} />
                <div className={cl("modal-user-header")}>
                    <div className={cl("modal-avatar-wrap")}>
                        <img className={cl("modal-avatar")} src={avatarUrl} alt="" draggable={false} />
                    </div>
                    <div className={cl("modal-user-meta")}>
                        <div className={cl("modal-display-name")}>{event.username}</div>
                        <div className={cl("modal-user-id")}>ID: {event.userId}</div>
                    </div>
                    <div className={classes(cl("modal-type-badge"), badgeClass)}>{typeLabel}</div>
                </div>
            </div>

            <div className={cl("modal-content")}>
                {/* Main event info */}
                <div className={cl("modal-section")}>
                    <div className={cl("modal-section-title")}>{t("Event Info")}</div>
                    <div className={cl("modal-grid")}>
                        <DetailField label={t("Date & Time")} value={formatTime(event.timestamp)} />
                        <DetailField label={t("Scope")} value={event.scope} />
                        {event.guildName || guild?.name ? (
                            <DetailField label={t("Server")} value={event.guildName ?? guild?.name} />
                        ) : null}
                        {event.channelName || channel?.name ? (
                            <DetailField label={t("Channel")} value={event.channelName ?? channel?.name} />
                        ) : null}
                        <DetailField label={t("Server ID")} value={event.guildId} />
                        <DetailField label={t("Channel ID")} value={event.channelId} />
                    </div>
                </div>

                {/* Details section */}
                {(event.details || event.content || event.before || event.after || ((event.type === "message" || event.type === "message_edit" || event.type === "message_delete") && !settings.store.captureMessageContent)) ? (
                    <div className={cl("modal-section")}>
                        <div className={cl("modal-section-title")}>{t("Details")}</div>
                        <div className={cl("modal-grid")}>
                            <DetailField label={t("Summary")} value={event.details} wide={true} preserve={true} />
                            {((event.type === "message" || event.type === "message_delete") && !event.content && !settings.store.captureMessageContent) ? (
                                <DetailField label={t("Message Content")} value={(document.documentElement.lang || "en-US").startsWith("fr") ? "[La capture du contenu des messages est désactivée dans les paramètres de Surveillance]" : "[Message content capture is disabled in Surveillance settings]"} wide={true} preserve={true} />
                            ) : (
                                <DetailField label={t("Message Content")} value={event.content} wide={true} preserve={true} />
                            )}
                            {(event.type === "message_edit" && !event.before && !event.after && !settings.store.captureMessageContent) ? (
                                <>
                                    <DetailField label={t("Before")} value={(document.documentElement.lang || "en-US").startsWith("fr") ? "[La capture du contenu des messages est désactivée dans les paramètres de Surveillance]" : "[Message content capture is disabled in Surveillance settings]"} wide={true} preserve={true} />
                                    <DetailField label={t("After")} value={(document.documentElement.lang || "en-US").startsWith("fr") ? "[La capture du contenu des messages est désactivée dans les paramètres de Surveillance]" : "[Message content capture is disabled in Surveillance settings]"} wide={true} preserve={true} />
                                </>
                            ) : (
                                <>
                                    <DetailField label={t("Before")} value={event.before} wide={true} preserve={true} />
                                    <DetailField label={t("After")} value={event.after} wide={true} preserve={true} />
                                </>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* Metadata */}
                {metadata.length ? (
                    <div className={cl("modal-section")}>
                        <div className={cl("modal-section-title")}>{t("Metadata")}</div>
                        <div className={cl("modal-grid")}>
                            {metadata.map(([key, value]) => (
                                <DetailField key={key} label={formatLabel(key)} value={value} />
                            ))}
                        </div>
                    </div>
                ) : null}


                <VoiceParticipantsPanel participants={event.voiceParticipants} targetUserId={event.scope === "person" ? event.userId : undefined} />

                {/* Footer */}
                <div className={cl("modal-footer")}>
                    <span className={cl("modal-meta")}>ID: {event.id}</span>
                    <button className={cl("action")} onClick={copyEvent}>{t("Copy JSON")}</button>
                </div>
            </div>
        </Modal>
    );
}, { noop: true });

const openEventModal = (event: SurveillanceEvent) => {
    openModal(modalProps => <EventDetailsModal event={event} modalProps={modalProps} />);
};

function TargetPill({ userId }: { userId: string; }) {
    const user = UserStore.getUser(userId);

    return (
        <button className={cl("target-pill")} onClick={() => removeTarget(userId)}>
            <span>{user?.username ?? userId}</span>
            <span className={cl("target-id")}>{userId}</span>
        </button>
    );
}

function ServerPill({ guildId }: { guildId: string; }) {
    const guild = GuildStore.getGuild(guildId);

    return (
        <button className={cl("target-pill")} onClick={() => removeServerTarget(guildId)}>
            <span>{guild?.name ?? guildId}</span>
            <span className={cl("target-id")}>{guildId}</span>
        </button>
    );
}

function UserSearchResult({ user, onAdd }: { user: CachedUser; onAdd(userId: string): void; }) {
    return (
        <button className={cl("search-result")} onClick={() => onAdd(user.id)} type="button">
            <span>
                <strong>{user.globalName ?? user.username}</strong>
                <small>{user.username}</small>
            </span>
            <span className={cl("target-id")}>{user.id}</span>
        </button>
    );
}

function ServerSearchResult({ guildId, onAdd }: { guildId: string; onAdd(guildId: string): void; }) {
    const guild = GuildStore.getGuild(guildId);

    return (
        <button className={cl("search-result")} onClick={() => onAdd(guildId)} type="button">
            <span>
                <strong>{guild?.name ?? guildId}</strong>
                <small>{t("Server")}</small>
            </span>
            <span className={cl("target-id")}>{guildId}</span>
        </button>
    );
}

function Stat({ label, value }: { label: string; value: number; }) {
    return (
        <div className={cl("stat")}>
            <span>{value}</span>
            <small>{label}</small>
        </div>
    );
}

function EventRow({ event }: { event: SurveillanceEvent; }) {
    const channel = event.channelId ? ChannelStore.getChannel(event.channelId) : undefined;
    const guild = event.guildId ? GuildStore.getGuild(event.guildId) : undefined;
    const user = UserStore.getUser(event.userId);
    const avatarUrl = user
        ? IconUtils.getUserAvatarURL(user, false, 32)
        : IconUtils.getDefaultAvatarURL(event.userId);
    const location = [
        event.guildName ?? guild?.name,
        event.channelName ?? channel?.name,
    ].filter(Boolean).join(" / ");

    return (
        <button className={classes(cl("event-row"), event.type.startsWith("activity_") && cl("event-row-compact"))} onClick={() => openEventModal(event)} type="button">
            <img
                className={cl("event-avatar")}
                src={avatarUrl}
                alt=""
                draggable={false}
                width={32}
                height={32}
            />
            <div className={classes(cl("event-badge"), getBadgeClass(event.type))}>
                {t(typeLabels[event.type])}
            </div>
            <div className={cl("event-main")}>
                <div className={cl("event-head")}>
                    <strong>{event.username}</strong>
                    <span>{formatTime(event.timestamp)}</span>
                </div>
                <div className={cl("event-details")}>{event.details}</div>
                <VoiceParticipantsPreview participants={event.voiceParticipants} />
                {location ? <div className={cl("event-location")}>{location}</div> : null}
                {event.before || event.after ? (
                    <div className={cl("event-diff")}>
                        {event.before ? <span>{t("Before")}: {event.before}</span> : null}
                        {event.after ? <span>{t("After")}: {event.after}</span> : null}
                    </div>
                ) : null}
            </div>

        </button>
    );
}

function SurveillanceTab() {
    const [events, setEvents] = useState<SurveillanceEvent[]>(getEvents());
    const [page, setPage] = useState<SurveillancePage>("user");
    const [targets, setLocalTargets] = useState(getTargets());
    const [serverTargets, setLocalServerTargets] = useState(getServerTargets());
    const [targetInput, setTargetInput] = useState("");
    const [userSearch, setUserSearch] = useState("");
    const [serverSearch, setServerSearch] = useState("");
    const [collapsedPages, setCollapsedPages] = useState<Record<SurveillancePage, boolean>>({
        server: false,
        user: false,
    });
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<EventFilter>("all");
    const [visibleEventCount, setVisibleEventCount] = useState(EVENT_PAGE_SIZE);
    const guildIds = useStateFromStores([GuildStore], () => GuildStore.getGuildsArray().map(guild => guild.id), [], areStringArraysEqual);

    useEffect(() => {
        void loadEvents(settings.store.maxEvents).then(() => setEvents(getEvents()));

        const unsubscribeEvents = subscribe(() => setEvents(getEvents()));
        const unsubscribeTargets = subscribeTargets(() => setLocalTargets([...getTargets()]));
        const unsubscribeServerTargets = subscribeServerTargets(() => setLocalServerTargets([...getServerTargets()]));

        return () => {
            unsubscribeEvents();
            unsubscribeTargets();
            unsubscribeServerTargets();
        };
    }, []);

    useEffect(() => {
        setVisibleEventCount(EVENT_PAGE_SIZE);
    }, [filter, page, query]);

    const targetIds = useMemo(() => new Set(targets), [targets]);
    const serverTargetIds = useMemo(() => new Set(serverTargets), [serverTargets]);
    const targetPanelCollapsed = collapsedPages[page];

    const scopedEvents = useMemo(() =>
        events.filter(event => eventMatchesPage(event, page)),
        [events, page]
    );

    const filteredEvents = useMemo(() =>
        scopedEvents.filter(event => eventMatchesFilter(event, filter) && eventMatchesQuery(event, query)),
        [filter, query, scopedEvents]
    );

    const visibleEvents = useMemo(() =>
        filteredEvents.slice(0, visibleEventCount),
        [filteredEvents, visibleEventCount]
    );

    const stats = useMemo(() => {
        const users = new Set<string>();
        const guilds = new Set<string>();
        const channels = new Set<string>();

        for (const event of scopedEvents) {
            users.add(event.userId);
            if (event.guildId) guilds.add(event.guildId);
            if (event.channelId) channels.add(event.channelId);
        }

        return {
            events: scopedEvents.length,
            users: users.size,
            guilds: guilds.size,
            channels: channels.size,
        };
    }, [scopedEvents]);

    const userSearchResults = useMemo(() => {
        const search = userSearch.trim().toLowerCase();
        if (page !== "user" || targetPanelCollapsed || !search) return { matches: [], total: 0 };

        const matches: CachedUser[] = [];
        let total = 0;

        for (const user of getCachedUsers()) {
            if (targetIds.has(user.id)) continue;
            if (
                !user.id.includes(search)
                && !user.username.toLowerCase().includes(search)
                && !user.globalName?.toLowerCase().includes(search)
            ) continue;

            total++;
            if (matches.length < SEARCH_RESULT_LIMIT) matches.push(user);
        }

        return { matches, total };
    }, [page, targetIds, targetPanelCollapsed, userSearch]);

    const serverSearchResults = useMemo(() => {
        const search = serverSearch.trim().toLowerCase();
        if (page !== "server" || targetPanelCollapsed) return { matches: [], total: 0 };

        const matches: string[] = [];
        let total = 0;

        for (const guildId of guildIds) {
            if (serverTargetIds.has(guildId)) continue;

            const guild = GuildStore.getGuild(guildId);
            const guildName = guild?.name ?? guildId;
            if (search && !guildId.includes(search) && !guildName.toLowerCase().includes(search)) continue;

            total++;
            if (matches.length < SEARCH_RESULT_LIMIT) matches.push(guildId);
        }

        return { matches, total };
    }, [guildIds, page, serverSearch, serverTargetIds, targetPanelCollapsed]);

    const userMatches = userSearchResults.matches;
    const serverMatches = serverSearchResults.matches;

    const selectedPageLabel = page === "server" ? "server" : "user";

    const addUserTarget = (userId: string) => {
        setTargets([...targets, userId]);
        toast(t("User target added."));
    };

    const addVisibleUsers = () => {
        if (!userMatches.length) {
            toast(t("No users to add."), Toasts.Type.FAILURE);
            return;
        }

        setTargets([...targets, ...userMatches.map(user => user.id)]);
        toast(t("Visible users added."));
    };

    const addVisibleServers = () => {
        if (!serverMatches.length) {
            toast(t("No servers to add."), Toasts.Type.FAILURE);
            return;
        }

        setServerTargets([...serverTargets, ...serverMatches]);
        toast(t("Visible servers added."));
    };

    const addServer = (guildId: string) => {
        addServerTarget(guildId);
        toast(t("Server target added."));
    };

    const clearPageTargets = () => {
        if (page === "server") {
            setServerTargets([]);
            toast(t("Server targets cleared."));
            return;
        }

        setTargets([]);
        toast(t("User targets cleared."));
    };

    const pageTargetCount = page === "server" ? serverTargets.length : targets.length;

    const pageHeading = page === "server" ? t("Server Surveillance") : t("User Surveillance");

    const pageEmpty = page === "server" ? t("No server events.") : t("No user events.");

    const targetEmpty = page === "server" ? t("No server targets.") : t("No user targets.");

    const targetLabel = page === "server" ? t("Servers") : t("Users");

    const targetCount = page === "server" ? serverTargets.length : targets.length;

    const resultCount = page === "server" ? serverMatches.length : userMatches.length;

    const totalAvailable = page === "server" ? serverSearchResults.total : userSearchResults.total;

    const searchPlaceholder = page === "server" ? t("Search servers by name or ID...") : t("Search cached users by name or ID...");


    const shownTargets = targets.slice(0, TARGET_LIST_LIMIT);

    const shownServerTargets = serverTargets.slice(0, TARGET_LIST_LIMIT);

    const hiddenTargetCount = targetCount - (page === "server" ? shownServerTargets.length : shownTargets.length);

    const toggleTargetPanel = () => {
        setCollapsedPages(current => ({ ...current, [page]: !current[page] }));
    };

    const showSearchHint = page === "user" && !userSearch.trim();

    const searchMeta = `${resultCount} ${t("shown")}${totalAvailable > SEARCH_RESULT_LIMIT ? ` ${t("of")} ${totalAvailable}` : ""}`;

    const addInputTargets = () => {
        const ids = targetInput.match(/\d+/g) ?? [];
        if (!ids.length) {
            toast(t("Enter a valid Discord user ID."), Toasts.Type.FAILURE);
            return;
        }

        setTargets([...targets, ...ids]);
        setTargetInput("");
        toast(t("Target list updated."));
    };

    const copyEvents = () => {
        try {
            void Promise.resolve(copyToClipboard(JSON.stringify(filteredEvents, null, 2))).then(
                () => toast(t("Surveillance events copied.")),
                () => toast(t("Failed to copy surveillance events."), Toasts.Type.FAILURE)
            );
        } catch {
            toast(t("Failed to copy surveillance events."), Toasts.Type.FAILURE);
        }
    };

    const resetEvents = () => {
        void clearEvents(page === "server" ? "server" : "person").then(() => toast(t("Surveillance events cleared.")));
    };

    const exportLabel = page === "server" ? t("Export Server JSON") : t("Export User JSON");
    const clearEventsLabel = page === "server" ? t("Clear Server Events") : t("Clear User Events");

    return (
        <SettingsTab>
            <div className={cl("root")}>
                <div className={cl("header")}>
                    <HeadingPrimary>{t("Surveillance")}</HeadingPrimary>
                    <div className={cl("actions")}>
                        <button className={cl("action")} onClick={copyEvents}>{exportLabel}</button>
                        <button className={classes(cl("action"), cl("danger"))} onClick={resetEvents}>{clearEventsLabel}</button>
                    </div>
                </div>

                <div className={cl("page-tabs")}>
                    {pageOptions.map(option => {
                        const count = option.value === "server" ? serverTargets.length : targets.length;

                        return (
                            <button
                                key={option.value}
                                className={classes(cl("page-tab"), page === option.value && cl("page-tab-active"))}
                                onClick={() => setPage(option.value)}
                                type="button"
                            >
                                <span>{t(option.label)}</span>
                                <small>{count} {t("targets")}</small>
                            </button>
                        );
                    })}
                </div>

                <div className={cl("stats")}>
                    <Stat label={t("Events")} value={stats.events} />
                    <Stat label={t("Users")} value={stats.users} />
                    <Stat label={t("Servers")} value={stats.guilds} />
                    <Stat label={t("Channels")} value={stats.channels} />
                </div>

                <section className={cl("panel")}>
                    <div className={cl("section-head")}>
                        <HeadingTertiary>{pageHeading}</HeadingTertiary>
                        <div className={cl("actions")}>
                            <button className={cl("action")} onClick={toggleTargetPanel}>
                                {targetPanelCollapsed ? t("Open") : t("Close")}
                            </button>
                            {targetPanelCollapsed ? null : (
                                <button className={cl("action")} disabled={!resultCount} onClick={page === "server" ? addVisibleServers : addVisibleUsers}>
                                    {t("Add visible")}
                                </button>
                            )}
                            <button className={classes(cl("action"), cl("danger"))} disabled={!pageTargetCount} onClick={clearPageTargets}>
                                {t("Clear")} {targetLabel}
                            </button>
                        </div>
                    </div>


                    {targetPanelCollapsed ? (
                        <div className={cl("collapsed-summary")}>
                            {targetCount} {t("targets selected")}
                        </div>
                    ) : (
                        <>
                            {page === "user" ? (
                                <>
                                    <div className={cl("target-input")}>
                                        <TextInput value={targetInput} placeholder={t("Discord user IDs...")} onChange={setTargetInput} />
                                        <button className={cl("action")} onClick={addInputTargets}>{t("Add IDs")}</button>
                                    </div>
                                    <div className={cl("target-input")}>
                                        <TextInput value={userSearch} placeholder={searchPlaceholder} onChange={setUserSearch} />
                                    </div>
                                    <div className={cl("search-meta")}>{showSearchHint ? t("Type a username or user ID to search cached users.") : searchMeta}</div>
                                    {showSearchHint ? null : (
                                        <ScrollerThin className={cl("search-results")} fade>
                                            {userMatches.length ? userMatches.map(user => (
                                                <UserSearchResult key={user.id} user={user} onAdd={addUserTarget} />
                                            )) : <span className={cl("empty")}>{t("No users found.")}</span>}
                                        </ScrollerThin>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className={cl("target-input")}>
                                        <TextInput value={serverSearch} placeholder={searchPlaceholder} onChange={setServerSearch} />
                                    </div>
                                    <div className={cl("search-meta")}>{searchMeta}</div>
                                    <ScrollerThin className={cl("search-results")} fade>
                                        {serverMatches.length ? serverMatches.map(guildId => (
                                            <ServerSearchResult key={guildId} guildId={guildId} onAdd={addServer} />
                                        )) : <span className={cl("empty")}>{t("No servers found.")}</span>}
                                    </ScrollerThin>
                                </>
                            )}

                            <div className={cl("target-summary")}>
                                <strong>{targetCount} {t("targets selected")}</strong>
                                <div className={cl("target-list")}>
                                    {page === "server"
                                        ? serverTargets.length ? shownServerTargets.map(guildId => (
                                            <ServerPill key={guildId} guildId={guildId} />
                                        )) : <span className={cl("empty")}>{targetEmpty}</span>
                                        : targets.length ? shownTargets.map(userId => (
                                            <TargetPill key={userId} userId={userId} />
                                        )) : <span className={cl("empty")}>{targetEmpty}</span>}
                                    {hiddenTargetCount > 0 ? <span className={cl("empty")}>{hiddenTargetCount} {t("more hidden.")}</span> : null}
                                </div>
                            </div>
                        </>
                    )}
                </section>

                <section className={cl("panel")}>
                    <div className={cl("timeline-head")}>
                        <HeadingTertiary>{pageHeading} {t("Timeline")}</HeadingTertiary>
                        <TextInput value={query} placeholder={page === "server" ? t("Search server events...") : t("Search user events...")} onChange={setQuery} />
                    </div>
                    <div className={cl("filters")}>
                        {filterOptions.map(option => (
                            <button
                                key={option.value}
                                className={classes(cl("filter"), filter === option.value && cl("filter-active"))}
                                onClick={() => setFilter(option.value)}
                            >
                                {t(option.label)}
                            </button>
                        ))}
                    </div>
                    <div className={cl("timeline")}>
                        {visibleEvents.length ? visibleEvents.map(event => (
                            <EventRow key={event.id} event={event} />
                        )) : <div className={cl("empty")}>{pageEmpty}</div>}
                    </div>
                    {filteredEvents.length > visibleEvents.length ? (
                        <div className={cl("timeline-footer")}>
                            <span>{t("Showing {visible} of {total}").replace("{visible}", String(visibleEvents.length)).replace("{total}", String(filteredEvents.length))}</span>
                            <button
                                className={cl("action")}
                                onClick={() => setVisibleEventCount(count => count + EVENT_PAGE_SIZE)}
                            >
                                {t("Show more")}
                            </button>
                        </div>
                    ) : null}
                </section>
            </div>
        </SettingsTab>
    );
}


export default wrapTab(SurveillanceTab, "Surveillance");
