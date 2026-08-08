/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Toasts } from "@webpack/common";
import { t } from "../autoTranslateMidnightcord";
import fixWebmDuration from "fix-webm-duration";

export interface RecordingOptions {
    mode: "voice" | "video";
    videoQuality?: string;
    videoFormat?: string;
    audioFormat?: string;
    maxStorageGB: number;
    shadowplayMinutes: number;
    autoSave: boolean;
    savePath: string;
    showSaveToast?: boolean;
}

let activeOpts: RecordingOptions | null = null;

let isRecording = false;
let isStopping = false;  // guard against concurrent stopRecording calls
let mediaRecorder: MediaRecorder | null = null;
let recordCtx: AudioContext | null = null;
let recordDest: MediaStreamAudioDestinationNode | null = null;
let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;

let currentFilename: string = "";
let isStreamMode = false;
let recordedChunks: Blob[] = [];
let pendingChunkPromises: Promise<any>[] = [];
const CHUNK_TIME_MS = 5000;
let startTimeMs = 0;
let memoryCheckInterval: any;

export function getRecordingDurationMs(): number {
    if (!isRecording) return 0;
    return Date.now() - startTimeMs;
}

export function isCurrentlyRecording(): boolean {
    return isRecording;
}

export async function startRecording(opts: RecordingOptions): Promise<boolean> {
    if (isRecording) return false;
    activeOpts = opts;
    isStopping = false;

    try {
        recordedChunks = [];
        pendingChunkPromises = [];  // always reset on new recording
        startTimeMs = Date.now();

        const ext = opts.mode === "video"
            ? (opts.videoFormat === "mkv" ? "mkv" : "webm")
            : (opts.audioFormat === "ogg" ? "ogg" : "webm");
        const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        currentFilename = `AutoCall_${dateStr}.${ext}`;

        const native = (window as any).VencordNative?.pluginHelpers?.AutoCallRecorder;
        if (native?.initStreamRecording && native?.appendRecordingChunk && native?.finalizeStreamRecording) {
            isStreamMode = await native.initStreamRecording(currentFilename);
        } else {
            isStreamMode = false;
        }

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        recordCtx = new AudioCtxClass();
        recordDest = recordCtx.createMediaStreamDestination();

        let capturedMic = false;
        let capturedSystem = false;

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (micStream && micStream.getAudioTracks().length > 0) {
                const micSource = recordCtx.createMediaStreamSource(micStream);
                micSource.connect(recordDest);
                capturedMic = true;
            }
        } catch (e) {
            console.warn("[AutoCallRecorder] Local mic capture failed:", e);
        }

        try {
            let desktopSourceId: string | null = null;
            const nativeCapture = (window as any).VencordNative?.desktopCapture;
            if (nativeCapture?.getSources) {
                const sources = await nativeCapture.getSources();
                const screenSource = sources.find((s: any) => s.id.startsWith("screen:"));
                if (screenSource) desktopSourceId = screenSource.id;
            }

            if (desktopSourceId) {
                const constraints: any = {
                    audio: {
                        mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: desktopSourceId
                        }
                    }
                };

                if (opts.mode === "video") {
                    let minWidth = 1280;
                    let minHeight = 720;
                    let maxFrameRate = 30;

                    if (opts.videoQuality === "1080p60") {
                        minWidth = 1920;
                        minHeight = 1080;
                        maxFrameRate = 60;
                    } else if (opts.videoQuality === "480p25") {
                        minWidth = 854;
                        minHeight = 480;
                        maxFrameRate = 25;
                    }

                    constraints.video = {
                        mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: desktopSourceId,
                            minWidth,
                            minHeight,
                            maxFrameRate
                        }
                    };
                } else {
                    constraints.video = {
                        mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: desktopSourceId,
                            maxWidth: 1, maxHeight: 1
                        }
                    };
                }

                systemStream = await navigator.mediaDevices.getUserMedia(constraints);

                if (systemStream && systemStream.getAudioTracks().length > 0) {
                    const sysAudioStream = new MediaStream(systemStream.getAudioTracks());
                    const systemSource = recordCtx.createMediaStreamSource(sysAudioStream);
                    systemSource.connect(recordDest);
                    capturedSystem = true;

                    // Immediately stop video capture pipeline in voice-only mode to prevent GPU/CPU overhead
                    if (opts.mode === "voice") {
                        systemStream.getVideoTracks().forEach(t => t.stop());
                    }
                }
            }
        } catch (e) {
            console.warn("[AutoCallRecorder] Desktop loopback capture failed:", e);
        }

        if (!capturedMic && !capturedSystem) {
            throw new Error("No audio source captured.");
        }

        let finalStream = recordDest.stream;
        if (opts.mode === "video" && systemStream) {
            finalStream = new MediaStream([
                ...systemStream.getVideoTracks(),
                ...recordDest.stream.getAudioTracks()
            ]);
        }

        let videoBitsPerSecond: number | undefined;
        let mimeType = "audio/webm";

        if (opts.mode === "video") {
            if (opts.videoQuality === "1080p60") videoBitsPerSecond = 8000000;
            else if (opts.videoQuality === "720p30") videoBitsPerSecond = 3000000;
            else if (opts.videoQuality === "480p25") videoBitsPerSecond = 1500000;

            if (opts.videoFormat === "mkv") {
                mimeType = "video/x-matroska;codecs=avc1,opus";
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm;codecs=vp8,opus";
            } else {
                mimeType = "video/webm;codecs=vp8,opus";
            }
        } else {
            if (opts.audioFormat === "webm") {
                mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            } else {
                if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) mimeType = "audio/ogg;codecs=opus";
                else if (MediaRecorder.isTypeSupported("audio/ogg")) mimeType = "audio/ogg";
                else mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            }
        }

        const recorderOptions: any = { mimeType };
        if (videoBitsPerSecond) {
            recorderOptions.videoBitsPerSecond = videoBitsPerSecond;
        }

        mediaRecorder = new MediaRecorder(finalStream, recorderOptions);

        mediaRecorder.ondataavailable = e => {
            if (!e.data || e.data.size === 0) return;

            if (isStreamMode && native?.appendRecordingChunk) {
                const p = (async () => {
                    try {
                        const buf = await e.data.arrayBuffer();
                        await native.appendRecordingChunk(new Uint8Array(buf));
                    } catch (err) {
                        console.error("[AutoCallRecorder] Stream chunk append failed:", err);
                    }
                })();
                pendingChunkPromises.push(p);
            } else {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.start(CHUNK_TIME_MS);
        isRecording = true;

        memoryCheckInterval = setInterval(() => {
            if (!isRecording || isStreamMode) return;

            if (opts.maxStorageGB > 0) {
                const maxBytes = opts.maxStorageGB * 1024 * 1024 * 1024;
                let currentBytes = recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0);
                while (currentBytes > maxBytes && recordedChunks.length > 1) {
                    const removed = recordedChunks.shift();
                    currentBytes -= (removed?.size || 0);
                }
            }

            if (opts.shadowplayMinutes > 0) {
                const maxChunks = (opts.shadowplayMinutes * 60 * 1000) / CHUNK_TIME_MS;
                while (recordedChunks.length > maxChunks) {
                    recordedChunks.shift();
                }
            }
        }, CHUNK_TIME_MS);

        return true;
    } catch (e) {
        console.error("[AutoCallRecorder] Failed to start recording:", e);
        cleanup();
        return false;
    }
}

export function stopRecording(): Promise<void> {
    return new Promise(resolve => {
        // Guard against concurrent calls (e.g. updateUI + VOICE_CHANNEL_SELECT firing simultaneously)
        if (isStopping) { resolve(); return; }

        const opts = activeOpts;
        if (!isRecording || !mediaRecorder || !opts) {
            cleanup();
            resolve();
            return;
        }

        isStopping = true;
        const durationSecs = (Date.now() - startTimeMs) / 1000;
        const shouldSave = durationSecs >= 2;
        const mimeType = mediaRecorder.mimeType || "audio/webm";

        mediaRecorder.onstop = async () => {
            // Wait for ALL pending stream-chunk writes to finish,
            // including the final chunk triggered by requestData() just before stop().
            if (pendingChunkPromises.length > 0) {
                await Promise.allSettled(pendingChunkPromises);
                pendingChunkPromises = [];
            }

            if (shouldSave) {
                const native = (window as any).VencordNative?.pluginHelpers?.AutoCallRecorder;
                if (isStreamMode && native?.finalizeStreamRecording) {
                    try {
                        const durationMs = Math.max(0, Math.round(Date.now() - startTimeMs));
                        const ok = await native.finalizeStreamRecording(opts.savePath, currentFilename, durationMs);
                        if (ok && opts.showSaveToast !== false) {
                            Toasts.show(Toasts.create(t("Save record"), Toasts.Type.SUCCESS));
                        }
                    } catch (e) {
                        console.error("[AutoCallRecorder] Finalize stream failed:", e);
                    }
                } else if (recordedChunks.length > 0) {
                    const blob = new Blob(recordedChunks, { type: mimeType });
                    saveBlobFallback(blob, opts, currentFilename);
                }
            }
            cleanup();
            resolve();
        };

        try {
            if (mediaRecorder.state !== "inactive") {
                // requestData() flushes the last partial chunk → triggers ondataavailable
                // BEFORE onstop fires, so the chunk will be in pendingChunkPromises
                // when Promise.allSettled runs inside onstop.
                mediaRecorder.requestData();
                mediaRecorder.stop();
            } else {
                cleanup();
                resolve();
            }
        } catch (e) {
            cleanup();
            resolve();
        }
    });
}

function cleanup() {
    isRecording = false;
    isStopping = false;
    isStreamMode = false;
    clearInterval(memoryCheckInterval);
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (systemStream) { systemStream.getTracks().forEach(t => t.stop()); systemStream = null; }
    if (recordCtx) { recordCtx.close(); recordCtx = null; }
    recordDest = null;
    mediaRecorder = null;
    recordedChunks = [];
    pendingChunkPromises = [];
    activeOpts = null;
}

async function saveBlobFallback(blob: Blob, opts: RecordingOptions, filename: string) {
    const notifySuccess = () => {
        if (opts.showSaveToast !== false) {
            Toasts.show(Toasts.create(t("Save record"), Toasts.Type.SUCCESS));
        }
    };

    let finalBlob = blob;
    try {
        const durationMs = Date.now() - startTimeMs;
        finalBlob = await fixWebmDuration(blob, durationMs);
    } catch { }

    const native = (window as any).VencordNative?.pluginHelpers?.AutoCallRecorder;
    if (native?.saveRecording) {
        try {
            const arrayBuffer = await finalBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            if (!opts.autoSave && native?.promptSaveRecording) {
                const success = await native.promptSaveRecording(uint8Array, filename);
                if (success) notifySuccess();
                return;
            } else {
                const success = await native.saveRecording(uint8Array, opts.savePath, filename);
                if (success) notifySuccess();
                return;
            }
        } catch (e) {
            console.error("Native fallback save failed", e);
        }
    }

    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);

    notifySuccess();
}
