/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "../autoTranslateMidnightcord";


import "./styles.css";
import "./FIGMAUI/style.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Microphone } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { lastState as silentMessageEnabled } from "@plugins/silentMessageToggle";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { useAwaiter } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile } from "@utils/web";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { Button, CloudUploader, Constants, FluxDispatcher, Forms, lodash, Menu, MessageActions, Modal, openModal, PendingReplyStore, PermissionsBits, PermissionStore, RestAPI, SelectedChannelStore, showToast, SnowflakeUtils, Toasts, useEffect, useState, useRef } from "@webpack/common";
import { ComponentType } from "react";

import { VoiceRecorderDesktop } from "./components/DesktopRecorder";
import { VoiceMessageProps, VoicePreview } from "./components/VoicePreview";
import { VoiceRecorderWeb } from "./components/WebRecorder";

const VOICE_MESSAGE_FLAG = 1 << 13;
const SILENT_MESSAGE_FLAG = 4096;
const DEFAULT_WAVEFORM = "AAAAAAAAAAAA";
const DEFAULT_DURATION = 1;
const WAVEFORM_MIN_BINS = 32;
const WAVEFORM_MAX_BINS = 256;
const WAVEFORM_BINS_PER_SECOND = 10;
const WAVEFORM_MAX_VALUE = 0xFF;

const EMPTY_META: AudioMetadata = {
    waveform: DEFAULT_WAVEFORM,
    duration: DEFAULT_DURATION,
};

export const cl = classNameFactory("vc-vmsg-");

export type VoiceRecorder = React.ComponentType<{
    setAudioBlob(blob: Blob): void;
    onRecordingChange?(recording: boolean): void;
}>;

export let VoiceMessage: ComponentType<VoiceMessageProps> = () => null;

const VoiceRecorder = IS_DISCORD_DESKTOP ? VoiceRecorderDesktop : VoiceRecorderWeb;

export const settings = definePluginSettings({
    noiseSuppression: {
        type: OptionType.BOOLEAN,
        description: "Noise Suppression",
        default: true,
    },
    echoCancellation: {
        type: OptionType.BOOLEAN,
        description: "Echo Cancellation",
        default: true,
    },
});

const ctxMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props || !props.channel) return;
    if (props.channel.guild_id && !(PermissionStore.can(PermissionsBits.SEND_VOICE_MESSAGES, props.channel) && PermissionStore.can(PermissionsBits.SEND_MESSAGES, props.channel))) return;
    if (!Menu || !Menu.MenuItem) return;

    children.push(
        <Menu.MenuItem
            id="vc-send-vmsg"
            iconLeft={Microphone}
            leadingAccessory={{
                type: "icon",
                icon: Microphone
            }}
            label="Send Voice Message"
            action={() => openModal(modalProps => <VoiceMessageModal modalProps={modalProps} />)}
        />
    );
};

export default definePlugin({
    name: "VoiceMessages",
    enabledByDefault: true,
    description: "Allows you to send voice messages like on mobile. To do so, right click the upload button and click Send Voice Message",
    tags: ["Voice"],
    authors: [Devs.Ven, Devs.Vap, Devs.Nickyux],
    settings,

    patches: [
        {
            find: "#{intl::PAUSE_VOICE_MESSAGE_A11Y_LABEL}",
            replacement: {
                match: /(?<=\i=)(?=\i\.memo\(.{0,50}?=1,onVolumeChange:[^}]+?waveform:[^}]+?playbackCacheKey:)/,
                replace: "$self.VoiceMessage=",
            }
        }
    ],

    set VoiceMessage(value) {
        VoiceMessage = value;
    },

    contextMenus: {
        "channel-attach": ctxMenuPatch
    }
});

type AudioMetadata = {
    waveform: string,
    duration: number,
};

function generateWaveform(audioBuffer: AudioBuffer): string {
    const channelData = audioBuffer.getChannelData(0);
    const binCount = lodash.clamp(
        Math.floor(audioBuffer.duration * WAVEFORM_BINS_PER_SECOND),
        Math.min(WAVEFORM_MIN_BINS, channelData.length),
        WAVEFORM_MAX_BINS
    );

    const bins = new Uint8Array(binCount);
    const samplesPerBin = Math.floor(channelData.length / binCount);

    for (let binIdx = 0; binIdx < binCount; binIdx++) {
        let sum = 0;
        for (let sampleIdx = 0; sampleIdx < samplesPerBin; sampleIdx++) {
            const offset = binIdx * samplesPerBin + sampleIdx;
            sum += channelData[offset] ** 2;
        }
        bins[binIdx] = Math.floor(Math.sqrt(sum / samplesPerBin) * WAVEFORM_MAX_VALUE);
    }

    const maxBin = Math.max(...bins);
    if (maxBin) {
        const easing = Math.min(1, 100 * (maxBin / WAVEFORM_MAX_VALUE) ** 3);
        const ratio = 1 + (WAVEFORM_MAX_VALUE / maxBin - 1) * easing;
        for (let i = 0; i < binCount; i++) {
            bins[i] = Math.min(WAVEFORM_MAX_VALUE, Math.floor(bins[i] * ratio));
        }
    }

    return window.btoa(String.fromCharCode(...bins));
}

function sendAudio(blob: Blob, meta: AudioMetadata) {
    const channelId = SelectedChannelStore.getChannelId();
    const reply = PendingReplyStore.getPendingReply(channelId);
    if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });

    const upload = new CloudUploader({
        file: new File([blob], "voice-message.ogg", { type: "audio/ogg; codecs=opus" }),
        isThumbnail: false,
        platform: CloudUploadPlatform.WEB,
    }, channelId);

    upload.on("complete", () => {
        RestAPI.post({
            url: Constants.Endpoints.MESSAGES(channelId),
            body: {
                flags: VOICE_MESSAGE_FLAG | (silentMessageEnabled ? SILENT_MESSAGE_FLAG : 0),
                channel_id: channelId,
                content: "",
                nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                sticker_ids: [],
                type: 0,
                attachments: [{
                    id: "0",
                    filename: upload.filename,
                    uploaded_filename: upload.uploadedFilename,
                    waveform: meta.waveform,
                    duration_secs: meta.duration,
                }],
                message_reference: reply ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : null,
            }
        });
    });
    upload.on("error", () => showToast("Failed to upload voice message", Toasts.Type.FAILURE));

    upload.upload();
}

function useObjectUrl() {
    const [url, setUrl] = useState<string>();
    const setWithFree = (blob: Blob) => {
        if (url) URL.revokeObjectURL(url);
        setUrl(URL.createObjectURL(blob));
    };

    return [url, setWithFree] as const;
}

function VoiceMessageModal({ modalProps }: { modalProps: any; }) {
    const [isRecording, setRecording] = useState(false);
    const [blob, setBlob] = useState<Blob>();
    const [blobUrl, setBlobUrl] = useObjectUrl();

    const VoiceRecorder = IS_DISCORD_DESKTOP ? VoiceRecorderDesktop : VoiceRecorderWeb;

    useEffect(() => () => {
        if (blobUrl)
            URL.revokeObjectURL(blobUrl);
    }, [blobUrl]);

    const [meta, metaError] = useAwaiter(async () => {
        if (!blob) return EMPTY_META;

        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
        audioContext.close();

        return {
            waveform: generateWaveform(audioBuffer),
            duration: audioBuffer.duration,
        };
    }, {
        deps: [blob],
        fallbackValue: EMPTY_META,
    });

    const isUnsupportedFormat = blob && (!blob.type.startsWith("audio/ogg") || blob.type.includes("codecs") && !blob.type.includes("opus"));

    const downloadBlob = () => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "voice-message.ogg";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    useEffect(() => {
        const handler = (e: Event) => {
            try {
                const target = e.target as HTMLElement | null;
                if (!target) return;
                if (!target.closest || !document.body.querySelector) return;
                const modalRoot = target.closest('.vc-vmsg-figma-ui') || target.closest('.vc-vmsg-figma-ui-content');
                if (!modalRoot) return;
                const anchor = target.closest('a[href^="blob:"]') as HTMLAnchorElement | null;
                if (anchor) {
                    e.preventDefault();
                    e.stopPropagation();
                    downloadBlob();
                }
            } catch (err) {
                
            }
        };

        document.addEventListener('click', handler, true);
        return () => document.removeEventListener('click', handler, true);
    }, [blob]);

    return (
        <Modal
            {...modalProps}
            className={cl("modal")}
            title={t("Record Voice Message")}
            actions={[{
                text: "Send",
                variant: "primary",
                onClick: () => {
                    sendAudio(blob!, meta ?? EMPTY_META);
                    modalProps.onClose();
                    showToast("Now sending voice message... Please be patient", Toasts.Type.MESSAGE);
                },
                disabled: !blob
            }]}
        >
            <div className={cl("figma-ui")}> 
                <div className={cl("figma-ui-content")}>
                    <div className={cl("buttons")}>
                        <VoiceRecorder
                    setAudioBlob={blob => {
                        setBlob(blob);
                        setBlobUrl(blob);
                    }}
                    onRecordingChange={setRecording}
                />

                <Button
                    onClick={async () => {
                        const file = await chooseFile("audio/*");
                        if (file) {
                            setBlob(file);
                            setBlobUrl(file);
                        }
                    }}
                >
                    Upload File
                </Button>
            </div>

            <Forms.FormTitle>Preview</Forms.FormTitle>
            {metaError
                ? <Paragraph className={cl("error")}>Failed to parse selected audio file: {metaError.message}</Paragraph>
                : (
                    <>
                        <div className={cl("preview-container")}> 
                                    <VoicePreview
                                        src={blobUrl}
                                        waveform={meta.waveform}
                                        recording={isRecording}
                                        onDownload={downloadBlob}
                                    />
                                </div>
                        {blob && (
                            <div className={cl("send-row")}> 
                                <Button
                                    onClick={() => {
                                        try {
                                            sendAudio(blob, meta ?? EMPTY_META);
                                            modalProps.onClose();
                                            showToast("Now sending voice message... Please be patient", Toasts.Type.MESSAGE);
                                        } catch (e) {
                                            showToast("Failed to send voice message", Toasts.Type.FAILURE);
                                        }
                                    }}
                                    disabled={!blob}
                                >
                                    Send
                                </Button>
                            </div>
                        )}
                    </>
                )}

            {isUnsupportedFormat && (
                <Card variant="warning" className={Margins.top16} defaultPadding>
                    <Forms.FormText>Voice Messages have to be OggOpus to be playable on iOS. This file is <code>{blob.type}</code> so it will not be playable on iOS.</Forms.FormText>

                    <Forms.FormText className={Margins.top8}>
                        To fix it, first convert it to OggOpus, for example using the <Link href="https://convertio.co/mp3-opus/">convertio web converter</Link>
                    </Forms.FormText>
                </Card>
            )}
                </div>
            </div>
        </Modal>
    );
}
