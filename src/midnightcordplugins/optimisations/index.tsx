/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { isObject } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { findAll } from "@webpack";

interface SpringModule {
    Globals: {
        assign(options: { skipAnimation: boolean; }): void;
    };
    Springs: object;
}

const log = new Logger("opti");
let ressorts: SpringModule[] = [];
let started = false;
let disableSpring = true;
let noGifAvatars = true;
let noAnimatedEmoji = false;
let noStickers = false;
let noActivities = false;
let limitMsgCache = true;
let noSoundboardPreview = true;
let noVideoAutoplay = false;

const settings = definePluginSettings({
    disableSpringAnimations: {
        type: OptionType.BOOLEAN,
        description: "Désactiver les animations spring de l'interface Discord (boutons, modals, etc.)",
        default: true,
        disabled: () => isPluginEnabled("DisableAnimations"),
        onChange(val: boolean) {
            disableSpring = val;
            if (!started) return;
            if (val && ressorts.length === 0) chargeRessorts();
            majAnimations(val);
        }
    },
    disableTypingDots: {
        type: OptionType.BOOLEAN,
        description: "Désactiver les points \"X est en train d'écrire...\"",
        default: true,
        disabled: () => isPluginEnabled("NoTypingAnimation"),
        restartNeeded: true
    },
    noGifAvatars: {
        type: OptionType.BOOLEAN,
        description: "Bloquer les avatars GIF animés dans les listes et messages",
        default: true,
        restartNeeded: true,
        onChange(v: boolean) { noGifAvatars = v; }
    },
    noAnimatedEmoji: {
        type: OptionType.BOOLEAN,
        description: "Désactiver l'animation des emojis Discord",
        default: false,
        restartNeeded: true,
        onChange(v: boolean) { noAnimatedEmoji = v; }
    },
    noStickers: {
        type: OptionType.BOOLEAN,
        description: "Empêcher l'autoplay des stickers animés Lottie",
        default: false,
        restartNeeded: true,
        onChange(v: boolean) { noStickers = v; }
    },
    noActivities: {
        type: OptionType.BOOLEAN,
        description: "Masquer la section Activités (jeux, Spotify, etc.) dans le panneau membres",
        default: false,
        restartNeeded: true,
        onChange(v: boolean) { noActivities = v; }
    },
    noVideoAutoplay: {
        type: OptionType.BOOLEAN,
        description: "Bloquer l'autoplay des vidéos intégrées dans les messages (MP4, WebM)",
        default: false,
        restartNeeded: true,
        onChange(v: boolean) { noVideoAutoplay = v; }
    },
    noSoundboardPreview: {
        type: OptionType.BOOLEAN,
        description: "Désactiver la prévisualisation audio du soundboard au survol",
        default: true,
        restartNeeded: true,
        onChange(v: boolean) { noSoundboardPreview = v; }
    },
    limitMsgCache: {
        type: OptionType.BOOLEAN,
        description: "Exécuter le nettoyage mémoire (Garbage Collector) sur les canaux inactifs",
        default: true,
        restartNeeded: false,
        onChange(v: boolean) { limitMsgCache = v; if (!v) stopCacheCleaner(); else startCacheCleaner(); }
    },
    reduceFpsBackground: {
        type: OptionType.BOOLEAN,
        description: "Limiter Discord à ~10 FPS quand la fenêtre est en arrière-plan",
        default: true,
        restartNeeded: false,
        onChange(v: boolean) { applyBgFpsPatch(v); }
    },
});

const cacheSettings = () => {
    disableSpring = settings.store.disableSpringAnimations;
    noGifAvatars = settings.store.noGifAvatars;
    noAnimatedEmoji = settings.store.noAnimatedEmoji;
    noStickers = settings.store.noStickers;
    noActivities = settings.store.noActivities;
    noVideoAutoplay = settings.store.noVideoAutoplay;
    noSoundboardPreview = settings.store.noSoundboardPreview;
    limitMsgCache = settings.store.limitMsgCache;
};

const estValide = (v: unknown): v is SpringModule["Globals"] => isObject(v) && "assign" in v && typeof (v as any).assign === "function";

const estModuleSpring = (v: unknown): v is SpringModule => {
    if (!isObject(v)) return false;
    const m = v as Partial<SpringModule>;
    return estValide(m.Globals) && isObject(m.Springs);
};

const chargeRessorts = () => {
    ressorts = findAll(estModuleSpring);
};

const majAnimations = (skip: boolean) => {
    for (const r of ressorts) {
        try { r.Globals.assign({ skipAnimation: skip }); } catch (err) { log.warn("ressort skip fail", err); }
    }
};

let _cacheCleanerInterval: ReturnType<typeof setInterval> | null = null;
const CHANNEL_STALE_MS = 5 * 60 * 1000;

const forceGC = () => {
    try {
        if (typeof (window as any).gc === "function") {
            (window as any).gc();
            setTimeout(() => {
                try {
                    if (typeof (window as any).gc === "function") (window as any).gc();
                } catch {}
            }, 100);
        }
    } catch {}
};

function pruneMessageCaches() {
    // Only call native V8 GC — do NOT mutate or delete MessageStore._channelMessages directly,
    // as wiping channel message objects corrupts Discord's internal pagination state (hasMoreBefore)
    // and causes older DM history to be cut off with a false "start of message history" header.
    forceGC();
}

function startCacheCleaner() {
    if (_cacheCleanerInterval) return;
    _cacheCleanerInterval = setInterval(() => {
        if (!limitMsgCache) return;
        pruneMessageCaches();
    }, CHANNEL_STALE_MS);
}

function stopCacheCleaner() {
    if (_cacheCleanerInterval !== null) {
        clearInterval(_cacheCleanerInterval);
        _cacheCleanerInterval = null;
    }
}

let _origRAF: typeof requestAnimationFrame | null = null;
let _origCancel: typeof cancelAnimationFrame | null = null;
let _bgFpsActive = false;
const BG_FRAME_INTERVAL = 100;
const _rafMap = new Map<number, any>();
let _rafSeq = 0;

function applyBgFpsPatch(enable: boolean) {
    if (enable && !_bgFpsActive) {
        _bgFpsActive = true;
        document.addEventListener("visibilitychange", _onVisChange);
        window.addEventListener("blur", _onBlur);
        window.addEventListener("focus", _onFocus);
        if (document.hidden || !document.hasFocus()) _installRafThrottle();
    } else if (!enable && _bgFpsActive) {
        _bgFpsActive = false;
        document.removeEventListener("visibilitychange", _onVisChange);
        window.removeEventListener("blur", _onBlur);
        window.removeEventListener("focus", _onFocus);
        _uninstallRafThrottle();
    }
}

function _onVisChange() {
    if (document.hidden) {
        _installRafThrottle();
        if (limitMsgCache) pruneMessageCaches();
    } else if (document.hasFocus()) {
        _uninstallRafThrottle();
    }
}

function _onBlur() {
    _installRafThrottle();
    if (limitMsgCache) pruneMessageCaches();
}

function _onFocus() {
    if (!document.hidden) {
        _uninstallRafThrottle();
    }
}

function _installRafThrottle() {
    if (_origRAF || !_bgFpsActive) return;
    _origRAF = window.requestAnimationFrame;
    _origCancel = window.cancelAnimationFrame;
    let _lastT = 0;
    (window as any).requestAnimationFrame = function (cb: FrameRequestCallback) {
        const id = ++_rafSeq;
        const now = performance.now();
        const delay = Math.max(0, BG_FRAME_INTERVAL - (now - _lastT));
        const tId = setTimeout(() => {
            _rafMap.delete(id);
            _lastT = performance.now();
            cb(performance.now());
        }, delay);
        _rafMap.set(id, tId);
        return id;
    };
    window.cancelAnimationFrame = function (id: number) {
        const tId = _rafMap.get(id);
        if (tId !== undefined) {
            clearTimeout(tId);
            _rafMap.delete(id);
        } else if (_origCancel) {
            _origCancel(id);
        }
    };
}

function _uninstallRafThrottle() {
    if (!_origRAF) return;
    window.requestAnimationFrame = _origRAF;
    if (_origCancel) window.cancelAnimationFrame = _origCancel;
    _origRAF = null;
    _origCancel = null;
    for (const tId of _rafMap.values()) {
        clearTimeout(tId);
    }
    _rafMap.clear();
}

const CSS_ID = "midnightcord-opti-css";

function buildAndInjectCss() {
    let css = "";

    if (noGifAvatars) {
        css += `
[class*="listItem"] [class*="avatar"] img[src*=".gif"],
[class*="message"] [class*="avatar"] img[src*=".gif"],
[class*="memberInner"] [class*="avatar"] img[src*=".gif"] {
    content: url("");
}
[class*="listItem"] [class*="avatar"] img,
[class*="message"] [class*="avatar"] img,
[class*="memberInner"] [class*="avatar"] img {
    image-rendering: pixelated;
}
`;
    }

    if (noAnimatedEmoji) {
        css += `
[class*="emoji"][class*="animated"],
img[class*="emoji"][src*="gif"] {
    animation: none !important;
}
`;
    }

    if (noStickers) {
        css += `
[class*="sticker"][class*="lottie"],
[class*="stickerAsset"][class*="animated"] {
    visibility: hidden !important;
}
`;
    }

    if (noActivities) {
        css += `
[class*="activity"],
[class*="activityText"],
[class*="Game"] {
    display: none !important;
}
`;
    }

    if (noVideoAutoplay) {
        css += `
[class*="embedVideo"] video,
[class*="attachmentContainer"] video {
    pointer-events: auto;
}
`;
    }

    if (noSoundboardPreview) {
        css += `
[class*="soundboardEmoji"]:hover [class*="soundWave"],
[class*="soundboardEmoji"] [class*="soundWave"] {
    animation: none !important;
    opacity: 0 !important;
}
`;
    }

    let el = document.getElementById(CSS_ID);
    if (!css) { el?.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = CSS_ID; document.head?.appendChild(el); }
    el.textContent = css.trim();
}

function removeCss() {
    document.getElementById(CSS_ID)?.remove();
}

export default definePlugin({
    name: "UI Optimisations",
    description: "Reduces resource consumption: animations, GIFs, message cache, background FPS.",
    authors: [{ name: ">Snayz", id: 1361345963175968779n }],
    tags: ["Utility", "Appearance", "Performance"],
    searchTerms: ["performance", "optimization", "lag", "animation", "fps", "ram", "memory", "gif", "low-end"],
    settings,

    patches: [
        {
            find: "dotCycle",
            predicate: () => settings.store.disableTypingDots && !isPluginEnabled("DisableAnimations"),
            replacement: {
                match: /focused:(\i)/g,
                replace: (_, focused) => `_focused:${focused}=false`
            }
        },
        {
            find: /getUserAvatarURL.{0,80}animated/,
            predicate: () => settings.store.noGifAvatars,
            replacement: {
                match: /(animated\s*(?:&&|=).*?)(true)/,
                replace: (_, pre) => `${pre}false`
            }
        },
        {
            find: /autoPlay[^:]{0,5}:true/,
            predicate: () => settings.store.noVideoAutoplay,
            replacement: {
                match: /autoPlay([^:]{0,5}):true/,
                replace: (_, s) => `autoPlay${s}:false`
            }
        },
        {
            find: "soundboard_sound_hover",
            predicate: () => settings.store.noSoundboardPreview,
            replacement: {
                match: /onMouseEnter:\s*\(\)\s*=>\s*\{[^}]*play[^}]*\}/,
                replace: "onMouseEnter:()=>{}"
            }
        },
    ],

    start() {
        started = true;
        cacheSettings();

        if (disableSpring && !isPluginEnabled("DisableAnimations")) {
            chargeRessorts();
            majAnimations(true);
        }

        buildAndInjectCss();

        if (limitMsgCache) startCacheCleaner();
        if (settings.store.reduceFpsBackground) applyBgFpsPatch(true);
    },

    stop() {
        started = false;

        if (ressorts.length !== 0 && !isPluginEnabled("DisableAnimations"))
            majAnimations(false);
        ressorts = [];

        removeCss();
        stopCacheCleaner();
        applyBgFpsPatch(false);
    }
});
