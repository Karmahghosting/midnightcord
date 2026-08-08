/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain } from "electron";

import { NativeSettings } from "./settings";

// Unique Midnightcord configuration key, provided by Mellowtel.
const MELLOWTEL_CONFIGURATION_KEY = "intgr-xbMMjQpcsJ";
const MELLOWTEL_INTEGRATION_ID = MELLOWTEL_CONFIGURATION_KEY;

// mellowtel doesn't ship types as of writing, hence the any.
let mellowtelInstance: any = null;

async function getMellowtel() {
    if (mellowtelInstance) return mellowtelInstance;

    // Lazily required so the app doesn't pay the require() cost (or crash on a
    // missing/failed install) for users who never opt in.
    const { default: Mellowtel } = await import("mellowtel");
    mellowtelInstance = new Mellowtel({ integrationId: MELLOWTEL_INTEGRATION_ID });
    await mellowtelInstance.init();

    return mellowtelInstance;
}

function getStoredConsent() {
    return NativeSettings.plain.mellowtel ?? null;
}

/** Call once at app startup to re-apply whatever choice the user already made. */
export async function applyStoredMellowtelConsent() {
    const stored = getStoredConsent();
    if (!stored || stored.consent !== "accepted") return;

    try {
        const mellowtel = await getMellowtel();
        await mellowtel.optIn();
        await mellowtel.start();
    } catch (e) {
        console.error("[Mellowtel] Failed to re-apply stored consent", e);
    }
}

ipcMain.handle(IpcEvents.MELLOWTEL_SET_CONSENT, async (_event, accepted: boolean, onboardingVersion: string) => {
    NativeSettings.store.mellowtel = {
        consent: accepted ? "accepted" : "declined",
        version: onboardingVersion
    };

    try {
        const mellowtel = await getMellowtel();
        if (accepted) {
            await mellowtel.optIn();
            await mellowtel.start();
        } else {
            await mellowtel.optOut();
        }
    } catch (e) {
        console.error("[Mellowtel] Failed to apply consent choice", e);
    }
});

ipcMain.on(IpcEvents.MELLOWTEL_GET_CONSENT, event => {
    event.returnValue = getStoredConsent();
});
