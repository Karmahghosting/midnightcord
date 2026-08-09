/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useReducer } from "@Midnightcord/types/webpack/common";
import { SettingsStore } from "shared/utils/SettingsStore";

import { VesktopLogger } from "./logger";
import { localStorage } from "./utils";

function getInitialSettings(): ReturnType<typeof VesktopNative.settings.get> {
    try {
        return VesktopNative.settings.get();
    } catch (error) {
        console.warn("Native settings bridge is unavailable; using safe defaults.", error);
        return {} as ReturnType<typeof VesktopNative.settings.get>;
    }
}

export const Settings = new SettingsStore(getInitialSettings());
Settings.addGlobalChangeListener((o, p) => {
    try {
        VesktopNative.settings.set(o, p);
    } catch (error) {
        console.warn("Unable to persist native settings.", error);
    }
});

export function useSettings() {
    const [, update] = useReducer(x => x + 1, 0);

    useEffect(() => {
        Settings.addGlobalChangeListener(update);

        return () => Settings.removeGlobalChangeListener(update);
    }, []);

    return Settings.store;
}

export function getValueAndOnChange(key: keyof typeof Settings.store) {
    return {
        value: Settings.store[key] as any,
        onChange: (value: any) => (Settings.store[key] = value)
    };
}

interface TState {
    screenshareQuality?: {
        resolution: string;
        frameRate: string;
    };
}

const stateKey = "MidnightcordState";

const currentState: TState = (() => {
    const stored = localStorage.getItem(stateKey);
    if (!stored) return {};
    try {
        return JSON.parse(stored);
    } catch (e) {
        VesktopLogger.error("Failed to parse stored state", e);
        return {};
    }
})();

export const State = new SettingsStore<TState>(currentState);
State.addGlobalChangeListener((o, p) => localStorage.setItem(stateKey, JSON.stringify(o)));

export function useVesktopState() {
    const [, update] = useReducer(x => x + 1, 0);

    useEffect(() => {
        State.addGlobalChangeListener(update);

        return () => State.removeGlobalChangeListener(update);
    }, []);

    return State.store;
}
