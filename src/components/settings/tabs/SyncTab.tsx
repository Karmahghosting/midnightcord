/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    addBadgeVisibilityListener,
    BadgeSource,
    getOwnHiddenBadgeSources,
    removeBadgeVisibilityListener,
    setOwnHiddenBadgeSources
} from "@api/BadgeVisibility";
import { t } from "@api/i18n";
import { useSettings } from "@api/Settings";
import {
    createCloudIdentity,
    getCloudKey,
    getCurrentCloudFingerprint,
    importCloudIdentity,
    unlinkCloudIdentity
} from "@api/SettingsSync/cloudSetup";
import {
    deleteCloudSettings,
    eraseAllCloudData,
    getCloudHistory,
    getCloudSettings,
    putCloudSettings,
    restoreCloudRevision
} from "@api/SettingsSync/cloudSync";
import { addCommunityChangeListener, getCommunityStatus, offerCommunityJoin, openCommunityJoin } from "@api/SettingsSync/community";
import type { CommunityStatus } from "@api/SettingsSync/communityFlow";
import type { CloudItemKey, CloudManifestEntry } from "@api/SettingsSync/types";
import { Button, LinkButton } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CloudUploadIcon, CopyIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { copyWithToast } from "@utils/discord";
import { Margins } from "@utils/margins";
import { Alerts, React, TextInput, useEffect, useState } from "@webpack/common";

const BADGE_OPTIONS: Array<{ label: string; value: BadgeSource; }> = [
    { label: "Vencord", value: "vencord" },
    { label: "Equicord", value: "equicord" },
    { label: "Midnightcord", value: "midnightcord" },
    { label: "GlobalBadges", value: "globalbadges" },
    { label: "Illegalcord", value: "illegalcord" }
];

const DIRECTION_OPTIONS = [
    { label: "Two-way — download remote changes and upload local changes", value: "both" },
    { label: "This device — upload only", value: "push" },
    { label: "Cloud — download only", value: "pull" },
    { label: "Manual — use the buttons below", value: "manual" }
] as const;

function formatLastSync(value: number) {
    if (!value) return t("Never synchronized");
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch {
        return new Date(value).toLocaleString();
    }
}

function SyncTab() {
    const settings = useSettings(["cloud.*"]);
    const [cloudKey, setCloudKey] = useState<string | null>(null);
    const [fingerprint, setFingerprint] = useState<string | null>(null);
    const [revealKey, setRevealKey] = useState(false);
    const [keyInput, setKeyInput] = useState("");
    const [keyError, setKeyError] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState<Record<CloudItemKey, CloudManifestEntry[]>>({ settings: [], quickCss: [] });
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string>();
    const [communityStatus, setCommunityStatus] = useState<CommunityStatus | null>(null);
    const [communityLoading, setCommunityLoading] = useState(false);
    const [communityError, setCommunityError] = useState(false);
    const [communityBusy, setCommunityBusy] = useState(false);
    const [communityRefresh, setCommunityRefresh] = useState(0);
    const [hidden, setHidden] = useState<BadgeSource[]>(getOwnHiddenBadgeSources());

    async function refreshIdentity() {
        const key = await getCloudKey();
        setCloudKey(key);
        setFingerprint(await getCurrentCloudFingerprint());
    }

    async function refreshCloudHistory() {
        if (!cloudKey) return;
        setHistoryLoading(true);
        try {
            const [settingsHistory, quickCssHistory] = await Promise.all([
                getCloudHistory("settings"),
                getCloudHistory("quickCss")
            ]);
            setHistory({ settings: settingsHistory, quickCss: quickCssHistory });
            setHistoryError(undefined);
        } catch (error) {
            setHistoryError(t(error instanceof Error ? error.message : "Could not load Cloud history."));
        } finally {
            setHistoryLoading(false);
        }
    }

    useEffect(() => {
        void refreshIdentity();
        const listener = () => setHidden([...getOwnHiddenBadgeSources()]);
        addBadgeVisibilityListener(listener);
        return () => removeBadgeVisibilityListener(listener);
    }, []);

    async function run(action: () => Promise<unknown>) {
        if (busy) return;
        setBusy(true);
        try {
            await action();
            await refreshIdentity();
        } finally {
            setBusy(false);
        }
    }

    async function toggleCloud(enabled: boolean) {
        if (enabled) {
            const key = await createCloudIdentity();
            settings.cloud.enabled = true;
            setCloudKey(key);
            setFingerprint(await getCurrentCloudFingerprint());
            setRevealKey(true);
            void offerCommunityJoin();
        } else {
            settings.cloud.enabled = false;
        }
    }

    async function linkExistingKey() {
        try {
            await importCloudIdentity(keyInput);
            settings.cloud.enabled = true;
            setKeyInput("");
            setKeyError(undefined);
            await refreshIdentity();
            void offerCommunityJoin();
        } catch {
            setKeyError(t("Invalid Midnightcord Cloud key"));
        }
    }

    async function unlinkDevice() {
        await unlinkCloudIdentity();
        settings.cloud.enabled = false;
        setCloudKey(null);
        setFingerprint(null);
        setRevealKey(false);
    }

    async function onBadgeChange(next: BadgeSource[]) {
        setHidden(next);
        await setOwnHiddenBadgeSources(next);
    }

    async function joinCommunity() {
        if (communityBusy) return;
        setCommunityBusy(true);
        try {
            await openCommunityJoin();
        } finally {
            setCommunityBusy(false);
        }
    }

    const linked = Boolean(cloudKey);
    const syncEnabled = settings.cloud.enabled && linked && (settings.cloud.settingsSync || settings.cloud.quickCssSync);

    useEffect(() => {
        let active = true;
        let revision = 0;
        setCommunityStatus(null);
        setCommunityError(false);
        setCommunityLoading(false);
        if (!cloudKey || !settings.cloud.enabled) return;

        const refresh = async () => {
            const request = ++revision;
            setCommunityLoading(true);
            try {
                const status = await getCommunityStatus();
                if (!active || request !== revision) return;
                setCommunityStatus(status);
                setCommunityError(false);
            } catch {
                if (active && request === revision) setCommunityError(true);
            } finally {
                if (active && request === revision) setCommunityLoading(false);
            }
        };
        const onFocus = () => void refresh();
        const unsubscribe = addCommunityChangeListener(onFocus);
        window.addEventListener("focus", onFocus);
        void refresh();
        return () => {
            active = false;
            unsubscribe();
            window.removeEventListener("focus", onFocus);
        };
    }, [cloudKey, settings.cloud.enabled, communityRefresh]);

    useEffect(() => {
        if (linked) void refreshCloudHistory();
    }, [linked, settings.cloud.lastSyncAt]);

    function confirmRestore(key: CloudItemKey, entry: CloudManifestEntry) {
        Alerts.show({
            title: t("Restore this Cloud version?"),
            body: t("The current Cloud version will be kept in history. This selected version will replace the Cloud copy and be restored on this device."),
            confirmText: t("Restore version"),
            cancelText: t("Cancel"),
            onConfirm: () => void run(() => restoreCloudRevision(key, entry.version))
        });
    }

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>{t("Midnightcord Cloud")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Synchronize your plugin settings and QuickCSS across your devices. Every payload is encrypted on this device before it reaches Midnightcord servers.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom20}>
                {t("Your Cloud key is the only way to decrypt your data. Midnightcord cannot recover it. Keep one private copy outside Discord.")}
            </Notice.Info>

            <FormSwitch
                title={t("Enable Midnightcord Cloud")}
                description={t("Create or use an end-to-end encrypted Cloud identity on this device.")}
                value={settings.cloud.enabled}
                onChange={value => void run(() => toggleCloud(value))}
                disabled={busy}
                hideBorder
            />

            <Card className={Margins.top16} defaultPadding>
                <Flex flexDirection="column" gap="12px">
                    <div>
                        <Heading>{linked ? t("Recovery key") : t("Link this device")}</Heading>
                        <Paragraph>
                            {linked
                                ? `${t("Cloud identity")}: ${fingerprint ?? "…"}`
                                : t("Paste a Cloud key from another device, or enable Cloud above to create a new one.")}
                        </Paragraph>
                    </div>

                    {linked ? (
                        <>
                            <TextInput
                                aria-label={t("Midnightcord Cloud recovery key")}
                                readOnly
                                value={revealKey ? cloudKey! : "•••• •••• •••• •••• •••• ••••"}
                            />
                            <Flex gap="8px" style={{ flexWrap: "wrap" }}>
                                <Button size="small" variant="secondary" onClick={() => setRevealKey(value => !value)}>
                                    {revealKey ? t("Hide key") : t("Reveal key")}
                                </Button>
                                <Button size="small" onClick={() => copyWithToast(cloudKey!, t("Cloud key copied."))}>
                                    <Flex gap="8px" alignItems="center"><CopyIcon width={18} height={18} />{t("Copy key")}</Flex>
                                </Button>
                                <Button size="small" variant="dangerSecondary" onClick={() => Alerts.show({
                                    title: t("Unlink this device"),
                                    body: t("This removes the Cloud key from this device. Remote encrypted data stays available to your other linked devices."),
                                    confirmText: t("Unlink device"),
                                    cancelText: t("Cancel"),
                                    onConfirm: () => void run(unlinkDevice)
                                })}>
                                    {t("Unlink device")}
                                </Button>
                            </Flex>
                        </>
                    ) : (
                        <>
                            <TextInput
                                aria-label={t("Existing Midnightcord Cloud key")}
                                value={keyInput}
                                onChange={(value: string) => { setKeyInput(value); setKeyError(undefined); }}
                                placeholder="mcc1-…"
                                error={keyError}
                            />
                            <Button size="small" disabled={!keyInput.trim() || busy} onClick={() => void run(linkExistingKey)}>
                                {t("Link with this key")}
                            </Button>
                        </>
                    )}
                </Flex>
            </Card>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Synchronized data")}</Heading>
            <FormSwitch
                title={t("Plugin settings")}
                description={t("Synchronize Midnightcord and plugin preferences. API keys, account tokens and uploader credentials are removed before encryption.")}
                value={settings.cloud.settingsSync}
                onChange={value => { settings.cloud.settingsSync = value; }}
                disabled={!linked || busy}
            />
            <FormSwitch
                title="QuickCSS"
                description={t("Synchronize your custom CSS as a separate encrypted item.")}
                value={settings.cloud.quickCssSync}
                onChange={value => { settings.cloud.quickCssSync = value; }}
                disabled={!linked || busy}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Rules for this device")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose whether this device downloads changes, uploads changes, or waits for a manual action.")}
            </Paragraph>
            <SafeSearchableSelect
                options={[...DIRECTION_OPTIONS]}
                value={settings.cloud.direction}
                onChange={value => { settings.cloud.direction = value; }}
                disabled={!syncEnabled || busy}
                closeOnSelect
            />

            <Flex gap="8px" className={Margins.top16} style={{ flexWrap: "wrap" }}>
                <Button disabled={!syncEnabled || busy} onClick={() => void run(() => putCloudSettings(true, true))}>
                    <Flex gap="8px" alignItems="center"><CloudUploadIcon />{t("Upload this device")}</Flex>
                </Button>
                <Button variant="secondary" disabled={!syncEnabled || busy} onClick={() => void run(() => getCloudSettings(true, true))}>
                    <Flex gap="8px" alignItems="center"><CloudDownloadIcon />{t("Download from Cloud")}</Flex>
                </Button>
                <LinkButton href="https://midnightcord.fr/cloud" size="small">{t("How Cloud works")}</LinkButton>
            </Flex>
            <Paragraph className={Margins.top8}>
                {t("Last synchronization")}: {formatLastSync(settings.cloud.lastSyncAt)}
            </Paragraph>

            {linked && (
                <>
                    <Divider className={Margins.top20} />
                    <Heading className={Margins.top20}>{t("Cloud version history")}</Heading>
                    <Paragraph className={Margins.bottom16}>
                        {t("The five previous encrypted versions of each item are kept. Restoring a version also preserves the current copy as the newest history entry.")}
                    </Paragraph>
                    {historyLoading && <Paragraph>{t("Loading Cloud history…")}</Paragraph>}
                    {historyError && <Notice.Info>{historyError}</Notice.Info>}
                    {(["settings", "quickCss"] as CloudItemKey[]).map(key => {
                        const label = key === "settings" ? t("Plugin settings") : "QuickCSS";
                        const entries = history[key];
                        return (
                            <div key={key}>
                                <Heading className={Margins.top16}>{label}</Heading>
                                {entries.length ? entries.map(entry => (
                                    <Card className={Margins.bottom8} key={`${key}-${entry.version}`} defaultPadding>
                                        <Flex alignItems="center" justifyContent="space-between" gap="12px" style={{ flexWrap: "wrap" }}>
                                            <Paragraph>
                                                {t("Version")} {entry.version} · {formatLastSync(Date.parse(entry.updatedAt))}
                                            </Paragraph>
                                            <Button size="small" variant="secondary" disabled={busy} onClick={() => confirmRestore(key, entry)}>
                                                {t("Restore version")}
                                            </Button>
                                        </Flex>
                                    </Card>
                                )) : <Paragraph className={Margins.bottom8}>{t("No previous versions yet. New Cloud updates will appear here.")}</Paragraph>}
                            </div>
                        );
                    })}
                </>
            )}

            {settings.cloud.enabled && linked && (
                <>
                    <Divider className={Margins.top20} />
                    <Heading className={Margins.top20}>{t("Midnightcord community server")}</Heading>
                    <Paragraph className={Margins.bottom16}>
                        {t("Joining is optional. Continue to Discord to authorize a one-time join to the official Midnightcord server. Cloud sync works with either choice.")}
                    </Paragraph>
                    {communityLoading && <Paragraph>{t("Checking community invitation…")}</Paragraph>}
                    {communityError && (
                        <Notice.Info>
                            <Paragraph>{t("Could not check the community invitation. Cloud sync is still available.")}</Paragraph>
                            <Button size="small" variant="secondary" disabled={communityLoading} onClick={() => setCommunityRefresh(value => value + 1)}>
                                {t("Retry")}
                            </Button>
                        </Notice.Info>
                    )}
                    {communityStatus?.status === "joined" ? (
                        <Notice.Info>
                            {t("This Cloud identity has already joined the Midnightcord server. Leaving the server will not trigger another join.")}
                        </Notice.Info>
                    ) : communityStatus?.enabled ? (
                        <>
                            {communityStatus.status === "declined" && <Paragraph className={Margins.bottom16}>
                                {t("You chose Cloud only. The invitation will not be shown again automatically; you can still join here.")}
                            </Paragraph>}
                            <Button disabled={communityBusy} onClick={() => void joinCommunity()}>
                                {t("Authorize with Discord and join")}
                            </Button>
                        </>
                    ) : communityStatus && (
                        <Notice.Info>
                            {t("The join option will appear here after the community server and its Discord application are configured.")}
                        </Notice.Info>
                    )}
                </>
            )}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Cloud data controls")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Delete the encrypted settings while keeping this key, or delete the complete Cloud account and unlink this device.")}
            </Paragraph>
            <Flex gap="8px" style={{ flexWrap: "wrap" }}>
                <Button variant="dangerSecondary" disabled={!linked || busy} onClick={() => Alerts.show({
                    title: t("Delete Cloud settings"),
                    body: t("This permanently removes the synchronized settings and QuickCSS from Midnightcord Cloud."),
                    confirmText: t("Delete Cloud settings"),
                    cancelText: t("Cancel"),
                    onConfirm: () => void run(deleteCloudSettings)
                })}>
                    {t("Delete Cloud settings")}
                </Button>
                <Button variant="dangerPrimary" disabled={!linked || busy} onClick={() => Alerts.show({
                    title: t("Delete Cloud account"),
                    body: t("This permanently deletes every encrypted Cloud item and removes the recovery key from this device."),
                    confirmText: t("Delete Cloud account"),
                    cancelText: t("Cancel"),
                    onConfirm: () => void run(eraseAllCloudData)
                })}>
                    {t("Delete Cloud account")}
                </Button>
            </Flex>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Badge privacy")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which badge sources to hide on your own profile. This preference stays on this device.")}
            </Paragraph>
            <SafeSearchableSelect
                multi
                closeOnSelect={false}
                options={BADGE_OPTIONS}
                value={hidden}
                placeholder={t("None hidden")}
                onChange={onBadgeChange}
            />
        </SettingsTab>
    );
}

export default wrapTab(SyncTab, "Midnightcord Cloud");
