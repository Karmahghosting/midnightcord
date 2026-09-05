/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 16_000_000;
export const MAX_INPUT_EDGE = 16_384;
export const MAX_OUTPUT_EDGE = 4096;
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export interface ImageInfo {
    mime: ImageMime;
    width: number;
    height: number;
    alpha: boolean;
    sourceMetadata: boolean;
}

export function checkDimensions(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("invalid-image");
    if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE || width * height > MAX_INPUT_PIXELS) throw new Error("image-too-large");
}

export function planSize(width: number, height: number, maximum: number) {
    checkDimensions(width, height);
    if (!Number.isInteger(maximum) || maximum < 64 || maximum > MAX_OUTPUT_EDGE) throw new Error("invalid-size");
    const ratio = Math.min(1, maximum / width, maximum / height);
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export function outputFormat(actual: string, requested: ImageMime) {
    if (actual !== "image/jpeg" && actual !== "image/png" && actual !== "image/webp") throw new Error("encode-failed");
    return { mime: actual as ImageMime, extension: actual === "image/jpeg" ? "jpg" : actual.slice(6), fallback: actual !== requested };
}

export function outputName(original: string, actual: string) {
    const base = original.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 100) || "image";
    return `${base}-optimisee.${outputFormat(actual, "image/png").extension}`;
}

export function discordImageUrl(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 4096) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
        if (!["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)) return null;
        if (!/^\/(?:attachments|ephemeral-attachments|avatars|guilds|icons|banners|emojis|role-icons)\//.test(url.pathname)) return null;
        return url.href;
    } catch { return null; }
}

export function inspectBytes(bytes: Uint8Array): ImageInfo {
    if (bytes.length > MAX_INPUT_BYTES) throw new Error("file-too-large");
    if (bytes.length < 12) throw new Error("invalid-image");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
    const uint24 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
    let width = 0;
    let height = 0;
    let alpha = false;
    let sourceMetadata = false;
    let mime: ImageMime;
    let chunks = 0;
    const countChunk = () => { if (++chunks > 8192) throw new Error("invalid-image"); };

    if (ascii(0, 3) === "GIF") throw new Error("animation-unsupported");
    if (bytes[0] === 137 && ascii(1, 3) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
        mime = "image/png";
        let ended = false;
        for (let offset = 8; offset + 12 <= bytes.length;) {
            countChunk();
            const length = view.getUint32(offset);
            const type = ascii(offset + 4, 4);
            const data = offset + 8;
            if (length > bytes.length - data - 4) throw new Error("invalid-image");
            if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new Error("animation-unsupported");
            if (type === "IHDR") {
                if (offset !== 8 || length !== 13) throw new Error("invalid-image");
                width = view.getUint32(data);
                height = view.getUint32(data + 4);
                checkDimensions(width, height);
                alpha = bytes[data + 9] === 4 || bytes[data + 9] === 6;
            }
            if (type === "tRNS") alpha = true;
            if (["eXIf", "tEXt", "zTXt", "iTXt"].includes(type)) sourceMetadata = true;
            offset = data + length + 4;
            if (type === "IEND") { ended = true; break; }
        }
        if (!ended) throw new Error("invalid-image");
    } else if (bytes[0] === 255 && bytes[1] === 216) {
        mime = "image/jpeg";
        for (let offset = 2; offset + 4 <= bytes.length;) {
            countChunk();
            if (bytes[offset++] !== 255) throw new Error("invalid-image");
            while (bytes[offset] === 255) offset++;
            const marker = bytes[offset++];
            if (marker === 218 || marker === 217) break;
            if (marker === 1 || marker >= 208 && marker <= 215) continue;
            if (offset + 2 > bytes.length) throw new Error("invalid-image");
            const length = view.getUint16(offset);
            if (length < 2 || offset + length > bytes.length) throw new Error("invalid-image");
            if (marker === 225 || marker === 237 || marker === 254) sourceMetadata = true;
            if (marker === 226 && ascii(offset + 2, 4) === "MPF\0") throw new Error("animation-unsupported");
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
                if (length < 8) throw new Error("invalid-image");
                height = view.getUint16(offset + 3);
                width = view.getUint16(offset + 5);
                checkDimensions(width, height);
            }
            offset += length;
        }
    } else if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
        mime = "image/webp";
        const end = view.getUint32(4, true) + 8;
        if (end !== bytes.length) throw new Error("invalid-image");
        for (let offset = 12; offset + 8 <= end;) {
            countChunk();
            const type = ascii(offset, 4);
            const length = view.getUint32(offset + 4, true);
            const data = offset + 8;
            if (length > end - data) throw new Error("invalid-image");
            if (type === "ANIM" || type === "ANMF") throw new Error("animation-unsupported");
            if (type === "VP8X") {
                if (length < 10) throw new Error("invalid-image");
                if (bytes[data] & 2) throw new Error("animation-unsupported");
                width = uint24(data + 4) + 1;
                height = uint24(data + 7) + 1;
                alpha = !!(bytes[data] & 16);
                checkDimensions(width, height);
            } else if (type === "VP8 ") {
                if (length < 10 || ascii(data + 3, 3) !== "\u009d\u0001\u002a") throw new Error("invalid-image");
                const frameWidth = view.getUint16(data + 6, true) & 0x3fff;
                const frameHeight = view.getUint16(data + 8, true) & 0x3fff;
                checkDimensions(frameWidth, frameHeight);
                if (width && (width !== frameWidth || height !== frameHeight)) throw new Error("invalid-image");
                width = frameWidth;
                height = frameHeight;
            } else if (type === "VP8L") {
                if (length < 5 || bytes[data] !== 47) throw new Error("invalid-image");
                const frameWidth = (bytes[data + 1] | (bytes[data + 2] & 63) << 8) + 1;
                const frameHeight = ((bytes[data + 2] >> 6) | bytes[data + 3] << 2 | (bytes[data + 4] & 15) << 10) + 1;
                checkDimensions(frameWidth, frameHeight);
                if (width && (width !== frameWidth || height !== frameHeight)) throw new Error("invalid-image");
                width = frameWidth;
                height = frameHeight;
                alpha ||= !!(bytes[data + 4] & 16);
            }
            if (type === "ALPH") alpha = true;
            if (type === "EXIF" || type === "XMP ") sourceMetadata = true;
            offset = data + length + (length % 2);
        }
    } else {
        throw new Error("unsupported-format");
    }
    checkDimensions(width, height);
    return { mime, width, height, alpha, sourceMetadata };
}
