/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { tPlugin as t } from "@api/pluginI18n";
import { getUserSettingLazy } from "@api/UserSettings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { UserStore } from "@webpack/common";

interface VoiceState {
    userId: string;
    channelId?: string;
}

const logger = new Logger("AutoAFK");

// "status"/"status" is Discord's own account status proto path: "online" | "idle" | "dnd" | "invisible".
const StatusSetting = getUserSettingLazy<string>("status", "status");
const VoiceStateStore = findStoreLazy("VoiceStateStore");

let afkTimeoutId: ReturnType<typeof setTimeout> | undefined;
let isAfk = false;

function getCurrentUserId(): string | undefined {
    return UserStore.getCurrentUser()?.id;
}

function isInVoiceChannel(): boolean {
    const userId = getCurrentUserId();
    if (!userId) return false;
    try {
        return !!VoiceStateStore?.getVoiceStateForUser?.(userId)?.channelId;
    } catch {
        return false;
    }
}

function applyStatus(value: string) {
    try {
        const setting = StatusSetting;
        if (!setting?.updateSetting) {
            logger.warn("StatusSetting not ready yet, retrying in 500ms");
            setTimeout(() => applyStatus(value), 500);
            return;
        }
        setting.updateSetting(value);
    } catch (e) {
        logger.error("Could not update the status.", e);
    }
}

function resetTimer() {
    clearTimeout(afkTimeoutId);
    const minutes = Math.max(1, settings.store.afkAfterMinutes || 1);
    afkTimeoutId = setTimeout(goAfk, minutes * 60_000);
}

function goAfk() {
    // Never mark the account as away while actively connected to a voice channel.
    // Just check again after the same delay instead of dropping the loop entirely.
    if (isInVoiceChannel()) {
        resetTimer();
        return;
    }

    if (isAfk) return;
    isAfk = true;
    logger.info(`Inactive for ${settings.store.afkAfterMinutes} min — switching to invisible`);
    applyStatus("invisible");
}

function goActive() {
    const wasAfk = isAfk;
    isAfk = false;
    if (wasAfk) {
        logger.info("Activity detected — restoring status to", settings.store.activeStatus || "online");
        applyStatus(settings.store.activeStatus || "online");
    }
    resetTimer();
}

// Debounce: avoid restarting the timer on every single mouse move pixel
let _activityDebounce: ReturnType<typeof setTimeout> | undefined;
function onActivity() {
    if (isAfk) {
        // Immediately restore when coming back from AFK
        goActive();
        return;
    }
    // Debounce timer reset to max once per 2s to avoid flooding
    if (_activityDebounce) return;
    _activityDebounce = setTimeout(() => {
        _activityDebounce = undefined;
        resetTimer();
    }, 2_000);
}

function onMouseMove() {
    if (!settings.store.mouseMovementCountsAsActivity) return;
    onActivity();
}

const settings = definePluginSettings({
    afkAfterMinutes: {
        type: OptionType.NUMBER,
        description: t("Minutes of inactivity before you're automatically set to appear offline."),
        default: 15,
        isValid: (value: number) => value >= 1 || t("Must be at least 1 minute."),
        onChange: resetTimer
    },
    mouseMovementCountsAsActivity: {
        type: OptionType.BOOLEAN,
        description: t("Count mouse movement as activity. Disable this if only typing, clicking, sending messages, and voice activity should count — simply moving your mouse won't prevent going AFK anymore."),
        default: true
    },
    activeStatus: {
        type: OptionType.SELECT,
        description: t("Status to switch back to once you're active again."),
        options: [
            { label: t("Online"), value: "online", default: true },
            { label: t("Idle"), value: "idle" },
            { label: t("Do Not Disturb"), value: "dnd" }
        ]
    }
});

export default definePlugin({
    name: "AutoAFK",
    description: "Automatically switches your status to appear offline when you've been inactive, and switches it back once you're active again.",
    authors: [{ name: "Midnightcord", id: 0n }],
    tags: ["Activity", "Utility"],
    dependencies: ["UserSettingsAPI"],
    settings,

    start() {
        isAfk = false;

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mousedown", onActivity);
        window.addEventListener("keydown", onActivity);
        window.addEventListener("wheel", onActivity);

        resetTimer();
    },

    stop() {
        clearTimeout(afkTimeoutId);
        clearTimeout(_activityDebounce);
        afkTimeoutId = undefined;
        _activityDebounce = undefined;

        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mousedown", onActivity);
        window.removeEventListener("keydown", onActivity);
        window.removeEventListener("wheel", onActivity);

        // If we were the ones who set the away status, restore the account
        // to an active status before the plugin unloads.
        if (isAfk) {
            isAfk = false;
            applyStatus(settings.store.activeStatus || "online");
        }
    },

    flux: {
        MESSAGE_CREATE({ message }: { message: { author?: { id: string; }; }; }) {
            if (message?.author?.id !== getCurrentUserId()) return;
            onActivity();
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const userId = getCurrentUserId();
            if (!userId) return;

            for (const state of voiceStates) {
                if (state.userId !== userId) continue;
                // Joining/staying connected to a voice channel always counts as activity.
                if (state.channelId) onActivity();
            }
        }
    }
});
