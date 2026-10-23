/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

import { unzipSync } from "fflate";

import { Artifact, executableRelativePath, INSTALL_VERSION, MODEL, runtimeArtifact } from "./model";

const MAX_UNPACKED = 512 * 1024 * 1024;
type Entry = { path: string; data?: Uint8Array; link?: string; };
type Manifest = { version: string; files: { path: string; bytes: number; sha256: string; }[]; };

export function safePath(name: string) {
    if (!name || name.includes("\\") || name.includes(":") || name.startsWith("/") || name.includes("\0")
        || name.replace(/\/$/, "").split("/").some(p => !p || p === ".." || p === ".")) throw new Error("unsafe-archive");
    return name.replace(/\/$/, "");
}

export function archiveEntries(data: Uint8Array, zip: boolean): Entry[] {
    if (zip) return Object.entries(unzipSync(data)).filter(([name]) => !name.endsWith("/"))
        .map(([path, content]) => ({ path: safePath(path), data: content }));
    const buffer = gunzipSync(data, { maxOutputLength: MAX_UNPACKED });
    const entries: Entry[] = [];
    for (let offset = 0; offset + 512 <= buffer.length;) {
        const header = buffer.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) break;
        const read = (start: number, length: number) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/, "");
        const path = safePath([read(345, 155), read(0, 100)].filter(Boolean).join("/"));
        const bytes = parseInt(read(124, 12).trim(), 8);
        if (!Number.isSafeInteger(bytes) || bytes < 0 || offset + 512 + bytes > buffer.length) throw new Error("unsafe-archive");
        const kind = read(156, 1);
        if (kind === "" || kind === "0") entries.push({ path, data: buffer.subarray(offset + 512, offset + 512 + bytes) });
        else if (kind === "2") {
            const link = read(157, 100);
            safePath(link);
            entries.push({ path, link: safePath(posix.join(posix.dirname(path), link)) });
        } else if (kind !== "5" && kind !== "g" && kind !== "x") throw new Error("unsafe-archive");
        offset += 512 + Math.ceil(bytes / 512) * 512;
    }
    return entries;
}

export function materializeEntries(entries: Entry[]) {
    const byPath = new Map<string, Entry>();
    for (const entry of entries) {
        safePath(entry.path);
        if (byPath.has(entry.path)) throw new Error("unsafe-archive");
        byPath.set(entry.path, entry);
    }
    let total = 0;
    return entries.map(entry => {
        let source = entry;
        const seen = new Set<string>();
        while (!source.data) {
            if (!source.link || seen.has(source.path)) throw new Error("unsafe-archive");
            seen.add(source.path);
            const target = byPath.get(safePath(source.link));
            if (!target) throw new Error("unsafe-archive");
            source = target;
        }
        total += source.data.byteLength;
        if (total > MAX_UNPACKED) throw new Error("archive-too-large");
        // Copy symlink targets as regular files. Extracted archives never create filesystem links.
        return { path: entry.path, data: source.data };
    });
}

async function directory(path: string) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("unsafe-cache");
}

export async function assertOwnedPath(root: string, path: string) {
    const base = resolve(root);
    const target = resolve(path);
    if (target !== base && !target.startsWith(base + sep)) throw new Error("unsafe-cache");
    for (let cursor = target; ; cursor = dirname(cursor)) {
        const info = await lstat(cursor).catch(error => {
            if (error.code === "ENOENT") return undefined;
            throw error;
        });
        if (info?.isSymbolicLink()) throw new Error("unsafe-cache");
        if (cursor === base) break;
    }
}

async function digestFile(path: string) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

export async function downloadArtifact(artifact: Artifact, destination: string, signal: AbortSignal, progress: (bytes: number) => void) {
    const response = await fetch(artifact.url, { signal, redirect: "follow" });
    if (!response.ok || !response.body || !response.url.startsWith("https://")) throw new Error("download-failed");
    const file = await open(destination, "wx", 0o600);
    const hash = createHash("sha256");
    let bytes = 0;
    try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > artifact.bytes) throw new Error("download-too-large");
            hash.update(chunk);
            let offset = 0;
            while (offset < chunk.byteLength) {
                const { bytesWritten } = await file.write(chunk, offset, chunk.byteLength - offset);
                if (!bytesWritten) throw new Error("download-write-failed");
                offset += bytesWritten;
            }
            progress(bytes);
        }
        if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256) throw new Error("download-integrity");
        await file.sync();
    } finally { await file.close(); }
}

export class TypeAssets {
    readonly root: string;
    readonly install: string;
    readonly artifact = runtimeArtifact();

    constructor(root: string) { this.root = resolve(root); this.install = join(this.root, INSTALL_VERSION); }

    get downloadBytes() { return MODEL.bytes + (this.artifact?.bytes ?? 0); }
    get executable() { return join(this.install, executableRelativePath()); }
    get model() { return join(this.install, "model.gguf"); }

    async valid(verifyHashes = false) {
        try {
            await assertOwnedPath(this.root, join(this.install, "manifest.json"));
            const manifest: Manifest = JSON.parse(await readFile(join(this.install, "manifest.json"), "utf8"));
            if (manifest.version !== INSTALL_VERSION || !Array.isArray(manifest.files) || manifest.files.length > 256) return false;
            if (!manifest.files.some(f => f.path === executableRelativePath()) || !manifest.files.some(f => f.path === "model.gguf" && f.sha256 === MODEL.sha256)) return false;
            for (const file of manifest.files) {
                const path = join(this.install, safePath(file.path));
                await assertOwnedPath(this.root, path);
                const info = await lstat(path);
                if (!info.isFile() || info.size !== file.bytes || (verifyHashes && await digestFile(path) !== file.sha256)) return false;
            }
            return true;
        } catch { return false; }
    }

    async prepare(signal: AbortSignal, progress: (ratio: number) => void) {
        if (!this.artifact) throw new Error("unsupported-platform");
        await directory(this.root);
        if (await this.valid(true)) return;
        const staging = join(this.root, `.install-${randomUUID()}`);
        await directory(staging);
        try {
            const archive = join(staging, "runtime.download");
            await downloadArtifact(this.artifact, archive, signal, n => progress(n / this.downloadBytes));
            const entries = materializeEntries(archiveEntries(await readFile(archive), this.artifact.url.endsWith(".zip")));
            const manifest: Manifest = { version: INSTALL_VERSION, files: [] };
            for (const entry of entries) {
                signal.throwIfAborted();
                const relative = `runtime/${entry.path}`;
                const path = join(staging, relative);
                await directory(dirname(path));
                await assertOwnedPath(this.root, path);
                await writeFile(path, entry.data, { flag: "wx", mode: 0o700 });
                manifest.files.push({ path: relative, bytes: entry.data.byteLength, sha256: createHash("sha256").update(entry.data).digest("hex") });
            }
            await rm(archive);
            await downloadArtifact(MODEL, join(staging, "model.gguf"), signal, n => progress((this.artifact!.bytes + n) / this.downloadBytes));
            manifest.files.push({ path: "model.gguf", bytes: MODEL.bytes, sha256: MODEL.sha256 });
            const notice = Buffer.from("MidnightType optional local model assets\n\n"
                + "llama.cpp b11840 - MIT - ggml-org contributors\nhttps://github.com/ggml-org/llama.cpp/blob/b11840/LICENSE\n\n"
                + "Qwen2.5-0.5B-Instruct-GGUF - Apache-2.0 - Qwen / Alibaba Cloud\n"
                + "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF\nhttps://www.apache.org/licenses/LICENSE-2.0\n\n"
                + "This model runs locally. Its suggestions can be inaccurate and always require user acceptance.\n");
            await writeFile(join(staging, "THIRD_PARTY.txt"), notice, { flag: "wx", mode: 0o600 });
            manifest.files.push({ path: "THIRD_PARTY.txt", bytes: notice.length, sha256: createHash("sha256").update(notice).digest("hex") });
            await chmod(join(staging, executableRelativePath()), 0o700);
            await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
            signal.throwIfAborted();
            await assertOwnedPath(this.root, this.install);
            await rm(this.install, { recursive: true, force: true });
            await rename(staging, this.install);
            progress(1);
        } finally {
            await assertOwnedPath(this.root, staging);
            await rm(staging, { recursive: true, force: true });
        }
    }

    async remove() {
        await assertOwnedPath(this.root, this.install);
        await rm(this.install, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}
