/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, GuildMemberStore, GuildRoleStore, PermissionsBits, RestAPI, UserStore, VoiceStateStore } from "@webpack/common";
import { findByPropsLazy, findStoreLazy } from "@webpack";

const PermissionStore = findStoreLazy("PermissionStore") as any;
const ChannelMemberStore = findStoreLazy("ChannelMemberStore") as any;
const RolePermissionUtils1 = findByPropsLazy("isRoleHigher", "canManageRole") as any;
const RolePermissionUtils2 = findByPropsLazy("canManageUserRole") as any;
const RolePermissionUtils3 = findByPropsLazy("isRoleHigherThan") as any;
const RolePermissionUtils4 = findByPropsLazy("getHighestRolePosition") as any;

let cachedAllPermissions: bigint | null = null;
function getAllPermissions() {
    if (cachedAllPermissions !== null) return cachedAllPermissions;
    cachedAllPermissions = Object.values(PermissionsBits ?? {}).reduce((acc: bigint, v) => {
        try { return acc | BigInt(v as any); } catch { return acc; }
    }, 0n);
    return cachedAllPermissions;
}

let isEnabled = false;

// Local maps for fake simulations
const fakeMutes = new Map<string, boolean>();
const fakeDeafs = new Map<string, boolean>();
// channelId: string = moved to channel, null = disconnected from voice
const fakeChannelIds = new Map<string, string | null>();
// guildId:userId -> nickname ("" means reset to base display name)
const fakeNicks = new Map<string, string>();
// guildId:userId -> Set<roleId>
const fakeRoles = new Map<string, Set<string>>();

let styleElement: HTMLStyleElement | null = null;
function injectFakePermStyle(enable: boolean) {
    if (enable) {
        if (!styleElement) {
            styleElement = document.createElement("style");
            styleElement.id = "fake-perm-placeholder-fix";
            styleElement.textContent = `
                .placeholder__27cc6.member__5d473,
                div[class*="placeholder__"][class*="member__"] {
                    display: none !important;
                }
            `;
            document.head.appendChild(styleElement);
        }
    } else {
        if (styleElement) {
            styleElement.remove();
            styleElement = null;
        }
    }
}

function computeMemberRoleProperties(guildId: string, roleIds: string[]) {
    try {
        const guildRolesMap = GuildRoleStore?.getGuildRoles?.(guildId) ?? GuildRoleStore?.getRoles?.(guildId) ?? {};
        const rolesList: any[] = Array.isArray(guildRolesMap) ? guildRolesMap : Object.values(guildRolesMap);

        if (!rolesList || rolesList.length === 0) {
            return {};
        }

        const roleSet = new Set(roleIds.map(String));
        const memberRoles = rolesList.filter((r: any) => r && roleSet.has(String(r.id)));

        // Sort descending by position (higher position = higher role hierarchy)
        memberRoles.sort((a: any, b: any) => (Number(b.position) || 0) - (Number(a.position) || 0));

        const highestRoleId = memberRoles[0]?.id ? String(memberRoles[0].id) : null;
        const hoistRole = memberRoles.find((r: any) => Boolean(r.hoist));
        const hoistRoleId = hoistRole?.id ? String(hoistRole.id) : null;

        const colorRole = memberRoles.find((r: any) => (r.color && r.color !== 0) || Boolean(r.colorString));
        const colorRoleId = colorRole?.id ? String(colorRole.id) : null;
        const colorString = colorRole?.colorString ?? null;

        return {
            hoistRoleId,
            colorRoleId,
            highestRoleId,
            colorString
        };
    } catch {
        return {};
    }
}

function patchMemberListProps(guildId: string, props: any) {
    if (!props) return props;

    try {
        const fakeUserIds = new Set<string>();
        for (const key of fakeRoles.keys()) {
            if (key.startsWith(`${guildId}:`)) {
                fakeUserIds.add(key.split(":")[1]);
            }
        }

        if (fakeUserIds.size === 0) return props;

        const groups = Array.isArray(props.groups) ? props.groups.map((g: any) => ({ ...g })) : props.groups;
        let rows = Array.isArray(props.rows) ? [...props.rows] : (Array.isArray(props.list) ? [...props.list] : null);

        for (const userId of fakeUserIds) {
            const member = GuildMemberStore.getMember(guildId, userId);
            if (!member) continue;

            const targetHoistId = member.hoistRoleId;

            if (rows && rows.length > 0) {
                let oldHoistId: string | null = null;
                const existingIdx = rows.findIndex((r: any) => r && (r.id === userId || r.userId === userId || r.record?.user?.id === userId));

                if (existingIdx !== -1) {
                    for (let i = existingIdx - 1; i >= 0; i--) {
                        const r = rows[i];
                        if (r && (r.type === "GROUP" || r.rowType === "GROUP")) {
                            oldHoistId = String(r.id || r.groupId || r.key || "");
                            break;
                        }
                    }
                }

                if (oldHoistId && targetHoistId && String(oldHoistId) === String(targetHoistId)) {
                    continue;
                }

                let userRecord: any = null;
                if (existingIdx !== -1) {
                    [userRecord] = rows.splice(existingIdx, 1);
                } else {
                    const user = UserStore?.getUser?.(userId);
                    userRecord = {
                        type: "MEMBER",
                        id: userId,
                        userId,
                        key: userId,
                        record: { user, member }
                    };
                }

                if (userRecord) {
                    userRecord.group = targetHoistId || "online";
                    userRecord.groupId = targetHoistId || "online";
                    if (userRecord.record) {
                        userRecord.record = {
                            ...userRecord.record,
                            member
                        };
                    }
                }

                let insertIdx = -1;
                if (targetHoistId) {
                    insertIdx = rows.findIndex((r: any) => r && (r.type === "GROUP" || r.rowType === "GROUP") && String(r.id || r.groupId || r.key) === String(targetHoistId));
                }

                if (insertIdx === -1) {
                    insertIdx = rows.findIndex((r: any) => r && (r.type === "GROUP" || r.rowType === "GROUP") && (r.id === "online" || r.id === "@everyone" || r.id === "offline"));
                }

                if (insertIdx !== -1) {
                    rows.splice(insertIdx + 1, 0, userRecord);
                } else {
                    rows.push(userRecord);
                }

                if (targetHoistId && Array.isArray(groups)) {
                    let targetGrp = groups.find((g: any) => String(g.id || g.groupId || g.key) === String(targetHoistId));
                    if (!targetGrp) {
                        const role = GuildRoleStore?.getRole?.(guildId, targetHoistId);
                        if (role) {
                            targetGrp = {
                                id: targetHoistId,
                                key: targetHoistId,
                                count: 1,
                                title: role.name
                            };
                            groups.unshift(targetGrp);
                            if (rows) {
                                rows.unshift({
                                    type: "GROUP",
                                    id: targetHoistId,
                                    key: targetHoistId,
                                    group: targetGrp
                                });
                            }
                        }
                    }
                }
            }
        }

        // Recalculate group counts based on actual MEMBER rows in each section
        if (rows && Array.isArray(groups)) {
            let currentGrpId: string | null = null;
            const actualCounts = new Map<string, number>();

            for (const r of rows) {
                if (!r) continue;
                if (r.type === "GROUP" || r.rowType === "GROUP") {
                    currentGrpId = String(r.id || r.groupId || r.key || "");
                    if (!actualCounts.has(currentGrpId)) {
                        actualCounts.set(currentGrpId, 0);
                    }
                } else if (currentGrpId) {
                    actualCounts.set(currentGrpId, (actualCounts.get(currentGrpId) || 0) + 1);
                }
            }

            for (const g of groups) {
                const gId = String(g.id || g.groupId || g.key || "");
                if (actualCounts.has(gId)) {
                    g.count = actualCounts.get(gId)!;
                }
            }
        }

        return {
            ...props,
            ...(Array.isArray(groups) ? { groups } : {}),
            ...(rows ? (Array.isArray(props.rows) ? { rows } : { list: rows }) : {})
        };
    } catch {
        return props;
    }
}

export default definePlugin({
    name: "FakePerm",
    description: "Unlocks native Discord administration and moderation UI locally with real-time visual voice, nickname & role management simulations (Mute, Deafen, Stream, Disconnect, Move, Nickname, Add/Remove Roles, Member List Hoist).",
    authors: [{ name: "Midnightcord", id: 0n }],
    requiresRestart: false,

    enableRolePillRemove(props: any) {
        if (!isEnabled || !props) return;
        try {
            props.canRemove = true;
            props.readOnly = false;
            if (!props.onRemove) {
                const guildId = props.guildId ?? props.guild?.id;
                const userId = props.user?.id ?? props.member?.userId ?? props.userId;
                const roleId = props.role?.id;
                if (guildId && userId && roleId) {
                    props.onRemove = () => {
                        RestAPI.del({
                            url: `/guilds/${guildId}/members/${userId}/roles/${roleId}`
                        });
                    };
                }
            }
        } catch { }
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[]; }) {
            if (!isEnabled || !Array.isArray(voiceStates)) return;

            let cleared = false;
            for (const state of voiceStates) {
                // If it's our own fake dispatch, do not clear
                if (state?._isFakeDispatch) continue;

                const userId = state?.userId;
                if (userId) {
                    if (fakeMutes.has(userId)) { fakeMutes.delete(userId); cleared = true; }
                    if (fakeDeafs.has(userId)) { fakeDeafs.delete(userId); cleared = true; }
                    if (fakeChannelIds.has(userId)) { fakeChannelIds.delete(userId); cleared = true; }
                }
            }

            if (cleared) {
                try { VoiceStateStore?.emitChange?.(); } catch { }
            }
        }
    },

    patches: [
        {
            find: "showCommunicationDisabledStyles",
            predicate: () => isEnabled,
            replacement: {
                match: /&&\i\.\i\.canManageUser\(\i\.\i\.MODERATE_MEMBERS,\i\.author,\i\)/,
                replace: "",
            },
        },
        {
            find: "INVITES_DISABLED)||",
            predicate: () => isEnabled,
            replacement: {
                match: /\i\.\i\.can\(\i\.\i.MANAGE_GUILD,\i\)/,
                replace: "true",
            },
        },
        {
            find: /,checkElevated:!1}\),\i\.\i\)}(?<=getCurrentUser\(\);return.+?)/,
            predicate: () => isEnabled,
            replacement: {
                match: /return \i\.\i\(\i\.\i\(\{user:\i,context:\i,checkElevated:!1\}\),\i\.\i\)/,
                replace: "return true",
            }
        },
        // fixes a bug where Members page must be loaded to see highest role
        {
            find: "#{intl::GUILD_MEMBER_MOD_VIEW_HIGHEST_ROLE}),children:",
            predicate: () => isEnabled,
            replacement: {
                match: /(#{intl::GUILD_MEMBER_MOD_VIEW_HIGHEST_ROLE}.{0,80})role:\i(?<=\[\i\.roles,\i\.highestRoleId,(\i)\].+?)/,
                replace: (_, rest, roles) => `${rest}role:$self.getHighestRole(arguments[0],${roles})`,
            }
        },
        // allows you to open mod view on yourself
        {
            find: 'action:"PRESS_MOD_VIEW",icon:',
            predicate: () => isEnabled,
            replacement: {
                match: /\i(?=\?null)/,
                replace: "false"
            }
        },
        // Force canRemove and onRemove handler on all role pills in profile popouts & modals
        {
            find: "#{intl::zr0Y5R::raw}",
            predicate: () => isEnabled,
            replacement: [
                {
                    match: /(\.colorString\?\?\i;)/,
                    replace: "$1$self.enableRolePillRemove(arguments[0]);"
                }
            ]
        }
    ],

    // ─── Runtime PermissionStore & GuildMemberStore overrides ────────────────
    _origCan: null as ((...a: any[]) => any) | null,
    _origGetChannelPerms: null as ((...a: any[]) => any) | null,
    _origGetGuildPerms: null as ((...a: any[]) => any) | null,
    _origGetGuildPermProps: null as ((...a: any[]) => any) | null,
    _origCanManageUser: null as ((...a: any[]) => any) | null,
    _origGetVoiceState: null as ((...a: any[]) => any) | null,
    _origGetVoiceStatesForChannel: null as ((...a: any[]) => any) | null,
    _origGetMember: null as ((...a: any[]) => any) | null,
    _origGetNick: null as ((...a: any[]) => any) | null,
    _origGetChannelMemberProps: null as ((...a: any[]) => any) | null,
    _origGetChannelMemberRows: null as ((...a: any[]) => any) | null,
    _origPatch: null as ((...a: any[]) => any) | null,
    _origPut: null as ((...a: any[]) => any) | null,
    _origDel: null as ((...a: any[]) => any) | null,
    _origMethodsMap: new Map<string, Function>(),

    _patchPermissionStore() {
        const methodNames = [
            "can",
            "canManageUser",
            "canManageRole",
            "canManageUserRole",
            "canManageRoleInGuild",
            "canRemoveRole",
            "isRoleHigher",
            "isRoleHigherThan",
            "getHighestRolePosition"
        ];

        const targets = [
            PermissionStore,
            RolePermissionUtils1,
            RolePermissionUtils2,
            RolePermissionUtils3,
            RolePermissionUtils4
        ].filter(Boolean);

        for (let idx = 0; idx < targets.length; idx++) {
            const target = targets[idx];
            for (const name of methodNames) {
                if (typeof target[name] === "function") {
                    const key = `T${idx}_${name}`;
                    if (!this._origMethodsMap.has(key)) {
                        const orig = target[name].bind(target);
                        this._origMethodsMap.set(key, orig);
                        target[name] = (...args: any[]) => isEnabled ? true : orig(...args);
                    }
                }
            }
        }

        if (PermissionStore) {
            if (!this._origGetChannelPerms && typeof PermissionStore.getChannelPermissions === "function") {
                this._origGetChannelPerms = PermissionStore.getChannelPermissions.bind(PermissionStore);
                PermissionStore.getChannelPermissions = (...args: any[]) =>
                    isEnabled ? getAllPermissions() : this._origGetChannelPerms!(...args);
            }
            if (!this._origGetGuildPerms && typeof PermissionStore.getGuildPermissions === "function") {
                this._origGetGuildPerms = PermissionStore.getGuildPermissions.bind(PermissionStore);
                PermissionStore.getGuildPermissions = (...args: any[]) =>
                    isEnabled ? getAllPermissions() : this._origGetGuildPerms!(...args);
            }
            if (!this._origGetGuildPermProps && typeof PermissionStore.getGuildPermissionProps === "function") {
                this._origGetGuildPermProps = PermissionStore.getGuildPermissionProps.bind(PermissionStore);
                PermissionStore.getGuildPermissionProps = (guild: any) => {
                    const real = this._origGetGuildPermProps!(guild);
                    if (!isEnabled) return real;

                    const allTrueProps: Record<string, boolean> = {};
                    if (real && typeof real === "object") {
                        for (const k of Object.keys(real)) {
                            allTrueProps[k] = true;
                        }
                    }
                    allTrueProps.canManageRoles = true;
                    allTrueProps.canManageGuild = true;
                    allTrueProps.canAdministrator = true;
                    return allTrueProps;
                };
            }
        }
    },

    _unpatchPermissionStore() {
        const methodNames = [
            "can",
            "canManageUser",
            "canManageRole",
            "canManageUserRole",
            "canManageRoleInGuild",
            "canRemoveRole",
            "isRoleHigher",
            "isRoleHigherThan",
            "getHighestRolePosition"
        ];

        const targets = [
            PermissionStore,
            RolePermissionUtils1,
            RolePermissionUtils2,
            RolePermissionUtils3,
            RolePermissionUtils4
        ].filter(Boolean);

        for (let idx = 0; idx < targets.length; idx++) {
            const target = targets[idx];
            for (const name of methodNames) {
                const key = `T${idx}_${name}`;
                const orig = this._origMethodsMap.get(key);
                if (orig) {
                    target[name] = orig;
                }
            }
        }
        this._origMethodsMap.clear();

        if (this._origGetChannelPerms && PermissionStore) {
            PermissionStore.getChannelPermissions = this._origGetChannelPerms;
            this._origGetChannelPerms = null;
        }
        if (this._origGetGuildPerms && PermissionStore) {
            PermissionStore.getGuildPermissions = this._origGetGuildPerms;
            this._origGetGuildPerms = null;
        }
        if (this._origGetGuildPermProps && PermissionStore) {
            PermissionStore.getGuildPermissionProps = this._origGetGuildPermProps;
            this._origGetGuildPermProps = null;
        }
    },

    // ─── GuildMemberStore Interception for Fake Nicknames & Roles ────────────
    _patchMemberStore() {
        if (GuildMemberStore) {
            if (!this._origGetMember && typeof GuildMemberStore.getMember === "function") {
                this._origGetMember = GuildMemberStore.getMember.bind(GuildMemberStore);
                GuildMemberStore.getMember = (guildId: string, userId: string) => {
                    const real = this._origGetMember!(guildId, userId);
                    if (!isEnabled || !guildId || !userId || !real) return real;

                    const key = `${guildId}:${userId}`;
                    const fkNick = fakeNicks.get(key);
                    const fkRoles = fakeRoles.get(key);

                    if (fkNick === undefined && fkRoles === undefined) return real;

                    // If fkNick === "", resetting nickname means restoring base display name (nick: null)
                    const effectiveNick = fkNick === "" ? null : (fkNick ?? real.nick);
                    const effectiveRoles = fkRoles !== undefined ? Array.from(fkRoles) : real.roles;
                    const roleProps = fkRoles !== undefined ? computeMemberRoleProperties(guildId, effectiveRoles) : {};

                    return {
                        ...real,
                        nick: effectiveNick,
                        roles: effectiveRoles,
                        ...roleProps
                    };
                };
            }

            if (!this._origGetNick && typeof GuildMemberStore.getNick === "function") {
                this._origGetNick = GuildMemberStore.getNick.bind(GuildMemberStore);
                GuildMemberStore.getNick = (guildId: string, userId: string) => {
                    if (isEnabled && guildId && userId) {
                        const fkNick = fakeNicks.get(`${guildId}:${userId}`);
                        if (fkNick !== undefined) {
                            return fkNick === "" ? null : fkNick;
                        }
                    }
                    return this._origGetNick!(guildId, userId);
                };
            }
        }

        // Intercept ChannelMemberStore for live sidebar group placement
        if (ChannelMemberStore) {
            if (!this._origGetChannelMemberProps && typeof ChannelMemberStore.getProps === "function") {
                this._origGetChannelMemberProps = ChannelMemberStore.getProps.bind(ChannelMemberStore);
                ChannelMemberStore.getProps = (guildId: string, channelId: string) => {
                    const props = this._origGetChannelMemberProps!(guildId, channelId);
                    if (!isEnabled || !guildId || !props) return props;
                    return patchMemberListProps(guildId, props);
                };
            }
            if (!this._origGetChannelMemberRows && typeof ChannelMemberStore.getRows === "function") {
                this._origGetChannelMemberRows = ChannelMemberStore.getRows.bind(ChannelMemberStore);
                ChannelMemberStore.getRows = (guildId: string, channelId: string) => {
                    if (isEnabled && guildId && typeof ChannelMemberStore.getProps === "function") {
                        const props = ChannelMemberStore.getProps(guildId, channelId);
                        if (props?.rows) return props.rows;
                    }
                    return this._origGetChannelMemberRows!(guildId, channelId);
                };
            }
        }
    },

    _unpatchMemberStore() {
        if (this._origGetMember && GuildMemberStore) {
            GuildMemberStore.getMember = this._origGetMember;
            this._origGetMember = null;
        }
        if (this._origGetNick && GuildMemberStore) {
            GuildMemberStore.getNick = this._origGetNick;
            this._origGetNick = null;
        }
        if (this._origGetChannelMemberProps && ChannelMemberStore) {
            ChannelMemberStore.getProps = this._origGetChannelMemberProps;
            this._origGetChannelMemberProps = null;
        }
        if (this._origGetChannelMemberRows && ChannelMemberStore) {
            ChannelMemberStore.getRows = this._origGetChannelMemberRows;
            this._origGetChannelMemberRows = null;
        }
    },

    // ─── VoiceState & RestAPI Interception for Mute/Deafen/Disconnect/Move/Nick/Roles ─
    _patchVoiceStore() {
        if (VoiceStateStore) {
            if (!this._origGetVoiceState && typeof VoiceStateStore.getVoiceStateForUser === "function") {
                this._origGetVoiceState = VoiceStateStore.getVoiceStateForUser.bind(VoiceStateStore);
                VoiceStateStore.getVoiceStateForUser = (userId: string) => {
                    const real = this._origGetVoiceState!(userId);
                    if (!isEnabled || !userId) return real;

                    const fakeChan = fakeChannelIds.get(userId);
                    if (fakeChan === null) return undefined; // Explicit Disconnect

                    if (!real) return real;

                    const isMuted = fakeMutes.get(userId);
                    const isDeaf = fakeDeafs.get(userId);
                    const targetChan = fakeChan !== undefined ? fakeChan : real.channelId;

                    if (isMuted === undefined && isDeaf === undefined && fakeChan === undefined) {
                        return real;
                    }

                    return {
                        ...real, // Preserves selfStream, selfVideo, etc.
                        channelId: targetChan,
                        ...(isMuted !== undefined ? { mute: isMuted, suppress: isMuted } : {}),
                        ...(isDeaf !== undefined ? { deaf: isDeaf } : {})
                    };
                };
            }

            if (!this._origGetVoiceStatesForChannel && typeof VoiceStateStore.getVoiceStatesForChannel === "function") {
                this._origGetVoiceStatesForChannel = VoiceStateStore.getVoiceStatesForChannel.bind(VoiceStateStore);
                VoiceStateStore.getVoiceStatesForChannel = (channelId: string) => {
                    const realMap = this._origGetVoiceStatesForChannel!(channelId) ?? {};
                    if (!isEnabled || !channelId) return realMap;

                    const newMap: Record<string, any> = { ...realMap };

                    // 1. Remove users disconnected or moved away from this channel
                    for (const [userId, targetChan] of fakeChannelIds.entries()) {
                        if (targetChan !== channelId && newMap[userId]) {
                            delete newMap[userId];
                        }
                    }

                    // 2. Add users moved TO this channel
                    for (const [userId, targetChan] of fakeChannelIds.entries()) {
                        if (targetChan === channelId && !newMap[userId]) {
                            const st = VoiceStateStore.getVoiceStateForUser(userId);
                            if (st) newMap[userId] = st;
                        }
                    }

                    // 3. Update properties of remaining users in this channel
                    for (const uId of Object.keys(newMap)) {
                        const st = VoiceStateStore.getVoiceStateForUser(uId);
                        if (st) newMap[uId] = st;
                    }

                    return newMap;
                };
            }
        }

        // Intercept RestAPI.patch for member moderation actions (Mute, Deafen, Disconnect, Move, Nickname, Full Roles List)
        if (RestAPI && !this._origPatch && typeof RestAPI.patch === "function") {
            this._origPatch = RestAPI.patch.bind(RestAPI);
            RestAPI.patch = (args: any) => {
                if (!isEnabled || !args?.url) return this._origPatch!(args);

                const match = args.url.match(/\/guilds\/(\d+)\/members\/(\d+)/);
                if (match) {
                    const guildId = match[1];
                    const userId = match[2];
                    const body = args.body || {};

                    let voiceChanged = false;
                    let memberChanged = false;

                    if (typeof body.mute === "boolean") {
                        if (body.mute === false) {
                            fakeMutes.delete(userId);
                            fakeDeafs.delete(userId);
                        } else {
                            fakeMutes.set(userId, true);
                        }
                        voiceChanged = true;
                    }
                    if (typeof body.deaf === "boolean") {
                        if (body.deaf === false) {
                            fakeDeafs.delete(userId);
                            fakeMutes.delete(userId);
                        } else {
                            fakeDeafs.set(userId, true);
                            fakeMutes.set(userId, true);
                        }
                        voiceChanged = true;
                    }

                    if ("nick" in body) {
                        fakeNicks.set(`${guildId}:${userId}`, body.nick ?? "");
                        memberChanged = true;
                    }
                    if (Array.isArray(body.roles)) {
                        fakeRoles.set(`${guildId}:${userId}`, new Set(body.roles.map(String)));
                        memberChanged = true;
                    }

                    // Only treat channel_id as a voice change if it's NOT part of a member profile change (like Change Nickname form submission)
                    if ("channel_id" in body && !("nick" in body) && !("roles" in body)) {
                        fakeChannelIds.set(userId, body.channel_id ?? null);
                        voiceChanged = true;
                    }

                    if (memberChanged) {
                        const realMember = this._origGetMember ? this._origGetMember(guildId, userId) : GuildMemberStore?.getMember?.(guildId, userId);
                        const fkNick = fakeNicks.get(`${guildId}:${userId}`);
                        const effectiveNick = fkNick === "" ? null : (fkNick ?? realMember?.nick ?? null);
                        const fkRoles = fakeRoles.get(`${guildId}:${userId}`);
                        const effectiveRoles = fkRoles ? Array.from(fkRoles) : (realMember?.roles ?? []);
                        const roleProps = computeMemberRoleProperties(guildId, effectiveRoles);

                        try { GuildMemberStore?.emitChange?.(); } catch { }
                        try { ChannelMemberStore?.emitChange?.(); } catch { }
                        try {
                            FluxDispatcher?.dispatch({
                                type: "GUILD_MEMBER_UPDATE",
                                ...realMember,
                                guildId,
                                user: realMember?.user ?? { id: userId },
                                nick: effectiveNick,
                                roles: effectiveRoles,
                                ...roleProps
                            });
                        } catch { }
                    }

                    if (voiceChanged) {
                        const rawState = this._origGetVoiceState ? this._origGetVoiceState(userId) : null;
                        const currentVoiceState = rawState ?? VoiceStateStore?.getVoiceStateForUser?.(userId);

                        let targetChanId: string | null | undefined;
                        if (fakeChannelIds.has(userId)) {
                            targetChanId = fakeChannelIds.get(userId);
                        } else {
                            targetChanId = currentVoiceState?.channelId;
                        }

                        if (targetChanId === null && fakeChannelIds.get(userId) !== null) {
                            targetChanId = currentVoiceState?.channelId;
                        }

                        const isMuted = fakeMutes.get(userId);
                        const isDeaf = fakeDeafs.get(userId);

                        try { VoiceStateStore?.emitChange?.(); } catch { }

                        if (targetChanId !== undefined) {
                            try {
                                FluxDispatcher?.dispatch({
                                    type: "VOICE_STATE_UPDATES",
                                    voiceStates: [
                                        {
                                            _isFakeDispatch: true,
                                            guildId,
                                            userId,
                                            channelId: targetChanId,
                                            mute: isMuted !== undefined ? isMuted : (currentVoiceState?.mute ?? false),
                                            deaf: isDeaf !== undefined ? isDeaf : (currentVoiceState?.deaf ?? false),
                                            suppress: isMuted !== undefined ? isMuted : (currentVoiceState?.suppress ?? false),
                                            selfStream: currentVoiceState?.selfStream,
                                            selfVideo: currentVoiceState?.selfVideo
                                        }
                                    ]
                                });
                            } catch { }
                        }
                    }

                    if (voiceChanged || memberChanged) {
                        return Promise.resolve({ ok: true, status: 200, body: {} });
                    }
                }

                return this._origPatch!(args);
            };
        }

        // Intercept RestAPI.put for adding a role: PUT /guilds/{guildId}/members/{userId}/roles/{roleId}
        if (RestAPI && !this._origPut && typeof RestAPI.put === "function") {
            this._origPut = RestAPI.put.bind(RestAPI);
            RestAPI.put = (args: any) => {
                if (!isEnabled || !args?.url) return this._origPut!(args);

                const match = args.url.match(/\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)/);
                if (match) {
                    const guildId = match[1];
                    const userId = match[2];
                    const roleId = String(match[3]);
                    const key = `${guildId}:${userId}`;

                    const existingSet = fakeRoles.get(key);
                    const realMember = this._origGetMember ? this._origGetMember(guildId, userId) : GuildMemberStore?.getMember?.(guildId, userId);
                    const initialRoles = existingSet
                        ? Array.from(existingSet)
                        : (realMember?.roles ?? []).map(String);

                    const currentRoles = new Set<string>(initialRoles);
                    currentRoles.add(roleId);
                    fakeRoles.set(key, currentRoles);

                    const rolesArray = Array.from(currentRoles);
                    const roleProps = computeMemberRoleProperties(guildId, rolesArray);

                    try { GuildMemberStore?.emitChange?.(); } catch { }
                    try { ChannelMemberStore?.emitChange?.(); } catch { }
                    try {
                        FluxDispatcher?.dispatch({
                            type: "GUILD_MEMBER_UPDATE",
                            ...realMember,
                            guildId,
                            user: realMember?.user ?? { id: userId },
                            roles: rolesArray,
                            ...roleProps
                        });
                    } catch { }

                    return Promise.resolve({ ok: true, status: 204, body: {} });
                }

                return this._origPut!(args);
            };
        }

        // Intercept RestAPI.del / delete for removing a role: DELETE /guilds/{guildId}/members/{userId}/roles/{roleId}
        const delFn = RestAPI?.del ?? RestAPI?.delete;
        if (RestAPI && !this._origDel && typeof delFn === "function") {
            this._origDel = delFn.bind(RestAPI);
            const patchedDel = (args: any) => {
                if (!isEnabled || !args?.url) return this._origDel!(args);

                const match = args.url.match(/\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)/);
                if (match) {
                    const guildId = match[1];
                    const userId = match[2];
                    const targetRoleId = String(match[3]);
                    const key = `${guildId}:${userId}`;

                    const existingSet = fakeRoles.get(key);
                    const realMember = this._origGetMember ? this._origGetMember(guildId, userId) : GuildMemberStore?.getMember?.(guildId, userId);
                    const initialRoles = existingSet
                        ? Array.from(existingSet)
                        : (realMember?.roles ?? []).map(String);

                    const currentRoles = new Set<string>();
                    for (const rId of initialRoles) {
                        if (String(rId) !== targetRoleId) {
                            currentRoles.add(String(rId));
                        }
                    }

                    fakeRoles.set(key, currentRoles);

                    const rolesArray = Array.from(currentRoles);
                    const roleProps = computeMemberRoleProperties(guildId, rolesArray);

                    try { GuildMemberStore?.emitChange?.(); } catch { }
                    try { ChannelMemberStore?.emitChange?.(); } catch { }
                    try {
                        FluxDispatcher?.dispatch({
                            type: "GUILD_MEMBER_UPDATE",
                            ...realMember,
                            guildId,
                            user: realMember?.user ?? { id: userId },
                            roles: rolesArray,
                            ...roleProps
                        });
                    } catch { }

                    return Promise.resolve({ ok: true, status: 204, body: {} });
                }

                return this._origDel!(args);
            };

            if (RestAPI.del) RestAPI.del = patchedDel;
            if (RestAPI.delete) RestAPI.delete = patchedDel;
        }
    },

    _unpatchVoiceStore() {
        if (this._origGetVoiceState && VoiceStateStore) {
            VoiceStateStore.getVoiceStateForUser = this._origGetVoiceState;
            this._origGetVoiceState = null;
        }
        if (this._origGetVoiceStatesForChannel && VoiceStateStore) {
            VoiceStateStore.getVoiceStatesForChannel = this._origGetVoiceStatesForChannel;
            this._origGetVoiceStatesForChannel = null;
        }
        if (this._origPatch && RestAPI) {
            RestAPI.patch = this._origPatch;
            this._origPatch = null;
        }
        if (this._origPut && RestAPI) {
            RestAPI.put = this._origPut;
            this._origPut = null;
        }
        if (this._origDel && RestAPI) {
            if (RestAPI.del) RestAPI.del = this._origDel;
            if (RestAPI.delete) RestAPI.delete = this._origDel;
            this._origDel = null;
        }
    },

    getHighestRole({ member }: { member: any; }, roles: any[]): any | undefined {
        try {
            return roles.find(role => role.id === member.highestRoleId);
        } catch {
            return undefined;
        }
    },

    options: {
        enabled: {
            type: OptionType.BOOLEAN,
            description: "Enable fake permissions (admin UI) — visual only, server still checks real perms",
            default: false,
            onChange(v: boolean) {
                isEnabled = Boolean(v);
                injectFakePermStyle(isEnabled);
                if (!isEnabled) {
                    fakeMutes.clear();
                    fakeDeafs.clear();
                    fakeChannelIds.clear();
                    fakeNicks.clear();
                    fakeRoles.clear();
                    try { VoiceStateStore?.emitChange?.(); } catch { }
                    try { GuildMemberStore?.emitChange?.(); } catch { }
                    try { ChannelMemberStore?.emitChange?.(); } catch { }
                }
            }
        }
    },

    start() {
        try {
            const S = (Vencord as any)?.Settings?.plugins?.FakePerm;
            isEnabled = S?.enabled === true;
        } catch {
            isEnabled = false;
        }

        injectFakePermStyle(isEnabled);
        this._patchPermissionStore();
        this._patchMemberStore();
        this._patchVoiceStore();
    },

    stop() {
        isEnabled = false;
        injectFakePermStyle(false);
        fakeMutes.clear();
        fakeDeafs.clear();
        fakeChannelIds.clear();
        fakeNicks.clear();
        fakeRoles.clear();
        this._unpatchPermissionStore();
        this._unpatchMemberStore();
        this._unpatchVoiceStore();
        try { VoiceStateStore?.emitChange?.(); } catch { }
        try { GuildMemberStore?.emitChange?.(); } catch { }
        try { ChannelMemberStore?.emitChange?.(); } catch { }
    },
});
