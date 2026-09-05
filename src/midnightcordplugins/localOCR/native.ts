/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import type { IpcMainInvokeEvent } from "electron";

import { prepareAssets } from "./assets";
import { Language, OcrRuntime } from "./runtime";
import { OcrSessionManager } from "./session";

let assets: Promise<string> | undefined;
const runtime = new OcrRuntime(() => assets ??= prepareAssets(join(__dirname, "ocr"), join(DATA_DIR, "ocr-runtime")).catch(error => { assets = undefined; throw error; }));
const sessions = new OcrSessionManager(runtime);
const observed = new WeakSet<Electron.WebContents>();

export async function recognize(event: IpcMainInvokeEvent, session: string, id: string, image: Uint8Array, language: Language) {
    if (!observed.has(event.sender)) {
        observed.add(event.sender);
        const senderId = event.sender.id;
        event.sender.once("destroyed", () => {
            sessions.releaseOwner(senderId);
        });
        event.sender.on("render-process-gone", () => {
            sessions.releaseOwner(senderId);
        });
    }
    return sessions.recognize(event.sender.id, session, id, image, language);
}

export function cancel(event: IpcMainInvokeEvent, session: string, id?: string) {
    return sessions.cancel(event.sender.id, session, id);
}

export function release(event: IpcMainInvokeEvent, session: string) {
    return sessions.release(event.sender.id, session);
}
