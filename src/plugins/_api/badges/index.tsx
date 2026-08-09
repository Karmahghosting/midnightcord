/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./fixDiscordBadgePadding.css";

import { _getBadges, BadgePosition, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import { loadOwnHiddenBadgeSources } from "@api/BadgeVisibility";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { shouldShowContributorBadge, shouldShowEquicordContributorBadge } from "@utils/misc";
import definePlugin from "@utils/types";
import { ContextMenuApi, FluxDispatcher, Menu, Toasts, UserProfileStore, UserStore } from "@webpack/common";

import Plugins, { PluginMeta } from "~plugins";

import { EquicordTranslatorModal, GenericBadgeModal } from "./modals";

const CONTRIBUTOR_BADGE = "https://cdn.discordapp.com/emojis/1092089799109775453.png?size=64";
const EQUICORD_CONTRIBUTOR_BADGE = "https://equicord.org/assets/favicon.png";
const USERPLUGIN_CONTRIBUTOR_BADGE = "https://equicord.org/assets/icons/misc/userplugin.png";

const ContributorBadge: ProfileBadge = {
    description: "Vencord Contributor",
    iconSrc: CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowContributorBadge(userId),
    onClick: (_, { userId }) => import("@components/settings/tabs/plugins/ContributorModal").then(m => m.openContributorModal(UserStore.getUser(userId)))
};

const EquicordContributorBadge: ProfileBadge = {
    description: "Equicord Contributor",
    iconSrc: EQUICORD_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowEquicordContributorBadge(userId),
    onClick: (_, { userId }) => import("@components/settings/tabs/plugins/ContributorModal").then(m => m.openContributorModal(UserStore.getUser(userId))),
    props: {
        style: {
            borderRadius: "0%",
            maxHeight: "22px",
            maxWidth: "22px"
        }
    },
};

const UserPluginContributorBadge: ProfileBadge = {
    description: "User Plugin Contributor",
    iconSrc: USERPLUGIN_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => {
        if (!IS_DEV) return false;
        const allPlugins = Object.values(Plugins);
        return allPlugins.some(p => {
            const pluginMeta = PluginMeta[p.name];
            return pluginMeta?.userPlugin && p.authors.some(a => a.id.toString() === userId);
        });
    },
    onClick: (_, { userId }) => import("@components/settings/tabs/plugins/ContributorModal").then(m => m.openContributorModal(UserStore.getUser(userId))),
    props: {
        style: {
            borderRadius: "0%",
            maxHeight: "22px",
            maxWidth: "22px"
        }
    },
};

let DonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
let EquicordDonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
type MidnightcordBadge = { icon: string; placeholder: string; uuid: string; };

const MIDNIGHTCORD_BADGE_ENDPOINT = "https://api.midnightcord.fr/v1/badge";
const MIDNIGHTCORD_CLIENT_MARKER = "midnightcord-desktop";
const MIDNIGHTCORD_CACHE_TTL = 30 * 60_000;
const MIDNIGHTCORD_RETRY_DELAY = 60_000;
const MidnightcordBadgeLogger = new Logger("BadgeAPI#Midnightcord");

let MidnightcordBadges = {} as Record<string, MidnightcordBadge[]>;
const MidnightcordBadgeLoadedAt = new Map<string, number>();
const MidnightcordBadgeRequests = new Map<string, Promise<void>>();
const MidnightcordBadgeFailures = new Map<string, number>();

function isMidnightcordBadge(value: any): value is MidnightcordBadge {
    if (
        !value
        || typeof value.icon !== "string"
        || typeof value.placeholder !== "string"
        || typeof value.uuid !== "string"
    ) return false;

    try {
        const url = new URL(value.icon);
        if (url.protocol !== "https:") return false;

        const isWebsiteAsset = ["midnightcord.fr", "www.midnightcord.fr"].includes(url.hostname)
            && url.pathname.startsWith("/assets/");
        const isApiAsset = url.hostname === "api.midnightcord.fr"
            && url.pathname.startsWith("/v1/assets/");
        return isWebsiteAsset || isApiAsset;
    } catch {
        return false;
    }
}

function loadMidnightcordBadges(userId: string, noCache = false): Promise<void> {
    if (!/^\d{17,20}$/.test(userId)) return Promise.resolve();

    const hasCachedValue = Object.prototype.hasOwnProperty.call(MidnightcordBadges, userId);
    const loadedAt = MidnightcordBadgeLoadedAt.get(userId) ?? 0;
    if (!noCache && hasCachedValue && Date.now() - loadedAt < MIDNIGHTCORD_CACHE_TTL) return Promise.resolve();

    const failedAt = MidnightcordBadgeFailures.get(userId) ?? 0;
    if (!noCache && Date.now() - failedAt < MIDNIGHTCORD_RETRY_DELAY) return Promise.resolve();

    const existing = MidnightcordBadgeRequests.get(userId);
    if (existing) return existing;

    const request = fetch(MIDNIGHTCORD_BADGE_ENDPOINT, {
        method: "POST",
        cache: "no-store",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Midnightcord-Client": MIDNIGHTCORD_CLIENT_MARKER
        },
        body: JSON.stringify({ userId })
    })
        .then(async response => {
            if (!response.ok) throw new Error("Badge service returned " + response.status);
            const payload = await response.json();
            const badges = Array.isArray(payload?.badges)
                ? payload.badges.filter(isMidnightcordBadge).slice(0, 4)
                : [];

            MidnightcordBadges[userId] = badges;
            MidnightcordBadgeLoadedAt.set(userId, Date.now());
            MidnightcordBadgeFailures.delete(userId);
            UserProfileStore.emitChange();
        })
        .catch(error => {
            MidnightcordBadgeFailures.set(userId, Date.now());
            MidnightcordBadgeLogger.warn("Unable to load a profile badge", error);
        })
        .finally(() => {
            MidnightcordBadgeRequests.delete(userId);
        });

    MidnightcordBadgeRequests.set(userId, request);
    return request;
}
let IllegalcordBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;

async function loadBadges(url: string, noCache = false) {
    const init = {} as RequestInit;
    if (noCache) init.cache = "no-cache";

    return await fetch(url, init).then(r => r.json());
}

async function loadAllBadges(noCache = false) {
    const vencordBadges = await loadBadges("https://badges.vencord.dev/badges.json", noCache).catch(() => ({}));
    const equicordBadges = await loadBadges("https://badge.equicord.org/badges.json", noCache).catch(() => ({}));
    const illegalcordBadges = await loadBadges("https://raw.githubusercontent.com/ImHisako/ImHisako/refs/heads/main/Images/badges.json", noCache).catch(() => ({}));

    DonorBadges = vencordBadges;
    EquicordDonorBadges = equicordBadges;
    if (noCache) {
        MidnightcordBadges = {};
        MidnightcordBadgeLoadedAt.clear();
        MidnightcordBadgeFailures.clear();
    }
    IllegalcordBadges = illegalcordBadges;
}

let intervalId: any;

export function BadgeContextMenu({ badge }: { badge: ProfileBadge & BadgeUserArgs; }) {
    return (
        <Menu.Menu
            navId="vc-badge-context"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Badge Options"
        >
            {badge.description && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label="Copy Badge Name"
                    action={() => copyWithToast(badge.description!)}
                />
            )}
            {badge.iconSrc && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label="Copy Badge Image Link"
                    action={() => copyWithToast(badge.iconSrc!)}
                />
            )}
        </Menu.Menu>
    );
}

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.Megu, Devs.Ven, Devs.TheSun],
    required: true,
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /alt:" ","aria-hidden":!0,src:.{0,50}(\i).iconSrc/,
                    replace: "...$1.props,$&"
                },
                {
                    match: /(?<=forceOpen:.{0,40}?\i\((\i)\.id\).{0,100}?)children:/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}) :"
                },
                // handle onClick and onContextMenu
                {
                    match: /href:(\i)\.link/,
                    replace: "...$self.getBadgeMouseEventHandlers($1),$&"
                }
            ]
        },
        {
            find: "getLegacyUsername(){",
            replacement: {
                match: /getBadges\(\)\{return(\[[^}]*?\])\}(?=getLegacyUsername\(\))/,
                replace: "getBadges(){return $self.dedupeBadges([...$self.getBadges(this),...$1])}"
            }
        }
    ],

    // for access from the console or other plugins
    get DonorBadges() {
        return DonorBadges;
    },

    get EquicordDonorBadges() {
        return EquicordDonorBadges;
    },

    get MidnightcordBadges() {
        return MidnightcordBadges;
    },

    toolboxActions: {
        async "Refetch Badges"() {
            await loadAllBadges(true);
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (currentUserId) await loadMidnightcordBadges(currentUserId, true);
            Toasts.show({
                id: Toasts.genId(),
                message: "Successfully refetched badges!",
                type: Toasts.Type.SUCCESS
            });
        }
    },

    userProfileBadges: [ContributorBadge, EquicordContributorBadge, UserPluginContributorBadge],

    async start() {
        await loadAllBadges();

        clearInterval(intervalId);
        intervalId = setInterval(loadAllBadges, 1000 * 60 * 30); // 30 minutes

        // Charge la preference "badges caches" (locale + cloud) pour l'utilisateur courant.
        // Sans cet appel, myHiddenSources reste vide en memoire a chaque redemarrage,
        // meme si la sauvegarde existe deja dans localStorage/le cloud.
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) {
            void loadMidnightcordBadges(currentUserId);
            loadOwnHiddenBadgeSources(currentUserId).catch(() => {});
        }
        FluxDispatcher.subscribe("CONNECTION_OPEN", this.onConnectionOpen);
    },

    onConnectionOpen() {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) {
            void loadMidnightcordBadges(currentUserId);
            loadOwnHiddenBadgeSources(currentUserId).catch(() => {});
        }
    },

    async stop() {
        clearInterval(intervalId);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", this.onConnectionOpen);
    },

    dedupeBadges(badges: any[]) {
        if (!Array.isArray(badges)) return badges;
        const seenKeys = new Set<string>();

        return badges.filter(b => {
            if (!b) return false;

            const id = (b.id || b.key || "").toString().toLowerCase();
            const normId = id
                .replace("hypesquad_online_house_", "hypesquad_house_")
                .replace("premium_early_supporter", "early_supporter")
                .replace("moderator_programs_alumni", "certified_moderator");

            const icon = (b.iconSrc || b.icon || "").toString();
            let iconHash = "";
            if (icon) {
                try {
                    const parts = icon.split("/");
                    const last = parts.pop() || icon;
                    iconHash = last.split("?")[0].replace(/\.(png|webp|jpg|svg)$/i, "");
                } catch {
                    iconHash = icon;
                }
            }

            const desc = (b.description || "").toString().trim().toLowerCase();

            const primaryKey = normId || iconHash || desc;
            if (!primaryKey) return true;

            if (seenKeys.has(primaryKey)) return false;

            seenKeys.add(primaryKey);
            if (normId) seenKeys.add(normId);
            if (iconHash) seenKeys.add(iconHash);

            return true;
        });
    },

    getBadges(profile: { userId: string; guildId: string; }) {
        if (!profile) return [];

        try {
            return _getBadges(profile);
        } catch (e) {
            new Logger("BadgeAPI#getBadges").error(e);
            return [];
        }
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component!;
        return <Component {...badge} />;
    }, { noop: true }),

    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers; // sanity check

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => {
            e.preventDefault();
            e.stopPropagation();
            onClick(e, badge);
        };
        if (onContextMenu) handlers.onContextMenu = e => onContextMenu(e, badge);

        return handlers;
    },

    getDonorBadges(userId: string) {
        return DonorBadges[userId]?.map(badge => ({
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "0%",
                    maxHeight: "22px",
                    maxWidth: "22px"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return GenericBadgeModal(badge, "Vencord");
            },
        } satisfies ProfileBadge));
    },

    getEquicordDonorBadges(userId: string) {
        return EquicordDonorBadges[userId]?.map(badge => ({
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "0%",
                    maxHeight: "22px",
                    maxWidth: "22px"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return badge.tooltip === "Equicord Translator" ? EquicordTranslatorModal() : GenericBadgeModal(badge, "Equicord");
            },
        } satisfies ProfileBadge));
    },

    getMidnightcordBadges(userId: string) {
        try {
            const userBadges = MidnightcordBadges[userId];
            void loadMidnightcordBadges(userId);
            if (!userBadges || !Array.isArray(userBadges)) return [];

            return userBadges
                .filter(badge => badge && badge.icon)
                .map(badge => ({
                    iconSrc: badge.icon,
                    description: badge.placeholder ?? "Midnightcord Badge",
                    position: BadgePosition.START,
                    props: {
                        style: {
                            borderRadius: "50%",
                            maxHeight: "22px",
                            maxWidth: "22px"
                        }
                    },
                    onContextMenu(event, b) {
                        ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={b as any} />);
                    },
                    onClick() {
                        return GenericBadgeModal(badge, "Midnightcord");
                    }
                } satisfies ProfileBadge));
        } catch (e) {
            console.error("[BadgeAPI] Error processing midnightcord badges for", userId, e);
            return [];
        }
    },

    getIllegalcordBadges(userId: string) {
        return IllegalcordBadges[userId]?.map(badge => ({
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    maxHeight: "22px",
                    maxWidth: "22px"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return GenericBadgeModal(badge, "Illegalcord");
            },
        } satisfies ProfileBadge));
    }
});
