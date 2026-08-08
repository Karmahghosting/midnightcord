import { t } from "../autoTranslateMidnightcord";
/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ProfileBadge } from "@api/Badges";
import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { AuthenticationStore, Button, FluxDispatcher, GuildMemberStore, IconUtils, Menu, OAuth2AuthorizeModal, React, Select, SettingsRouter, showToast, SnowflakeUtils, Toasts, UserProfileStore, UserStore } from "@webpack/common";
import { Settings } from "@api/Settings";
import { getPublicPluginConfig, saveOwnPluginConfig } from "../../api/PluginSync";
import { getStoredToken, storeToken, beginDiscordOAuth, API_BASE } from "../../api/OAuth2";
function cleanMerge(original: any, overrides: any) {
    if (!original) return original;
    const clone = Object.create(Object.getPrototypeOf(original));
    for (const key of Reflect.ownKeys(original)) {
        const desc = Object.getOwnPropertyDescriptor(original, key);
        if (desc) Object.defineProperty(clone, key, desc);
    }
    for (const key of Reflect.ownKeys(overrides)) {
        const desc = Object.getOwnPropertyDescriptor(overrides, key);
        if (desc) Object.defineProperty(clone, key, desc);
    }
    return clone;
}

import { tPlugin as t } from "@api/pluginI18n";

const DS_KEY = "customProfile_data";
const DS_ENABLED = "customProfile_enabled";

const FLAG = {
    STAFF: 1,
    PARTNER: 2,
    HYPESQUAD: 4,
    BUG_HUNTER_1: 8,
    BRAVERY: 64,
    BRILLIANCE: 128,
    BALANCE: 256,
    EARLY_SUPPORTER: 512,
    BUG_HUNTER_2: 16384,
    DEV_VERIFIED: 131072,
    MOD_ALUMNI: 262144,
    ACTIVE_DEVELOPER: 4194304,
};

const BADGES = [
    { key: "Staff Discord", label: t("Staff Discord"), flag: FLAG.STAFF, icon: "https://cdn.discordapp.com/badge-icons/5e74e9b61934fc1f67c65515d1f7e60d.png" },
    { key: "Partnered Server Owner", label: t("Partnered Server Owner"), flag: FLAG.PARTNER, icon: "https://cdn.discordapp.com/badge-icons/3f9748e53446a137a052f3454e2de41e.png" },
    { key: "HypeSquad Events", label: t("HypeSquad Events"), flag: FLAG.HYPESQUAD, icon: "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png" },
    { key: "Bug Hunter Lvl 1", label: t("Bug Hunter Lvl 1"), flag: FLAG.BUG_HUNTER_1, icon: "https://cdn.discordapp.com/badge-icons/2717692c7dca7289b35297368a940dd0.png" },
    { key: "HypeSquad Bravery", label: t("HypeSquad Bravery"), flag: FLAG.BRAVERY, icon: "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png" },
    { key: "HypeSquad Brilliance", label: t("HypeSquad Brilliance"), flag: FLAG.BRILLIANCE, icon: "https://cdn.discordapp.com/badge-icons/011940fd013da3f7fb926e4a1cd2e618.png" },
    { key: "HypeSquad Balance", label: t("HypeSquad Balance"), flag: FLAG.BALANCE, icon: "https://cdn.discordapp.com/badge-icons/3aa41de486fa12454c3761e8e223442e.png" },
    { key: "Early Supporter", label: t("Early Supporter"), flag: FLAG.EARLY_SUPPORTER, icon: "https://cdn.discordapp.com/badge-icons/7060786766c9c840eb3019e725d2b358.png" },
    { key: "Former Moderator", label: t("Former Moderator"), flag: FLAG.MOD_ALUMNI, icon: "https://cdn.discordapp.com/badge-icons/fee1624003e2fee35cb398e125dc479b.png" },
    { key: "Bug Hunter Lvl 2", label: t("Bug Hunter Lvl 2"), flag: FLAG.BUG_HUNTER_2, icon: "https://cdn.discordapp.com/badge-icons/848f79194d4be5ff5f81505cbd0ce1e6.png" },
    { key: "Early Verified Bot Developer", label: t("Early Verified Bot Developer"), flag: FLAG.DEV_VERIFIED, icon: "https://cdn.discordapp.com/badge-icons/6df5892e0f35b051f8b61eace34f4967.png" },
    { key: "Active Developer", label: t("Active Developer"), flag: FLAG.ACTIVE_DEVELOPER, icon: "https://cdn.discordapp.com/badge-icons/6bdc42827a38498929a4920da12695d9.png" },
];

const OLD_NAME_BADGE_ICON = "https://cdn.discordapp.com/badge-icons/6de6d34650760ba5551a79732e98ed60.png";

const NITRO_LEVELS = [
    { label: t("Nitro (0 mois)"), icon: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png" },
    { label: t("Bronze (1 mois)"), icon: "https://cdn.discordapp.com/badge-icons/4f33c4a9c64ce221936bd256c356f91f.png" },
    { label: t("Argent (3 mois)"), icon: "https://cdn.discordapp.com/badge-icons/4514fab914bdbfb4ad2fa23df76121a6.png" },
    { label: t("Or (6 mois)"), icon: "https://cdn.discordapp.com/badge-icons/2895086c18d5531d499862e41d1155a6.png" },
    { label: t("Platine (12 mois)"), icon: "https://cdn.discordapp.com/badge-icons/0334688279c8359120922938dcb1d6f8.png" },
    { label: t("Diamant (24 mois)"), icon: "https://cdn.discordapp.com/badge-icons/0d61871f72bb9a33a7ae568c1fb4f20a.png" },
    { label: t("Émeraude (36 mois)"), icon: "https://cdn.discordapp.com/badge-icons/11e2d339068b55d3a506cff34d3780f3.png" },
    { label: t("Rubis (60 mois)"), icon: "https://cdn.discordapp.com/badge-icons/cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4.png" },
    { label: t("Opale (72 mois)"), icon: "https://cdn.discordapp.com/badge-icons/5b154df19c53dce2af92c9b61e6be5e2.png" },
];

const BOOST_LABELS_RAW = [
    "1 Mois", "2 Mois", "3 Mois", "6 Mois",
    "9 Mois", "12 Mois", "15 Mois", "18 Mois", "24 Mois"
];
const BOOST_LABELS = BOOST_LABELS_RAW.map(l => t(l));
const BOOST_ICONS = [
    "https://cdn.discordapp.com/badge-icons/51040c70d4f20a921ad6674ff86fc95c.png", // 1 mois
    "https://cdn.discordapp.com/badge-icons/0e4080d1d333bc7ad29ef6528b6f2fb7.png", // 2 mois
    "https://cdn.discordapp.com/badge-icons/72bed924410c304dbe3d00a6e593ff59.png", // 3 mois
    "https://cdn.discordapp.com/badge-icons/df199d2050d3ed4ebf84d64ae83989f8.png", // 6 mois
    "https://cdn.discordapp.com/badge-icons/996b3e870e8a22ce519b3a50e6bdd52f.png", // 9 mois
    "https://cdn.discordapp.com/badge-icons/991c9f39ee33d7537d9f408c3e53141e.png", // 12 mois
    "https://cdn.discordapp.com/badge-icons/cb3ae83c15e970e8f3d410bc62cb8b99.png", // 15 mois
    "https://cdn.discordapp.com/badge-icons/7142225d31238f6387d9f09efaa02759.png", // 18 mois
    "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png", // 24 mois
];

const AVATAR_DECORATIONS = [
    { id: "1144307957425778779", label: "Hearts" },
    { id: "1144308196723408958", label: "Hearts Animated" },
    { id: "1212569433839636530", label: "Lofi Cafe" },
    { id: "1481387347642810480", label: "Winter" },
    { id: "1343751617362661526", label: "Magic Orb" },
    { id: "1373015260465987705", label: "Dragon" },
    { id: "1333866045303423026", label: "Ghost" },
    { id: "1144308439720394944", label: "Sakura Drift" },
    { id: "1432550258126229565", label: "Neon" },
    { id: "1462116613632426014", label: "Cyber City" },
    { id: "1462116613682757888", label: "Retro" },
    { id: "1144307629225672846", label: "Fire" },
    { id: "1341506443718688768", label: "Void" },
    { id: "1447654090640330763", label: "Celestial" },
    { id: "1483857762890022923", label: "Snowy" },
    { id: "1479561706672885811", label: "Ice" },
    { id: "1212569856189407352", label: "Cozy" },
    { id: "1485784028710830242", label: "New Year" },
    { id: "1341506444150702080", label: "Abyss" },
    { id: "1232071712695386162", label: "Spring" },
    { id: "1220514048068812901", label: "Summer" },
    { id: "1427463138634109026", label: "Autumn" },
    { id: "1341506443865489408", label: "Darkness" },
    { id: "1144003752978829455", label: "Flaming Sword" },
    { id: "1144006094134456352", label: "Magical Potion" },
    { id: "1144046002110738634", label: "Fairy Sprites" },
    { id: "1144048390594908212", label: "Wizard's Staff" },
    { id: "1144048977138946230", label: "Glowing Runes" },
    { id: "1144049316009353338", label: "Defensive Shield" },
    { id: "1144049603109470370", label: "Skull Medallion" },
    { id: "1144049924397334651", label: "Treasure and Key" },
    { id: "1207047014769234001", label: "Fire Element" },
    { id: "1207047597294886923", label: "Water" },
    { id: "1207047808838799410", label: "Air" },
    { id: "1207048049571139584", label: "Earth" },
    { id: "1207048289610899526", label: "Lightning" },
    { id: "1207048656289534022", label: "Balance" },
    { id: "1232070870093008937", label: "Stardust" },
    { id: "1232071157746765906", label: "Black Hole" },
    { id: "1232072121950146560", label: "Solar Orbit" },
    { id: "1232072520249643028", label: "UFO" },
    { id: "1232072859485208687", label: "Astronaut Helmet" },
    { id: "1197344326133502032", label: "Glitch" },
    { id: "1197344396983664670", label: "Cybernetic" },
    { id: "1197344575832981605", label: "Digital Sunrise" },
    { id: "1197344636558114986", label: "Implant" },
];

function getDecorationUrl(assetId: string, animated = true): string {
    return `https://cdn.discordapp.com/media/v1/collectibles-shop/${assetId}/${animated ? "animated" : "static"}`;
}

function getProfileEffectUrl(assetId: string, animated = false): string {
    return `https://cdn.discordapp.com/media/v1/collectibles-shop/${assetId}/${animated ? "animated" : "static"}`;
}

function getGiftingBadgeDesc(type: string): string {
    const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
    switch (type) {
        case "icon": return isFr ? "Plaisir d'offrir Icône" : "Gifting Icon";
        case "patron": return isFr ? "Plaisir d'offrir Mécène" : "Gifting Patron";
        case "champion": return isFr ? "Plaisir d'offrir Champion" : "Gifting Champion";
        case "luminary": return isFr ? "Plaisir d'offrir Luminaire" : "Gifting Luminary";
        case "hero": return isFr ? "Plaisir d'offrir Héros" : "Gifting Hero";
        case "legend": return isFr ? "Plaisir d'offrir Légende" : "Gifting Legend";
        default: return "";
    }
}

function getLevelBadgeDesc(level: number): string {
    const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
    return isFr ? `Niveau ${level} atteint` : `Level ${level} Reached`;
}

function getLocalizedBadgeLabel(key: string): string {
    const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
    if (!isFr) {
        switch (key) {
            case "Badges": return "BADGES";
            case "Evolving Nitro Badge": return "EVOLVING NITRO BADGE";
            case "Special Badges": return "SPECIAL BADGES";
            case "Gifting Badges": return "GIFTING BADGES";
            case "Server Boost Badges": return "SERVER BOOST BADGES";
            case "None": return "None";
            case "Staff Discord": return "Staff Discord";
            case "Partnered Server Owner": return "Partnered Server Owner";
            case "HypeSquad Events": return "HypeSquad Events";
            case "Bug Hunter Lvl 1": return "Bug Hunter Lvl 1";
            case "HypeSquad Bravery": return "HypeSquad Bravery";
            case "HypeSquad Brilliance": return "HypeSquad Brilliance";
            case "HypeSquad Balance": return "HypeSquad Balance";
            case "Early Supporter": return "Early Supporter";
            case "Former Moderator": return "Former Moderator";
            case "Bug Hunter Lvl 2": return "Bug Hunter Lvl 2";
            case "Early Verified Bot Developer": return "Early Verified Bot Developer";
            case "Active Developer": return "Active Developer";
            case "Completed a quest": return "Completed a quest";
            case "Orbs — Apprentice": return "Orbs — Apprentice";
            case "Old username": return "Old username";
            case "Level Reached": return "Level Reached";
            case "Gifting Icon": return "Gifting Icon";
            case "Gifting Patron": return "Gifting Patron";
            case "Gifting Champion": return "Gifting Champion";
            case "Gifting Luminary": return "Gifting Luminary";
            case "Gifting Hero": return "Gifting Hero";
            case "Gifting Legend": return "Gifting Legend";
            default: return key;
        }
    }

    switch (key) {
        case "Badges": return "BADGES";
        case "Evolving Nitro Badge": return "BADGES NITRO ÉVOLUTIFS";
        case "Special Badges": return "BADGES SPÉCIAUX";
        case "Gifting Badges": return "BADGES DE CADEAUX";
        case "Server Boost Badges": return "BADGES DE BOOST DE SERVEUR";
        case "None": return "Aucun";

        // Main Badges
        case "Staff Discord": return "Personnel Discord";
        case "Partnered Server Owner": return "Propriétaire d'un serveur partenaire";
        case "HypeSquad Events": return "Événements HypeSquad";
        case "Bug Hunter Lvl 1": return "Chasseur de bugs Nv. 1";
        case "HypeSquad Bravery": return "HypeSquad Bravery";
        case "HypeSquad Brilliance": return "HypeSquad Brilliance";
        case "HypeSquad Balance": return "HypeSquad Balance";
        case "Early Supporter": return "Soutien de la première heure";
        case "Former Moderator": return "Ancien modérateur";
        case "Bug Hunter Lvl 2": return "Chasseur de bugs Nv. 2";
        case "Early Verified Bot Developer": return "Développeur de bot vérifié de la première heure";
        case "Active Developer": return "Développeur actif";

        // Special Badges
        case "Completed a quest": return "A accompli une quête";
        case "Orbs — Apprentice": return "Orbes — Apprenti";
        case "Old username": return "Ancien nom d'utilisateur";
        case "Level Reached": return "Niveau atteint";

        // Gifting Badges
        case "Gifting Icon": return "Plaisir d'offrir Icône";
        case "Gifting Patron": return "Plaisir d'offrir Mécène";
        case "Gifting Champion": return "Plaisir d'offrir Champion";
        case "Gifting Luminary": return "Plaisir d'offrir Luminaire";
        case "Gifting Hero": return "Plaisir d'offrir Héros";
        case "Gifting Legend": return "Plaisir d'offrir Légende";

        default: return key;
    }
}

function getStandardBadgeDesc(key: string): string {
    const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
    if (!isFr) {
        switch (key) {
            case "Staff Discord": return "Discord Staff";
            case "Partnered Server Owner": return "Partnered Server Owner";
            case "HypeSquad Events": return "HypeSquad Events";
            case "Bug Hunter Lvl 1": return "Bug Hunter Lvl 1";
            case "HypeSquad Bravery": return "HypeSquad Bravery";
            case "HypeSquad Brilliance": return "HypeSquad Brilliance";
            case "HypeSquad Balance": return "HypeSquad Balance";
            case "Early Supporter": return "Early Supporter";
            case "Former Moderator": return "Discord Moderator Programs Alumni";
            case "Bug Hunter Lvl 2": return "Bug Hunter Lvl 2";
            case "Early Verified Bot Developer": return "Early Verified Bot Developer";
            case "Active Developer": return "Active Developer";
            default: return key;
        }
    }

    switch (key) {
        case "Staff Discord": return "Personnel Discord";
        case "Partnered Server Owner": return "Propriétaire d'un serveur partenaire";
        case "HypeSquad Events": return "Événements HypeSquad";
        case "Bug Hunter Lvl 1": return "Chasseur de bugs Nv. 1";
        case "HypeSquad Bravery": return "HypeSquad Bravery";
        case "HypeSquad Brilliance": return "HypeSquad Brilliance";
        case "HypeSquad Balance": return "HypeSquad Balance";
        case "Early Supporter": return "Soutien de la première heure";
        case "Former Moderator": return "Ancien modérateur";
        case "Bug Hunter Lvl 2": return "Chasseur de bugs Nv. 2";
        case "Early Verified Bot Developer": return "Développeur de bot vérifié de la première heure";
        case "Active Developer": return "Développeur actif";
        default: return key;
    }
}

function getBadgeId(key: string): string {
    switch (key) {
        case "Staff Discord": return "staff";
        case "Partnered Server Owner": return "partner";
        case "HypeSquad Events": return "hypesquad";
        case "Bug Hunter Lvl 1": return "bug_hunter_level_1";
        case "HypeSquad Bravery": return "hypesquad_house_1";
        case "HypeSquad Brilliance": return "hypesquad_house_2";
        case "HypeSquad Balance": return "hypesquad_house_3";
        case "Early Supporter": return "early_supporter";
        case "Former Moderator": return "certified_moderator";
        case "Bug Hunter Lvl 2": return "bug_hunter_level_2";
        case "Early Verified Bot Developer": return "verified_developer";
        case "Active Developer": return "active_developer";
        default: return key.toLowerCase().replace(/ /g, "_");
    }
}

function normalizeBadgeId(id: string): string {
    if (!id) return "";
    let s = id.toLowerCase();
    s = s.replace("hypesquad_online_house_", "hypesquad_house_");
    s = s.replace("premium_early_supporter", "early_supporter");
    s = s.replace("moderator_programs_alumni", "certified_moderator");
    return s;
}

function getBadgeIconKey(icon: string): string {
    if (!icon) return "";
    try {
        const parts = icon.split("/");
        const last = parts.pop() || icon;
        return last.split("?")[0].replace(/\.(png|webp|jpg|svg)$/i, "");
    } catch {
        return icon;
    }
}

function deduplicateProfileBadges(badges: any[]): any[] {
    if (!Array.isArray(badges)) return [];
    const seenIds = new Set<string>();
    const seenIcons = new Set<string>();

    return badges.filter(b => {
        if (!b) return false;

        const rawId = b.id || b.key || "";
        const normId = normalizeBadgeId(rawId);
        const iconKey = getBadgeIconKey(b.icon || b.iconSrc || "");

        if (normId && seenIds.has(normId)) return false;
        if (iconKey && seenIcons.has(iconKey)) return false;

        if (normId) seenIds.add(normId);
        if (iconKey) seenIcons.add(iconKey);

        return true;
    });
}

const PROFILE_EFFECTS = [
    { id: "1139323092645183591", label: "Hydro Blast" },
    { id: "1139323093991575696", label: "Sakura Dreams" },
    { id: "1139323099251232828", label: "Mystic Vines" },
    { id: "1139323099687436419", label: "Pixie Dust" },
    { id: "1212582298893946880", label: "Dreamy" },
    { id: "1212582372877541427", label: "Ki Detonate" },
    { id: "1212582452640350238", label: "Sushi Mania" },
    { id: "1139323100568244355", label: "Magic Hearts" },
    { id: "1139323093551165533", label: "Shatter" },
    { id: "1139323101008642101", label: "Shuriken Strike" },
    { id: "1139323101881061466", label: "Power Surge" },
    { id: "1158572178179108968", label: "Ghoulish Graffiti" },
    { id: "1158572275507937342", label: "Dark Omens" },
    { id: "1197344693630009424", label: "Nightrunner" },
    { id: "1197344764174008452", label: "Uplink Error" },
    { id: "1217626509737459852", label: "Petal Serenade" },
    { id: "1217627051217911848", label: "Fellowship of the Spring" },
    { id: "1217627230818009171", label: "Spring Bloom" },
    { id: "1228233390260486164", label: "Study Spot" },
    { id: "1228234634379132958", label: "All Nighter" },
    { id: "1237654783209508904", label: "Jolly Roger" },
    { id: "1237654867330469949", label: "Forgotten Treasure" },
    { id: "1237654942202990602", label: "Haunted Man O' War" },
    { id: "1232073286582538261", label: "Shooting Stars" },
    { id: "1232073608168472638", label: "Twilight" },
    { id: "1207049115339591681", label: "Rock Slide" },
    { id: "1207049364464345158", label: "Vortex" },
    { id: "1207049498065375343", label: "Mastery" },
    { id: "1245088205330710539", label: "Turbo Drive" },
    { id: "1245088254647205991", label: "Twinkle Trails" },
];

function VerifiedBadge() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, verticalAlign: "middle" }}>
            <path
                d="M12 2L14.39 4.39L17.5 3.5L18.39 6.61L21.5 7.5L20.61 10.61L23 13L20.61 15.39L21.5 18.5L18.39 19.39L17.5 22.5L14.39 21.61L12 24L9.61 21.61L6.5 22.5L5.61 19.39L2.5 18.5L3.39 15.39L1 13L3.39 10.61L2.5 7.5L5.61 6.61L6.5 3.5L9.61 4.39L12 2Z"
                fill="#ffffff"
            />
            <path
                d="M10 16.2L6.5 12.7L7.91 11.29L10 13.38L16.09 7.29L17.5 8.7L10 16.2Z"
                fill="#111214"
            />
        </svg>
    );
}

interface FakeConnection {
    id: string;
    platform: string;
    name: string;
    url?: string;
}

const FAKE_PLATFORMS = [
    { id: "domain", label: "Domain / Site Web", icon: "/assets/b4376756bcbbf1ef.svg", placeholder: "nightcord.st", defaultUrl: (name: string) => name.startsWith("http") ? name : `https://${name}` },
    { id: "twitter", label: "X (Twitter)", icon: "/assets/a61999ae9bfb9658.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://x.com/${name.replace(/^@/, "")}` },
    { id: "github", label: "GitHub", icon: "/assets/a35ff3e86ffa1eb2.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://github.com/${name}` },
    { id: "youtube", label: "YouTube", icon: "/assets/0fa530ba9c04ac32.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://youtube.com/@${name.replace(/^@/, "")}` },
    { id: "twitch", label: "Twitch", icon: "/assets/4fda00c96319c8ae.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://twitch.tv/${name}` },
    { id: "spotify", label: "Spotify", icon: "/assets/d5719388ffc613da.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://open.spotify.com/user/${name}` },
    { id: "tiktok", label: "TikTok", icon: "/assets/b4376756bcbbf1ef.svg", placeholder: "midnightcord", defaultUrl: (name: string) => name.startsWith("http") ? name : name.includes("tiktok.com") ? `https://${name.replace(/^https?:\/\//, "")}` : `https://tiktok.com/@${name.replace(/^@/, "")}` },
    { id: "reddit", label: "Reddit", icon: "/assets/adfd927dcc2049a5.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://reddit.com/user/${name}` },
    { id: "steam", label: "Steam", icon: "/assets/1f7ec18f3695d4cf.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://steamcommunity.com/id/${name}` },
    { id: "leagueoflegends", label: "Riot Games", icon: "https://cdn.discordapp.com/app-icons/1443033465766281327/b69039088ad141a9c036f7f4f247f6ba.png?size=128", placeholder: "Midnightcord#EUW" },
    { id: "bluesky", label: "Bluesky", icon: "/assets/2709f058378a099d.svg", placeholder: "midnightcord.bsky.social", defaultUrl: (name: string) => `https://bsky.app/profile/${name}` },
    { id: "paypal", label: "PayPal", icon: "/assets/dcb64a4ff8f61b2c.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://paypal.me/${name}` },
    { id: "ebay", label: "eBay", icon: "/assets/b28a7a265581b6e3.svg", placeholder: "midnightcord" },
    { id: "crunchyroll", label: "Crunchyroll", icon: "/assets/94ef3e8b7fa85a2e.svg", placeholder: "midnightcord" },
    { id: "playstation", label: "PlayStation Network", icon: "/assets/eed203a7ec517e23.svg", placeholder: "Midnightcord_ID" },
    { id: "xbox", label: "Xbox", icon: "/assets/c4f09fda61827e19.svg", placeholder: "Midnightcord" },
    { id: "amazon-music", label: "Amazon Music", icon: "/assets/e3c4aacc1a54395d.svg", placeholder: "midnightcord" },
    { id: "battlenet", label: "Battle.net", icon: "/assets/163c8cb9220efc74.svg", placeholder: "Midnightcord#1234" },
    { id: "bungie", label: "Bungie.net", icon: "/assets/099cd81cf3b4cc98.svg", placeholder: "Midnightcord#1234" },
    { id: "epicgames", label: "Epic Games", icon: "/assets/199eceff4fca1a0c.svg", placeholder: "Midnightcord" },
    { id: "facebook", label: "Facebook", icon: "/assets/17be29f77bee4405.svg", placeholder: "midnightcord", defaultUrl: (name: string) => `https://facebook.com/${name}` },
    { id: "roblox", label: "Roblox", icon: "/assets/a4d8e9b0404a2d00.svg", placeholder: "Midnightcord" }
];

function formatFakeConnections(fakeConns: FakeConnection[]) {
    if (!Array.isArray(fakeConns) || fakeConns.length === 0) return [];
    return fakeConns.map(c => {
        const plat = FAKE_PLATFORMS.find(p => p.id === c.platform) || FAKE_PLATFORMS[0];
        let finalUrl = c.url;
        if (!finalUrl && plat.defaultUrl && c.name) {
            try { finalUrl = plat.defaultUrl(c.name); } catch { }
        }
        if (!finalUrl && c.platform === "domain" && c.name) {
            finalUrl = c.name.startsWith("http") ? c.name : `https://${c.name}/`;
        }

        return {
            type: c.platform,
            id: c.name || "connection",
            name: c.name,
            verified: true,
            visibility: 1,
            showActivity: false,
            show_activity: false,
            friendSync: false,
            friend_sync: false,
            metadataVisibility: 0,
            metadata_visibility: 0,
            twoWayLink: false,
            two_way_link: false,
            metadata: {},
            ...(finalUrl ? { url: finalUrl } : {})
        };
    });
}

interface CustomProfileData {
    username?: string;
    globalName?: string;
    avatar?: string;
    banner?: string;
    bio?: string;
    accentColor?: number;
    accentColor2?: number;
    pronouns?: string;
    badgeFlags?: number;
    createdAt?: string;
    nitro?: boolean;
    nitroLevel?: number;
    boostMonths?: number;
    email?: string;
    phone?: string;
    customBadgeIds?: string[];
    oldName?: string;
    levelReached?: number;
    decorationAsset?: string;
    profileEffectId?: string;
    copiedUserId?: string;
    fakeConnections?: FakeConnection[];
}

const LS_KEY_DATA = "MidnightcordCP_data";
const LS_KEY_ENABLED = "MidnightcordCP_enabled";
const DS_ALL_DATA = "customProfile_allData";
const DS_ALL_ENABLED = "customProfile_allEnabled";
const LS_ALL_DATA = "MidnightcordCP_allData";
const LS_ALL_ENABLED = "MidnightcordCP_allEnabled";

let storedData: CustomProfileData = {};
let isEnabled = false;
let domObserver: MutationObserver | null = null;

let cacheDatesR: string[] = [];
let cacheDatesF: string[] = [];
let leCacheU: string | null = null;
let leCacheI: string | null = null;
function choppeDatesReelles(): string[] {
    try {
        const u = UserStore.getCurrentUser();
        if (!u?.id) return [];
        if (leCacheU === u.id) return cacheDatesR;
        leCacheU = u.id;
        cacheDatesR = getRealDateVariants();
        return cacheDatesR;
    } catch { return []; }
}

function choppeDatesBidons(iso: string): string[] {
    if (leCacheI === iso) return cacheDatesF;
    leCacheI = iso;
    cacheDatesF = getFakeDateVariants(iso);
    return cacheDatesF;
}

const publicProfilesCache = new Map<string, { fetched: boolean, data: CustomProfileData | null, timestamp: number }>();
const MacDonald = 500;
function setPublicProfileCache(userId: string, entry: { fetched: boolean, data: CustomProfileData | null, timestamp: number }) {
    if (publicProfilesCache.size >= MacDonald && !publicProfilesCache.has(userId)) {
        const firstKey = publicProfilesCache.keys().next().value;
        if (firstKey !== undefined) publicProfilesCache.delete(firstKey);
    }
    publicProfilesCache.set(userId, entry);
}

const PUBLIC_CACHE_TTL = 1000 * 30;

let _lastSeeAll = false;
function checkSeeAllSettingChange() {
    const current = !!Settings.seeAllCustomProfile;
    if (_lastSeeAll && !current) {
        publicProfilesCache.clear();
    }
    _lastSeeAll = current;
}

const inFlightRequests = new Set<string>();

async function fetchPublicProfileIfNeeded(userId: string) {
    checkSeeAllSettingChange();
    if (!Settings.seeAllCustomProfile) return;
    const existing = publicProfilesCache.get(userId);
    if (existing?.fetched && (Date.now() - existing.timestamp) < PUBLIC_CACHE_TTL) return;

    if (inFlightRequests.has(userId)) return;
    inFlightRequests.add(userId);

    if (!existing) {
        setPublicProfileCache(userId, { fetched: false, data: null, timestamp: 0 });
    }

    try {
        const result = await getPublicPluginConfig("customProfile", userId);
        const dataToSave = result?.settings || null;
        if (dataToSave) {
            delete dataToSave.username;
            delete dataToSave.globalName;
            delete dataToSave.avatar;
            delete dataToSave.bio;
            delete dataToSave.pronouns;
            delete dataToSave.email;
            delete dataToSave.phone;
            delete dataToSave.copiedUserId;
        }
        setPublicProfileCache(userId, { fetched: true, data: dataToSave, timestamp: Date.now() });

        try {
            const UPS = (Vencord as any).Webpack?.findByProps?.("getUserProfile", "getGuildMemberProfile");
            if (UPS && UPS.emitChange) UPS.emitChange();

            const US = (Vencord as any).Webpack?.findByStoreName("UserStore");
            if (US && US.emitChange) US.emitChange();
        } catch {}
    } catch (e: any) {
        // Cache the failure so we don't spam requests for non-existent public profiles
        setPublicProfileCache(userId, { fetched: true, data: null, timestamp: Date.now() });
        console.warn(`[CustomProfile] Failed to fetch public profile for ${userId} (User might not have customProfile):`, e.message || e);
    } finally {
        inFlightRequests.delete(userId);
    }
}

let cachedOriginalUser: any = null;
let cachedFakeUser: any = null;
let cachedDataHash: number = 0;
let _trueOriginalUser: any = null;
let _dataVersion: number = 0;
let allAccountsData: Record<string, CustomProfileData> = {};
let allAccountsEnabled: Record<string, boolean> = {};

function saveDataSync(data: CustomProfileData, enabled: boolean) {
    try {
        localStorage.setItem(LS_KEY_DATA, JSON.stringify(data));
        localStorage.setItem(LS_KEY_ENABLED, enabled ? "1" : "0");
    } catch { }
}

function saveAllDataSync() {
    try {
        localStorage.setItem(LS_ALL_DATA, JSON.stringify(allAccountsData));
        localStorage.setItem(LS_ALL_ENABLED, JSON.stringify(allAccountsEnabled));
    } catch { }
}

function syncCurrentUserData() {
    const myId = _cachedMyId || AuthenticationStore?.getId?.();
    if (myId) {
        _cachedMyId = myId;
        storedData = allAccountsData[myId] || {};
        isEnabled = allAccountsEnabled[myId] || false;
    }
}

function loadDataSync() {
    try {
        const rawAll = localStorage.getItem(LS_ALL_DATA);
        if (rawAll) {
            try { allAccountsData = JSON.parse(rawAll); } catch { allAccountsData = {}; }
            const rawEnabled = localStorage.getItem(LS_ALL_ENABLED);
            try { allAccountsEnabled = rawEnabled ? JSON.parse(rawEnabled) : {}; } catch { allAccountsEnabled = {}; }
            syncCurrentUserData();
            if (!storedData || Object.keys(storedData).length === 0) {
                const rawOld = localStorage.getItem(LS_KEY_DATA);
                const enOld = localStorage.getItem(LS_KEY_ENABLED);
                if (rawOld) {
                    try { storedData = JSON.parse(rawOld); } catch { storedData = {}; }
                    isEnabled = enOld === "1";
                }
            }
            return;
        }
        const raw = localStorage.getItem(LS_KEY_DATA);
        const en = localStorage.getItem(LS_KEY_ENABLED);
        if (raw) {
            try { storedData = JSON.parse(raw); } catch { storedData = {}; }
        } else { storedData = {}; }
        isEnabled = en === "1";
    } catch {
        storedData = {};
        isEnabled = false;
    }
}

let _lastKnownUserId: string | null = null;

function onAccountSwitch() {
    updateCachedRealData();
    const currentId = AuthenticationStore?.getId?.() || null;

    // CONNECTION_OPEN fires on ANY websocket reconnect (e.g. after saving profile).
    // Only do the full reset if the actual account has changed.
    if (currentId && currentId === _lastKnownUserId) {
        // Same account reconnected (e.g. after username/pfp change) — just clear caches, no rerender
        cachedFakeUser = null;
        cachedOriginalUser = null;
        _dataVersion++;
        return;
    }

    _lastKnownUserId = currentId;
    syncCurrentUserData();
    cachedFakeUser = null;
    cachedOriginalUser = null;
    _trueOriginalUser = null;
    leCacheU = null;
    leCacheI = null;
    cacheDatesR = [];
    cacheDatesF = [];
    _dataVersion++;
    _realUsername = "";
    _realGlobalName = "";
    if (isEnabled) startDomObserver();
    else stopDomObserver();
    forceAccountPanelRerender();
}

/**
 * Intercepts CURRENT_USER_UPDATE dispatches from the gateway BEFORE Discord's
 * UserStore processes them.
 *
 * The invariant that triggers the reconnect:
 *   "Premium type should not change for non-staff users"
 *
 * Root cause: our prototype getter lies and returns premiumType=2 (Nitro).
 * When the user edits their profile, Discord's gateway fires CURRENT_USER_UPDATE
 * with the *real* premiumType (0 for non-subscribers).  Discord's store compares
 * the cached value (2, from our hook) against the incoming value (0) and throws.
 *
 * Fix: if we are faking Nitro for this user, overwrite premiumType in the
 * payload with the value our prototype would return (2), so Discord sees no
 * change and the invariant passes silently.
 */
function _onCurrentUserUpdate(event: any) {
    try {
        if (!event?.user) return;
        const userId: string | undefined = event.user.id;
        if (!userId) return;

        const fakingNitro =
            (isEnabled && isMe(userId) && storedData.nitro) ||
            (Settings.seeAllCustomProfile && publicProfilesCache.get(userId)?.data?.nitro);

        if (fakingNitro) {
            // Overwrite in-place so Discord's store validation sees no change.
            // We also stash the real value so we can restore it on stop().
            if (event.user._realPremiumType === undefined) {
                event.user._realPremiumType = event.user.premiumType ?? 0;
            }
            event.user.premiumType = 2;
        }
    } catch { /* never throw inside a Flux handler */ }
}


loadDataSync();

const HIDE_STYLE_ID = "cp-hide-during-load";
function injectHideStyle() {
    if (!isEnabled) return;
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = `
        [class*='nameTag'] [class*='username'],
        [class*='nameTag'] [class*='discriminator'],
        [class*='nameTag'] [class*='panelSubtitle']
        { color: transparent !important; }
        [class*='accountProfilePopout'] [class*='avatarWrap'] img,
        [class*='accountProfilePopout'] [class*='avatarWrap'] svg
        { opacity: 0 !important; }
    `;
    const inject = () => {
        if (!document.head) { requestAnimationFrame(inject); return; }
        document.head.appendChild(style);
    };
    inject();
}
function removeHideStyle() {
    document.getElementById(HIDE_STYLE_ID)?.remove();
}
if (isEnabled) injectHideStyle();

let _avatarPatchApplied = false;
let _avatarPatchOrig: any = null;
function applyAvatarPatchEarly() {
    if (_avatarPatchApplied) return;
    try {
        if (!IconUtils?.getUserAvatarURL) return;
        _avatarPatchOrig = IconUtils.getUserAvatarURL;
        const orig = _avatarPatchOrig;
        // The patch reads storedData/isEnabled at call-time, not at install-time
        // so it works even if called before loadData() finishes.
        IconUtils.getUserAvatarURL = function (user: any, ...args: any[]) {
            if (!user) return orig(user, ...args);
            const uid = user.id ?? user.userId;
            if (!uid) return orig(user, ...args);
            // Own user
            if (isEnabled && storedData.avatar && isMe(uid)) {
                return storedData.avatar;
            }
            // Other users via public cache
            checkSeeAllSettingChange();
            if (Settings.seeAllCustomProfile && !isMe(uid)) {
                const cached = publicProfilesCache.get(uid);
                if (cached?.fetched && cached.data?.avatar) {
                    return cached.data.avatar;
                }
                fetchPublicProfileIfNeeded(uid);
            }
            return orig(user, ...args);
        };
        _avatarPatchApplied = true;
    } catch { }
}

async function loadData() {
    try {
        const allData = await DataStore.get(DS_ALL_DATA) as Record<string, CustomProfileData> | null;
        const allEnabled = await DataStore.get(DS_ALL_ENABLED) as Record<string, boolean> | null;
        if (allData && typeof allData === "object" && Object.keys(allData).length > 0) {
            allAccountsData = allData;
            allAccountsEnabled = allEnabled || {};
            syncCurrentUserData();
            saveAllDataSync();
            saveDataSync(storedData, isEnabled);
            return;
        }
        const d = await DataStore.get(DS_KEY) as CustomProfileData | null;
        const e = await DataStore.get(DS_ENABLED) as boolean | null;
        if (d !== null) storedData = d;
        if (e !== null) isEnabled = e === true;
        const myId = AuthenticationStore?.getId?.();
        if (myId && storedData && Object.keys(storedData).length > 0) {
            allAccountsData[myId] = storedData;
            allAccountsEnabled[myId] = isEnabled;
            DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
            DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });
            saveAllDataSync();
        }
        saveDataSync(storedData, isEnabled);
    } catch (err) { }
}

async function copyUserProfile(userId: string) {
    try {
        const user = UserStore.getUser(userId) as any;
        if (!user) return;

        const { findByProps } = await import("@webpack") as any;
        const UserProfileStore = findByProps("getUserProfile", "getGuildMemberProfile") as any;
        const IU = IconUtils as any;
        const profile = UserProfileStore?.getUserProfile?.(userId) ?? {};

        const newData: CustomProfileData = {
            username: user.username || "",
            globalName: user.globalName || "",
            pronouns: "",
            bio: "",
            accentColor: undefined,
            accentColor2: undefined,
            banner: "",
            avatar: "",
            badgeFlags: 0,
            customBadgeIds: [],
            nitro: false,
            nitroLevel: -1,
            boostMonths: -1,
            decorationAsset: undefined,
            createdAt: undefined,
            copiedUserId: userId
        };

        if (user.bio !== undefined) newData.bio = user.bio || "";
        if (profile.bio !== undefined) newData.bio = profile.bio || "";

        try {
            const avatarUrl = IU?.getUserAvatarURL?.(user, false, 512)
                ?? (user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=512` : null);
            if (avatarUrl) newData.avatar = avatarUrl;
        } catch { }

        const hasNitro = (profile.premiumType ?? 0) > 0;
        newData.nitro = hasNitro;

        if (hasNitro) {
            const premiumSince = profile.premiumSince ?? user.premiumSince ?? null;
            if (premiumSince) {
                const months = Math.floor((Date.now() - new Date(premiumSince).getTime()) / (1000 * 60 * 60 * 24 * 30));
                if (months >= 72) newData.nitroLevel = 7;
                else if (months >= 36) newData.nitroLevel = 6;
                else if (months >= 24) newData.nitroLevel = 5;
                else if (months >= 12) newData.nitroLevel = 4;
                else if (months >= 6) newData.nitroLevel = 3;
                else if (months >= 3) newData.nitroLevel = 2;
                else if (months >= 2) newData.nitroLevel = 1;
                else newData.nitroLevel = 0;
            } else {
                newData.nitroLevel = 0;
            }
        }

        const boostSince = profile.premiumGuildSince ?? null;
        if (boostSince) {
            const bMonths = Math.floor((Date.now() - new Date(boostSince).getTime()) / (1000 * 60 * 60 * 24 * 30));
            if (bMonths >= 24) newData.boostMonths = 8;
            else if (bMonths >= 18) newData.boostMonths = 7;
            else if (bMonths >= 15) newData.boostMonths = 6;
            else if (bMonths >= 12) newData.boostMonths = 5;
            else if (bMonths >= 9) newData.boostMonths = 4;
            else if (bMonths >= 6) newData.boostMonths = 3;
            else if (bMonths >= 3) newData.boostMonths = 2;
            else if (bMonths >= 2) newData.boostMonths = 1;
            else newData.boostMonths = 0;
        }

        const bannerId = profile.banner ?? user.banner ?? null;
        if (bannerId) newData.banner = IconUtils.getUserBannerURL({ id: userId, banner: bannerId, size: 512 }) ?? "";

        if (profile.accentColor !== undefined) newData.accentColor = profile.accentColor;
        else if (user.accentColor !== undefined) newData.accentColor = user.accentColor;

        try {
            const ms = Number(BigInt(userId) >> 22n) + 1420070400000;
            newData.createdAt = new Date(ms).toISOString().slice(0, 10);
        } catch { }

        try {
            const flags = user.publicFlags ?? 0;
            let badgeFlags = 0;
            for (const { flag } of BADGES) { if (flags & flag) badgeFlags |= flag; }
            newData.badgeFlags = badgeFlags;
            if (user.avatarDecorationData?.asset) newData.decorationAsset = user.avatarDecorationData.asset;
        } catch { }

        newData.copiedUserId = userId;
        storedData = newData;
        isEnabled = true;
        cachedFakeUser = null;
        cachedOriginalUser = null;
        _trueOriginalUser = null;
        leCacheU = null;
        leCacheI = null;
        cacheDatesR = [];
        cacheDatesF = [];
        _dataVersion++;
        saveDataSync(newData, true);
        DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
        DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });

        forceAccountPanelRerender();
    } catch (err) {
        console.error("[CustomProfile] copyUserProfile error:", err);
    }
}

const userContextMenuPatch: NavContextMenuPatchCallback = (_children, _props: any) => {
    // "Copy this profile" / "Remove copy profile" removed
};




function getRealDateVariants(): string[] {
    try {
        const u = UserStore.getCurrentUser();
        if (!u?.id) return [];
        const ms = Number(BigInt(u.id) >> 22n) + 1420070400000;
        const d = new Date(ms);
        const variants = new Set<string>();
        const locales = ["en-US", "en-GB", "fr-FR", "de-DE", "it-IT", navigator.language];
        const fmtSpecs: Intl.DateTimeFormatOptions[] = [
            { day: "numeric", month: "short", year: "numeric" },
            { day: "numeric", month: "long", year: "numeric" },
            { month: "short", day: "numeric", year: "numeric" },
            { month: "long", day: "numeric", year: "numeric" },
            { day: "2-digit", month: "2-digit", year: "numeric" },
        ];
        for (const loc of locales) {
            for (const fmt of fmtSpecs) {
                try {
                    const s = new Intl.DateTimeFormat(loc, fmt).format(d);
                    variants.add(s); variants.add(s.replace(/\s/g, " ")); variants.add(s.replace(/\s/g, "\u00a0"));
                } catch { }
            }
        }
        const day = d.getDate(); const year = d.getFullYear(); const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const mS = monthsShort[d.getMonth()]; const mL = monthsLong[d.getMonth()];
        const patterns = [`${day} ${mS} ${year}`, `${day} ${mL} ${year}`, `${mS} ${day}, ${year}`, `${mL} ${day}, ${year}`, d.toISOString().slice(0, 10)];
        for (const p of patterns) { variants.add(p); variants.add(p.replace(/ /g, "\u00a0")); variants.add(p.replace(/\u00a0/g, " ")); }
        variants.add(year.toString()); return [...variants].filter(v => v.length >= 4);
    } catch { return []; }
}

function getFakeDateVariants(isoDate: string): string[] {
    try {
        const d = new Date(isoDate + "T12:00:00Z");
        const variants = new Set<string>();
        const fmtSpecs: Intl.DateTimeFormatOptions[] = [
            { day: "numeric", month: "short", year: "numeric" },
            { day: "numeric", month: "long", year: "numeric" },
            { month: "short", day: "numeric", year: "numeric" },
            { month: "long", day: "numeric", year: "numeric" },
        ];
        for (const fmt of fmtSpecs) { try { variants.add(new Intl.DateTimeFormat(navigator.language, fmt).format(d)); } catch { } }
        return [...variants];
    } catch { return []; }
}

// Deterministic pseudo-random helper (FNV-1a based) so a given account/badge
// always gets the SAME fake day-of-month across renders (no re-rolling every
// time the profile is recomputed), while different accounts/badges naturally
// land on different days from one another.
function seededFraction(seed: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

// Computes a "since" date whose total elapsed time is randomized somewhere
// inside [minMonths, maxMonths) — i.e. a Rubis badge (60 months minimum) might
// land on 61, 67, or 70 months, not always exactly 60. This mirrors reality:
// a real Rubis holder can be anywhere between 60 and just under 72 months
// (when they'd become Opale). The result is deterministic per `seed` so it
// doesn't change between renders, and is always in the past (never today or
// the future).
function computeFakeSinceDate(minMonths: number, maxMonths: number, seed: string): Date {
    const now = new Date();
    const AVG_DAYS_PER_MONTH = 30.4368;
    const minDays = Math.round(minMonths * AVG_DAYS_PER_MONTH);
    let maxDays = Math.round(maxMonths * AVG_DAYS_PER_MONTH) - 1; // stay strictly under the next tier
    if (maxDays <= minDays) maxDays = minDays + 1;
    const frac = seededFraction(`${seed}:${minMonths}:${maxMonths}`);
    const totalDays = minDays + Math.floor(frac * (maxDays - minDays + 1));
    const d = new Date(now);
    d.setDate(d.getDate() - totalDays);
    if (d.getTime() >= now.getTime()) {
        d.setTime(now.getTime() - 24 * 60 * 60 * 1000);
    }
    return d;
}

const NITRO_LEVEL_MIN_MONTHS = [0, 1, 3, 6, 12, 24, 36, 60, 72];
const NITRO_LEVEL_MAX_MONTHS = [1, 3, 6, 12, 24, 36, 60, 72, 108];

const BOOST_LEVEL_MIN_MONTHS = [1, 2, 3, 6, 9, 12, 15, 18, 24];
const BOOST_LEVEL_MAX_MONTHS = [2, 3, 6, 9, 12, 15, 18, 24, 48];

function getFakeNitroDate(level: number, seedBase: string): Date {
    const min = NITRO_LEVEL_MIN_MONTHS[level] ?? 1;
    const max = NITRO_LEVEL_MAX_MONTHS[level] ?? (min + 24);
    return computeFakeSinceDate(min, max, `${seedBase}:nitro:${level}:${min}:${max}`);
}

function getFakeBoostDate(boostIdx: number, seedBase: string): Date {
    const min = BOOST_LEVEL_MIN_MONTHS[boostIdx] ?? 1;
    const max = BOOST_LEVEL_MAX_MONTHS[boostIdx] ?? (min + 12);
    return computeFakeSinceDate(min, max, `${seedBase}:boost:${boostIdx}:${min}:${max}`);
}

function getDiscordLocale(): string {
    try {
        return document.documentElement.lang || (window as any).DiscordNative?.app?.getLocale?.() || navigator.language || "en-US";
    } catch {
        return "en-US";
    }
}

function formatNitroBadgeDesc(d: Date | string): string {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    if (!dateObj || isNaN(dateObj.getTime())) return "Subscriber since";
    const locale = getDiscordLocale().toLowerCase();
    const isFr = locale.startsWith("fr");
    
    const day = dateObj.getDate().toString().padStart(2, "0");
    const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
    const yy = dateObj.getFullYear().toString().slice(-2);
    
    if (isFr) {
        return `Abonné depuis ${day}/${month}/${yy}`;
    } else {
        return `Subscriber since ${month}/${day}/${yy}`;
    }
}

function formatBoostBadgeDesc(d: Date | string): string {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    if (!dateObj || isNaN(dateObj.getTime())) return "Server boosting since";
    const locale = getDiscordLocale().toLowerCase();
    const isFr = locale.startsWith("fr");
    
    const day = dateObj.getDate();
    const year = dateObj.getFullYear();
    
    const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthsFr = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    
    if (isFr) {
        const mName = monthsFr[dateObj.getMonth()] || "janv.";
        return `Booster de serveurs depuis le ${day} ${mName} ${year}`;
    } else {
        const mName = monthsEn[dateObj.getMonth()] || "Jan";
        return `Server boosting since ${mName} ${day}, ${year}`;
    }
}

let _cachedMyId: string | null = null;
let _realUsername = "";
let _realGlobalName = "";

function updateCachedRealData() {
    try { const myId = AuthenticationStore?.getId?.(); if (myId) _cachedMyId = myId; } catch { }
}

let _domQueued = false;
let _domMutations: MutationRecord[] = [];

function scanTextNode(node: Text) {
    if (!isEnabled || !node.nodeValue) return;
    const val = (node as any).__cp_orig || node.nodeValue;
    let result = val;
    try { if (_trueOriginalUser) { _realUsername = _trueOriginalUser.username || _realUsername; _realGlobalName = _trueOriginalUser.globalName || _realGlobalName; } } catch { }
    let replaced = false;
    if (storedData.createdAt) {
        const realDates = choppeDatesReelles(); const fakeDates = choppeDatesBidons(storedData.createdAt);
        if (realDates.length > 0 && fakeDates.length > 0) {
            for (let i = 0; i < realDates.length; i++) {
                const realDate = realDates[i];
                if (realDate.length >= 4 && (val.includes(realDate) || val.toLowerCase().includes(realDate.toLowerCase()))) {
                    result = result.split(realDate).join(fakeDates[0]); replaced = true;
                }
            }
        }
    }
    if (_realUsername && storedData.username && result.includes(_realUsername)) { result = result.split(_realUsername).join(storedData.username); replaced = true; }
    if (_realGlobalName && storedData.globalName && result.includes(_realGlobalName)) { result = result.split(_realGlobalName).join(storedData.globalName); replaced = true; }
    if (replaced && result !== node.nodeValue) { if ((node as any).__cp_orig === undefined) (node as any).__cp_orig = val; node.nodeValue = result; }
}

function scanNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { scanTextNode(node as Text); return; }
    if (node instanceof Element) {
        const tag = node.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "CANVAS" || tag === "VIDEO" || tag === "IFRAME") return;
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
        const parent = n.parentElement;
        if (parent) {
            const tag = parent.tagName;
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "CANVAS" || tag === "VIDEO" || tag === "IFRAME") continue;
        }
        scanTextNode(n as Text);
    }
}

function processDomBatch() {
    _domQueued = false;
    if (!isEnabled) { _domMutations = []; return; }
    const batch = _domMutations; _domMutations = [];
    const obs = domObserver;
    if (obs) obs.disconnect();
    try {
        for (const m of batch) {
            if (m.type === "characterData") {
                scanTextNode(m.target as Text);
            } else {
                for (const n of m.addedNodes) {
                    scanNode(n);
                }
            }
        }
        // HypeSquad changer is handled by standalone HypeSquadChanger plugin
    } finally {
        if (isEnabled && obs) {
            obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
    }
}

function startDomObserver() {
    stopDomObserver();
    if (!isEnabled || document.visibilityState === "hidden") return;
    scanNode(document.body);
    domObserver = new MutationObserver(mutations => {
        if (!isEnabled || !mutations.length) return;
        if (document.visibilityState === "hidden") {
            _domMutations = [];
            return;
        }
        _domMutations.push(...mutations);
        if (!_domQueued) {
            _domQueued = true;
            setTimeout(processDomBatch, 20);
        }
    });
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function stopDomObserver() {
    domObserver?.disconnect(); domObserver = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) { if ((n as any).__cp_orig !== undefined) { n.nodeValue = (n as any).__cp_orig; delete (n as any).__cp_orig; } }
}

function handleVisibilityChange() {
    if (!isEnabled) return;
    if (document.visibilityState === "visible") {
        startDomObserver();
    } else {
        stopDomObserver();
        _domMutations = [];
        _domQueued = false;
    }
}

function isMe(userId: string | null | undefined): boolean {
    if (!userId) return false;
    if (_cachedMyId) return _cachedMyId === userId;
    try { const myId = AuthenticationStore?.getId?.(); if (myId) { _cachedMyId = myId; return myId === userId; } } catch { }
    return false;
}

function EditIcon({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>;
}
function FolderIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z" /></svg>;
}
function CloseIcon() {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}
function TrashIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.1l-.9 12.1A3 3 0 0 1 17 23H7a3 3 0 0 1-3-2.9L3.1 8H2a1 1 0 0 1 0-2h4V4Zm2 0v2h6V4H9ZM5.1 8l.9 11.9a1 1 0 0 0 1 .1h6a1 1 0 0 0 1-.1L14.9 8H5.1Z" /></svg>;
}
function SaveIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm3-10H5V5h10v4Z" /></svg>;
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties; }) {
    return <div className="cp-section-label" style={style}>{children}</div>;
}

function Field({ label, value, placeholder, onChange, type = "text" }: {
    label: string; value: string; placeholder?: string; onChange: (v: string) => void; type?: string;
}) {
    return (
        <div className="cp-field">
            <SectionLabel>{label}</SectionLabel>
            <input className="cp-input" type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        </div>
    );
}

function ImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void; }) {
    const fileRef = React.useRef<HTMLInputElement>(null);
    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { if (ev.target?.result) onChange(ev.target.result as string); };
        reader.readAsDataURL(file);
    }
    return (
        <div className="cp-field">
            <SectionLabel>{label}</SectionLabel>
            <div className="cp-image-card">
                {value && (
                    <img src={value} alt="" className="cp-image-thumb" />
                )}
                <div className="cp-image-inputs">
                    <input
                        className="cp-input cp-url-input"
                        placeholder={t("Paste an image URL...")}
                        value={value.startsWith("data:") ? "" : value}
                        onChange={e => onChange(e.target.value)}
                    />
                    <div className="cp-image-actions">
                        <button className="cp-image-file-btn" onClick={() => fileRef.current?.click()}>
                            <FolderIcon />
                            <span>{t("Browse")}</span>
                        </button>
                        {value && (
                            <button className="cp-image-clear-btn" onClick={() => onChange("")} title={t("Remove")}>
                                <CloseIcon />
                            </button>
                        )}
                    </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
            </div>
        </div>
    );
}

function Toggle({ label, checked, onChange, sublabel }: { label: string; checked: boolean; onChange: (v: boolean) => void; sublabel?: string; }) {
    return (
        <div className="cp-toggle-row" onClick={() => onChange(!checked)}>
            <div className="cp-toggle-text">
                <span className="cp-toggle-label">{label}</span>
                {sublabel && <span className="cp-toggle-sub">{sublabel}</span>}
            </div>
            <div className={`cp-toggle ${checked ? "cp-toggle--on" : ""}`}><div className="cp-toggle-thumb" /></div>
        </div>
    );
}

function BadgeBtn({ label, icon, active, onClick }: { label: string; icon?: string; active: boolean; onClick: () => void; }) {
    return (
        <button onClick={onClick} className={`cp-badge ${active ? "cp-badge--on" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {icon && <img src={icon} alt="" style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }} />}
            <span>{label}</span>
        </button>
    );
}

function BadgePicker({ selected, onChange, nitroType, onNitroType, boostLevel, onBoostLevel, customIds, onCustomIds, oldName, onOldName, levelReached, onLevelReached }: {
    selected: number; onChange: (v: number) => void;
    nitroType: number; onNitroType: (v: number) => void;
    boostLevel: number; onBoostLevel: (v: number) => void;
    customIds: string[]; onCustomIds: (v: string[]) => void;
    oldName: string; onOldName: (v: string) => void;
    levelReached: number; onLevelReached: (v: number) => void;
}) {
    const hasOldName = customIds.includes("oldname");
    const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
    return (
        <div className="cp-field">
            <SectionLabel>{getLocalizedBadgeLabel("Badges")}</SectionLabel>
            <div className="cp-badges">
                {BADGES.map(b => (
                    <BadgeBtn key={b.flag} label={getLocalizedBadgeLabel(b.key)} icon={b.icon}
                        active={!!(selected & b.flag)} onClick={() => onChange(selected ^ b.flag)} />
                ))}
            </div>
            <SectionLabel style={{ marginTop: 8 }}>{getLocalizedBadgeLabel("Evolving Nitro Badge")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={getLocalizedBadgeLabel("None")} active={nitroType === -1} onClick={() => onNitroType(-1)} />
                {NITRO_LEVELS.map((n, i) => {
                    const nLabel = isFr
                        ? n.label.replace("mois", "mois").replace("0 mois", "0 mois")
                        : n.label.replace(" (0 mois)", " (0 months)").replace(" (1 mois)", " (1 month)").replace(" mois)", " months)");
                    return (
                        <BadgeBtn key={i} label={nLabel} icon={n.icon} active={nitroType === i} onClick={() => {
                            onNitroType(i);
                        }} />
                    );
                })}
            </div>
            <SectionLabel style={{ marginTop: 8 }}>{getLocalizedBadgeLabel("Special Badges")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={getLocalizedBadgeLabel("Completed a quest")}
                    icon="https://cdn.discordapp.com/badge-icons/7d9ae358c8c5e118768335dbe68b4fb8.png"
                    active={customIds.includes("quest")}
                    onClick={() => onCustomIds(customIds.includes("quest") ? customIds.filter(x => x !== "quest") : [...customIds, "quest"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Orbs — Apprentice")}
                    icon="https://cdn.discordapp.com/badge-icons/83d8a1eb09a8d64e59233eec5d4d5c2d.png"
                    active={customIds.includes("orbs")}
                    onClick={() => onCustomIds(customIds.includes("orbs") ? customIds.filter(x => x !== "orbs") : [...customIds, "orbs"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Old username")} icon={OLD_NAME_BADGE_ICON} active={hasOldName}
                    onClick={() => onCustomIds(hasOldName ? customIds.filter(x => x !== "oldname") : [...customIds, "oldname"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Level Reached")}
                    icon="https://cdn.discordapp.com/badge-icons/ca105ad9cfc8580c765101d17bbb2323.png"
                    active={customIds.includes("gifting_level")}
                    onClick={() => onCustomIds(customIds.includes("gifting_level") ? customIds.filter(x => x !== "gifting_level") : [...customIds, "gifting_level"])} />
            </div>
            <SectionLabel style={{ marginTop: 8 }}>{getLocalizedBadgeLabel("Gifting Badges")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={getLocalizedBadgeLabel("Gifting Icon")}
                    icon="https://cdn.discordapp.com/badge-icons/64f2413c9b9803661322aaad25826b62.png"
                    active={customIds.includes("gifting_icon")}
                    onClick={() => onCustomIds(customIds.includes("gifting_icon") ? customIds.filter(x => x !== "gifting_icon") : [...customIds, "gifting_icon"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Gifting Patron")}
                    icon="https://cdn.discordapp.com/badge-icons/ac305d1b9481f312ce4419e7f8296558.png"
                    active={customIds.includes("gifting_patron")}
                    onClick={() => onCustomIds(customIds.includes("gifting_patron") ? customIds.filter(x => x !== "gifting_patron") : [...customIds, "gifting_patron"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Gifting Champion")}
                    icon="https://cdn.discordapp.com/badge-icons/8b7792c4f65953d3ff564f23429cb79e.png"
                    active={customIds.includes("gifting_champion")}
                    onClick={() => onCustomIds(customIds.includes("gifting_champion") ? customIds.filter(x => x !== "gifting_champion") : [...customIds, "gifting_champion"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Gifting Luminary")}
                    icon="https://cdn.discordapp.com/badge-icons/3119f5504b2cd09576a323908c7c3517.png"
                    active={customIds.includes("gifting_luminary")}
                    onClick={() => onCustomIds(customIds.includes("gifting_luminary") ? customIds.filter(x => x !== "gifting_luminary") : [...customIds, "gifting_luminary"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Gifting Hero")}
                    icon="https://cdn.discordapp.com/badge-icons/77d65b1f210014a11eb1582ee06ab684.png"
                    active={customIds.includes("gifting_hero")}
                    onClick={() => onCustomIds(customIds.includes("gifting_hero") ? customIds.filter(x => x !== "gifting_hero") : [...customIds, "gifting_hero"])} />
                <BadgeBtn label={getLocalizedBadgeLabel("Gifting Legend")}
                    icon="https://cdn.discordapp.com/badge-icons/7fe346cfc5da1340087d8759a9e7a395.png"
                    active={customIds.includes("gifting_legend")}
                    onClick={() => onCustomIds(customIds.includes("gifting_legend") ? customIds.filter(x => x !== "gifting_legend") : [...customIds, "gifting_legend"])} />
            </div>
            {hasOldName && (
                <div className="cp-field" style={{ marginTop: 6 }}>
                    <SectionLabel style={{ marginTop: 0 }}>{isFr ? "Ancien nom d'utilisateur affiché" : "Old username displayed in tooltip"}</SectionLabel>
                    <input className="cp-input" value={oldName} placeholder="OldUser#0000"
                        onChange={e => onOldName(e.target.value)} />
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                        {isFr ? 'Ex : Triggerr#5954 — apparaîtra comme "Connu à l\'origine sous le nom de Triggerr#5954" au survol du badge.' : 'Ex : Triggerr#5954 — will appear as "Originally known as Triggerr#5954" when hovering the badge.'}
                    </div>
                </div>
            )}
            {customIds.includes("gifting_level") && (
                <div className="cp-field" style={{ marginTop: 6 }}>
                    <SectionLabel style={{ marginTop: 0 }}>{isFr ? "Niveau atteint" : "Level reached"}</SectionLabel>
                    <input className="cp-input" type="number" min="1" max="10000" value={levelReached}
                        onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) onLevelReached(val);
                        }} />
                </div>
            )}
            <SectionLabel style={{ marginTop: 8 }}>{getLocalizedBadgeLabel("Server Boost Badges")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={getLocalizedBadgeLabel("None")} active={boostLevel === -1} onClick={() => onBoostLevel(-1)} />
                {BOOST_LABELS.map((lbl, i) => {
                    const bLbl = isFr ? lbl : lbl.replace("Mois", "Months").replace("1 Months", "1 Month");
                    return (
                        <BadgeBtn key={i} label={bLbl} icon={BOOST_ICONS[i]} active={boostLevel === i} onClick={() => onBoostLevel(i)} />
                    );
                })}
            </div>
        </div>
    );
}

function ConnectionsPicker({ connections, onChange }: {
    connections: FakeConnection[];
    onChange: (conns: FakeConnection[]) => void;
}) {
    const [platform, setPlatform] = React.useState(FAKE_PLATFORMS[0].id);
    const [name, setName] = React.useState("");

    const currentPlat = FAKE_PLATFORMS.find(p => p.id === platform) || FAKE_PLATFORMS[0];

    function handleAdd() {
        if (!name.trim()) return;
        let finalUrl = "";
        if (currentPlat.defaultUrl) {
            try { finalUrl = currentPlat.defaultUrl(name.trim()); } catch { }
        } else if (platform === "domain") {
            finalUrl = name.trim().startsWith("http") ? name.trim() : `https://${name.trim()}/`;
        }

        const newConn: FakeConnection = {
            id: Date.now().toString(),
            platform,
            name: name.trim(),
            ...(finalUrl ? { url: finalUrl } : {}),
        };
        onChange([...connections, newConn]);
        setName("");
    }

    function handleRemove(id: string) {
        onChange(connections.filter(c => c.id !== id));
    }

    const previewUrl = currentPlat.defaultUrl && name.trim() ? currentPlat.defaultUrl(name.trim()) : (platform === "domain" && name.trim() ? (name.trim().startsWith("http") ? name.trim() : `https://${name.trim()}/`) : "");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header info */}
            <div style={{
                padding: "14px 16px",
                background: "rgba(88, 101, 242, 0.08)",
                border: "1px solid rgba(88, 101, 242, 0.2)",
                borderRadius: 12,
                fontSize: 13,
                color: "#dbdee1",
                lineHeight: 1.5
            }}>
                <strong>{t("Profile Connections")}</strong>
                <br />
                {t("Add social links or custom domains (e.g. nightcord.st, X @tag, GitHub, Spotify, TikTok). These connections will appear directly on your Discord profile.")}
            </div>

            {/* List of active connections */}
            <div>
                <SectionLabel>{t("Configured Connections")} ({connections.length})</SectionLabel>
                {connections.length === 0 ? (
                    <div style={{
                        padding: "20px",
                        textAlign: "center",
                        background: "#2b2d31",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.05)",
                        color: "var(--text-muted)",
                        fontSize: 13
                    }}>
                        {t("No connections added yet. Fill out the form below to add one.")}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {connections.map(c => {
                            const pObj = FAKE_PLATFORMS.find(p => p.id === c.platform) || FAKE_PLATFORMS[0];
                            return (
                                <div key={c.id} style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 14px",
                                    background: "#2b2d31",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.06)"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            background: "#1e1f22",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center"
                                        }}>
                                            <img src={pObj.icon} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
                                        </div>
                                        <div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14, color: "#fff" }}>
                                                <span>{c.name}</span>
                                                <VerifiedBadge />
                                                <span style={{ fontSize: 11, color: "#949ba4", fontWeight: 400 }}>({pObj.label})</span>
                                            </div>
                                            {c.url && (
                                                <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#00a8fc", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                    {c.url} ↗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <button className="cp-clear-btn" onClick={() => handleRemove(c.id)} title={t("Remove")}>
                                        <CloseIcon />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="cp-divider" />

            {/* Form section */}
            <div>
                <SectionLabel>{t("Add New Connection")}</SectionLabel>

                {/* Grid selection for fast platform picking — expanded height so all options fit nicely */}
                <div style={{ marginBottom: 16 }}>
                    <SectionLabel style={{ marginTop: 0, fontSize: 11 }}>{t("Select Platform")}</SectionLabel>
                    <div className="cp-custom-scroll" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(115px, 1fr))", gap: 8, paddingRight: 4 }}>
                        {FAKE_PLATFORMS.map(p => (
                            <div
                                key={p.id}
                                onClick={() => setPlatform(p.id)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "9px 12px",
                                    borderRadius: 8,
                                    background: platform === p.id ? "rgba(88, 101, 242, 0.2)" : "#2b2d31",
                                    border: platform === p.id ? "1px solid #5865f2" : "1px solid transparent",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease"
                                }}
                            >
                                <img src={p.icon} alt="" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: platform === p.id ? 700 : 500, color: platform === p.id ? "#fff" : "#dbdee1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {p.label.split(" ")[0]}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Form fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Field
                        label={platform === "domain" ? t("Domain / Website Name (e.g. nightcord.st)") : t("Account Name / Username")}
                        value={name}
                        placeholder={currentPlat.placeholder || "midnightcord"}
                        onChange={setName}
                    />

                    {/* Live Preview Card */}
                    {name.trim() && (
                        <div style={{ marginTop: 8 }}>
                            <SectionLabel style={{ fontSize: 11 }}>{t("Live Profile Preview")}</SectionLabel>
                            <div style={{
                                padding: "10px 14px",
                                background: "#111214",
                                borderRadius: 8,
                                border: "1px solid #2b2d31",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between"
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <img src={currentPlat.icon} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
                                    <div>
                                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                                            {name}
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                                        </div>
                                        {previewUrl && <div style={{ fontSize: 11, color: "#949ba4" }}>{previewUrl}</div>}
                                    </div>
                                </div>
                                <span style={{ fontSize: 11, color: "#fff", fontWeight: 600, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.15)", padding: "3px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <VerifiedBadge /> {t("Verified")}
                                </span>
                            </div>
                        </div>
                    )}

                    <button
                        className="cp-btn cp-btn-primary"
                        onClick={handleAdd}
                        disabled={!name.trim()}
                        style={{ marginTop: 10, alignSelf: "flex-start", opacity: name.trim() ? 1 : 0.5 }}
                    >
                        + {t("Add Connection")}
                    </button>
                </div>
            </div>
        </div>
    );
}

function forceAccountPanelRerender() {
    try {
        if (UserStore && UserStore.emitChange) UserStore.emitChange();

        // Force UserProfileStore (side profile panel and popouts)
        if (UserProfileStore && UserProfileStore.emitChange) UserProfileStore.emitChange();

        // Force MultiAccountStore to re-notify the "Switch Account" switcher
        const WP = (Vencord as any).Webpack;
        const MAS = WP?.findByProps?.("getUsers", "getValidUsers", "getHasLoggedInAccounts");
        if (MAS && MAS.emitChange) MAS.emitChange();

        // We DO NOT dispatch USER_SETTINGS_PROTO_UPDATE here anymore as it wipes user settings (theme, folders, nitro)
        // Restart full DOM scan
        if (isEnabled) startDomObserver();
        else stopDomObserver();
    } catch { }
}

function CustomProfileModal({ rootProps }: { rootProps: any; }) {
    const myId = AuthenticationStore?.getId?.() || "";
    const [selectedAccountId, setSelectedAccountId] = React.useState(myId);
    const [data, setData] = React.useState<CustomProfileData>(() => ({ ...(allAccountsData[myId] || storedData || {}) }));
    const [saving, setSaving] = React.useState(false);
    const nitroLevel = data.nitroLevel ?? -1;
    const boostLevel = data.boostMonths ?? -1;
    const customIds = data.customBadgeIds ?? [];
    const oldName = data.oldName ?? "";
    const levelReached = data.levelReached ?? 1;
    const [shareEnabled, setShareEnabled] = React.useState(!!Settings.syncOwnCustomProfile);

    async function toggleShareProfile(v: boolean) {
        if (v) {
            try {
                const oauthData = await beginDiscordOAuth();
                const clientId = new URL(oauthData.url).searchParams.get("client_id") ?? "";
                openModal((p: any) => <OAuth2AuthorizeModal
                    {...p}
                    scopes={oauthData.scopes}
                    responseType="code"
                    redirectUri={oauthData.redirectUri}
                    permissions={0n}
                    clientId={clientId}
                    cancelCompletesFlow={false}
                    callback={async ({ location }: { location: string; }) => {
                        if (!location) return;
                        try {
                            const res = await fetch(location, { headers: { Accept: "application/json" } });
                            const json = await res.json();
                            if (json?.token) {
                                await storeToken(json.token);
                                Settings.syncOwnCustomProfile = true;
                                Settings.seeAllCustomProfile = true;
                                setShareEnabled(true);

                                // Push what is currently in the form right away instead of
                                // waiting for the user to remember to hit "Save" afterwards.
                                // Enabling sync should sync immediately, not on a later click,
                                // otherwise anyone who already had edits pending loses them
                                // (they stay local-only until a Save that may never happen).
                                const currentData = { ...data };
                                if (selectedAccountId === myId) {
                                    allAccountsData[myId] = currentData;
                                    allAccountsEnabled[myId] = true;
                                    storedData = currentData;
                                    isEnabled = true;
                                    saveDataSync(storedData, true);
                                    saveAllDataSync();
                                    DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
                                    DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });
                                    cachedFakeUser = null;
                                    cachedOriginalUser = null;
                                    leCacheU = null;
                                    leCacheI = null;
                                    cacheDatesR = [];
                                    cacheDatesF = [];
                                    _dataVersion++;
                                    forceAccountPanelRerender();
                                }

                                const dataToSync = { ...currentData };
                                delete dataToSync.username;
                                delete dataToSync.globalName;
                                delete dataToSync.avatar;
                                delete dataToSync.bio;
                                delete dataToSync.pronouns;
                                delete dataToSync.email;
                                delete dataToSync.phone;
                                delete dataToSync.copiedUserId;
                                saveOwnPluginConfig("customProfile", json.token, { ...dataToSync, private: false }).then(() => {
                                    publicProfilesCache.delete(myId);
                                }).catch(e => {
                                    console.error("[CustomProfile] Immediate sync after enabling failed:", e);
                                });
                            }
                        } catch (e) {
                            console.error("[CustomProfile] OAuth callback error:", e);
                        }
                    }}
                />);
            } catch (e) {
                console.error("[CustomProfile] OAuth initiation failed:", e);
            }
        } else {
            Settings.syncOwnCustomProfile = false;
            Settings.seeAllCustomProfile = false;
            setShareEnabled(false);
            getStoredToken().then(token => {
                if (token) {
                    saveOwnPluginConfig("customProfile", token, { private: true }).catch(() => { });
                    publicProfilesCache.delete(myId);
                }
            });
        }
    }

    // Retrieve all connected accounts
    const accounts = React.useMemo(() => {
        try {
            // Tentative 1: via MultiAccountStore global
            const MAS = (window as any).Vencord?.Webpack?.findByProps?.("getUsers", "getValidUsers");
            if (MAS?.getUsers) {
                const users = MAS.getUsers();
                if (Array.isArray(users) && users.length > 0) return users;
            }

            // Tentative 2: via le store interne
            const internalStore = (window as any).Vencord?.Webpack?.findStore?.("MultiAccountStore");
            if (internalStore?.getUsers) {
                const users = internalStore.getUsers();
                if (Array.isArray(users) && users.length > 0) return users;
            }
        } catch (e) { console.error("[CustomProfile] Failed to fetch accounts:", e); }

        const me = UserStore.getCurrentUser();
        // Pour debug: si on ne trouve qu'un compte, on simule quand même pour voir si la barre s'affiche
        return me ? [me, { ...me, id: "debug-placeholder", username: "Second Account?",
     globalName: "Simulation" }] : [];
    }, []);

    // When changing selected account, load its data
    React.useEffect(() => {
        const newData = allAccountsData[selectedAccountId] || {};
        setData({ ...newData });
    }, [selectedAccountId]);

    function set<K extends keyof CustomProfileData>(key: K, val: CustomProfileData[K]) {
        setData(d => ({ ...d, [key]: val }));
    }

    async function save() {
        try {
            setSaving(true);
            const savedData = { ...data };

            // Save in multi-accounts storage
            allAccountsData[selectedAccountId] = savedData;
            allAccountsEnabled[selectedAccountId] = true;

            // If it's the active account, update globals
            if (selectedAccountId === myId) {
                storedData = savedData;
                isEnabled = true;
                saveDataSync(storedData, true);
                cachedFakeUser = null;
                cachedOriginalUser = null;
                leCacheU = null;
                leCacheI = null;
                cacheDatesR = [];
                cacheDatesF = [];
                _dataVersion++;

                if (Settings.syncOwnCustomProfile) {
                    const dataToSync = { ...savedData };
                    delete dataToSync.username;
                    delete dataToSync.globalName;
                    delete dataToSync.avatar;
                    delete dataToSync.bio;
                    delete dataToSync.pronouns;
                    delete dataToSync.email;
                    delete dataToSync.phone;
                    delete dataToSync.copiedUserId;

                    getStoredToken().then(token => {
                        if (token) {
                            // private: false ensures others can fetch it via /public endpoint
                            saveOwnPluginConfig("customProfile", token, { ...dataToSync, private: false }).then(() => {
                                // Invalidate our own cache so others see updated data immediately
                                publicProfilesCache.delete(myId);
                            }).catch(e => {
                                console.error("[CustomProfile] Failed to sync to cloud:", e);
                            });
                        } else {
                            // No token yet — open OAuth to get one, then sync
                            beginDiscordOAuth().then(oauthData => {
                                const clientId = new URL(oauthData.url).searchParams.get("client_id") ?? "";
                                openModal((p: any) => <OAuth2AuthorizeModal
                                    {...p}
                                    scopes={oauthData.scopes}
                                    responseType="code"
                                    redirectUri={oauthData.redirectUri}
                                    permissions={0n}
                                    clientId={clientId}
                                    cancelCompletesFlow={false}
                                    callback={async ({ location }: { location: string }) => {
                                        try {
                                            const res = await fetch(location);
                                            const json = await res.json();
                                            if (json?.token) {
                                                await storeToken(json.token);
                                                saveOwnPluginConfig("customProfile", json.token, { ...dataToSync, private: false }).then(() => {
                                                    publicProfilesCache.delete(myId);
                                                }).catch(e => console.error("[CustomProfile] Failed to sync after OAuth:", e));
                                            }
                                        } catch (e) {
                                            console.error("[CustomProfile] OAuth callback error:", e);
                                        }
                                    }}
                                />);
                            }).catch(e => console.error("[CustomProfile] OAuth initiation failed:", e));
                        }
                    });
                }
            }

            // Save all in localStorage + IndexedDB
            saveAllDataSync();
            DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
            DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });

            updateCachedRealData();
            forceAccountPanelRerender();
        } catch (err) {
            console.error("[CustomProfile] save error:", err);
        } finally {
            setSaving(false);
            rootProps.onClose();
        }
    }

    async function reset() {
        delete allAccountsData[selectedAccountId];
        delete allAccountsEnabled[selectedAccountId];

        if (selectedAccountId === myId) {
            storedData = {};
            isEnabled = false;
            saveDataSync({}, false);
            cachedFakeUser = null;
            cachedOriginalUser = null;
            _trueOriginalUser = null;
            leCacheU = null;
            leCacheI = null;
            cacheDatesR = [];
            cacheDatesF = [];
            _dataVersion++;

            // Push private:true to server so others immediately stop seeing the profile
            if (Settings.syncOwnCustomProfile) {
                getStoredToken().then(token => {
                    if (token) {
                        saveOwnPluginConfig("customProfile", token, { private: true }).catch(() => {});
                        // Also clear our own entry from public cache
                        publicProfilesCache.delete(myId);
                    }
                });
            }
        }

        saveAllDataSync();
        DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
        DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });
        DataStore.set(DS_KEY, {}).catch(() => { });
        DataStore.set(DS_ENABLED, false).catch(() => { });

        forceAccountPanelRerender();
        rootProps.onClose();
    }

    const [activeTab, setActiveTab] = React.useState("general");
    const accentHex = data.accentColor != null ? "#" + data.accentColor.toString(16).padStart(6, "0") : "";

    return (
        <ModalRoot {...rootProps} className="cp-modal-root" size="large">
            <ModalHeader separator={false}>
                <div className="cp-header">
                    <EditIcon size={20} />
                    <span className="cp-header-title">{t("Custom Profile")}</span>
                </div>
                <div style={{ marginLeft: "auto", marginRight: 8, minWidth: 200 }}>
                    <Select
                        options={accounts.map((acc: any) => ({
                            value: acc.id,
                            label: acc.globalName || acc.username,
                        }))}
                        isSelected={(v: string) => v === selectedAccountId}
                        select={(v: string) => setSelectedAccountId(v)}
                        serialize={(v: string) => v}
                        renderOptionLabel={(o: any) => (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <img
                                    src={IconUtils.getUserAvatarURL(accounts.find((a: any) => a.id === o.value) || { id: o.value }, false, 20)}
                                    style={{ borderRadius: "50%", width: 20, height: 20 }}
                                />
                                {o.label}
                            </div>
                        )}
                        renderOptionValue={(selected: any[]) => {
                            const option = selected[0];
                            if (!option) return t("Select Account");
                            return (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <img
                                        src={IconUtils.getUserAvatarURL(accounts.find((a: any) => a.id === option.value) || { id: option.value }, false, 20)}
                                        style={{ borderRadius: "50%", width: 20, height: 20 }}
                                    />
                                    {option.label}
                                </div>
                            );
                        }}
                    />
                </div>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 0, overflow: 'hidden' }}>
                <div className="cp-layout">
                    <div className="cp-tabs">
                        <div className={`cp-tab ${activeTab === 'general' ? 'cp-tab--active' : ''}`} onClick={() => setActiveTab('general')}>{t("General")}</div>
                        <div className={`cp-tab ${activeTab === 'aesthetics' ? 'cp-tab--active' : ''}`} onClick={() => setActiveTab('aesthetics')}>{t("Aesthetics")}</div>
                        <div className={`cp-tab ${activeTab === 'badges' ? 'cp-tab--active' : ''}`} onClick={() => setActiveTab('badges')}>{t("Badges & Effects")}</div>
                        <div className={`cp-tab ${activeTab === 'connections' ? 'cp-tab--active' : ''}`} onClick={() => setActiveTab('connections')}>{t("Connections")}</div>
                    </div>
                    <div className="cp-settings-content">
                        {activeTab === 'general' && (
                            <>
                                <Toggle
                                    label={t("Share my Custom Profile")}
                                    sublabel={t("Lets other Midnightcord users see your Custom Profile, and lets you see theirs")}
                                    checked={shareEnabled}
                                    onChange={toggleShareProfile}
                                />
                                <div style={{
                                    padding: "16px", background: "rgba(250, 166, 26, 0.05)",
                                    border: "1px solid rgba(250, 166, 26, 0.15)", borderRadius: 12, display: "flex", gap: 16, marginBottom: 24
                                }}>
                                    <span style={{ fontSize: 24, lineHeight: 1 }}>⚠️</span>
                                    <span style={{ color: "rgba(250, 166, 26, 0.9)", fontSize: 14, lineHeight: 1.5, fontWeight: 500 }}>
                                        {t("This requires Discord authorization. Once enabled, everyone using Midnightcord will be able to see your Custom Profile, and you will be able to see theirs.")}
                                    </span>
                                </div>
                                <Field label={t("Username")} value={data.username ?? ""} placeholder="my_username_00" onChange={v => set("username", v)} />
                                <Field label={t("Display name")} value={data.globalName ?? ""} placeholder="My Name" onChange={v => set("globalName", v)} />
                                <Field label={t("Bio")} value={data.bio ?? ""} placeholder={t("My description...")} onChange={v => set("bio", v)} />
                                <Field label={t("Pronouns")} value={data.pronouns ?? ""} placeholder={t("he/him")} onChange={v => set("pronouns", v)} />
                                <Field label={t("Account creation date")} value={data.createdAt ?? ""} placeholder="2010-06-29" type="date" onChange={v => set("createdAt", v)} />
                                <div className="cp-divider" />
                                <Field label={t("Email address (local display)")} value={data.email ?? ""} placeholder="exemple@mail.com" onChange={v => set("email", v)} />
                                <Field label={t("Phone (local display)")} value={data.phone ?? ""} placeholder="+33 6 00 00 00 00" onChange={v => set("phone", v)} />
                            </>
                        )}
                        {activeTab === 'aesthetics' && (
                            <>
                                <Toggle label={t("Simulate Nitro")} sublabel={t("Enables banner and profile color")} checked={data.nitro ?? false} onChange={v => set("nitro", v)} />
                                <ImageUpload label={t("Profile picture")} value={data.avatar ?? ""} onChange={v => set("avatar", v)} />
                                {data.nitro && <ImageUpload label={t("Banner")} value={data.banner ?? ""} onChange={v => set("banner", v)} />}
                                <div className="cp-field">
                                    <SectionLabel>{t("Profile color (Nitro — gradient possible)")}</SectionLabel>
                                    <div className="cp-color-row" style={{ marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, color: "var(--text-muted)", width: 60 }}>{t("Color 1")}</span>
                                        <input type="color" value={accentHex || "#5865f2"} onChange={e => { const n = parseInt(e.target.value.replace("#", ""), 16); if (!isNaN(n)) set("accentColor", n); }} className="cp-color-swatch" />
                                        <input value={accentHex} placeholder="#5865f2" onChange={e => { const h = e.target.value.replace("#", ""); const n = parseInt(h, 16); if (!isNaN(n) && h.length === 6) set("accentColor", n); else if (!e.target.value || e.target.value === "#") set("accentColor", undefined); }} className="cp-input cp-color-input" />
                                        {data.accentColor != null && <button className="cp-clear-btn" onClick={() => set("accentColor", undefined)}><CloseIcon /></button>}
                                    </div>
                                    <div className="cp-color-row">
                                        <span style={{ fontSize: 13, color: "var(--text-muted)", width: 60 }}>{t("Color 2")}</span>
                                        {(() => {
                                            const hex2 = data.accentColor2 != null ? "#" + data.accentColor2.toString(16).padStart(6, "0") : ""; return (<>
                                                <input type="color" value={hex2 || "#eb459e"} onChange={e => { const n = parseInt(e.target.value.replace("#", ""), 16); if (!isNaN(n)) set("accentColor2", n); }} className="cp-color-swatch" />
                                                <input value={hex2} placeholder="#eb459e (optional)" onChange={e => { const h = e.target.value.replace("#", ""); const n = parseInt(h, 16); if (!isNaN(n) && h.length === 6) set("accentColor2", n); else if (!e.target.value || e.target.value === "#") set("accentColor2", undefined); }} className="cp-input cp-color-input" />
                                                {data.accentColor2 != null && <button className="cp-clear-btn" onClick={() => set("accentColor2", undefined)}><CloseIcon /></button>}
                                            </>);
                                        })()}
                                    </div>
                                </div>
                            </>
                        )}
                        {activeTab === 'badges' && (
                            <>
                                <BadgePicker
                                    selected={data.badgeFlags ?? 0} onChange={v => set("badgeFlags", v)}
                                    nitroType={nitroLevel} onNitroType={v => {
                                        set("nitroLevel", v as any);
                                        if (v >= 0) {
                                            set("nitro", true);
                                        } else {
                                            // v === -1 = None selected → disable nitro simulation
                                            set("nitro", false);
                                        }
                                    }}
                                    boostLevel={boostLevel} onBoostLevel={v => set("boostMonths", v)}
                                    customIds={customIds} onCustomIds={v => set("customBadgeIds", v)}
                                    oldName={oldName} onOldName={v => set("oldName", v)}
                                    levelReached={levelReached} onLevelReached={v => set("levelReached", v)}
                                />
                                <div className="cp-divider" />
                                <div className="cp-field">
                                    <SectionLabel>{t("Avatar decoration")}</SectionLabel>
                                    <div className="cp-effect-grid">
                                        <button
                                            onClick={() => set("decorationAsset", undefined)}
                                            className={`cp-effect-chip ${!data.decorationAsset ? "cp-effect-chip--on" : ""}`}
                                        >
                                            <span className="cp-effect-none-icon">✕</span>
                                            {t("None")}
                                        </button>
                                        {AVATAR_DECORATIONS.map(dec => (
                                            <button key={dec.id}
                                                onClick={() => set("decorationAsset", data.decorationAsset === dec.id ? undefined : dec.id)}
                                                className={`cp-effect-chip ${data.decorationAsset === dec.id ? "cp-effect-chip--on" : ""}`}
                                                title={dec.label}
                                            >
                                                <img
                                                    src={getDecorationUrl(dec.id)}
                                                    alt=""
                                                    className="cp-effect-chip-img"
                                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                />
                                                {dec.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="cp-divider" />
                                <div className="cp-field">
                                    <SectionLabel>{t("Profile Effect")}</SectionLabel>
                                    <div className="cp-effect-grid">
                                        <button
                                            onClick={() => set("profileEffectId", undefined)}
                                            className={`cp-effect-chip ${!data.profileEffectId ? "cp-effect-chip--on" : ""}`}
                                        >
                                            <span className="cp-effect-none-icon">✕</span>
                                            {t("None")}
                                        </button>
                                        {PROFILE_EFFECTS.map(eff => (
                                            <button key={eff.id}
                                                onClick={() => set("profileEffectId", data.profileEffectId === eff.id ? undefined : eff.id)}
                                                className={`cp-effect-chip ${data.profileEffectId === eff.id ? "cp-effect-chip--on" : ""}`}
                                                title={eff.label}
                                            >
                                                {eff.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        {activeTab === 'connections' && (
                            <ConnectionsPicker
                                connections={data.fakeConnections ?? []}
                                onChange={conns => set("fakeConnections", conns)}
                            />
                        )}
                    </div>
                </div>
            </ModalContent>
            <ModalFooter className="cp-footer">
                <button className="cp-btn cp-btn-ghost" onClick={rootProps.onClose}>{t("Cancel")}</button>
                <button className="cp-btn cp-btn-danger" onClick={reset}><TrashIcon /><span>{t("Reset")}</span></button>
                <button className="cp-btn cp-btn-primary" onClick={save} disabled={saving}><SaveIcon /><span>{saving ? t("Saving...") : t("Save")}</span></button>
            </ModalFooter>
        </ModalRoot>
    );
}

function CustomProfileButton() {
    return <HeaderBarButton icon={() => <EditIcon size={18} />} tooltip={t("Custom Profile")} onClick={() => openModal(props => <CustomProfileModal rootProps={props} />)} />;
}

function CPDMNotice({ userId }: { userId: string; }) {
    const cached = publicProfilesCache.get(userId);

    // Only show if the user has actually modified something visible in their profile
    const data = cached?.fetched ? cached?.data : null;
    const hasRealModifications = data && (
        data.username || data.globalName || data.avatar || data.banner ||
        data.bio || data.pronouns || data.accentColor != null ||
        data.badgeFlags || data.nitro || data.decorationAsset || data.profileEffectId ||
        (data.customBadgeIds && data.customBadgeIds.length > 0) ||
        data.createdAt
    );

    const [showRaw, setShowRaw] = React.useState(false);

    if (!Settings.seeAllCustomProfile || !hasRealModifications) return null;

    return (
        <div style={{
            margin: "8px 0 12px 0",
            padding: "10px 14px",
            background: "rgba(250, 166, 26, 0.1)",
            border: "1px solid rgba(250, 166, 26, 0.4)",
            borderRadius: 6,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
        }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1 }}>
                <span style={{ color: "var(--text-warning, #faa61a)", fontWeight: 600, fontSize: 13 }}>
                    {t("WARNING — This user has CustomProfile enabled. Their profile has been modified.")}
                </span>
                <br />
                <span
                    role="button"
                    style={{ color: "var(--text-link)", fontSize: 12, cursor: "pointer", marginTop: 2, display: "inline-block" }}
                    onClick={() => setShowRaw(r => !r)}
                >
                    {showRaw ? t("Hide raw profile") : t("View raw profile")}
                </span>
                {showRaw && (() => {
                    const data = cached!.data!;
                    const fields: [string, string][] = [];
                    if (data.username) fields.push([t("Username"), data.username]);
                    if (data.globalName) fields.push([t("Display name"), data.globalName]);
                    if (data.bio) fields.push([t("Bio"), data.bio]);
                    if (data.pronouns) fields.push([t("Pronouns"), data.pronouns]);
                    if (data.createdAt) fields.push([t("Account created"), data.createdAt]);
                    if (data.nitro) fields.push(["Nitro", t("Simulated")]);
                    return (
                        <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                            {fields.map(([k, v]) => (
                                <span key={k}><strong>{k}:</strong> {v}</span>
                            ))}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}

export default definePlugin({
    name: "CustomProfile",
    enabledByDefault: true,
    description: "Visually customize your Discord profile (username, PFP, banner, badges, bio...) — persistent, only visible to you.",
    authors: [{ name: "Midnightcord",
     id: 0n }],
    dependencies: ["HeaderBarAPI", "ContextMenuAPI"],

    headerBarButton: {
        icon: EditIcon,
    },

    patches: [
        {
            // Inject the CustomProfile warning notice into DM welcome screens
            find: "getRecipientId()",
            noWarn: true,
            replacement: {
                match: /(children:\[)(\i\.isDM\(\).{0,300})/,
                replace: "$1$self.renderDMNotice(this.props),$2"
            }
        },
        {
            find: '"SHOULD_LOAD");',
            replacement: {
                match: /\i(?:\?)?.getPreviewBanner\(\i,\i,\i\)(?=.{0,100}"COMPLETE")/,
                replace: "$self.patchBannerUrl(arguments[0])||$&"
            }
        },
        // UserProfileStore patch removed — caused invisible channels for members
        // with high permissions. getUserProfile is called by Discord to calculate
        // VIEW_CHANNEL and other permissions. virtualMerge with premiumType:2 corrupted
        // these calculations even with isMe() guard. DomObserver + fakeCurrentUser are enough.
        {
            find: ".WIDGETS_RTC_UPSELL_COACHMARK)",
            replacement: {
                match: /currentUser:(\i)(?=.{0,200}voiceDb)/,
                replace: "currentUser:$self.fakeCurrentUser($1)"
            }
        },
        {
            find: "DISPLAY_NAME",
            noWarn: true,
            replacement: {
                match: /(?<=currentUser:\i,user:)(\i)/,
                replace: "$self.fakeCurrentUser($1)"
            }
        },
        {
            find: "obfuscatedEmail",
            noWarn: true,
            replacement: [
                {
                    match: /obfuscatedEmail:(\i)/,
                    replace: "obfuscatedEmail:$self.fakeObfuscatedEmail($1)"
                },
                {
                    match: /obfuscatedPhone:(\i)/,
                    replace: "obfuscatedPhone:$self.fakeObfuscatedPhone($1)"
                }
            ]
        },
        {
            find: "isHoveringOrFocusing",
            replacement: [
                {
                    noWarn: true,
                    match: /user:([A-Za-z_$][\w$]*),displayProfile:([A-Za-z_$][\w$]*),themeType/,
                    replace: "user:$self.fakeCurrentUser($1),displayProfile:$2,themeType"
                }
            ]
        },
        {
            find: "AccountPanel",
            replacement: [
                {
                    match: /user:([a-zA-Z0-9_]+),/,
                    replace: "user:$self.fakeCurrentUser($1),"
                }
            ]
        },
        {
            find: "UserAccountSettings",
            replacement: [
                {
                    match: /user:([a-zA-Z0-9_]+),/,
                    replace: "user:$self.fakeCurrentUser($1),"
                },
                {
                    match: /email:([^,}]+),/,
                    replace: "email:$self.fakeObfuscatedEmail($1),"
                }
            ]
        },
        {
            find: "getObfuscatedEmail",
            replacement: [
                {
                    match: /obfuscatedEmail:([^,}]+)/g,
                    replace: "obfuscatedEmail:$self.fakeObfuscatedEmail($1)"
                },
                {
                    match: /obfuscatedPhone:([^,}]+)/g,
                    replace: "obfuscatedPhone:$self.fakeObfuscatedPhone($1)"
                }
            ]
        },
        {
            find: "getAvatarDecorationURL:",
            noWarn: true,
            replacement: {
                match: /(?<=function \i\((\i)\){)(?=.{0,20}let\s*\{avatarDecoration)/,
                replace: "const _cpDecoUrl=$self.getDecorationURLForUser($1);if(_cpDecoUrl)return _cpDecoUrl;"
            }
        },
        {
            find: "isAvatarDecorationAnimating:",
            noWarn: true,
            group: true,
            replacement: [
                {
                    match: /(?<=\.avatarDecoration,guildId:\i\}\)\),)(?<=user:(\i).+?)/,
                    replace: "_cpAvatarDeco=$self.getAvatarDecoOverride($1),"
                },
                {
                    match: /(?<={avatarDecoration:).{1,20}?(?=,)(?<=avatarDecorationOverride:(\i).+?)/,
                    replace: "$1??_cpAvatarDeco??($&)"
                },
                {
                    match: /(?<=size:\i\}\),\[)/,
                    replace: "_cpAvatarDeco,"
                }
            ]
        }
    ],

    _copiedUserId: null as string | null,
    _otherProfilesCache: new Map<string, { input: any, output: any, timestamp: number }>(),

    isCopiedUser(userId: string | null | undefined): boolean {
        if (!isEnabled || !userId || !this._copiedUserId) return false;
        return userId === this._copiedUserId;
    },

    fakeCurrentUser(user: any) {
        if (!user || (!isEnabled && this._forceNative !== true) || !isMe(user.id)) return user;

        const hasCustomUsername = !!storedData.username;
        const hasCustomGlobalName = !!storedData.globalName;
        const hasCustomEmail = !!storedData.email;
        const hasCustomPhone = !!storedData.phone;
        const hasCustomBio = !!storedData.bio;
        const hasCustomPronouns = !!storedData.pronouns;
        const hasCustomCreatedAt = !!storedData.createdAt;
        const hasCustomDeco = !!storedData.decorationAsset;
        const hasCustomBadgeFlags = storedData.badgeFlags != null;
        const hasCustomNitro = !!storedData.nitro;
        const hasCustomConnections = Array.isArray(storedData.fakeConnections) && storedData.fakeConnections.length > 0;

        if (!hasCustomUsername && !hasCustomGlobalName && !hasCustomEmail && !hasCustomPhone && !hasCustomBio && !hasCustomPronouns && !hasCustomCreatedAt && !hasCustomDeco && !hasCustomBadgeFlags && !hasCustomNitro && !hasCustomConnections) {
            return user;
        }

        // Fast cache: if same user + same data, return existing proxy
        if (cachedOriginalUser === user && cachedFakeUser && cachedDataHash === _dataVersion) {
            return cachedFakeUser;
        }

        const proxy = new Proxy(user, {
            get(target, prop, receiver) {
                const desc = Object.getOwnPropertyDescriptor(target, prop);
                if (desc && !desc.configurable) {
                    return Reflect.get(target, prop, target);
                }

                if (prop === "__cp_isClone") return true;
                if (prop === "username" || prop === "legacyUsername") {
                    return isEnabled && storedData.username ? storedData.username : target.username;
                }
                if (prop === "globalName") {
                    return isEnabled && storedData.globalName ? storedData.globalName : target.globalName;
                }
                if (prop === "displayName") {
                    return isEnabled ? (storedData.globalName || target.displayName || target.globalName || target.username) : target.displayName;
                }
                if (prop === "email") {
                    return isEnabled && storedData.email ? storedData.email : target.email;
                }
                if (prop === "phone") {
                    return isEnabled && storedData.phone ? storedData.phone : target.phone;
                }
                if (prop === "createdAt") {
                    if (isEnabled && storedData.createdAt) {
                        return new Date(storedData.createdAt + "T12:00:00Z");
                    }
                    return target.createdAt;
                }
                if (prop === "avatarDecoration") {
                    return isEnabled && storedData.decorationAsset ? null : target.avatarDecoration;
                }
                if (prop === "avatarDecorationData") {
                    if (isEnabled && storedData.decorationAsset) {
                        return {
                            asset: storedData.decorationAsset,
                            skuId: storedData.decorationAsset
                        };
                    }
                    return target.avatarDecorationData;
                }
                if (prop === "publicFlags" || prop === "flags") {
                    return isEnabled && storedData.badgeFlags != null ? storedData.badgeFlags : target[prop];
                }
                if (prop === "premiumType") {
                    return isEnabled && storedData.nitro ? 2 : target.premiumType;
                }
                if (prop === "premiumSince") {
                    if (isEnabled && storedData.nitro) {
                        const seedBase = target.id || "self";
                        const nl = storedData.nitroLevel ?? 0;
                        return getFakeNitroDate(nl, seedBase);
                    }
                    return target.premiumSince;
                }
                if (prop === "premiumGuildSince") {
                    if (isEnabled && storedData.nitro) {
                        const bm = storedData.boostMonths ?? -1;
                        if (bm >= 0) {
                            const seedBase = target.id || "self";
                            return getFakeBoostDate(bm, seedBase);
                        }
                    }
                    return target.premiumGuildSince;
                }
                if (prop === "getTag") {
                    return () => {
                        const name = storedData.username || target.username;
                        return target.discriminator === "0" ? name : `${name}#${target.discriminator}`;
                    };
                }
                if (prop === "getGlobalName") {
                    return () => isEnabled && storedData.globalName ? storedData.globalName : target.globalName;
                }
                if (prop === "toString") {
                    return () => isEnabled ? (storedData.globalName || target.displayName || target.globalName || target.username) : target.toString();
                }

                const value = Reflect.get(target, prop, target);
                if (typeof value === "function") {
                    return value.bind(target);
                }
                return value;
            },
            set(target, prop, value) {
                return Reflect.set(target, prop, value, target);
            }
        });

        cachedOriginalUser = user;
        cachedFakeUser = proxy;
        cachedDataHash = _dataVersion;

        return proxy;
    },

    fakeOtherUser(realUser: any, data: CustomProfileData) {
        if (!realUser || !realUser.id) return realUser;

        const hasCustomUsername = !!data.username;
        const hasCustomGlobalName = !!data.globalName;
        const hasCustomAvatar = !!data.avatar;
        const hasCustomEmail = !!data.email;
        const hasCustomPhone = !!data.phone;
        const hasCustomCreatedAt = !!data.createdAt;
        const hasCustomDeco = !!data.decorationAsset;
        const hasCustomBadgeFlags = data.badgeFlags != null;
        const hasCustomNitro = !!data.nitro;

        if (!hasCustomUsername && !hasCustomGlobalName && !hasCustomAvatar && !hasCustomEmail && !hasCustomPhone && !hasCustomCreatedAt && !hasCustomDeco && !hasCustomBadgeFlags && !hasCustomNitro) {
            return realUser;
        }

        return new Proxy(realUser, {
            get(target, prop, receiver) {
                const desc = Object.getOwnPropertyDescriptor(target, prop);
                if (desc && !desc.configurable) {
                    return Reflect.get(target, prop, target);
                }

                if (prop === "__cp_isClone") return true;
                if (prop === "username") {
                    return data.username || target.username;
                }
                if (prop === "globalName") {
                    return data.globalName || target.globalName;
                }
                if (prop === "displayName") {
                    return data.globalName || target.displayName || target.globalName || target.username;
                }
                if (prop === "avatar") {
                    return data.avatar || target.avatar;
                }
                if (prop === "email") {
                    return data.email || target.email;
                }
                if (prop === "phone") {
                    return data.phone || target.phone;
                }
                if (prop === "createdAt") {
                    if (data.createdAt) {
                        return new Date(data.createdAt + "T12:00:00Z");
                    }
                    return target.createdAt;
                }
                if (prop === "__cp_fakeCreatedAt") {
                    if (data.createdAt) {
                        return new Date(data.createdAt + "T12:00:00Z").getTime();
                    }
                    return undefined;
                }
                if (prop === "avatarDecoration") {
                    return data.decorationAsset ? null : target.avatarDecoration;
                }
                if (prop === "avatarDecorationData") {
                    if (data.decorationAsset) {
                        return {
                            asset: data.decorationAsset,
                            skuId: data.decorationAsset
                        };
                    }
                    return target.avatarDecorationData;
                }
                if (prop === "publicFlags" || prop === "flags") {
                    return data.badgeFlags != null ? data.badgeFlags : target[prop];
                }
                if (prop === "premiumType") {
                    return data.nitro ? 2 : target.premiumType;
                }
                if (prop === "premiumSince") {
                    if (data.nitro) {
                        const seedBase = target.id || "other";
                        const nl = data.nitroLevel ?? 0;
                        return getFakeNitroDate(nl, seedBase);
                    }
                    return target.premiumSince;
                }
                if (prop === "premiumGuildSince") {
                    if (data.nitro) {
                        const bm = data.boostMonths ?? -1;
                        if (bm >= 0) {
                            const seedBase = target.id || "other";
                            return getFakeBoostDate(bm, seedBase);
                        }
                    }
                    return target.premiumGuildSince;
                }
                if (prop === "getTag") {
                    return () => {
                        const name = data.username || target.username;
                        return target.discriminator === "0" ? name : `${name}#${target.discriminator}`;
                    };
                }
                if (prop === "getGlobalName") {
                    return () => data.globalName || target.globalName;
                }
                if (prop === "toString") {
                    return () => data.globalName || target.displayName || target.globalName || target.username;
                }

                const value = Reflect.get(target, prop, target);
                if (typeof value === "function") {
                    return value.bind(target);
                }
                return value;
            },
            set(target, prop, value) {
                return Reflect.set(target, prop, value, target);
            }
        });
    },

    hookOtherUserProfile(profile: any, data: CustomProfileData, timestamp = 0) {
        if (!profile) return profile;

        const hasDeco = !!data.decorationAsset;
        const hasNitro = !!data.nitro;
        const hasBadgeFlags = data.badgeFlags != null;
        const hasBio = !!data.bio;
        const hasPronouns = !!data.pronouns;
        const hasAccentColor = data.accentColor != null;
        const hasBanner = !!data.banner;
        const hasEffect = !!data.profileEffectId;
        const hasCustomBadges = Array.isArray(data.customBadgeIds) && data.customBadgeIds.length > 0;

        if (!hasDeco && !hasNitro && !hasBadgeFlags && !hasBio && !hasPronouns && !hasAccentColor && !hasBanner && !hasEffect && !hasCustomBadges) {
            return profile;
        }

        const userId = profile.userId;
        if (userId) {
            const cachedVal = this._otherProfilesCache.get(userId);
            if (cachedVal && cachedVal.input === profile && cachedVal.timestamp === timestamp) {
                return cachedVal.output;
            }
        }

        try {
            const merged: any = {};

            if (data.bio) merged.bio = data.bio;
            if (data.pronouns) merged.pronouns = data.pronouns;
            if (data.accentColor != null) merged.accentColor = data.accentColor;
            if (data.banner) merged.banner = data.banner;

            if (data.decorationAsset) {
                const decoData = {
                    asset: data.decorationAsset,
                    skuId: data.decorationAsset
                };
                merged.avatarDecoration = null;
                merged.avatarDecorationData = decoData;
            }

            const overrideFlags = data.nitro || data.badgeFlags != null;

            if (overrideFlags) {
                merged.premiumType = data.nitro ? 2 : 0;

                if (data.nitro) {
                    if (data.accentColor != null) {
                        const c2 = data.accentColor2 ?? data.accentColor;
                        merged.themeColors = [data.accentColor, c2];
                    }
                    const nl = data.nitroLevel ?? 0;
                    const seedBase = profile?.userId || data.copiedUserId || "other";
                    const since = getFakeNitroDate(nl, seedBase);
                    merged.premiumSince = since;

                    const bm = data.boostMonths ?? -1;
                    if (bm >= 0) {
                        merged.premiumGuildSince = getFakeBoostDate(bm, seedBase);
                    } else {
                        merged.premiumGuildSince = null;
                    }
                } else {
                    merged.premiumSince = null;
                    merged.premiumGuildSince = null;
                }

                merged.publicFlags = (data.badgeFlags != null) ? data.badgeFlags : profile.publicFlags;
            } else if (data.nitro === false) {
                merged.premiumType = profile.premiumType ?? 0;
                merged.premiumSince = null;
                merged.premiumGuildSince = null;
            }

            let badgesArr = overrideFlags ? [] : (Array.isArray(profile.badges) ? [...profile.badges] : []);
            
            if (overrideFlags) {
                if (data.nitro) {
                    const nl = data.nitroLevel ?? 0;
                    const LEVEL_MONTHS = [0, 1, 3, 6, 12, 24, 36, 60, 72];
                    const nitroHash = NITRO_LEVELS[nl]?.icon.split("/").pop()?.replace(".png", "") || "2ba85e8026a8614b640c2837bcdfe21b";
                    const months = LEVEL_MONTHS[nl] ?? 1;
                    const nitroId = `premium_tenure_${months}_month_v2`;

                    const seedBase = profile?.userId || data.copiedUserId || "other";
                    const since = getFakeNitroDate(nl, seedBase);
                    merged.premiumSince = since;
                    badgesArr.push({
                        id: nitroId,
                        icon: nitroHash,
                        description: formatNitroBadgeDesc(since)
                    });
                } else {
                    merged.premiumSince = null;
                    merged.premiumGuildSince = null;
                }
                
                const wantedFlags = (data.badgeFlags != null) ? data.badgeFlags : profile.publicFlags;
                merged.publicFlags = wantedFlags;
            }

            const customIds = data.customBadgeIds ?? [];
            const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
            const hasBadge = (badgeId: string) => {
                const targetNorm = normalizeBadgeId(badgeId);
                return badgesArr.some(b => {
                    if (!b) return false;
                    const bId = b.id || b.key || "";
                    if (bId === badgeId || normalizeBadgeId(bId) === targetNorm) return true;
                    const iconKey = getBadgeIconKey(b.icon || b.iconSrc || "");
                    if (iconKey && (badgeId.includes(iconKey) || iconKey.includes(badgeId))) return true;
                    return false;
                });
            };

            const wantedFlags = merged.publicFlags ?? 0;
            if (wantedFlags) {
                for (const bDef of BADGES) {
                    if (wantedFlags & bDef.flag) {
                        const bId = getBadgeId(bDef.key);
                        if (!hasBadge(bId)) {
                            const hash = bDef.icon.split("/").pop()?.replace(".png", "") || "";
                            badgesArr.push({
                                id: bId,
                                icon: hash,
                                description: getStandardBadgeDesc(bDef.key)
                            });
                        }
                    }
                }
            }

            if (customIds.includes("quest") && !hasBadge("quest_completed")) badgesArr.push({ id: "quest_completed", icon: "7d9ae358c8c5e118768335dbe68b4fb8", description: getLocalizedBadgeLabel("Completed a quest"), link: "https://discord.com/discovery/quests" });
            if (customIds.includes("orbs") && !hasBadge("orb_profile_badge")) badgesArr.push({ id: "orb_profile_badge", icon: "83d8a1eb09a8d64e59233eec5d4d5c2d", description: getLocalizedBadgeLabel("Orbs — Apprentice") });
            if (customIds.includes("oldname") && !hasBadge("legacy_username")) {
                const dText = data.oldName ? (isFr ? "Connu à l'origine sous le nom de " + data.oldName : "Originally known as " + data.oldName) : (isFr ? "Connu à l'origine sous le nom de ..." : "Originally known as ...");
                badgesArr.push({ id: "legacy_username", icon: "6de6d34650760ba5551a79732e98ed60", description: dText });
            }
            if (customIds.includes("gifting_icon") && !hasBadge("gifting_icon")) badgesArr.push({ id: "gifting_icon", icon: "64f2413c9b9803661322aaad25826b62", description: getGiftingBadgeDesc("icon") });
            if (customIds.includes("gifting_patron") && !hasBadge("gifting_patron")) badgesArr.push({ id: "gifting_patron", icon: "ac305d1b9481f312ce4419e7f8296558", description: getGiftingBadgeDesc("patron") });
            if (customIds.includes("gifting_champion") && !hasBadge("gifting_champion")) badgesArr.push({ id: "gifting_champion", icon: "8b7792c4f65953d3ff564f23429cb79e", description: getGiftingBadgeDesc("champion") });
            if (customIds.includes("gifting_luminary") && !hasBadge("gifting_luminary")) badgesArr.push({ id: "gifting_luminary", icon: "3119f5504b2cd09576a323908c7c3517", description: getGiftingBadgeDesc("luminary") });
            if (customIds.includes("gifting_hero") && !hasBadge("gifting_hero")) badgesArr.push({ id: "gifting_hero", icon: "77d65b1f210014a11eb1582ee06ab684", description: getGiftingBadgeDesc("hero") });
            if (customIds.includes("gifting_legend") && !hasBadge("gifting_legend")) badgesArr.push({ id: "gifting_legend", icon: "7fe346cfc5da1340087d8759a9e7a395", description: getGiftingBadgeDesc("legend") });
            if (customIds.includes("gifting_level") && !hasBadge("gifting_level")) {
                const lvl = data.levelReached ?? 1;
                badgesArr.push({ id: "gifting_level", icon: "ca105ad9cfc8580c765101d17bbb2323", description: getLevelBadgeDesc(lvl) });
            }

            // FILTER OUT custom client badges to prevent double rendering/flicker
            badgesArr = badgesArr.filter(b => {
                if (!b) return false;
                const id = (b.id || "").toLowerCase();
                const desc = (b.description || "").toLowerCase();
                if (id.includes("vencord") || desc.includes("vencord")) return false;
                if (id.includes("equicord") || desc.includes("equicord")) return false;
                if (id.includes("midnightcord") || desc.includes("midnightcord")) return false;
                if (id.includes("illegalcord") || desc.includes("illegalcord")) return false;
                if (id.includes("contributor") || desc.includes("contributor")) return false;
                if (id === "nc-badge") return false;
                return true;
            });

            badgesArr = deduplicateProfileBadges(badgesArr);
            merged.badges = badgesArr;

            if (data.profileEffectId) {
                merged.profileEffectId = data.profileEffectId;
                merged.profileEffect = { expireAt: null, skuId: data.profileEffectId };
                if (!merged.premiumType) merged.premiumType = profile.premiumType || 2;
            }

            if (data.fakeConnections && data.fakeConnections.length > 0) {
                const fakeAccs = formatFakeConnections(data.fakeConnections);
                const existing = profile.connectedAccounts || profile.connected_accounts || [];
                merged.connectedAccounts = [...existing, ...fakeAccs];
                merged.connected_accounts = [...existing, ...fakeAccs];
            }

            const result = cleanMerge(profile, merged);
            if (userId) {
                this._otherProfilesCache.set(userId, { input: profile, output: result, timestamp });
            }
            return result;
        } catch (e) {
            return profile;
        }
    },

    _cachedProfile: null as any,
    _cachedProfileInput: null as any,
    _cachedProfileVersion: 0,

    hookUserProfile(profile: any) {
        if (!profile || !isEnabled) return profile;

        const hasDeco = !!storedData.decorationAsset;
        const hasNitro = !!storedData.nitro;
        const hasBadgeFlags = storedData.badgeFlags != null;
        const hasBio = !!storedData.bio;
        const hasPronouns = !!storedData.pronouns;
        const hasAccentColor = storedData.accentColor != null;
        const hasBanner = !!storedData.banner;
        const hasEffect = !!storedData.profileEffectId;
        const hasCustomBadges = Array.isArray(storedData.customBadgeIds) && storedData.customBadgeIds.length > 0;
        const hasConnections = Array.isArray(storedData.fakeConnections) && storedData.fakeConnections.length > 0;

        if (!hasDeco && !hasNitro && !hasBadgeFlags && !hasBio && !hasPronouns && !hasAccentColor && !hasBanner && !hasEffect && !hasCustomBadges && !hasConnections) {
            return profile;
        }

        // Cache: if same profile + same data version
        if (this._cachedProfileInput === profile && this._cachedProfile && this._cachedProfileVersion === _dataVersion) {
            return this._cachedProfile;
        }
        try {
            const merged: any = {};

            if (storedData.bio) merged.bio = storedData.bio;
            if (storedData.pronouns) merged.pronouns = storedData.pronouns;
            if (storedData.accentColor != null) merged.accentColor = storedData.accentColor;
            if (storedData.banner) merged.banner = storedData.banner;

            if (storedData.decorationAsset) {
                const decoData = {
                    asset: storedData.decorationAsset,
                    skuId: storedData.decorationAsset
                };
                merged.avatarDecoration = null;
                merged.avatarDecorationData = decoData;
            }

            const overrideFlags = isEnabled && (storedData.nitro || storedData.badgeFlags != null);

            if (overrideFlags) {
                merged.premiumType = storedData.nitro ? 2 : 0;

                if (storedData.nitro) {
                    if (storedData.accentColor != null) {
                        const c2 = storedData.accentColor2 ?? storedData.accentColor;
                        merged.themeColors = [storedData.accentColor, c2];
                    }
                    const nl = storedData.nitroLevel ?? 0;
                    const seedBase = UserStore.getCurrentUser()?.id || "self";
                    const since = getFakeNitroDate(nl, seedBase);
                    merged.premiumSince = since;

                    const bm = storedData.boostMonths ?? -1;
                    if (bm >= 0) {
                        merged.premiumGuildSince = getFakeBoostDate(bm, seedBase);
                    } else {
                        merged.premiumGuildSince = null;
                    }
                } else {
                    merged.premiumSince = null;
                    merged.premiumGuildSince = null;
                }

                merged.publicFlags = (storedData.badgeFlags != null) ? storedData.badgeFlags : profile.publicFlags;
            } else if (isEnabled && storedData.nitro === false) {
                merged.premiumType = profile.premiumType ?? 0;
                merged.premiumSince = profile.premiumSince ?? null;
                merged.premiumGuildSince = profile.premiumGuildSince ?? null;
            } else {
                if (profile.premiumType) merged.premiumType = profile.premiumType;
                if (profile.premiumSince) merged.premiumSince = profile.premiumSince;
                if (profile.premiumGuildSince) merged.premiumGuildSince = profile.premiumGuildSince;
            }

            let badgesArr = overrideFlags ? [] : (Array.isArray(profile.badges) ? [...profile.badges] : []);

            if (overrideFlags) {
                if (storedData.nitro) {
                    const nl = storedData.nitroLevel ?? 0;
                    const LEVEL_MONTHS = [0, 1, 3, 6, 12, 24, 36, 60, 72];
                    const nitroHash = NITRO_LEVELS[nl]?.icon.split("/").pop()?.replace(".png", "") || "2ba85e8026a8614b640c2837bcdfe21b";
                    const months = LEVEL_MONTHS[nl] ?? 1;
                    const nitroId = `premium_tenure_${months}_month_v2`;

                    const seedBase = UserStore.getCurrentUser()?.id || "self";
                    const since = getFakeNitroDate(nl, seedBase);
                    merged.premiumSince = since;
                    badgesArr.push({
                        id: nitroId,
                        icon: nitroHash,
                        description: formatNitroBadgeDesc(since)
                    });

                    const bm = storedData.boostMonths ?? -1;
                    if (bm >= 0) {
                        const BOOST_LVLS = ["lvl1", "lvl2", "lvl3", "lvl4", "lvl5", "lvl6", "lvl7", "lvl8", "lvl9"];
                        const boostHash = BOOST_ICONS[bm]?.split("/").pop()?.replace(".png", "") || "51040c70d4f20a921ad6674ff86fc95c";
                        const boostLvl = BOOST_LVLS[bm] || "lvl1";
                        const boostSince = getFakeBoostDate(bm, seedBase);
                        merged.premiumGuildSince = boostSince;

                        badgesArr.push({
                            id: `guild_booster_${boostLvl}`,
                            icon: boostHash,
                            description: formatBoostBadgeDesc(boostSince),
                            link: "https://discord.com/settings/guild-boosting"
                        });
                    } else {
                        merged.premiumGuildSince = null;
                    }
                } else {
                    merged.premiumSince = null;
                    merged.premiumGuildSince = null;
                }
                const wantedFlags = (storedData.badgeFlags != null) ? storedData.badgeFlags : profile.publicFlags;
                merged.publicFlags = wantedFlags;
            }

            const customIds = storedData.customBadgeIds ?? [];
            const isFr = getDiscordLocale().toLowerCase().startsWith("fr");
            const hasBadge = (badgeId: string) => {
                const targetNorm = normalizeBadgeId(badgeId);
                return badgesArr.some(b => {
                    if (!b) return false;
                    const bId = b.id || b.key || "";
                    if (bId === badgeId || normalizeBadgeId(bId) === targetNorm) return true;
                    const iconKey = getBadgeIconKey(b.icon || b.iconSrc || "");
                    if (iconKey && (badgeId.includes(iconKey) || iconKey.includes(badgeId))) return true;
                    return false;
                });
            };

            const wantedFlags = merged.publicFlags ?? 0;
            if (wantedFlags) {
                for (const bDef of BADGES) {
                    if (wantedFlags & bDef.flag) {
                        const bId = getBadgeId(bDef.key);
                        if (!hasBadge(bId)) {
                            const hash = bDef.icon.split("/").pop()?.replace(".png", "") || "";
                            badgesArr.push({
                                id: bId,
                                icon: hash,
                                description: getStandardBadgeDesc(bDef.key)
                            });
                        }
                    }
                }
            }

            if (customIds.includes("quest") && !hasBadge("quest_completed")) badgesArr.push({ id: "quest_completed", icon: "7d9ae358c8c5e118768335dbe68b4fb8", description: getLocalizedBadgeLabel("Completed a quest"), link: "https://discord.com/discovery/quests" });
            if (customIds.includes("orbs") && !hasBadge("orb_profile_badge")) badgesArr.push({ id: "orb_profile_badge", icon: "83d8a1eb09a8d64e59233eec5d4d5c2d", description: getLocalizedBadgeLabel("Orbes — Apprentice") });
            if (customIds.includes("oldname") && !hasBadge("legacy_username")) {
                const dText = storedData.oldName ? (isFr ? "Connu à l'origine sous le nom de " + storedData.oldName : "Originally known as " + storedData.oldName) : (isFr ? "Connu à l'origine sous le nom de ..." : "Originally known as ...");
                badgesArr.push({ id: "legacy_username", icon: "6de6d34650760ba5551a79732e98ed60", description: dText });
            }
            if (customIds.includes("gifting_icon") && !hasBadge("gifting_icon")) badgesArr.push({ id: "gifting_icon", icon: "64f2413c9b9803661322aaad25826b62", description: getGiftingBadgeDesc("icon") });
            if (customIds.includes("gifting_patron") && !hasBadge("gifting_patron")) badgesArr.push({ id: "gifting_patron", icon: "ac305d1b9481f312ce4419e7f8296558", description: getGiftingBadgeDesc("patron") });
            if (customIds.includes("gifting_champion") && !hasBadge("gifting_champion")) badgesArr.push({ id: "gifting_champion", icon: "8b7792c4f65953d3ff564f23429cb79e", description: getGiftingBadgeDesc("champion") });
            if (customIds.includes("gifting_luminary") && !hasBadge("gifting_luminary")) badgesArr.push({ id: "gifting_luminary", icon: "3119f5504b2cd09576a323908c7c3517", description: getGiftingBadgeDesc("luminary") });
            if (customIds.includes("gifting_hero") && !hasBadge("gifting_hero")) badgesArr.push({ id: "gifting_hero", icon: "77d65b1f210014a11eb1582ee06ab684", description: getGiftingBadgeDesc("hero") });
            if (customIds.includes("gifting_legend") && !hasBadge("gifting_legend")) badgesArr.push({ id: "gifting_legend", icon: "7fe346cfc5da1340087d8759a9e7a395", description: getGiftingBadgeDesc("legend") });
            if (customIds.includes("gifting_level") && !hasBadge("gifting_level")) {
                const lvl = storedData.levelReached ?? 1;
                badgesArr.push({ id: "gifting_level", icon: "ca105ad9cfc8580c765101d17bbb2323", description: getLevelBadgeDesc(lvl) });
            }

            // FILTER OUT custom client badges to prevent double rendering/flicker
            badgesArr = badgesArr.filter(b => {
                if (!b) return false;
                const id = (b.id || "").toLowerCase();
                const desc = (b.description || "").toLowerCase();
                if (id.includes("vencord") || desc.includes("vencord")) return false;
                if (id.includes("equicord") || desc.includes("equicord")) return false;
                if (id.includes("midnightcord") || desc.includes("midnightcord")) return false;
                if (id.includes("illegalcord") || desc.includes("illegalcord")) return false;
                if (id.includes("contributor") || desc.includes("contributor")) return false;
                if (id === "nc-badge") return false;
                return true;
            });

            badgesArr = deduplicateProfileBadges(badgesArr);
            merged.badges = badgesArr;

            if (storedData.profileEffectId) {
                merged.profileEffectId = storedData.profileEffectId;
                merged.profileEffect = { expireAt: null, skuId: storedData.profileEffectId };
                if (!merged.premiumType) merged.premiumType = profile.premiumType || 2;
            }

            if (storedData.fakeConnections && storedData.fakeConnections.length > 0) {
                const fakeAccs = formatFakeConnections(storedData.fakeConnections);
                const existing = profile.connectedAccounts || profile.connected_accounts || [];
                merged.connectedAccounts = [...existing, ...fakeAccs];
                merged.connected_accounts = [...existing, ...fakeAccs];
            }

            const result = cleanMerge(profile, merged);
            this._cachedProfileInput = profile;
            this._cachedProfile = result;
            this._cachedProfileVersion = _dataVersion;
            return result;
        } catch {
            return profile;
        }
    },

    // Variant of hookUserProfile used exclusively for getGuildMemberProfile.
    // Guild member profiles are merged with the global user profile by Discord
    // when rendering a popout — if we inject badges into BOTH, Discord shows
    // them twice.  This variant applies every customisation EXCEPT badges so
    // that badges are only ever injected once (via getUserProfile).
    hookUserProfileGuildOnly(profile: any) {
        if (!profile || !isEnabled) return profile;

        const hasDeco = !!storedData.decorationAsset;
        const hasNitro = !!storedData.nitro;
        const hasBio = !!storedData.bio;
        const hasPronouns = !!storedData.pronouns;
        const hasAccentColor = storedData.accentColor != null;
        const hasBanner = !!storedData.banner;
        const hasEffect = !!storedData.profileEffectId;
        const hasConnections = Array.isArray(storedData.fakeConnections) && storedData.fakeConnections.length > 0;

        if (!hasDeco && !hasNitro && !hasBio && !hasPronouns && !hasAccentColor && !hasBanner && !hasEffect && !hasConnections) {
            return profile;
        }

        try {
            const merged: any = {};

            if (storedData.bio) merged.bio = storedData.bio;
            if (storedData.pronouns) merged.pronouns = storedData.pronouns;
            if (storedData.accentColor != null) merged.accentColor = storedData.accentColor;
            if (storedData.banner) merged.banner = storedData.banner;

            if (storedData.decorationAsset) {
                merged.avatarDecoration = null;
                merged.avatarDecorationData = {
                    asset: storedData.decorationAsset,
                    skuId: storedData.decorationAsset
                };
            }

            if (storedData.nitro) {
                merged.premiumType = 2;
                if (storedData.accentColor != null) {
                    const c2 = storedData.accentColor2 ?? storedData.accentColor;
                    merged.themeColors = [storedData.accentColor, c2];
                }
                const nl = storedData.nitroLevel ?? 0;
                const seedBase = UserStore.getCurrentUser()?.id || "self";
                merged.premiumSince = getFakeNitroDate(nl, seedBase);
                const bm = storedData.boostMonths ?? -1;
                if (bm >= 0) {
                    merged.premiumGuildSince = getFakeBoostDate(bm, seedBase);
                } else {
                    merged.premiumGuildSince = null;
                }
            } else if (storedData.nitro === false) {
                merged.premiumType = profile.premiumType ?? 0;
                merged.premiumSince = profile.premiumSince ?? null;
                merged.premiumGuildSince = profile.premiumGuildSince ?? null;
            }

            if (storedData.profileEffectId) {
                merged.profileEffectId = storedData.profileEffectId;
                merged.profileEffect = { expireAt: null, skuId: storedData.profileEffectId };
                if (!merged.premiumType) merged.premiumType = profile.premiumType || 2;
            }

            if (storedData.fakeConnections && storedData.fakeConnections.length > 0) {
                const fakeAccs = formatFakeConnections(storedData.fakeConnections);
                const existing = profile.connectedAccounts || profile.connected_accounts || [];
                merged.connectedAccounts = [...existing, ...fakeAccs];
                merged.connected_accounts = [...existing, ...fakeAccs];
            }

            // NOTE: badges are intentionally NOT injected here.
            // Discord merges guild member profile badges with user profile badges
            // in the popout UI; injecting into both would double every badge.
            // Badges are only injected via hookUserProfile (getUserProfile).

            return cleanMerge(profile, merged);
        } catch {
            return profile;
        }
    },

    fakeObfuscatedEmail(real: string | null) {
        if (!isEnabled || !storedData.email || !real) return real;
        // Discord often expects to see s***@d***.com format
        const fake = storedData.email;
        const atIdx = fake.indexOf("@");
        if (atIdx <= 1) return fake;
        return fake[0] + "***" + fake.slice(atIdx - 1);
    },

    fakeObfuscatedPhone(real: string | null) {
        if (!isEnabled || !storedData.phone || !real) return real;
        const fake = storedData.phone;
        if (fake.length < 4) return fake;
        return "***-***-" + fake.slice(-4);
    },

    renderDMNotice(props: any) {
        try {
            if (!Settings.seeAllCustomProfile) return null;
            const channel = props?.channel;
            if (!channel?.isDM?.()) return null;
            const recipientId = channel.recipients?.[0];
            if (!recipientId) return null;
            fetchPublicProfileIfNeeded(recipientId);
            const cached = publicProfilesCache.get(recipientId);
            if (!cached?.fetched || !cached?.data) return null;
            const d = cached.data;
            const hasRealModifications = d.username || d.globalName || d.avatar || d.banner ||
                d.bio || d.pronouns || d.accentColor != null || d.badgeFlags ||
                d.nitro || d.decorationAsset || d.profileEffectId || (d.customBadgeIds && d.customBadgeIds.length > 0) || d.createdAt;
            if (!hasRealModifications) return null;
            return <CPDMNotice userId={recipientId} />;
        } catch { return null; }
    },

    /**
     * Called by the Webpack patch on getAvatarDecorationURL.
     * Returns our custom decoration URL for the current user (or other users
     * via the public cache), or null to let Discord use the default logic.
     */
    getDecorationURLForUser(opts: any) {
        try {
            // opts is the argument object passed to getAvatarDecorationURL
            // It contains { avatarDecoration, avatarDecorationData, userId, canAnimate, ... }
            const decoData = opts?.avatarDecorationData ?? opts?.avatarDecoration;
            const userId = opts?.userId;
            const canAnimate = opts?.canAnimate ?? opts?.animated ?? true;

            // ── Own user ──────────────────────────────────────────────────────
            if (isEnabled && storedData.decorationAsset) {
                const myId = UserStore.getCurrentUser()?.id;
                const isOurs =
                    decoData?.asset === storedData.decorationAsset ||
                    decoData?.skuId === storedData.decorationAsset ||
                    (userId && userId === myId);
                if (isOurs) {
                    const asset = storedData.decorationAsset;
                    return getDecorationUrl(asset, canAnimate);
                }
            }

            // ── Other users via public cache ──────────────────────────────────
            if (Settings.seeAllCustomProfile && userId && !isMe(userId)) {
                const cached = publicProfilesCache.get(userId);
                if (cached?.fetched && cached.data?.decorationAsset) {
                    const asset = cached.data.decorationAsset!;
                    return getDecorationUrl(asset, canAnimate);
                }
            }
        } catch { }
        return null;
    },

    /**
     * Called by the Webpack patch on the Avatar component (isAvatarDecorationAnimating).
     * Returns the avatarDecorationData object to inject, or null.
     */
    getAvatarDecoOverride(user: any) {
        try {
            const uid = user?.id;
            if (!uid) return null;

            // ── Own user ──────────────────────────────────────────────────────
            if (isEnabled && isMe(uid) && storedData.decorationAsset) {
                return { asset: storedData.decorationAsset, skuId: storedData.decorationAsset };
            }

            // ── Other users via public cache ──────────────────────────────────
            if (Settings.seeAllCustomProfile && !isMe(uid)) {
                const cached = publicProfilesCache.get(uid);
                if (cached?.fetched && cached.data?.decorationAsset) {
                    return { asset: cached.data.decorationAsset!, skuId: cached.data.decorationAsset! };
                }
            }
        } catch { }
        return null;
    },

    patchBannerUrl({ displayProfile }: any) {
        try {
            const uid = displayProfile?.userId;
            if (!uid) return null;

            // Own user
            if (isEnabled && storedData.nitro && storedData.banner && isMe(uid)) {
                return storedData.banner;
            }

            // Other users via public cache
            checkSeeAllSettingChange();
            if (Settings.seeAllCustomProfile && !isMe(uid)) {
                const cached = publicProfilesCache.get(uid);
                if (cached?.fetched && cached.data?.banner && cached.data?.nitro) {
                    return cached.data.banner;
                }
            }
            return null;
        } catch { return null; }
    },

    toolboxActions: {
        [t("Open Custom Profile")]() { openModal(props => <CustomProfileModal rootProps={props} />); },
    },

    _origGetUserAvatarURL: null as any,
    _origExtractTimestamp: null as any,
    _forceNative: false, // Tool variable for local reset

    async start() {
        document.addEventListener("visibilitychange", handleVisibilityChange);
        applyAvatarPatchEarly();
        addHeaderBarButton("custom-profile-btn", () => <CustomProfileButton />, 10);
        addContextMenuPatch("user-context", userContextMenuPatch);

        // Auto-sync own profile to cloud on startup if option enabled
        loadData().then(() => {
            if (Settings.syncOwnCustomProfile && storedData && Object.keys(storedData).length > 0) {
                const dataToSync = { ...storedData };
                delete dataToSync.username;
                delete dataToSync.globalName;
                delete dataToSync.avatar;
                delete dataToSync.bio;
                delete dataToSync.pronouns;
                delete dataToSync.email;
                delete dataToSync.phone;
                delete dataToSync.copiedUserId;

                getStoredToken().then(t => {
                    if (t) {
                        saveOwnPluginConfig("customProfile", t, { ...dataToSync, private: false }).catch(e => {
                            console.error("[CustomProfile] Auto-sync on startup failed:", e);
                        });
                    }
                });
            }
        });

        // Listen for account changes to sync data
        FluxDispatcher.subscribe("CONNECTION_OPEN", onAccountSwitch);

        // ── INVARIANT GUARD ──────────────────────────────────────────────────
        // Discord's UserStore_CURRENT_USER_UPDATE validates that premiumType
        // does not change between two successive CURRENT_USER_UPDATE dispatches
        // *unless* the user has staff flags.  Our prototype hook makes every
        // read of premiumType return 2 (Nitro), so when a profile edit comes
        // back from the gateway with the real premiumType (0), Discord sees
        // 2→0 and throws:
        //   Invariant Violation: Premium type should not change for non-staff
        // Fix: subscribe BEFORE Discord's stores, intercept the payload, and
        // set premiumType to whatever the prototype would return for this user.
        FluxDispatcher.subscribe("CURRENT_USER_UPDATE", _onCurrentUserUpdate);

        // PERFECT AND SECURE NATIVE INTERCEPTION ON USER STORE.
        try {
            const US = (Vencord as any).Webpack?.findByProps?.("getCurrentUser", "getUser");
            if (US && !US._cp_perfect_hook) {
                const origCurrent = US.getCurrentUser.bind(US);

                let _lastRealUser: any = null;
                let _lastFakeResult: any = null;
                let _lastCacheVersion = -1;

                US.getCurrentUser = () => {
                    const realUser = origCurrent();

                    // --- DEFERRED PROTOTYPE PATCH TO FORCE NATIVE POPOUTS ---
                    // Run this as soon as we have a valid user object to get the constructor
                    if (realUser && !realUser.constructor.prototype._cp_premium_hook) {
                        try {
                            const UserClass = realUser.constructor;
                            
                            // Patch isPremium if it's a method
                            if (typeof UserClass.prototype.isPremium === "function") {
                                const origIsPremium = UserClass.prototype.isPremium;
                                UserClass.prototype.isPremium = function() {
                                    if (isEnabled && isMe(this.id) && storedData.nitro) return true;
                                    if (Settings.seeAllCustomProfile && publicProfilesCache.get(this.id)?.data?.nitro) return true;
                                    return origIsPremium.call(this);
                                };
                            }

                            // Comprehensive staff method & property patches to prevent Invariant Violation: Premium type should not change for non-staff users
                            const staffProps = ["isStaff", "isStaffPersonal", "isStaffUser", "hasStaffFlag", "isStaffMember"];
                            for (const prop of staffProps) {
                                try {
                                    const orig = UserClass.prototype[prop];
                                    if (typeof orig === "function") {
                                        UserClass.prototype[prop] = function(this: any) {
                                            const isFake = (isEnabled && isMe(this.id) && storedData.nitro) ||
                                                           (Settings.seeAllCustomProfile && publicProfilesCache.get(this.id)?.data?.nitro);
                                            if (isFake) return true;
                                            return orig.call(this);
                                        };
                                    } else {
                                        Object.defineProperty(UserClass.prototype, prop, {
                                            get() {
                                                const isFake = (isEnabled && isMe(this.id) && storedData.nitro) ||
                                                               (Settings.seeAllCustomProfile && publicProfilesCache.get(this.id)?.data?.nitro);
                                                if (isFake) return true;
                                                return orig ?? false;
                                            },
                                            configurable: true,
                                            enumerable: true
                                        });
                                    }
                                } catch { }
                            }

                            // Define a getter/setter for premiumType to intercept ALL accesses
                            // This ensures even standalone functions reading user.premiumType see the fake value!
                            Object.defineProperty(UserClass.prototype, "premiumType", {
                                get() {
                                    const isFake = (isEnabled && isMe(this.id) && storedData.nitro) || 
                                                   (Settings.seeAllCustomProfile && publicProfilesCache.get(this.id)?.data?.nitro);
                                    if (isFake) {
                                        return 2;
                                    }
                                    return this._realPremiumType !== undefined ? this._realPremiumType : 0;
                                },
                                set(val) {
                                    this._realPremiumType = val;
                                },
                                configurable: true,
                                enumerable: true
                            });

                            UserClass.prototype._cp_premium_hook = true;

                            // Clean up existing own properties in UserStore to force prototype usage
                            const allUsers = US.getUsers ? US.getUsers() : [];
                            for (const u of Object.values(allUsers)) {
                                if (u && typeof u === "object" && Object.prototype.hasOwnProperty.call(u, "premiumType")) {
                                    (u as any)._realPremiumType = (u as any).premiumType;
                                    delete (u as any).premiumType;
                                }
                            }
                        } catch (e) {
                            console.error("[CustomProfile] Failed to patch User prototype", e);
                        }
                    }
                    // --------------------------------------------------------

                    if (realUser) {
                        // Update name cache only when the user object itself changes
                        if (realUser !== _lastRealUser) {
                            if (realUser.username) _realUsername = realUser.username;
                            if (realUser.globalName) _realGlobalName = realUser.globalName;
                        }
                        // Return cached clone if nothing changed
                        if (realUser === _lastRealUser && _lastCacheVersion === _dataVersion && _lastFakeResult) {
                            return _lastFakeResult;
                        }
                        _lastRealUser = realUser;
                        _lastCacheVersion = _dataVersion;
                        _lastFakeResult = this.fakeCurrentUser(realUser);
                        return _lastFakeResult;
                    }
                    return this.fakeCurrentUser(realUser);
                };

                const origGet = US.getUser.bind(US);
                US.getUser = (id: string) => {
                    const user = origGet(id);
                    if (!user) return user;
                    
                    if (isEnabled && isMe(id)) {
                        return this.fakeCurrentUser(user);
                    }
                    
                    // Check if seeAll was just turned off and clear cache if needed
                    checkSeeAllSettingChange();
                    
                    if (Settings.seeAllCustomProfile && !isMe(id)) {
                        const cached = publicProfilesCache.get(id);
                        if (cached?.fetched && cached.data) {
                            return this.fakeOtherUser(user, cached.data);
                        }
                    }
                    
                    return user;
                };
                US._cp_perfect_hook = true;
            }
        } catch { }

        // INTERCEPTION ON GuildMemberStore (for server member list nickname + avatar)
        try {
            const GMS = (Vencord as any).Webpack?.findByProps?.("getMember", "getMembers", "getMemberIds");
            if (GMS && !GMS._cp_member_hook) {
                const origGetMember = GMS.getMember.bind(GMS);
                GMS.getMember = (guildId: string, userId: string) => {
                    const member = origGetMember(guildId, userId);
                    if (!member) return member;

                    // Only patch own user — never expose custom nick to other users' views
                    if (isEnabled && isMe(userId)) {
                        const patched = { ...member };
                        if (storedData.username) patched.nick = storedData.globalName || storedData.username;
                        return patched;
                    }

                    return member;
                };
                GMS._cp_member_hook = true;
            }
        } catch { }

        // INTERCEPTION ON UserProfileStore (for native Nitro/Boost badges in popout/modal profile)
        try {
            const UPS = (Vencord as any).Webpack?.findByProps?.("getUserProfile", "getGuildMemberProfile");
            if (UPS && !UPS._cp_profile_hook) {
                const origGetProfile = UPS.getUserProfile.bind(UPS);
                UPS.getUserProfile = (userId: string) => {
                    try {
                        const profile = origGetProfile(userId);
                        if (!userId) return profile;
                        
                        if (isEnabled && isMe(userId) && profile) {
                            return this.hookUserProfile(profile);
                        }
                        
                        if (Settings.seeAllCustomProfile && !isMe(userId)) {
                            fetchPublicProfileIfNeeded(userId);
                            const cached = publicProfilesCache.get(userId);
                            if (cached?.fetched && cached.data && profile) {
                                return this.hookOtherUserProfile(profile, cached.data, cached.timestamp);
                            }
                        }
                        
                        return profile;
                    } catch (e) {
                        console.error("[CustomProfile] Error in getUserProfile hook:", e);
                        return origGetProfile(userId);
                    }
                };
                const origGetGuild = UPS.getGuildMemberProfile.bind(UPS);
                UPS.getGuildMemberProfile = (userId: string, guildId: string) => {
                    try {
                        const profile = origGetGuild(userId, guildId);
                        if (!userId) return profile;
                        
                        if (isEnabled && isMe(userId) && profile) {
                            // Use the guild-only variant (no badges) to avoid
                            // doubling badges that getUserProfile already injects.
                            return this.hookUserProfileGuildOnly(profile);
                        }
                        
                        if (Settings.seeAllCustomProfile && !isMe(userId)) {
                            fetchPublicProfileIfNeeded(userId);
                            const cached = publicProfilesCache.get(userId);
                            if (cached?.fetched && cached.data && profile) {
                                return this.hookOtherUserProfile(profile, cached.data, cached.timestamp);
                            }
                        }
                        
                        return profile;
                    } catch (e) {
                        console.error("[CustomProfile] Error in getGuildMemberProfile hook:", e);
                        return origGetGuild(userId, guildId);
                    }
                };
                UPS._cp_profile_hook = true;
            }
        } catch { }

        // INTERCEPTION ON ConnectedAccountsStore (for profile edit settings + user profile connections display)
        try {
            const WP = (Vencord as any).Webpack;
            const CAS = WP?.findByProps?.("getAccounts", "getLocalAccounts");
            if (CAS && !CAS._cp_accounts_hook) {
                const origGetAccounts = CAS.getAccounts.bind(CAS);
                CAS.getAccounts = () => {
                    const accounts = origGetAccounts() || [];
                    if (isEnabled && storedData.fakeConnections && storedData.fakeConnections.length > 0) {
                        const fakeAccs = formatFakeConnections(storedData.fakeConnections);
                        return [...accounts, ...fakeAccs];
                    }
                    return accounts;
                };
                CAS._cp_accounts_hook = true;
            }
        } catch { }

        // INTERCEPTION ON MULTI ACCOUNT STORE (For the "Switch Account" menu)
        // Applies custom usernames for ALL accounts in the switcher
        try {
            const WP = (Vencord as any).Webpack;
            const MAS = WP?.findByProps?.("getUsers", "getValidUsers", "getHasLoggedInAccounts");
            if (MAS && !MAS._cp_perfect_hook) {
                function patchAccountUser(u: any) {
                    if (!u?.id) return u;
                    const acctData = allAccountsData[u.id];
                    const acctEnabled = allAccountsEnabled[u.id];
                    if (!acctData || !acctEnabled) return u;
                    const patched: any = { ...u };
                    if (acctData.username) {
                        patched.username = acctData.username;
                        patched.legacyUsername = acctData.username;
                    }
                    if (acctData.globalName) patched.globalName = acctData.globalName;
                    return patched;
                }

                if (MAS.getUsers) {
                    const origGetUsers = MAS.getUsers.bind(MAS);
                    MAS.getUsers = () => {
                        const users = origGetUsers();
                        if (!users || !Array.isArray(users)) return users;
                        return users.map(patchAccountUser);
                    };
                }

                if (MAS.getValidUsers) {
                    const origGetValid = MAS.getValidUsers.bind(MAS);
                    MAS.getValidUsers = () => {
                        const users = origGetValid();
                        if (!users || !Array.isArray(users)) return users;
                        return users.map(patchAccountUser);
                    };
                }

                MAS._cp_perfect_hook = true;
                try { MAS.emitChange?.(); } catch { }
            }
        } catch { }

        // Patch SnowflakeUtils.extractTimestamp pour faker la date de création
        try {
            if (SnowflakeUtils?.extractTimestamp && !this._origExtractTimestamp) {
                this._origExtractTimestamp = SnowflakeUtils.extractTimestamp;
                const origExtract = this._origExtractTimestamp;
                (SnowflakeUtils as any).extractTimestamp = (snowflake: string) => {
                    // Own user
                    if (isEnabled && storedData.createdAt && isMe(snowflake)) {
                        return new Date(storedData.createdAt + "T12:00:00Z").getTime();
                    }
                    // Other users via public cache
                    if (Settings.seeAllCustomProfile && !isMe(snowflake)) {
                        const cached = publicProfilesCache.get(snowflake);
                        if (cached?.fetched && cached.data?.createdAt) {
                            return new Date(cached.data.createdAt + "T12:00:00Z").getTime();
                        }
                    }
                    return origExtract(snowflake);
                };
            }
        } catch { }

        loadData().then(() => {
            updateCachedRealData();
            // Retry avatar patch — may have failed at early boot if module wasn't ready yet
            if (!_avatarPatchApplied) {
                applyAvatarPatchEarly();
            }
            if (isEnabled) {
                forceAccountPanelRerender();
                requestAnimationFrame(() => removeHideStyle());
            } else {
                removeHideStyle();
            }
        });

        // Patch getAvatarDecorationURL pour injecter notre déco uniquement sur notre user
        try {
            const decoMod = (Vencord as any).Webpack?.findByProps?.("getAvatarDecorationURL");
            if (decoMod?.getAvatarDecorationURL) {
                const origDeco = decoMod.getAvatarDecorationURL.bind(decoMod);
                decoMod.getAvatarDecorationURL = (opts: any) => {
                    try {
                        // Discord changed the arg name from `avatarDecoration` → `avatarDecorationData`
                        // Support both shapes plus a plain object passed as first positional arg
                        const decoData = opts?.avatarDecorationData ?? opts?.avatarDecoration ?? opts;
                        const userId = opts?.userId;
                        const canAnimate = opts?.canAnimate ?? opts?.animated ?? true;

                        // Own user decoration — match on asset value injected by our proxy
                        if (isEnabled && storedData.decorationAsset) {
                            const myId = UserStore.getCurrentUser()?.id;
                            const isOurs =
                                // Direct asset match (most reliable)
                                decoData?.asset === storedData.decorationAsset ||
                                // skuId marker we set on the proxy avatarDecorationData
                                decoData?.skuId === storedData.decorationAsset ||
                                // Legacy marker
                                decoData?.skuId === "__fake__" ||
                                // userId fallback (still works in some contexts)
                                (userId && userId === myId);
                            if (isOurs) {
                                const asset = storedData.decorationAsset;
                                return getDecorationUrl(asset, canAnimate);
                            }
                        }

                        // Other users via public cache
                        if (Settings.seeAllCustomProfile) {
                            // Try userId first, then fall back to looking up by asset
                            const lookupId = userId;
                            if (lookupId && !isMe(lookupId)) {
                                const cached = publicProfilesCache.get(lookupId);
                                if (cached?.fetched && cached.data?.decorationAsset) {
                                    const asset = cached.data.decorationAsset!;
                                    return getDecorationUrl(asset, canAnimate);
                                }
                            } else if (!lookupId && decoData?.asset) {
                                // No userId — scan cache for matching asset
                                for (const [uid, entry] of publicProfilesCache) {
                                    if (!isMe(uid) && entry.fetched && entry.data?.decorationAsset === decoData.asset) {
                                        const asset = entry.data.decorationAsset!;
                                        return getDecorationUrl(asset, canAnimate);
                                    }
                                }
                            }
                        }
                    } catch { }
                    return origDeco(opts);
                };
            }
        } catch { }

        if (!_avatarPatchApplied) {
            applyAvatarPatchEarly();
        }

        // Hook GuildMemberStore.getMember — only patches nick for own user
        try {
            if (GuildMemberStore?.getMember && !(GuildMemberStore as any)._cp_member_hook) {
                const _origGetMember = GuildMemberStore.getMember.bind(GuildMemberStore);
                (GuildMemberStore as any).getMember = (guildId: string, userId: string) => {
                    const member = _origGetMember(guildId, userId);
                    try {
                        const myId = UserStore.getCurrentUser()?.id;
                        // Only patch our own member entry
                        if (isEnabled && userId === myId && member) {
                            const customNick = storedData.globalName || storedData.username;
                            if (customNick) {
                                return { ...member, nick: customNick };
                            }
                        }
                    } catch { }
                    return member;
                };
                (GuildMemberStore as any)._cp_member_hook = true;
                (GuildMemberStore as any)._cp_orig_getMember = _origGetMember;
            }
        } catch { }
    },

    userProfileBadges: [
        {
            getBadges({ userId }: { userId: string; }) {
                // Badges are already directly attached to profile.badges in getUserProfile / useUserProfile
                return [];
            }
        } as ProfileBadge
    ] as ProfileBadge[],

    stop() {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        removeHeaderBarButton("custom-profile-btn");
        removeContextMenuPatch("user-context", userContextMenuPatch);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", onAccountSwitch);
        FluxDispatcher.unsubscribe("CURRENT_USER_UPDATE", _onCurrentUserUpdate);
        stopDomObserver();
        removeHideStyle();
        if (this._origExtractTimestamp && SnowflakeUtils) {
            (SnowflakeUtils as any).extractTimestamp = this._origExtractTimestamp;
            this._origExtractTimestamp = null;
        }
        if (this._origGetUserAvatarURL && IconUtils) {
            (IconUtils as any).getUserAvatarURL = this._origGetUserAvatarURL;
            this._origGetUserAvatarURL = null;
        }
        // Clean up GuildMemberStore hook
        try {
            if ((GuildMemberStore as any)?._cp_member_hook) {
                if ((GuildMemberStore as any)._cp_orig_getMember) GuildMemberStore.getMember = (GuildMemberStore as any)._cp_orig_getMember;
                delete (GuildMemberStore as any)._cp_member_hook;
                delete (GuildMemberStore as any)._cp_orig_getMember;
            }
        } catch { }
        // Nettoyer le patch avatarDecoration
        try {
            const myUser = UserStore.getCurrentUser() as any;
            if (myUser) {
                try { delete myUser.avatarDecoration; } catch { }
                try { delete myUser.avatarDecorationData; } catch { }
            }
        } catch { }
    },

    settingsAboutComponent() {
        return <Button onClick={() => openModal(props => <CustomProfileModal rootProps={props} />)}>{t("Open Custom Profile")}</Button>;
    },
});
