/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function parseClock(value: string): number | null {
    const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
    return match ? Number(match[0].slice(0, 2)) * 60 + Number(match[0].slice(3, 5)) : null;
}

export function isWithinQuietHours(now: Date, startValue: string, endValue: string): boolean {
    const start = parseClock(startValue);
    const end = parseClock(endValue);
    if (start === null || end === null || start === end) return false;

    const current = now.getHours() * 60 + now.getMinutes();
    return start < end
        ? current >= start && current < end
        : current >= start || current < end;
}

export function parseVipUserIds(value: string): Set<string> {
    return new Set(value.split(/[\s,;]+/).filter(id => /^\d{17,20}$/.test(id)));
}
