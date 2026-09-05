/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function deliverReminderNotice(inApp: () => void, desktop: () => void, onDesktopError: (error: unknown) => void) {
    inApp();
    try {
        desktop();
    } catch (error) {
        onDesktopError(error);
    }
}
