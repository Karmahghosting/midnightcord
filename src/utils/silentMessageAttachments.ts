/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { CloudUploader } from "@webpack/common";

export interface SilentAttachment {
    id: string;
    filename: string;
    url: string;
    size: number;
    content_type?: string;
    description?: string;
    title?: string;
    spoiler?: boolean;
    is_spoiler?: boolean;
    flags?: number;
}

export interface PreservedAttachment {
    id: string;
    filename: string;
    uploaded_filename: string;
    description?: string;
    title?: string;
    is_spoiler: boolean;
}

function isSpoiler(attachment: SilentAttachment) {
    return Boolean(attachment.spoiler || attachment.is_spoiler || (Number(attachment.flags) & 8) || attachment.filename.startsWith("SPOILER_"));
}

function attachmentUrl(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname))
        throw new Error("Unsupported attachment URL; the original message was kept.");
    // Preserve signed CDN query parameters. Never attach Discord credentials to a CDN request.
    return url.href;
}

async function download(attachment: SilentAttachment, signal: AbortSignal): Promise<Blob> {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("Attachment download timed out.")), 60_000);
    try {
        const response = await fetch(attachmentUrl(attachment.url), { credentials: "omit", redirect: "error", signal: controller.signal });
        if (!response.ok) throw Object.assign(new Error(`Could not download ${attachment.filename} (${response.status}).`), { status: response.status });
        const blob = await response.blob();
        if (blob.size !== attachment.size) throw new Error(`Incomplete attachment: ${attachment.filename}.`);
        return blob;
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
    }
}

function upload(file: File, attachment: SilentAttachment, channelId: string, index: number, signal: AbortSignal): Promise<PreservedAttachment> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const uploader = new CloudUploader({ file, platform: CloudUploadPlatform.WEB }, channelId);
        // Preserve the original bytes instead of applying Discord's optional HEIC/WebP optimization.
        uploader.allowOptimization = false;
        uploader.spoiler = isSpoiler(attachment);
        uploader.description = attachment.description ?? null;
        let settled = false;
        const cleanup = () => {
            clearTimeout(timeout);
            signal.removeEventListener("abort", abort);
            uploader.removeListener?.("complete", complete);
            // Keep the error listener until the uploader settles: EventEmitter treats unhandled errors as fatal.
        };
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error instanceof Error ? error : new Error(`Could not upload ${file.name}.`));
        };
        const abort = () => {
            fail(signal.reason ?? new Error("Silent edit cancelled."));
            // Discord's cancel() may emit complete, so settle our promise before cancelling it.
            try { uploader.cancel?.(); } catch { /* The promise is already rejected; keep the original message. */ }
        };
        const timeout = setTimeout(() => {
            fail(new Error(`Upload timed out: ${file.name}.`));
            try { uploader.cancel?.(); } catch { /* The promise is already rejected; keep the original message. */ }
        }, 120_000);
        const complete = () => {
            if (settled) return;
            if (signal.aborted || !uploader.uploadedFilename || (uploader.status != null && uploader.status !== "COMPLETED")) {
                fail(new Error(`Upload was not completed: ${file.name}.`));
                return;
            }
            settled = true;
            cleanup();
            resolve({
                id: String(index), filename: file.name, uploaded_filename: uploader.uploadedFilename,
                is_spoiler: uploader.spoiler,
                ...(attachment.description != null ? { description: attachment.description } : {}),
                ...(attachment.title != null ? { title: attachment.title } : {})
            });
        };
        uploader.on("complete", complete);
        uploader.on("error", fail);
        signal.addEventListener("abort", abort, { once: true });
        try { Promise.resolve(uploader.upload()).catch(fail); } catch (error) { fail(error); }
    });
}

/** Upload every file before creating the replacement. A single failure leaves the original untouched. */
export async function preserveSilentAttachments(
    attachments: SilentAttachment[], channelId: string, signal: AbortSignal,
    refreshAttachments: () => Promise<SilentAttachment[]>
): Promise<PreservedAttachment[]> {
    const result: PreservedAttachment[] = [];
    let refreshed: SilentAttachment[] | undefined;
    for (const attachment of attachments) {
        if (!attachment.filename || !Number.isSafeInteger(attachment.size) || attachment.size < 0)
            throw new Error("Attachment metadata is incomplete; the original message was kept.");
        let blob: Blob;
        try { blob = await download(attachment, signal); } catch (error) {
            if (signal.aborted || ![403, 404].includes((error as { status?: number; }).status ?? 0)) throw error;
            // Expired signed URLs need a fresh Discord message, not a stripped or fabricated CDN URL.
            refreshed ??= await refreshAttachments();
            const fresh = refreshed.find(item => item.id === attachment.id);
            if (!fresh || fresh.size !== attachment.size || fresh.filename !== attachment.filename) throw error;
            blob = await download({ ...attachment, url: fresh.url }, signal);
        }
        const spoiler = isSpoiler(attachment);
        const name = spoiler && !attachment.filename.startsWith("SPOILER_") ? "SPOILER_" + attachment.filename : attachment.filename;
        const file = new File([blob], name, { type: attachment.content_type || blob.type || "application/octet-stream" });
        result.push(await upload(file, attachment, channelId, result.length, signal));
    }
    return result;
}

export function assertPreservedAttachments(actual: SilentAttachment[] | undefined, source: SilentAttachment[], uploaded: PreservedAttachment[]) {
    if (!Array.isArray(actual) || actual.length !== uploaded.length)
        throw new Error("Discord did not confirm all attachments; the original message was kept.");
    const unmatched = [...actual];
    uploaded.forEach((expected, index) => {
        const match = unmatched.findIndex(item => item.filename === expected.filename && item.size === source[index].size
            && (expected.description == null || item.description === expected.description)
            && (!expected.is_spoiler || isSpoiler(item)));
        if (match === -1) throw new Error("Discord returned an incomplete attachment; the original message was kept.");
        unmatched.splice(match, 1);
    });
}
