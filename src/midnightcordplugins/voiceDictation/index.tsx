/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { showApiKeyWarning } from "@utils/apiKeyWarning";
import definePlugin, { OptionType } from "@utils/types";
import { ComponentDispatch, MediaEngineStore, React, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";
import plugins from "~plugins";

import { getGroqKey } from "../midnightcordAI/groqManager";
import { t } from "../autoTranslateMidnightcord";

const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        description: "Transcription language. Auto-detect may occasionally hallucinate English.",
        options: [
            { label: "French (Français)", value: "fr", default: true },
            { label: "English (Anglais)", value: "en" },
            { label: "Spanish (Español)", value: "es" },
            { label: "German (Deutsch)", value: "de" },
            { label: "Italian (Italiano)", value: "it" },
            { label: "Portuguese (Português)", value: "pt" },
            { label: "Auto-detect", value: "" }
        ],
        restartNeeded: false,
    },
    chunkSeconds: {
        type: OptionType.SLIDER,
        description: "Audio segment duration (seconds). Shorter = more reactive but less precise.",
        markers: [1, 2, 3, 5, 8, 10],
        default: 2,
        restartNeeded: false,
    },
});

const DictationIcon: React.FC<{
    recording?: boolean;
    processing?: boolean;
    height?: string | number;
    width?: string | number;
    className?: string;
}> = ({ recording = false, processing = false, height = 20, width = 20, className }) => (
    <svg
        aria-hidden="true"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        fill="none"
        viewBox="0 0 24 24"
        className={className}
        style={{ color: processing ? "var(--text-warning)" : recording ? "var(--status-danger)" : "currentColor" }}
    >
        <path fill="currentColor" d="M5.04 12c-.37 0-.7.34-.58.7A8 8 0 0 0 11 17.93V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.06A8 8 0 0 0 20 10a1 1 0 1 0-2 0 6 6 0 0 1-11.56 2.27.62.62 0 0 0-.7-.35c-.23.05-.47.08-.7.08Z" />
        <path fill="currentColor" d="M8 9.94V10a4 4 0 0 0 8 0V6a4 4 0 0 0-4.53-3.97c-.4.06-.47.58-.21.9A3.22 3.22 0 0 1 9.9 8l-1.16.43a.5.5 0 0 0-.3.3L8.01 9.9 8 9.94Z" />
        <path fill="currentColor" d="m9.2 3.86-.46-.17-.91-.34a2 2 0 0 1-1.18-1.18L6.14.79a1.21 1.21 0 0 0-2.28 0l-.5 1.38a2 2 0 0 1-1.19 1.18l-1.38.51a1.21 1.21 0 0 0 0 2.28l1.38.5a2 2 0 0 1 1.18 1.19l.51 1.38a1.21 1.21 0 0 0 2.28 0l.5-1.38a2 2 0 0 1 1.19-1.18L8 6.59l1.2-.45a1.21 1.21 0 0 0 0-2.28Z" />
    </svg>
);

function insertText(text: string) {
    ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", {
        rawText: text,
        plainText: text,
    });
}

async function transcribe(blob: Blob): Promise<string> {
    const language = settings.store.language?.trim() || undefined;
    const apiKey = await getGroqKey();
    if (!apiKey) throw new Error(t("API key missing — Configure your key in Settings → MidnightcordAI"));

    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "text");
    form.append("prompt", "Ceci est une dictée vocale en français. Ne pas traduire en anglais. Ne pas générer de texte si il n'y a que du silence.");
    if (language) form.append("language", language);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Groq API ${res.status}: ${body.slice(0, 120)}`);
    }

    return (await res.text()).trim();
}

function getDiscordVoice(): any | null {
    try {
        return (DiscordNative as any)?.nativeModules?.requireModule?.("discord_voice") ?? null;
    } catch {
        return null;
    }
}

const VoiceDictationButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const nativeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const nativeRecordingRef = useRef(false);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const activeRef = useRef(false);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => { stopDictation(); }, []);

    async function processBlob(blob: Blob) {
        if (blob.size < 100) return;
        setProcessing(true);
        try {
            const text = await transcribe(blob);
            if (text) {
                const t = text.trim();
                const isHallucination =
                    /^(merci|thanks?|thank you|music|♪|🎵|\.\.\.|\.\s*)+$/i.test(t) ||
                    /sous[- ]?titr/i.test(t) ||
                    /radio[- ]?canada|société radio/i.test(t) ||
                    /merci .*(regard|écouter|suivi)|thanks? .*watch/i.test(t) ||
                    /transcri(ption|t)\s*(par|by)/i.test(t) ||
                    /^(.{1,15})\1{2,}$/i.test(t.replace(/\s+/g, "")) ||
                    /^[\s.,!?…\-–—]+$/.test(t);
                if (!isHallucination) insertText(text + " ");
            }
        } catch (e: any) {
            setErrorMsg(e.message.slice(0, 100));
        } finally {
            setProcessing(false);
        }
    }

    function startRecorder(stream: MediaStream) {
        const mimeType =
            ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
                .find(m => MediaRecorder.isTypeSupported(m)) ?? "";
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start();
    }

    async function flushAndTranscribe() {
        if (!recorderRef.current || recorderRef.current.state !== "recording") return;

        recorderRef.current.stop();
        await new Promise<void>(resolve => { recorderRef.current!.onstop = () => resolve(); });

        const chunks = [...chunksRef.current];
        chunksRef.current = [];

        if (chunks.length === 0 || !activeRef.current) {
            if (activeRef.current) restartRecorder();
            return;
        }

        const mimeType = recorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        await processBlob(blob);

        if (activeRef.current) restartRecorder();
    }

    function restartRecorder() {
        if (!streamRef.current || !activeRef.current) return;
        try { startRecorder(streamRef.current); } catch { }
    }

    async function startNative(discordVoice: any) {
        const chunkMs = (settings.store.chunkSeconds ?? 2) * 1000;
        async function cycleNative() {
            if (!nativeRecordingRef.current) return;

            await new Promise<void>(resolve => {
                discordVoice.stopLocalAudioRecording(async (filePath: string) => {
                    nativeRecordingRef.current = false;
                    if (filePath) {
                        try {
                            const buf = await (VencordNative as any).pluginHelpers?.VoiceMessages?.readRecording?.(filePath);
                            if (buf) {
                                const blob = new Blob([new Uint8Array(buf)], { type: "audio/ogg; codecs=opus" });
                                await processBlob(blob);
                            }
                        } catch { }
                    }
                    resolve();
                });
            });

            if (activeRef.current) {
                discordVoice.startLocalAudioRecording(
                    {
                        echoCancellation: false,
                        noiseCancellation: false,
                        deviceId: MediaEngineStore.getInputDeviceId(),
                    },
                    (success: boolean) => {
                        if (success) {
                            nativeRecordingRef.current = true;
                        }
                    }
                );
            }
        }

        await new Promise<void>((resolve, reject) => {
            discordVoice.startLocalAudioRecording(
                {
                    echoCancellation: false,
                    noiseCancellation: false,
                    deviceId: MediaEngineStore.getInputDeviceId(),
                },
                (success: boolean) => {
                    if (success) {
                        nativeRecordingRef.current = true;
                        resolve();
                    } else {
                        reject(new Error("startLocalAudioRecording returned false"));
                    }
                }
            );
        });

        setRecording(true);
        nativeTimerRef.current = setInterval(() => cycleNative(), chunkMs);
    }

    async function stopNative(discordVoice: any) {
        if (nativeTimerRef.current) {
            clearInterval(nativeTimerRef.current);
            nativeTimerRef.current = null;
        }
        if (nativeRecordingRef.current) {
            discordVoice.stopLocalAudioRecording(async (filePath: string) => {
                nativeRecordingRef.current = false;
                if (filePath) {
                    try {
                        const buf = await (VencordNative as any).pluginHelpers?.VoiceMessages?.readRecording?.(filePath);
                        if (buf) await processBlob(new Blob([new Uint8Array(buf)], { type: "audio/ogg; codecs=opus" }));
                    } catch { /* ignore */ }
                }
            });
        }
    }

    async function startFallback() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("getUserMedia not available in this context");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000,
        }});
        streamRef.current = stream;
        startRecorder(stream);
        setRecording(true);
        const chunkMs = (settings.store.chunkSeconds ?? 2) * 1000;
        timerRef.current = setInterval(() => flushAndTranscribe(), chunkMs);
    }

    async function startDictation() {
        setErrorMsg(null);

        const apiKey = await getGroqKey();
        if (!apiKey) {
            showApiKeyWarning("VoiceDictation");
            return;
        }

        activeRef.current = true;

        try {
            await startFallback();
            return;
        } catch { }

        const discordVoice = getDiscordVoice();
        if (discordVoice?.startLocalAudioRecording) {
            try {
                await startNative(discordVoice);
                return;
            } catch { }
        }

        setErrorMsg(t("Could not access microphone"));
        activeRef.current = false;
    }

    function stopDictation() {
        activeRef.current = false;

        const discordVoice = getDiscordVoice();
        if (discordVoice && nativeRecordingRef.current) {
            stopNative(discordVoice);
        }
        if (nativeTimerRef.current) {
            clearInterval(nativeTimerRef.current);
            nativeTimerRef.current = null;
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        recorderRef.current = null;
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        setRecording(false);
        setProcessing(false);
    }

    function toggle() {
        if (recording) {
            const discordVoice = getDiscordVoice();
            if (discordVoice && nativeRecordingRef.current) {
                stopDictation();
            } else {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                flushAndTranscribe().finally(() => stopDictation());
            }
        } else {
            startDictation();
        }
    }

    if (!isMainChat) return null;

    const tooltip = errorMsg || (processing ? t("Transcribing...") : recording ? t("Stop dictation") : t("Voice dictation"));

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={toggle}
            onContextMenu={e => {
                e.preventDefault();
                openPluginModal(plugins["VoiceDictation"] ?? plugins["voiceDictation"]);
            }}
        >
            <DictationIcon recording={recording} processing={processing} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "VoiceDictation",
    enabledByDefault: true,
    description: "Real-time voice dictation via Groq Whisper (free). API key shared with MidnightcordAI.",
    authors: [{ name: "User",
     id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    settings,
    chatBarButton: {
        icon: DictationIcon as any,
        render: VoiceDictationButton,
    },
});