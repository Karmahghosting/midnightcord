/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { ComponentType, HTMLProps } from "react";

import { getHiddenBadgeSources } from "./BadgeVisibility";

export const enum BadgePosition {
    START,
    END
}

export interface ProfileBadge {
    /** The tooltip to show on hover. Required for image badges */
    description?: string;
    /** Custom component for the badge (tooltip not included) */
    component?: ComponentType<ProfileBadge & BadgeUserArgs>;
    /** The custom image to use */
    iconSrc?: string;
    link?: string;
    /** Action to perform when you click the badge */
    onClick?(event: React.MouseEvent, props: ProfileBadge & BadgeUserArgs): void;
    /** Action to perform when you right click the badge */
    onContextMenu?(event: React.MouseEvent, props: BadgeUserArgs & BadgeUserArgs): void;
    /** Should the user display this badge? */
    shouldShow?(userInfo: BadgeUserArgs): boolean;
    /** Optional props (e.g. style) for the badge, ignored for component badges */
    props?: HTMLProps<HTMLImageElement>;
    /** Insert at start or end? */
    position?: BadgePosition;
    /** The badge name to display, Discord uses this. Required for component badges */
    key?: string;

    /**
     * Allows dynamically returning multiple badges.
     * Must not call hooks
     */
    getBadges?(userInfo: BadgeUserArgs): ProfileBadge[];
}

const Badges = new Set<ProfileBadge>();

/**
 * Register a new badge with the Badges API
 * @param badge The badge to register
 */
export function addProfileBadge(badge: ProfileBadge) {
    badge.component &&= ErrorBoundary.wrap(badge.component, { noop: true });
    Badges.add(badge);
}

/**
 * Unregister a badge from the Badges API
 * @param badge The badge to remove
 */
export function removeProfileBadge(badge: ProfileBadge) {
    return Badges.delete(badge);
}

/**
 * Inject badges into the profile badges array.
 * You probably don't need to use this.
 */
export function _getBadges(args: BadgeUserArgs) {
    // ── Stealth Mode Bypass ──
    try {
        const { isStealthModeEnabled } = require("./HeaderBar");
        if (isStealthModeEnabled()) return [];
    } catch { }

    // ── Hidden badge sources (per-profile, synced via cloud) ──
    const hiddenSources = getHiddenBadgeSources(args.userId);
    const isHidden = (source: string) => hiddenSources.includes(source as any);

    const badges = [] as ProfileBadge[];

    const shieldBadge = (b: any) => ({
        ...args,
        ...b,
        iconSrc: typeof b.iconSrc === "string" ? b.iconSrc : "",
        link: typeof b.link === "string" ? b.link : "",
        id: b.id || b.key || b.description || "nc-badge",
        key: b.key || b.id || b.description || "nc-badge",
        description: b.description || "",
    });

    for (const badge of Badges) {
        if (badge.shouldShow && !badge.shouldShow(args)) {
            continue;
        }

        const b = badge.getBadges
            ? badge.getBadges(args).map(badge => shieldBadge({
                ...badge,
                component: badge.component && ErrorBoundary.wrap(badge.component, { noop: true })
            }))
            : [shieldBadge(badge)];

        if (badge.position === BadgePosition.START) {
            badges.unshift(...b);
        } else {
            badges.push(...b);
        }
    }

    const donorBadges = BadgeAPIPlugin.getDonorBadges(args.userId);
    const equicordDonorBadges = BadgeAPIPlugin.getEquicordDonorBadges(args.userId);
    const midnightcordBadges = (BadgeAPIPlugin as any).getMidnightcordBadges?.(args.userId);
    const illegalcordBadges = (BadgeAPIPlugin as any).getIllegalcordBadges?.(args.userId);

    if (donorBadges && !isHidden("vencord")) {
        badges.unshift(...donorBadges.map(shieldBadge));
    }

    if (equicordDonorBadges && !isHidden("equicord")) {
        badges.unshift(...equicordDonorBadges.map(shieldBadge));
    }

    if (midnightcordBadges && !isHidden("midnightcord")) {
        badges.unshift(...midnightcordBadges.map(shieldBadge));
    }

    const seen = new Set<string>();
    return badges.filter(b => {
        if (!b) return false;
        const key = (b.id || b.key || b.iconSrc || b.description || "").toString();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export interface BadgeUserArgs {
    userId: string;
    guildId: string;
}
