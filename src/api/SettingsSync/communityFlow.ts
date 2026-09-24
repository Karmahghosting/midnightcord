/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface CommunityStatus {
    enabled: boolean;
    name: string;
    guildId: string | null;
    status: "unseen" | "offered" | "declined" | "joined";
    updatedAt?: string;
}

interface CommunityDependencies {
    baseUrl: string;
    isEnabled(): boolean;
    getAuthorization(): Promise<string | null>;
    fetch: typeof fetch;
    openExternal(url: string): void | Promise<unknown>;
    prepareExternal?(): ExternalTarget;
    showPrompt(confirm: () => void, decline: () => void): void;
    onChange(): void;
    onError(manual: boolean): void;
    timeoutMs?: number;
}

interface ExternalTarget {
    open(url: string): void;
    close(): void;
}

function parseStatus(value: unknown): CommunityStatus {
    const data = value as Partial<CommunityStatus> | null;
    if (!data || typeof data.enabled !== "boolean" || typeof data.name !== "string"
        || !(data.guildId === null || typeof data.guildId === "string" && /^\d{17,20}$/.test(data.guildId))
        || !["unseen", "offered", "declined", "joined"].includes(data.status ?? ""))
        throw new Error("Invalid community status");
    return data as CommunityStatus;
}

export function createCommunityFlow(deps: CommunityDependencies) {
    const attempted = new Set<string>();
    const joining = new Set<string>();

    async function identity() {
        if (!deps.isEnabled()) return null;
        const authorization = await deps.getAuthorization();
        return deps.isEnabled() ? authorization : null;
    }

    async function isCurrent(authorization: string) {
        return await identity() === authorization;
    }

    async function request(authorization: string, suffix = "", method = "GET") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15_000);
        try {
            const response = await deps.fetch(new URL(`/v1/cloud/community${suffix}`, deps.baseUrl), {
                method,
                headers: {
                    Authorization: `Bearer ${authorization}`,
                    "X-Midnightcord-Client": "desktop-v1"
                },
                credentials: "omit",
                cache: "no-store",
                referrerPolicy: "no-referrer",
                signal: controller.signal
            });
            if (!response.ok) throw new Error("Community request failed");
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async function getStatus(): Promise<CommunityStatus | null> {
        const authorization = await identity();
        if (!authorization) return null;
        const status = parseStatus(await request(authorization));
        return await isCurrent(authorization) ? status : null;
    }

    async function joinIdentity(authorization: string, target?: ExternalTarget) {
        if (joining.has(authorization)) return;
        joining.add(authorization);
        try {
            if (!await isCurrent(authorization)) return;
            const result = await request(authorization, "/join", "POST");
            if (!await isCurrent(authorization)) return;
            if (result?.joined !== true) {
                if (typeof result?.url !== "string") throw new Error("Missing community URL");
                const url = new URL(result.url);
                if (url.origin !== new URL(deps.baseUrl).origin || url.pathname !== "/v1/community/join"
                    || url.username || url.password || url.hash || [...url.searchParams].length !== 1
                    || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("ticket") ?? ""))
                    throw new Error("Invalid community URL");
                if (target) target.open(url.toString());
                else await deps.openExternal(url.toString());
            }
            if (await isCurrent(authorization)) deps.onChange();
        } finally {
            joining.delete(authorization);
        }
    }

    async function act(authorization: string, action: "join" | "decline", target?: ExternalTarget) {
        try {
            if (!await isCurrent(authorization)) return;
            if (action === "join") await joinIdentity(authorization, target);
            else {
                await request(authorization, "/decline", "PUT");
                if (await isCurrent(authorization)) deps.onChange();
            }
        } catch {
            if (await isCurrent(authorization).catch(() => false)) deps.onError(true);
        }
    }

    async function join(expectedAuthorization?: string) {
        let target: ExternalTarget | undefined;
        try {
            target = deps.prepareExternal?.();
            const authorization = expectedAuthorization ?? await identity();
            if (authorization) await act(authorization, "join", target);
        } catch {
            deps.onError(true);
        } finally {
            target?.close();
        }
    }

    async function offer() {
        try {
            const authorization = await identity();
            if (!authorization || attempted.has(authorization)) return;
            attempted.add(authorization);
            const result = await request(authorization, "/prompt", "POST");
            const status = parseStatus(result);
            if (!await isCurrent(authorization)) return;
            deps.onChange();
            if (status.enabled && status.status === "offered" && result.showPrompt === true) {
                deps.showPrompt(
                    () => void join(authorization),
                    () => void act(authorization, "decline")
                );
            }
        } catch {
            deps.onError(false);
        }
    }

    return { getStatus, join, offer };
}
