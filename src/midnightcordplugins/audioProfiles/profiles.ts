/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface AudioDevice {
    id: string;
    name: string;
    disabled?: boolean;
}

export interface AudioSnapshot {
    inputDevice?: AudioDevice;
    outputDevice?: AudioDevice;
    inputVolume?: number;
    outputVolume?: number;
    noiseSuppression?: boolean;
    noiseCancellation?: boolean;
}

export interface AudioProfile {
    id: string;
    name: string;
    updatedAt: number;
    audio: AudioSnapshot;
}

export type AudioField = keyof AudioSnapshot;
export interface RestoreEnvironment {
    inputDevices: AudioDevice[];
    outputDevices: AudioDevice[];
    supported: Partial<Record<AudioField, boolean>>;
}

export const MAX_PROFILES = 30;
export const AUDIO_FIELDS: AudioField[] = ["inputDevice", "outputDevice", "inputVolume", "outputVolume", "noiseCancellation", "noiseSuppression"];

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function profileName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 60 || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("invalid-name");
    return trimmed;
}

export function isNameTaken(profiles: AudioProfile[], name: string, exceptId?: string) {
    const key = name.normalize("NFKC").toLocaleLowerCase();
    return profiles.some(profile => profile.id !== exceptId && profile.name.normalize("NFKC").toLocaleLowerCase() === key);
}

export function validVolume(value: unknown, maximum: number): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
}

export function readDevices(value: unknown): AudioDevice[] {
    if (!isRecord(value) && !Array.isArray(value)) return [];
    return Object.values(value).flatMap(device => {
        if (!isRecord(device) || typeof device.id !== "string" || !device.id || typeof device.name !== "string") return [];
        return [{ id: device.id, name: device.name, disabled: device.disabled === true }];
    });
}

export function readSnapshot(value: unknown): AudioSnapshot | null {
    if (!isRecord(value)) return null;
    const result: AudioSnapshot = {};
    for (const field of ["inputDevice", "outputDevice"] as const) {
        if (value[field] === undefined) continue;
        const device = readDevices([value[field]])[0];
        if (!device) return null;
        result[field] = { id: device.id, name: device.name };
    }
    for (const field of ["inputVolume", "outputVolume"] as const) {
        if (value[field] === undefined) continue;
        const volume = value[field];
        if (!validVolume(volume, field === "inputVolume" ? 100 : 200)) return null;
        result[field] = volume;
    }
    for (const field of ["noiseSuppression", "noiseCancellation"] as const) {
        if (value[field] === undefined) continue;
        if (typeof value[field] !== "boolean") return null;
        result[field] = value[field];
    }
    return Object.keys(result).length ? result : null;
}

export function readProfiles(value: unknown): AudioProfile[] {
    if (!Array.isArray(value)) return [];
    const result: AudioProfile[] = [];
    for (const raw of value) {
        if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id || typeof raw.name !== "string") continue;
        if (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt) || raw.updatedAt < 0) continue;
        const audio = readSnapshot(raw.audio);
        if (!audio || result.some(profile => profile.id === raw.id)) continue;
        try {
            const name = profileName(raw.name);
            if (!isNameTaken(result, name)) result.push({ id: raw.id, name, updatedAt: raw.updatedAt, audio });
        } catch { /* Ignore malformed entries from an old or damaged backup. */ }
        if (result.length === MAX_PROFILES) break;
    }
    return result;
}

export function planRestore(audio: AudioSnapshot, environment: RestoreEnvironment) {
    const apply: AudioField[] = [];
    const skipped: { field: AudioField; reason: "unavailable-device" | "unsupported"; }[] = [];
    for (const field of AUDIO_FIELDS) {
        if (audio[field] === undefined) continue;
        if (!environment.supported[field]) {
            skipped.push({ field, reason: "unsupported" });
            continue;
        }
        if (field === "inputDevice" || field === "outputDevice") {
            const available = field === "inputDevice" ? environment.inputDevices : environment.outputDevices;
            if (!available.some(device => !device.disabled && device.id === audio[field]?.id)) {
                skipped.push({ field, reason: "unavailable-device" });
                continue;
            }
        }
        apply.push(field);
    }
    return { apply, skipped };
}
