/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { Span } from "@components/Span";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { changes, checkForUpdates, isOutdated as updateAvailable, rebuild, update, UpdateLogger } from "@utils/updater";
import { React, Toasts, useEffect, useRef, useState } from "@webpack/common";

declare const VERSION: string;

function cleanError(error: any): string {
    let detail = error?.message || error?.error?.message || (typeof error === "string" ? error : "Please check your connection.");
    detail = String(detail).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return detail.length > 300 ? detail.substring(0, 300) + "..." : detail;
}

function UpdaterTab() {
    const detectedAtOpen = updateAvailable;
    const preparingRef = useRef(false);
    const [checking, setChecking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [checked, setChecked] = useState(detectedAtOpen);
    const [outdated, setOutdated] = useState(detectedAtOpen);
    const [readyToRestart, setReadyToRestart] = useState(false);
    const [updateList, setUpdateList] = useState(changes ?? []);
    const [error, setError] = useState<string | null>(null);

    async function prepareUpdate() {
        if (preparingRef.current || readyToRestart) return;
        preparingRef.current = true;
        setDownloading(true);
        setError(null);

        try {
            if (!await update()) throw new Error("The release could not be resolved.");
            if (!await rebuild()) throw new Error("The verified update could not be staged.");

            setOutdated(false);
            setReadyToRestart(true);
            Toasts.show({
                message: "Midnightcord is ready to restart.",
                id: Toasts.genId(),
                type: Toasts.Type.SUCCESS,
                options: { position: Toasts.Position.BOTTOM }
            });
        } catch (updateError: any) {
            UpdateLogger.error("Update preparation failed", updateError);
            setError("Update failed: " + cleanError(updateError));
        } finally {
            preparingRef.current = false;
            setDownloading(false);
        }
    }

    async function handleCheck() {
        setChecking(true);
        setError(null);
        try {
            const hasUpdate = await checkForUpdates();
            setOutdated(hasUpdate);
            setUpdateList(changes ?? []);
            setChecked(true);

            if (hasUpdate) {
                await prepareUpdate();
            } else {
                Toasts.show({
                    message: t("You are already on the latest version!"),
                    id: Toasts.genId(),
                    type: Toasts.Type.SUCCESS,
                    options: { position: Toasts.Position.BOTTOM }
                });
            }
        } catch (checkError: any) {
            UpdateLogger.error("Update check failed", checkError);
            setError(t("Check for Updates") + ": " + cleanError(checkError));
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        if (detectedAtOpen) void prepareUpdate();
    }, []);

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>{t("Midnightcord Updater")}</Heading>
            <Paragraph className={Margins.bottom20}>
                {t("Updates are downloaded, verified, and applied after a normal restart.")}
            </Paragraph>

            <Card style={{ padding: "12px 16px", marginBottom: 12 }}>
                <Flex style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <Span size="sm" color="text-subtle">{t("Current Version")}</Span>
                        <div>
                            <Span size="md" weight="medium" color="text-strong">v{VERSION}</Span>
                        </div>
                    </div>
                    <div>
                        <Span size="sm" color="text-subtle">{t("Website")}</Span>
                        <div>
                            <Link href="https://github.com/Karmahghosting/midnightcord" style={{ fontSize: 13 }}>GitHub</Link>
                        </div>
                    </div>
                </Flex>
            </Card>

            {error && (
                <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-danger)" }}>
                    <Span size="sm" color="text-danger">{error}</Span>
                </Card>
            )}

            {readyToRestart ? (
                <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-positive)" }}>
                    <Span size="sm" style={{ color: "var(--text-positive)" }}>Update verified. Restart Midnightcord to apply it.</Span>
                </Card>
            ) : checked && !error && (
                outdated ? (
                    <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-warning)" }}>
                        <Span size="sm" style={{ color: "var(--text-warning)" }}>
                            {updateList[0]?.message ?? "A new update is available!"}
                        </Span>
                    </Card>
                ) : (
                    <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-positive)" }}>
                        <Span size="sm" style={{ color: "var(--text-positive)" }}>{t("You are running the latest version")}</Span>
                    </Card>
                )
            )}

            <Flex gap="8px" className={Margins.top8}>
                {!readyToRestart && (
                    <Button size="small" disabled={checking || downloading} onClick={handleCheck}>
                        {checking ? "Checking..." : t("Check for Updates")}
                    </Button>
                )}

                {(outdated || downloading || readyToRestart) && (
                    <Button
                        size="small"
                        variant="primary"
                        onClick={readyToRestart ? relaunch : prepareUpdate}
                        disabled={downloading}
                    >
                        {downloading ? "Downloading and verifying..." : readyToRestart ? "Restart Midnightcord" : "Retry Update"}
                    </Button>
                )}
            </Flex>

            <Divider className={Margins.top20} />
            <Paragraph className={Margins.top16} style={{ fontSize: 12, opacity: 0.6 }}>
                {t("The update is cryptographically verified before it can be applied.")}
            </Paragraph>
        </SettingsTab>
    );
}

export default wrapTab(UpdaterTab, "Updater");
