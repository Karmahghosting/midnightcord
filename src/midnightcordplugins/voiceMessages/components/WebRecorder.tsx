/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, MediaEngineStore, useState } from "@webpack/common";

import { settings, type VoiceRecorder } from "..";

export const VoiceRecorderWeb: VoiceRecorder = ({ setAudioBlob, onRecordingChange }) => {
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [recorder, setRecorder] = useState<MediaRecorder>();

    const changeRecording = (recording: boolean) => {
        setRecording(recording);
        onRecordingChange?.(recording);
    };

    function toggleRecording() {
        const nowRecording = !recording;

        if (nowRecording) {
            navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: settings.store.echoCancellation,
                    noiseSuppression: settings.store.noiseSuppression,
                    deviceId: MediaEngineStore.getInputDeviceId()
                }
            }).then(mediaStream => {
                const chunks: Blob[] = [];

                const recorder = new MediaRecorder(mediaStream);
                setRecorder(recorder);

                const handleDataAvailable = (e: BlobEvent) => {
                    chunks.push(e.data);
                };

                const handleStop = () => {
                    setAudioBlob(new Blob(chunks, { type: "audio/ogg; codecs=opus" }));
                    changeRecording(false);

                    recorder.removeEventListener("dataavailable", handleDataAvailable);
                    recorder.removeEventListener("stop", handleStop);

                    mediaStream.getTracks().forEach(track => track.stop());
                };

                recorder.addEventListener("dataavailable", handleDataAvailable);
                recorder.addEventListener("stop", handleStop, { once: true });
                recorder.start();

                changeRecording(true);
            });
        } else {
            recorder?.stop();
        }
    }

    return (
        <Button onClick={toggleRecording}>
            {recording ? "Stop" : "Start"} recording
        </Button>
    );
};
