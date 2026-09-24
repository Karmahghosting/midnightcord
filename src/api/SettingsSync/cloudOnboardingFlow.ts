/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type CloudOnboardingState = "pending" | "handled";

export function initialCloudOnboardingState(raw: Record<string, unknown>, rendererKeys: readonly string[]): CloudOnboardingState {
    if (raw.cloudOnboarding === "pending" || raw.cloudOnboarding === "handled") return raw.cloudOnboarding;
    return rendererKeys.some(key => Object.hasOwn(raw, key)) ? "handled" : "pending";
}

interface OnboardingDependencies {
    getState(): CloudOnboardingState | undefined;
    saveState(state: CloudOnboardingState): Promise<void>;
    isCloudEnabled(): boolean;
    hasIdentity(): Promise<boolean>;
    showPrompt(configure: () => void): void;
    openSettings(): void;
    onError(): void;
}

export function createCloudOnboarding(deps: OnboardingDependencies) {
    let started = false;

    return async function offer() {
        if (started) return;
        started = true;
        try {
            if (deps.getState() !== "pending") return;
            const alreadyConfigured = deps.isCloudEnabled() || await deps.hasIdentity();
            await deps.saveState("handled");
            if (alreadyConfigured || deps.isCloudEnabled() || await deps.hasIdentity()) return;
            deps.showPrompt(() => {
                try {
                    deps.openSettings();
                } catch {
                    deps.onError();
                }
            });
        } catch {
            deps.onError();
        }
    };
}
