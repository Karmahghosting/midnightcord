/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { MouseEvent } from "react";
import { useTimer } from "@utils/react";

import { cl, VoiceMessage } from "..";

const PREVIEW_IDLE_LABEL = "----";
const PREVIEW_RECORDING_LABEL = "RECORDING";

export interface VoiceMessageProps {
    src: string;
    waveform: string;
}

export type VoicePreviewOptions = {
    src?: string;
    waveform: string;
    recording?: boolean;
    onDownload?: () => void;
};

export const VoicePreview = ({
    src,
    waveform,
    recording,
    onDownload,
}: VoicePreviewOptions) => {
    const durationMs = useTimer({
        deps: [recording]
    });

    const durationSeconds = recording ? Math.floor(durationMs / 1000) : 0;
    const durationDisplay = Math.floor(durationSeconds / 60) + ":" + (durationSeconds % 60).toString().padStart(2, "0");

    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (!onDownload) return;
        const target = event.target as HTMLElement;
        const link = target.closest('a[href^="blob:"]') as HTMLAnchorElement | null;

        if (link) {
            event.preventDefault();
            event.stopPropagation();
            onDownload();
        }
    };

    if (src && !recording)
        return (
            <div className={cl("preview", "preview-playback")} onClick={handleClick}>
                <div className={cl("preview-message")}>
                    <VoiceMessage key={src} src={src} waveform={waveform} />
                </div>
            </div>
        );

    return (
        <div className={cl("preview", recording ? "preview-recording" : [])}>
            <div className={cl("preview-indicator")} />
            <div className={cl("preview-time")}>{durationDisplay}</div>
            <div className={cl("preview-label")}>{recording ? PREVIEW_RECORDING_LABEL : PREVIEW_IDLE_LABEL}</div>
        </div>
    );
};
