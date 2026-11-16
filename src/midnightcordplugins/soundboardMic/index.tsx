/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { IS_LINUX, IS_MAC } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, MediaEngineStore, SelectedGuildStore, Toasts, UserStore } from "@webpack/common";

import { t } from "../autoTranslateMidnightcord";

interface SoundboardSound {
    soundId: string;
    name: string;
    guildId: string;
    available?: boolean;
}

const MediaEngineActions = findByPropsLazy("setInputDevice");
const PremiumUtils = findByPropsLazy("canUseSoundboardEverywhere");

const LINUX_DEVICE = /Midnightcord[-_ ]Soundboard/i;
const WINDOWS_OUTPUT = /CABLE Input|VB-Audio|VoiceMeeter|Virtual Audio/i;
const WINDOWS_INPUT = /CABLE Output|VoiceMeeter Output|Virtual Audio/i;
const MACOS_DEVICE = /BlackHole|Loopback|Soundflower/i;

const settings = definePluginSettings({
    volume: {
        type: OptionType.SLIDER,
        description: "Volume of the soundboard sent to the microphone",
        default: 100,
        markers: [0, 50, 100, 150, 200],
        stickToMarkers: false
    },
    localMonitor: {
        type: OptionType.BOOLEAN,
        description: "Also play the sound locally so you can hear it",
        default: true
    },
    autoSwitchInput: {
        type: OptionType.BOOLEAN,
        description: "Automatically switch the Discord input device to the virtual microphone",
        default: true
    }
});

const players = new Set<HTMLAudioElement>();
const endTimers = new Map<string, ReturnType<typeof setTimeout>>();

let virtualOutputId: string | undefined;
let previousInputId: string | undefined;
let clickHandlerAttached = false;
let errorShown = false;
let routeTimer: ReturnType<typeof setInterval> | null = null;
let micReady = false;
let perksSpoofed = false;
let originalPerks: unknown;
let premiumSpoofed = false;
let originalPremiumType: unknown;
let premiumRestoreTimer: ReturnType<typeof setTimeout> | null = null;
let pickerObserver: MutationObserver | null = null;

function outputPattern() {
    if (IS_LINUX) return LINUX_DEVICE;
    if (IS_MAC) return MACOS_DEVICE;
    return WINDOWS_OUTPUT;
}

function inputPattern() {
    if (IS_LINUX) return LINUX_DEVICE;
    if (IS_MAC) return MACOS_DEVICE;
    return WINDOWS_INPUT;
}

function showError(message: string) {
    if (errorShown) return;
    errorShown = true;
    Toasts.show({
        message,
        type: Toasts.Type.FAILURE,
        id: Toasts.genId(),
        options: { position: Toasts.Position.BOTTOM }
    });
}

function stopAll() {
    for (const player of players) {
        player.pause();
        player.src = "";
    }
    players.clear();
    for (const timer of endTimers.values()) clearTimeout(timer);
    endTimers.clear();
}

async function listDevices(kind: MediaDeviceKind) {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === kind);
    } catch {
        return [];
    }
}

async function waitForDevice(kind: MediaDeviceKind, pattern: RegExp, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const device = (await listDevices(kind)).find(item => pattern.test(item.label));
        if (device) return device;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return undefined;
}

function soundUrl(soundId: string) {
    const cdn = (window as any).GLOBAL_ENV?.CDN_HOST || "cdn.discordapp.com";
    return `https://${cdn}/soundboard-sounds/${soundId}`;
}

function soundDuration(audio: HTMLAudioElement) {
    return new Promise<number>(resolve => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
            resolve(audio.duration);
            return;
        }
        const done = () => resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 4);
        audio.addEventListener("loadedmetadata", done, { once: true });
        setTimeout(done, 1500);
    });
}

function dispatchPlayState(type: string, soundId: string) {
    const userId = UserStore.getCurrentUser()?.id;
    if (!userId) return;
    FluxDispatcher.dispatch({ type, soundId, userId });
}

function startPlayer(audio: HTMLAudioElement) {
    players.add(audio);
    audio.addEventListener("ended", () => {
        players.delete(audio);
        audio.src = "";
    });
    return audio.play().catch(() => {
        players.delete(audio);
        showError(t("Unable to play this soundboard sound."));
    });
}

async function playSound(sound: SoundboardSound) {
    stopAll();

    const url = soundUrl(sound.soundId);
    const volume = Math.min(1, Math.min(2, Math.max(0, settings.store.volume / 100)));
    const audio = new Audio(url);
    audio.volume = volume;

    let routed = false;
    if (virtualOutputId) {
        try {
            await (audio as any).setSinkId(virtualOutputId);
            routed = true;
        } catch { }
    }

    await startPlayer(audio);

    if (routed && settings.store.localMonitor) {
        const monitor = new Audio(url);
        monitor.volume = volume;
        monitor.addEventListener("ended", () => { monitor.src = ""; });
        monitor.play().catch(() => { });
    }

    dispatchPlayState("GUILD_SOUNDBOARD_SOUND_PLAY_START", sound.soundId);

    const duration = await soundDuration(audio);
    const previous = endTimers.get(sound.soundId);
    if (previous) clearTimeout(previous);
    endTimers.set(sound.soundId, setTimeout(() => {
        dispatchPlayState("GUILD_SOUNDBOARD_SOUND_PLAY_END", sound.soundId);
        endTimers.delete(sound.soundId);

        if (endTimers.size === 0) {
            stopAll();
            void teardownVirtualMicrophone();
        }
    }, duration * 1000 + 400));
}

function readSound(element: Element): SoundboardSound | undefined {
    const fiberKey = Object.keys(element).find(key => key.startsWith("__reactFiber"));
    if (!fiberKey) return undefined;

    let fiber: any = (element as any)[fiberKey];
    for (let depth = 0; fiber && depth < 10; depth++, fiber = fiber.return) {
        const sound = fiber.memoizedProps?.sound;
        if (sound?.soundId) return sound;
    }

    return undefined;
}

let lastTrigger = 0;

function playLocalCopy(sound: SoundboardSound) {
    if (!settings.store.localMonitor) return;

    const volume = Math.min(1, Math.min(2, Math.max(0, settings.store.volume / 100)));
    const audio = new Audio(soundUrl(sound.soundId));
    audio.volume = volume;
    audio.addEventListener("ended", () => { audio.src = ""; });
    audio.play().catch(() => { });
}

function applyPerkSpoof() {
    const user = UserStore.getCurrentUser();
    if (!user || perksSpoofed) return;
    if (!user.perks) return;

    originalPerks = user.perks;
    user.perks = { ...user.perks, activePerksBitmask: ["16"] };
    perksSpoofed = true;
}

function removePerkSpoof() {
    if (!perksSpoofed) return;

    const user = UserStore.getCurrentUser();
    if (user && originalPerks) user.perks = originalPerks;
    originalPerks = undefined;
    perksSpoofed = false;
}

function applyPremiumSpoof() {
    applyPerkSpoof();

    const user = UserStore.getCurrentUser();
    if (!user || premiumSpoofed) return;

    originalPremiumType = user.premiumType;
    user.premiumType = 2;
    premiumSpoofed = true;
}

function removePremiumSpoof() {
    if (premiumRestoreTimer) {
        clearTimeout(premiumRestoreTimer);
        premiumRestoreTimer = null;
    }

    if (!premiumSpoofed) return;

    const user = UserStore.getCurrentUser();
    if (user) user.premiumType = originalPremiumType;
    originalPremiumType = undefined;
    premiumSpoofed = false;
}

function canPlayNatively(sound: SoundboardSound) {
    if (!perksSpoofed) {
        const user = UserStore.getCurrentUser();
        if (user && PremiumUtils?.canUseSoundboardEverywhere(user)) return true;
    }

    return sound.guildId === SelectedGuildStore.getGuildId();
}

function onActivate(event: Event) {
    const target = event.target as Element | null;
    if (!target?.closest) return;

    if (event.type === "pointerdown" && target.closest('[aria-label*="soundboard" i]')) {
        applyPremiumSpoof();
        return;
    }

    const button = target.closest('[class*="soundButtonWrapper_"]');
    if (!button) return;

    const sound = readSound(button);
    if (!sound) return;

    if (canPlayNatively(sound)) {
        if (event.type === "pointerdown") playLocalCopy(sound);
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.type !== "pointerdown") return;

    const now = Date.now();
    if (now - lastTrigger < 500) return;
    lastTrigger = now;

    void handleSound(sound);
}

async function handleSound(sound: SoundboardSound) {
    if (!micReady) {
        await setupVirtualMicrophone();
        micReady = true;
    }

    await playSound(sound);
}

async function routeDiscordAudio() {
    if (!IS_LINUX || !VesktopNative.soundboardMic) return;
    await VesktopNative.soundboardMic.route().catch(() => { });
}

async function teardownVirtualMicrophone() {
    if (!micReady && !virtualOutputId) return;

    micReady = false;
    virtualOutputId = undefined;

    if (routeTimer) {
        clearInterval(routeTimer);
        routeTimer = null;
    }

    if (!IS_LINUX || !VesktopNative.soundboardMic) return;

    await VesktopNative.soundboardMic.unroute().catch(() => { });
    await VesktopNative.soundboardMic.remove().catch(() => { });
}

async function setupVirtualMicrophone() {
    if (IS_LINUX && VesktopNative.soundboardMic) {
        const current = MediaEngineStore.getInputDeviceId();
        const currentDevice = (await listDevices("audioinput")).find(device => device.deviceId === current);
        if (currentDevice && inputPattern().test(currentDevice.label)) {
            MediaEngineActions.setInputDevice("default");
        }

        const result = await VesktopNative.soundboardMic.ensure();
        if (!result.ok) {
            showError(`${t("Virtual microphone unavailable")} : ${result.error ?? t("unknown error")}`);
            return;
        }

        const output = await waitForDevice("audiooutput", outputPattern());
        if (!output) {
            showError(t("Virtual microphone not detected. Check your PipeWire/PulseAudio setup."));
            return;
        }

        virtualOutputId = output.id;
        await routeDiscordAudio();

        if (routeTimer) clearInterval(routeTimer);
        routeTimer = setInterval(() => void routeDiscordAudio(), 1500);
        return;
    }

    const output = await waitForDevice("audiooutput", outputPattern());
    if (output) {
        virtualOutputId = output.id;
    } else {
        showError(t("No virtual audio device detected. Install one to send soundboard sounds through your microphone."));
        return;
    }

    if (!settings.store.autoSwitchInput) return;

    const input = await waitForDevice("audioinput", inputPattern());
    if (!input) return;

    const current = MediaEngineStore.getInputDeviceId();
    if (current === input.deviceId) return;

    const currentDevice = (await listDevices("audioinput")).find(device => device.deviceId === current);
    previousInputId = currentDevice && inputPattern().test(currentDevice.label) ? "default" : current;
    MediaEngineActions.setInputDevice(input.deviceId);
}

export default definePlugin({
    name: "SoundboardMic",
    enabledByDefault: false,
    description: "Use any server soundboard without Nitro: clicking a sound in Discord's soundboard plays it locally, sends it through your microphone and shows the native soundboard animation.",
    tags: ["Voice", "Utility"],
    authors: [{ name: "Midnightcord", id: 253979869n }],
    settings,

    start() {
        if (!clickHandlerAttached) {
            for (const type of ["pointerdown", "mousedown", "pointerup", "click"]) {
                document.addEventListener(type, onActivate, true);
            }
            clickHandlerAttached = true;
        }

        applyPerkSpoof();

        if (!pickerObserver) {
            pickerObserver = new MutationObserver(() => {
                if (document.querySelector('[role="dialog"][class*="picker_"]')) {
                    if (premiumRestoreTimer) {
                        clearTimeout(premiumRestoreTimer);
                        premiumRestoreTimer = null;
                    }
                    applyPremiumSpoof();
                } else if (premiumSpoofed && !premiumRestoreTimer) {
                    premiumRestoreTimer = setTimeout(() => {
                        premiumRestoreTimer = null;
                        if (!document.querySelector('[role="dialog"][class*="picker_"]')) removePremiumSpoof();
                    }, 600);
                }
            });
            pickerObserver.observe(document.body, { childList: true, subtree: true });
        }
    },

    stop() {
        if (clickHandlerAttached) {
            for (const type of ["pointerdown", "mousedown", "pointerup", "click"]) {
                document.removeEventListener(type, onActivate, true);
            }
            clickHandlerAttached = false;
        }

        pickerObserver?.disconnect();
        pickerObserver = null;
        removePremiumSpoof();
        removePerkSpoof();

        stopAll();
        void teardownVirtualMicrophone();

        if (previousInputId) {
            try {
                MediaEngineActions.setInputDevice(previousInputId);
            } catch { }
            previousInputId = undefined;
        }

        virtualOutputId = undefined;
        micReady = false;
        errorShown = false;

        if (IS_LINUX) void VesktopNative.soundboardMic?.remove();
    }
});
