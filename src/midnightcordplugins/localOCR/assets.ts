/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Electron workers need real files; extract only our versioned, hash-checked runtime. */
export async function prepareAssets(source: string, cache: string) {
    if (!/\.asar[\\/]/i.test(source)) return source;
    const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8")) as { version: string; files: { path: string; sha256: string; }[]; };
    if (!/^[a-f0-9]{64}$/.test(manifest.version) || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100) throw new Error("invalid-assets");
    const target = join(cache, manifest.version);
    for (const file of manifest.files) {
        if (!/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.startsWith("/") || file.path.split("/").some(part => part === ".." || part === "." || !part) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("invalid-assets");
        const destination = join(target, file.path);
        const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
        const existing = await readFile(destination).catch(() => undefined);
        if (existing && hash(existing) === file.sha256) continue;
        const bundled = await readFile(join(source, file.path));
        if (hash(bundled) !== file.sha256) throw new Error("invalid-assets");
        await mkdir(dirname(destination), { recursive: true });
        const temporary = `${destination}.${process.pid}.tmp`;
        await writeFile(temporary, bundled);
        await rename(temporary, destination);
    }
    return target;
}
