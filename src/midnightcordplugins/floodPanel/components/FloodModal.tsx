/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { HeadingPrimary, HeadingSecondary } from "@components/Heading";
import { Margins } from "@utils/margins";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { RestAPI, TextArea, useEffect, useMemo, useRef, useState } from "@webpack/common";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { t } from "../../autoTranslateMidnightcord";

const DEFAULT_MESSAGES = [
    "you literal npc",
    "youre such a boomer",
    "you absolute clown",
    "bro is a certified hater",
    "you have zero rizz",
    "youre acting like a karen",
    "bro is so mid",
    "youre a massive yapper",
    "bro is computing in slow motion",
    "youre such a tryhard",
    "you absolute bot",
    "youre a total fraud",
    "bro is a certified npc",
    "youre acting like a baby",
    "bro is so irrelevant",
    "youre such a local",
    "youre a massive gatekeeper",
    "you absolute casual",
    "bro is living in 2012",
    "youre such a loser"
];

const DELAY_OPTIONS = [
    { label: "0ms", value: "0" },
    { label: "50ms", value: "50" },
    { label: "100ms", value: "100" },
    { label: "250ms", value: "250" },
    { label: "500ms", value: "500" },
    { label: "1s", value: "1000" },
    { label: "2s", value: "2000" },
    { label: "5s", value: "5000" },
];

interface Props {
    channel: { id: string; };
    rootProps: ModalProps;
    onRunningChange: (running: boolean) => void;
}

function makeNonce(): string {
    const DISCORD_EPOCH = 1420070400000n;
    const nowMs = BigInt(Date.now());
    const tsPart = (nowMs - DISCORD_EPOCH) << 22n;
    const rndPart = BigInt(Math.floor(Math.random() * 0x3FFFFF));
    return String(tsPart | rndPart);
}

export function FloodModal({ channel, rootProps, onRunningChange }: Props) {
    const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const [delayMs, setDelayMs] = useState("500");
    const [shuffle, setShuffle] = useState(true);
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState("");

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const indexRef = useRef(0);
    const runningRef = useRef(false);

    const delayOptions = useMemo(() => DELAY_OPTIONS, []);

    useEffect(() => { onRunningChange(running); }, [running]);
    useEffect(() => {
        return () => {
            runningRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    function startFlood() {
        if (runningRef.current || messages.length === 0) return;
        runningRef.current = true;
        indexRef.current = 0;
        setRunning(true);
        setStatus(t("In progress..."));
        scheduleNext();
    }

    function stopFlood() {
        runningRef.current = false;
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setRunning(false);
        setStatus(t("Stopped"));
    }

    function scheduleNext(extraDelay = 0) {
        const ms = Number(delayMs);
        const delay = Math.max(0, (ms > 0 ? ms : 50) + extraDelay);
        timerRef.current = setTimeout(tick, delay);
    }

    async function tick() {
        if (!runningRef.current || messages.length === 0) { stopFlood(); return; }
        const idx = shuffle
            ? Math.floor(Math.random() * messages.length)
            : indexRef.current % messages.length;
        indexRef.current++;
        try {
            const response = await RestAPI.post({
                url: `/channels/${channel.id}/messages`,
                body: { content: messages[idx], nonce: makeNonce(), tts: false }
            });
            if (response.status === 429) {
                setStatus(t("Rate limited — waiting..."));
                if (runningRef.current) scheduleNext(1000);
                return;
            }
            setStatus(t("Sent:") + ` ${++indexRef.current - 1}`);
        } catch { setStatus(t("Network error...")); }
        if (runningRef.current) scheduleNext();
    }



    return (
        <ModalRoot {...rootProps}>
            <ModalHeader className="vc-flood-modal-header">
                <HeadingPrimary className="vc-flood-modal-title">{t("Flood Panel")}</HeadingPrimary>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="vc-flood-modal-content">

                {/* Messages source */}
                <HeadingSecondary className={Margins.bottom8}>{t("Messages source")}</HeadingSecondary>
                {isEditing ? (
                    <div className={Margins.bottom16}>
                        <TextArea 
                            value={editValue} 
                            onChange={(v: string) => setEditValue(v)}
                            placeholder={t("Write your phrases here, one per line...")}
                            rows={8}
                            autoFocus
                            style={{ marginBottom: "12px" }}
                        />
                        <div className="vc-flood-file-row">
                            <Button variant="primary" size="small" onClick={() => {
                                const lines = editValue.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                                if (lines.length > 0) {
                                    setMessages(lines);
                                    setFileName(t("Custom") + ` (${lines.length} ` + t("phrases)"));
                                }
                                setIsEditing(false);
                            }}>
                                {t("Save")}
                            </Button>
                            <Button variant="secondary" size="small" onClick={() => setIsEditing(false)}>
                                {t("Cancel")}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="vc-flood-file-info">
                            {fileName ?? t("Default") + ` (${messages.length} ` + t("phrases)")}
                        </div>
                        <div className={`vc-flood-file-row ${Margins.bottom16}`}>
                            <Button variant="secondary" size="small" onClick={() => {
                                setEditValue(messages.join("\n"));
                                setIsEditing(true);
                            }}>
                                {t("Edit phrases")}
                            </Button>
                            <Button variant="secondary" size="small" onClick={() => { setMessages(DEFAULT_MESSAGES); setFileName(null); }}>
                                {t("Default")}
                            </Button>
                        </div>
                    </>
                )}

                <Divider className={Margins.bottom16} />

                {/* Delay */}
                <HeadingSecondary className={Margins.bottom8}>{t("Delay between messages")}</HeadingSecondary>
                <div className={Margins.bottom16}>
                    <SafeSearchableSelect
                        options={delayOptions}
                        value={delayOptions.find(o => o.value === delayMs)?.value}
                        placeholder={t("Choose a delay")}
                        maxVisibleItems={8}
                        closeOnSelect={true}
                        onChange={(v: string) => setDelayMs(v)}
                    />
                </div>

                {/* Status */}
                {status !== "" && (
                    <div className="vc-flood-status">
                        {running && <div className="vc-flood-spinner" />}
                        <span className={running ? "vc-flood-status-active" : "vc-flood-status-idle"}>
                            {status}
                        </span>
                    </div>
                )}

            </ModalContent>

            <ModalFooter className="vc-flood-modal-footer">
                <Button
                    variant={running ? "dangerPrimary" : "positive"}
                    size="medium"
                    onClick={running ? stopFlood : startFlood}
                >
                    {running ? t("Stop flood") : t("Start flood")}
                </Button>
                <Button variant="secondary" size="medium" onClick={rootProps.onClose}>
                    {t("Close")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
