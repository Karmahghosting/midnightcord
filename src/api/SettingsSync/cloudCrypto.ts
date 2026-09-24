/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const CLOUD_KEY_PREFIX = "mcc1-";
const DERIVATION_SALT = new TextEncoder().encode("Midnightcord Cloud v1");
const AUTH_INFO = new TextEncoder().encode("authentication");
const ENCRYPTION_INFO = new TextEncoder().encode("encryption");
const PAYLOAD_VERSION = 1;
const IV_BYTES = 12;

export function toCloudArrayBuffer(data: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

function toBase64Url(data: Uint8Array): string {
    const chunkSize = 0x2000;
    let binary = "";
    for (let index = 0; index < data.length; index += chunkSize)
        binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid Cloud key encoding");
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function createCloudKey(): string {
    return CLOUD_KEY_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function parseCloudKey(value: string): Uint8Array {
    const normalized = value.trim();
    if (!normalized.startsWith(CLOUD_KEY_PREFIX)) throw new Error("The Cloud key must start with mcc1-");
    const key = fromBase64Url(normalized.slice(CLOUD_KEY_PREFIX.length));
    if (key.length !== 32) throw new Error("The Cloud key has an invalid length");
    return key;
}

export function isCloudKey(value: string): boolean {
    try {
        parseCloudKey(value);
        return true;
    } catch {
        return false;
    }
}

async function deriveBits(secret: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
    const source = await crypto.subtle.importKey("raw", toCloudArrayBuffer(secret), "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
        name: "HKDF",
        hash: "SHA-256",
        salt: toCloudArrayBuffer(DERIVATION_SALT),
        info: toCloudArrayBuffer(info)
    }, source, 256);
    return new Uint8Array(bits);
}

async function deriveEncryptionKey(secret: Uint8Array): Promise<CryptoKey> {
    const bytes = await deriveBits(secret, ENCRYPTION_INFO);
    return crypto.subtle.importKey("raw", toCloudArrayBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function deriveCloudAuthorization(cloudKey: string): Promise<string> {
    const bytes = await deriveBits(parseCloudKey(cloudKey), AUTH_INFO);
    return `mc1.${toBase64Url(bytes)}`;
}

export async function getCloudFingerprint(cloudKey: string): Promise<string> {
    const authorization = await deriveCloudAuthorization(cloudKey);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", toCloudArrayBuffer(new TextEncoder().encode(authorization))));
    return Array.from(hash.subarray(0, 5), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function encryptCloudPayload(cloudKey: string, plaintext: string): Promise<Uint8Array> {
    const secret = parseCloudKey(cloudKey);
    const key = await deriveEncryptionKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toCloudArrayBuffer(iv), additionalData: toCloudArrayBuffer(DERIVATION_SALT), tagLength: 128 },
        key,
        toCloudArrayBuffer(new TextEncoder().encode(plaintext))
    ));
    const payload = new Uint8Array(1 + iv.length + ciphertext.length);
    payload[0] = PAYLOAD_VERSION;
    payload.set(iv, 1);
    payload.set(ciphertext, 1 + iv.length);
    return payload;
}

export async function decryptCloudPayload(cloudKey: string, payload: Uint8Array): Promise<string> {
    if (payload.length <= 1 + IV_BYTES + 16 || payload[0] !== PAYLOAD_VERSION)
        throw new Error("Unsupported or incomplete Cloud payload");
    const secret = parseCloudKey(cloudKey);
    const key = await deriveEncryptionKey(secret);
    const plaintext = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: toCloudArrayBuffer(payload.subarray(1, 1 + IV_BYTES)),
            additionalData: toCloudArrayBuffer(DERIVATION_SALT),
            tagLength: 128
        },
        key,
        toCloudArrayBuffer(payload.subarray(1 + IV_BYTES))
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

export async function checksumBytes(payload: Uint8Array): Promise<string> {
    return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", toCloudArrayBuffer(payload))));
}

export async function digestCloudText(value: string): Promise<string> {
    return checksumBytes(new TextEncoder().encode(value));
}
