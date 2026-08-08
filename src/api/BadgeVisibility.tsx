/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type BadgeSource = "vencord" | "equicord" | "midnightcord" | "globalbadges" | "illegalcord";

const STORAGE_KEY = "midnightcord_hidden_badges";
let myHiddenSources: BadgeSource[] = [];
let myUserId: string | null = null;
let loaded = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function emitBadgeVisibilityChange() {
    for (const listener of listeners) {
        try {
            listener();
        } catch { }
    }
}

export function getHiddenBadgeSources(userId: string): BadgeSource[] {
    return myUserId === userId ? myHiddenSources : [];
}

export async function loadOwnHiddenBadgeSources(userId: string) {
    myUserId = userId;

    try {
        const localData = localStorage.getItem(STORAGE_KEY);
        const parsed = localData ? JSON.parse(localData) : [];
        myHiddenSources = Array.isArray(parsed) ? parsed : [];
    } catch {
        myHiddenSources = [];
    }

    loaded = true;
    emitBadgeVisibilityChange();
}

export async function setOwnHiddenBadgeSources(hidden: BadgeSource[]) {
    myHiddenSources = [...hidden];

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(myHiddenSources));
    } catch { }

    emitBadgeVisibilityChange();
}

export function isOwnDataLoaded() {
    return loaded;
}

export function getOwnHiddenBadgeSources(): BadgeSource[] {
    return myHiddenSources;
}

export function addBadgeVisibilityListener(listener: Listener) {
    listeners.add(listener);
}

export function removeBadgeVisibilityListener(listener: Listener) {
    listeners.delete(listener);
}
