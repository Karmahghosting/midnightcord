/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { desktopCapturer, session, Streams } from "electron";
import type { StreamPick } from "renderer/components/ScreenSharePicker";
import { IpcCommands, IpcEvents } from "shared/IpcEvents";

import { isWayland } from "./constants";
import { getPlatformSpoofInfo } from "./gnuSpoofing";
import { sendRendererCommand } from "./ipcCommands";
import { handle } from "./utils/ipcWrappers";

export function registerScreenShareHandler() {
    handle(IpcEvents.CAPTURER_GET_LARGE_THUMBNAIL, async (_, id: string) => {
        const sources = await desktopCapturer.getSources({
            types: ["window", "screen"],
            thumbnailSize: {
                width: 1920,
                height: 1080
            }
        });
        return sources.find(s => s.id === id)?.thumbnail.toDataURL();
    });

    // Warm up desktopCapturer on first launch so the first real call never cold-starts
    let capturerReady = false;
    async function warmUpCapturer() {
        if (capturerReady) return;
        try {
            await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
            capturerReady = true;
        } catch { /* ignore */ }
    }

    // Pre-warm as soon as the app is ready so it's done before the user clicks Go Live
    warmUpCapturer();

    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        // Ensure capturer is warm before proceeding (critical on first launch / after reboot)
        if (!capturerReady) {
            await warmUpCapturer().catch(() => {});
            // Give the OS media stack an extra moment to settle
            await new Promise(r => setTimeout(r, 300));
        }

        // request full resolution on wayland right away because we always only end up with one result anyway
        const width = isWayland ? 1920 : 176;

        let sources: Awaited<ReturnType<typeof desktopCapturer.getSources>> | undefined;
        // Retry once if the first call fails (race condition on cold start)
        for (let attempt = 0; attempt < 2; attempt++) {
            sources = await desktopCapturer
                .getSources({
                    types: ["window", "screen"],
                    thumbnailSize: {
                        width,
                        height: width * (9 / 16)
                    }
                })
                .catch(err => {
                    console.error(`Error during screenshare picker (attempt ${attempt + 1})`, err);
                    return undefined;
                });
            if (sources) break;
            await new Promise(r => setTimeout(r, 500));
        }

        if (!sources) return callback({});

        const data = sources.map(({ id, name, thumbnail }) => ({
            id,
            name,
            url: thumbnail.toDataURL()
        }));

        if (isWayland) {
            const video = data[0];
            if (video) {
                const stream = await sendRendererCommand<StreamPick>(IpcCommands.SCREEN_SHARE_PICKER, {
                    screens: [video],
                    skipPicker: true
                }).catch(() => null);

                if (stream === null) return callback({});
            }

            callback(video ? { video: sources[0] } : {});
            return;
        }

        const choice = await sendRendererCommand<StreamPick>(IpcCommands.SCREEN_SHARE_PICKER, {
            screens: data,
            skipPicker: false
        }).catch(e => {
            console.error("Error during screenshare picker", e);
            return null;
        });

        if (!choice) return callback({});

        const source = sources.find(s => s.id === choice.id);
        if (!source) return callback({});

        const streams: Streams = {
            video: source
        };
        if (choice.audio && getPlatformSpoofInfo().originalPlatform === "win32") streams.audio = "loopback";

        callback(streams);
    });
}
