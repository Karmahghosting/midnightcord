/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { DeleteIcon, HeadphonesIcon, NoEntrySignIcon, WarningIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import SettingsPlugin from "@plugins/_core/settings";
import { classes, removeFromArray } from "@utils/misc";
import definePlugin, { OptionType, PluginNative, ReporterTestable } from "@utils/types";
import { tPlugin as t } from "@api/pluginI18n";
import { Alerts, Button, React, ScrollerThin, Select, SettingsRouter, showToast, TextInput, Toasts } from "@webpack/common";

import type { ActionInfo, InstallInfo, NativeResult, StereoMethod2Quality } from "./native";

const Native = VencordNative.pluginHelpers.StereoInstaller as PluginNative<typeof import("./native")>;
const SETTINGS_ENTRY_KEY = "illegalcord_stereo_installer";
const DISCORD_AUDIO_COLLECTIVE_SOURCE_URL = "https://github.com/ProdHallow/Discord-Stereo-Windows-MacOS-Linux";
const VOICE_PLAYGROUND_SOURCE_URL = "https://codeberg.org/UnpackedX/Discord-Experimental-Subsystem";
const VOICE_PLAYGROUND_TUTORIAL_URL = "https://www.youtube.com/watch?v=zSIIganbZxg";

type InstallerMethod = "method1" | "method2" | "custom";
type LogLevel = "error" | "info" | "success" | "warning";

interface LogEntry {
    id: number;
    line: string;
}

const METHOD_LABELS = {
    method1: "Discord Audio Collective Method",
    method2: "Voice Playground Method",
    custom: "Custom Module Folder"
} satisfies Record<InstallerMethod, string>;

const METHOD_LAST_PATCH_KEYS = {
    method1: "discordAudioCollective",
    method2: "voicePlayground",
    custom: "customModule"
} satisfies Record<InstallerMethod, keyof InstallInfo["lastPatchLabels"]>;

const METHOD_OPTIONS = [
    { label: METHOD_LABELS.method1, value: "method1" },
    { label: METHOD_LABELS.method2, value: "method2" },
    { label: METHOD_LABELS.custom, value: "custom" }
] satisfies Array<{ label: string; value: InstallerMethod; }>;

const METHOD_2_QUALITY_OPTIONS = [
    { label: "128", value: "128" },
    { label: "384", value: "384" },
    { label: "512", value: "512" }
] satisfies Array<{ label: string; value: StereoMethod2Quality; }>;

let lastRepatchNotificationKey = "";
let nextLogId = 0;

function appendLogs(existingLogs: LogEntry[], newLogs: string[] | undefined): LogEntry[] {
    return [...existingLogs, ...(newLogs ?? []).map(line => ({ id: nextLogId++, line }))];
}

function notifyRepatchIfNeeded(info: InstallInfo): void {
    if (!info.repatchWarning) return;

    const key = `${info.discordRoot}:${info.clientLabel}:${info.repatchWarning}`;
    if (lastRepatchNotificationKey === key) return;

    lastRepatchNotificationKey = key;
    showNotification({
        title: t("StereoInstaller"),
        body: info.repatchWarning,
        permanent: true,
        onClick: () => SettingsRouter.openUserSettings(`${SETTINGS_ENTRY_KEY}_panel`)
    });
}

function StereoWarning() {
    return (
        <div className="vc-stereo-installer-warning">
            <Heading tag="h3">{t("StereoInstaller warning")}</Heading>
            <Paragraph>
                {t("This plugin replaces local Discord voice files to enable higher audio quality. It keeps a backup so you can restore the original files when needed.")}
            </Paragraph>
            <Paragraph>
                {t("Keep one method installed at a time. Revert to the saved backup before switching methods or after a Discord update if voice stops working.")}
            </Paragraph>
        </div>
    );
}

function InfoLine({ label, value }: { label: string; value: string; }) {
    return (
        <div className="vc-stereo-installer-info-line">
            <span>{label}</span>
            <code>{value || "--"}</code>
        </div>
    );
}

function InstallationStatus({ info }: { info: InstallInfo | ActionInfo; }) {
    const methodKey = info.installedMethod === "discordAudioCollective"
        ? "method1"
        : info.installedMethod === "voicePlayground"
            ? "method2"
            : info.installedMethod === "customModule"
                ? "custom"
                : null;
    const method = methodKey ? METHOD_LABELS[methodKey] : "StereoInstaller";

    if (info.installStatus === "installed") {
        return (
            <div className={classes("vc-stereo-installer-install-status", "vc-stereo-installer-install-status-installed")}>
                <HeadphonesIcon width={28} height={28} />
                <div>
                    <Heading tag="h3">{t("Stereo is installed")}</Heading>
                    <Paragraph>{method} {t("is active for")} {info.clientLabel}.</Paragraph>
                </div>
            </div>
        );
    }

    if (info.installStatus === "needsReinstall") {
        return (
            <div className={classes("vc-stereo-installer-install-status", "vc-stereo-installer-install-status-needs-reinstall")}>
                <WarningIcon width={28} height={28} />
                <div>
                    <Heading tag="h3">{t("Stereo must be installed again")}</Heading>
                    <Paragraph>{t("Discord was updated after")} {method} {t("was installed. Patch Discord voice again.")}</Paragraph>
                </div>
            </div>
        );
    }

    return (
        <div className={classes("vc-stereo-installer-install-status", "vc-stereo-installer-install-status-not-installed")}>
            <NoEntrySignIcon width={28} height={28} />
            <div>
                <Heading tag="h3">{t("Stereo is not installed")}</Heading>
                <Paragraph>{t("Choose a method and patch Discord voice to enable stereo audio.")}</Paragraph>
            </div>
        </div>
    );
}

function LogLine({ entry }: { entry: LogEntry; }) {
    const match = /^\[([^\]]+)]\s*(.*)$/.exec(entry.line);
    const timestamp = match?.[1] || "";
    const rawMessage = match?.[2] || entry.line;
    const level: LogLevel = /^(?:FAIL|ERROR):/i.test(rawMessage)
        ? "error"
        : /^WARN:/i.test(rawMessage)
            ? "warning"
            : /^OK:/i.test(rawMessage)
                ? "success"
                : "info";
    const message = rawMessage.replace(/^(?:FAIL|ERROR|WARN|OK):\s*/i, "");

    return (
        <div className={classes("vc-stereo-installer-log-line", `vc-stereo-installer-log-line-${level}`)}>
            <span className="vc-stereo-installer-log-time">{timestamp || "--"}</span>
            <span className="vc-stereo-installer-log-level">{level}</span>
            <span className="vc-stereo-installer-log-message">{message}</span>
        </div>
    );
}

function StereoInstallerPanel() {
    const [root, setRoot] = React.useState("");
    const [customFolder, setCustomFolder] = React.useState("");
    const [info, setInfo] = React.useState<InstallInfo | ActionInfo | null>(null);
    const [status, setStatus] = React.useState("Ready.");
    const [logs, setLogs] = React.useState<LogEntry[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [installerMethod, setInstallerMethod] = React.useState<InstallerMethod>("method1");
    const [method2Quality, setMethod2Quality] = React.useState<StereoMethod2Quality>("128");
    const voicePlaygroundUnavailable = !!info && info.platformKey !== "windows";
    const selectedLastPatch = info?.lastPatchLabels[METHOD_LAST_PATCH_KEYS[installerMethod]] ?? "--";

    async function runNative<T>(action: () => Promise<NativeResult<T>>): Promise<T | null> {
        setBusy(true);

        try {
            const result = await action();
            setLogs(currentLogs => appendLogs(currentLogs, result.logs));

            if (!result.success) {
                setStatus(result.error);
                showToast(result.error, Toasts.Type.FAILURE);
                return null;
            }

            return result.data;
        } finally {
            setBusy(false);
        }
    }

    async function autoDetect(): Promise<void> {
        const detected = await runNative(() => Native.autoDetect());
        if (!detected) return;

        setInfo(detected);
        setRoot(detected.discordRoot);
        setStatus(detected.repatchWarning || t("Discord install detected."));
        notifyRepatchIfNeeded(detected);
    }

    async function loadLogs(): Promise<void> {
        const result = await Native.readLogs();
        if (result.success) setLogs(appendLogs([], result.data));
    }

    async function clearLogs(): Promise<void> {
        const cleared = await runNative(() => Native.clearLogs());
        if (!cleared) return;

        setLogs([]);
        setStatus(t("Logs cleared."));
        showToast(t("StereoInstaller logs cleared."), Toasts.Type.SUCCESS);
    }

    async function browse(): Promise<void> {
        const selected = await runNative(() => Native.chooseDiscordRoot());
        if (!selected) return;

        setInfo(selected);
        setRoot(selected.discordRoot);
        setStatus(selected.repatchWarning || t("Discord install selected."));
        notifyRepatchIfNeeded(selected);
    }

    async function browseCustomFolder(): Promise<void> {
        const selected = await runNative(() => Native.chooseCustomModuleFolder());
        if (!selected) return;

        setCustomFolder(selected);
        setStatus(t("Custom module folder selected."));
    }

    async function runAction(kind: "patch" | "revert" | "method2Index"): Promise<void> {
        if (!root.trim()) {
            setStatus(t("Choose a Discord install folder first."));
            showToast(t("Choose a Discord install folder first."), Toasts.Type.FAILURE);
            return;
        }

        if (kind === "patch" && installerMethod === "custom" && !customFolder.trim()) {
            setStatus(t("Choose a custom module folder first."));
            showToast(t("Choose a custom module folder first."), Toasts.Type.FAILURE);
            return;
        }

        const result = await runNative<ActionInfo>(() => {
            if (kind === "revert") return Native.revert(root);
            if (kind === "method2Index") return Native.patchMethod2Index(root);
            if (installerMethod === "method2") return Native.patchMethod2(root, method2Quality);
            if (installerMethod === "custom") return Native.patchCustomModule(root, customFolder);

            return Native.patch(root);
        });
        if (!result) return;

        setInfo(result);
        setStatus(t("Discord will close now. Check the StereoInstaller log if it does not reopen."));
        showToast(t("Discord will close now to finish StereoInstaller."), Toasts.Type.SUCCESS);
    }

    function confirmPatch(): void {
        const isMethod2 = installerMethod === "method2";
        const isCustom = installerMethod === "custom";

        Alerts.show({
            title: isCustom
                ? t("Use Custom Module Folder?")
                : isMethod2
                    ? t("Use Voice Playground Method?")
                    : t("Use Discord Audio Collective Method?"),
            body: (
                <div>
                    {isCustom ? (
                        <>
                            <Paragraph>
                                {t("This will copy files from your custom module folder:")} <code>{customFolder}</code> {t("into your Discord voice module directory.")}
                            </Paragraph>
                            <Paragraph>
                                {t("Make sure your custom folder contains a valid discord_voice.node or index.js.")}
                            </Paragraph>
                        </>
                    ) : isMethod2 ? (
                        <>
                            <Paragraph>
                                {t("This will use the local")} {method2Quality} {t("file from StereoMethods/Discord-Voice, rename it to discord_voice.node, and copy it into")} <code>{"modules\\discord_voice-1\\discord_voice"}</code>.
                            </Paragraph>
                            <Paragraph>
                                {t("Voice Playground Method replaces the local voice module to enable higher audio quality. Use only one method on the same Discord install.")}
                            </Paragraph>
                        </>
                    ) : (
                        <>
                            <Paragraph>
                                {t("This will download the Discord Audio Collective Method files for your platform, save a backup, and replace the local Discord voice module to enable higher audio quality.")}
                            </Paragraph>
                            <Paragraph>
                                {t("Use Revert to restore the saved backup before switching methods or after a Discord update if voice stops working.")}
                            </Paragraph>
                        </>
                    )}
                </div>
            ),
            confirmText: t("Patch Discord voice"),
            cancelText: t("Cancel"),
            confirmColor: Button.Colors.RED,
            onConfirm: () => void runAction("patch")
        });
    }

    function confirmMethod2IndexPatch(): void {
        Alerts.show({
            title: t("Replace Voice Playground index.js?"),
            body: (
                <div>
                    <Paragraph>
                        {t("This will copy index.js from StereoMethods/Discord-Voice into")} <code>{"modules\\discord_voice-1\\discord_voice"}</code>.
                    </Paragraph>
                    <Paragraph>
                        {t("Discord will close while the file is replaced. Use this only if you are fixing Voice Playground Method files or know you need that index.js.")}
                    </Paragraph>
                </div>
            ),
            confirmText: t("Replace index.js"),
            cancelText: "Cancel",
            confirmColor: Button.Colors.RED,
            onConfirm: () => void runAction("method2Index")
        });
    }

    function selectInstallerMethod(value: InstallerMethod): void {
        if (value === "method2" && voicePlaygroundUnavailable) {
            setStatus(t("Voice Playground Method is only available on Windows. Linux support is handled by Discord Audio Collective Method."));
            showToast(t("Voice Playground Method is only available on Windows."), Toasts.Type.FAILURE);
            return;
        }

        setInstallerMethod(value);
    }

    function openDiscordAudioCollectiveSource(): void {
        VencordNative.native.openExternal(DISCORD_AUDIO_COLLECTIVE_SOURCE_URL);
    }

    function openVoicePlaygroundSource(): void {
        VencordNative.native.openExternal(VOICE_PLAYGROUND_SOURCE_URL);
    }

    function openMethod2Tutorial(): void {
        VencordNative.native.openExternal(VOICE_PLAYGROUND_TUTORIAL_URL);
    }

    React.useEffect(() => {
        void loadLogs().then(autoDetect);
    }, []);

    React.useEffect(() => {
        if (!voicePlaygroundUnavailable || installerMethod !== "method2") return;

        setInstallerMethod("method1");
        setStatus("Voice Playground Method is only available on Windows. Linux support is handled by Discord Audio Collective Method.");
    }, [installerMethod, voicePlaygroundUnavailable]);

    return (
        <div className="vc-stereo-installer-root">
            <div className="vc-stereo-installer-controls">
                <div className="vc-stereo-installer-select-grid">
                    <div className="vc-stereo-installer-select-row">
                        <div>
                            <span>{t("Installer method")}</span>
                            <Paragraph>{voicePlaygroundUnavailable ? t("Voice Playground Method is Windows-only.") : t("Use only one method at a time.")}</Paragraph>
                        </div>
                        <Select
                            options={METHOD_OPTIONS}
                            select={selectInstallerMethod}
                            isSelected={(value: InstallerMethod) => value === installerMethod}
                            serialize={(value: InstallerMethod) => value}
                        />
                    </div>

                    {installerMethod === "method2" && (
                        <div className="vc-stereo-installer-select-row">
                            <div>
                                <span>{t("Voice Playground quality")}</span>
                                <Paragraph>{t("The selected file will be installed as discord_voice.node.")}</Paragraph>
                            </div>
                            <Select
                                options={METHOD_2_QUALITY_OPTIONS}
                                select={(value: StereoMethod2Quality) => setMethod2Quality(value)}
                                isSelected={(value: StereoMethod2Quality) => value === method2Quality}
                                serialize={(value: StereoMethod2Quality) => value}
                            />
                        </div>
                    )}

                    {installerMethod === "custom" && (
                        <div className="vc-stereo-installer-select-row">
                            <div>
                                <span>{t("Custom module folder")}</span>
                                <Paragraph>{t("Select a folder (e.g. from Desktop) containing your discord_voice.node or index.js files.")}</Paragraph>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <TextInput
                                    value={customFolder}
                                    placeholder={t("Path to custom module folder (e.g. Desktop/my-modules)")}
                                    onChange={(value: string) => setCustomFolder(value)}
                                    disabled={busy}
                                    style={{ flex: 1 }}
                                />
                                <Button
                                    color={Button.Colors.PRIMARY}
                                    size={Button.Sizes.SMALL}
                                    disabled={busy}
                                    onClick={() => void browseCustomFolder()}
                                    style={{ flexShrink: 0 }}
                                >{t("Browse folder")}</Button>
                            </div>
                        </div>
                    )}

                    <div className="vc-stereo-installer-select-row">
                        <div>
                            <span>{t("Source code")}</span>
                            <Paragraph>{t("Each method has its own upstream source.")}</Paragraph>
                        </div>
                        <div className="vc-stereo-installer-warning-actions">
                            <Button
                                color={Button.Colors.PRIMARY}
                                size={Button.Sizes.SMALL}
                                onClick={openDiscordAudioCollectiveSource}
                            >{t("Discord Audio Collective")}</Button>
                            <Button
                                color={Button.Colors.PRIMARY}
                                size={Button.Sizes.SMALL}
                                onClick={openVoicePlaygroundSource}
                            >{t("Voice Playground")}</Button>
                        </div>
                    </div>
                </div>

                {installerMethod === "method2" && (
                    <div className="vc-stereo-installer-method2-note">
                        <Paragraph>
                            {t("Voice Playground Method uses bundled Windows payloads from StereoMethods/Discord-Voice for higher audio quality. Do not install both methods on the same client. If Discord voice files stop working, use the bundled index.js repair and check the tutorial.")}
                        </Paragraph>
                        <div className="vc-stereo-installer-warning-actions">
                            <Button
                                color={Button.Colors.PRIMARY}
                                size={Button.Sizes.SMALL}
                                onClick={openVoicePlaygroundSource}
                            >{t("Voice Playground source")}</Button>
                            <Button
                                color={Button.Colors.PRIMARY}
                                size={Button.Sizes.SMALL}
                                onClick={openMethod2Tutorial}
                            >{t("Corruption fix tutorial")}</Button>
                            <Button
                                color={Button.Colors.RED}
                                size={Button.Sizes.SMALL}
                                disabled={busy}
                                onClick={confirmMethod2IndexPatch}
                            >{t("Replace index.js")}</Button>
                        </div>
                    </div>
                )}

                <TextInput
                    value={root}
                    placeholder={t("Discord install folder")}
                    onChange={(value: string) => setRoot(value)}
                    disabled={busy}
                />
                <div className="vc-stereo-installer-buttons">
                    <Button
                        color={Button.Colors.PRIMARY}
                        size={Button.Sizes.SMALL}
                        disabled={busy}
                        onClick={() => void autoDetect()}
                    >{t("Auto-detect")}</Button>
                    <Button
                        color={Button.Colors.PRIMARY}
                        size={Button.Sizes.SMALL}
                        disabled={busy}
                        onClick={() => void browse()}
                    >{t("Browse")}</Button>
                    <Button
                        color={Button.Colors.GREEN}
                        size={Button.Sizes.SMALL}
                        disabled={busy}
                        onClick={confirmPatch}
                    >{t("Patch Discord voice")}</Button>
                    <Button
                        color={Button.Colors.RED}
                        size={Button.Sizes.SMALL}
                        disabled={busy}
                        onClick={() => void runAction("revert")}
                    >{t("Revert to backup")}</Button>
                </div>
            </div>

            {info && <InstallationStatus info={info} />}

            {info && (
                <div className="vc-stereo-installer-info">
                    <InfoLine label={t("Client")} value={info.clientLabel} />
                    <InfoLine label={t("Platform")} value={`${info.platformLabel} ${info.readableOs}`} />
                    <InfoLine label={t("Voice module")} value={info.voiceDir} />
                    {"logPath" in info && <InfoLine label={t("Log file")} value={info.logPath} />}
                    <InfoLine label={`${t(METHOD_LABELS[installerMethod])} ${t("last patch")}`} value={selectedLastPatch} />
                </div>
            )}

            <Paragraph className="vc-stereo-installer-status">{busy ? t("Working...") : status}</Paragraph>

            <div className="vc-stereo-installer-log-panel">
                <div className="vc-stereo-installer-log-header">
                    <div>
                        <Heading tag="h3">{t("Installer logs")}</Heading>
                        <Paragraph>{logs.length ? `${logs.length} ${t("log entries.")}` : t("No log entries yet.")}</Paragraph>
                    </div>
                    <Button
                        color={Button.Colors.RED}
                        size={Button.Sizes.SMALL}
                        disabled={busy || !logs.length}
                        onClick={() => void clearLogs()}
                    >
                        <DeleteIcon width={16} height={16} />
                        {t("Clear logs")}
                    </Button>
                </div>
                <div className="vc-stereo-installer-log" role="log" aria-live="polite">
                    {logs.length
                        ? logs.slice(-200).map(entry => <LogLine key={entry.id} entry={entry} />)
                        : <div className="vc-stereo-installer-log-empty">{t("StereoInstaller activity will appear here.")}</div>}
                </div>
            </div>
        </div>
    );
}

function StereoInstallerPage() {
    return (
        <>
            <StereoWarning />
            <StereoInstallerPanel />
        </>
    );
}

const settings = definePluginSettings({
    installer: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(StereoInstallerPanel, { noop: true }),
    }
});

export default definePlugin({
    name: "StereoInstaller",
    description: t("Installs and reverts the Discord stereo voice module from selected method sources."),
    tags: ["Utility"],
    authors: [{ name: "irritably",
     id: 928787166916640838n }],
    required: true,
    reporterTestable: ReporterTestable.None,
    settings,
    settingsAboutComponent: ErrorBoundary.wrap(StereoWarning, { noop: true }),
    toolboxActions: {
        [t("Open StereoInstaller")]: () => SettingsRouter.openUserSettings(`${SETTINGS_ENTRY_KEY}_panel`),
    },

    start() {
        if (!SettingsPlugin.customEntries.some(entry => entry.key === SETTINGS_ENTRY_KEY)) {
            SettingsPlugin.customEntries.push({
                key: SETTINGS_ENTRY_KEY,
                title: t("StereoInstaller"),
                Component: ErrorBoundary.wrap(StereoInstallerPage, { noop: true }),
                Icon: HeadphonesIcon,
            });
        }

        void Native.autoDetect().then(result => {
            if (result.success) notifyRepatchIfNeeded(result.data);
        }, () => void 0);
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === SETTINGS_ENTRY_KEY);
    }
});
