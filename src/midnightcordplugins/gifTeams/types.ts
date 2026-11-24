/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type SharingMode = "auto" | "manual" | "off";

export interface GifInput {
    url: string;
    src: string;
    width: number;
    height: number;
    format?: 1 | 2;
    title?: string;
}

export interface Gif extends GifInput {
    id: string;
}

export interface TeamSummary {
    id: string;
    name: string;
    role: "owner" | "member";
    memberCount: number;
    gifCount: number;
    updatedAt: string;
    mode: SharingMode;
    sharingRevision: number;
}

export interface TeamMember {
    id: string;
    displayName: string;
    role: "owner" | "member";
    mode: SharingMode;
    gifCount: number;
    updatedAt: string;
}

export interface TeamDetail extends TeamSummary {
    ownerId: string;
    members: TeamMember[];
}

export interface Sharing {
    mode: SharingMode;
    gifs: Gif[];
    revision: number;
}

export interface GifPage {
    items: (Gif & { memberId: string; displayName: string; })[];
    total: number;
    offset: number;
    nextOffset: number | null;
}

export interface Invite {
    code: string;
    expiresAt: string;
}

export interface TeamsResponse {
    viewerId: string;
    teams: TeamSummary[];
    limits: { maxTeams: number; maxMembers: number; maxGifs: number; };
}

export interface TeamsSnapshot {
    connected: boolean;
    loading: boolean;
    busy: boolean;
    error: string | null;
    teams: TeamSummary[];
    viewerId: string | null;
    team: TeamDetail | null;
    page: GifPage | null;
    sharing: Sharing | null;
    favorites: GifInput[];
    favoritesReady: boolean;
    filterMember: string | undefined;
    invite: Invite | null;
}
