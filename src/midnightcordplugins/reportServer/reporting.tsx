/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import type { Guild } from "@vencord/discord-types";
import { extractAndLoadChunks, filters, mapMangledModule, wreq } from "@webpack";
import { GuildStore, UserStore } from "@webpack/common";

import { openReportUnavailable } from "./UnavailableModal";

type ReportTarget = { id: string; name: string; };
type NativeReportOpener = (
    target: { name: "guild"; record: Guild; },
    options: Record<string, never>,
    callbacks: { onClose(): void; }
) => Promise<void>;

const logger = new Logger("ReportServer");
const reportCode = ["isEligibleForFeedback", "getInteractingModalContext"];

// This existing user menu loads Discord's shared reporting code. Extract its
// current dependencies instead of pinning Discord's changing module/chunk IDs.
// Do not memoize a failed promise: the user can retry after a network failure.
// Webpack itself caches successfully loaded chunks.
const requireReportingCode = () => extractAndLoadChunks(
    ["GuildChannelUserContextMenu"],
    /Promise\.all\(\[((?:\i\.e\("[^")]+"\),?)+)\]\)\.then\(\i\.bind\(\i,"?([^)";]+)"?\)\);return[^;]{0,600}"GuildChannelUserContextMenu"/
);
const requireReportForm = () => extractAndLoadChunks(reportCode);

let activeRequest: object | undefined;

function reportingCodeIsLoaded(): boolean {
    return Object.values(wreq.m).some(factory => {
        const code = String(factory);
        return reportCode.every(part => code.includes(part));
    });
}

function findReportOpener(): NativeReportOpener | undefined {
    const { open } = mapMangledModule(reportCode, { open: filters.byCode(...reportCode) });
    return typeof open === "function" ? open : undefined;
}

export function stopReports(): void {
    activeRequest = undefined;
}

export function openServerReport(target: ReportTarget): void {
    if (activeRequest || typeof target?.id !== "string" || !/^[1-9]\d{16,19}$/.test(target.id)) return;

    const selected = {
        id: target.id,
        name: typeof target.name === "string" && target.name.trim() ? target.name : "Serveur Discord"
    };
    const userId = UserStore.getCurrentUser()?.id;
    if (!userId || GuildStore.getGuild(selected.id)?.id !== selected.id) {
        openReportUnavailable(selected);
        return;
    }

    const request = activeRequest = {};
    const isCurrent = () => activeRequest === request;
    const fail = () => {
        if (!isCurrent()) return;
        activeRequest = undefined;
        openReportUnavailable(selected);
    };

    void (async () => {
        try {
            if (!reportingCodeIsLoaded() && !await requireReportingCode()) throw new Error("reporting-code-unavailable");
            if (!isCurrent()) return;

            // Discord's opener does not await its lazy modal. Preload the same
            // native form so chunk failures are handled before opening it.
            if (!await requireReportForm()) throw new Error("report-form-unavailable");
            if (!isCurrent()) return;

            const guild = GuildStore.getGuild(selected.id);
            if (UserStore.getCurrentUser()?.id !== userId || guild?.id !== selected.id) {
                fail();
                return;
            }
            const open = findReportOpener();
            if (!open) throw new Error("report-opener-unavailable");

            let opening = true;
            // The regular authenticated "guild" form supplies its own reasons,
            // validation and explicit Submit action. Opening sends no report.
            await open({ name: "guild", record: guild }, {}, {
                onClose() {
                    if (!isCurrent()) return;
                    // Discord also calls onClose when its menu request fails.
                    if (opening) fail();
                    else activeRequest = undefined;
                }
            });
            opening = false;
        } catch (error) {
            logger.warn("Unable to open Discord's server report form", error);
            fail();
        }
    })();
}
