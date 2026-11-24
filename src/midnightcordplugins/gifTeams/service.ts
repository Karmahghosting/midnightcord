/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { deriveCloudAuthorization, digestCloudText } from "@api/SettingsSync/cloudCrypto";
import { CLOUD_API_BASE } from "@api/SettingsSync/cloudSetup";

export const API_PATH = "/v1/cloud/gif-teams";

export class TeamsError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
}

// Separate credentials for GIF sharing, Cloud backups and each Discord account.
// The Cloud recovery key and Discord's session token never leave this device.
export async function deriveTeamsAuthorization(key: string, discordId: string) {
    if (!/^\d{17,20}$/.test(discordId)) throw new Error("Compte Discord indisponible.");
    const cloudAuthorization = await deriveCloudAuthorization(key);
    return `mc1.${await digestCloudText(`midnightcord-gif-teams-v1:${discordId}:${cloudAuthorization}`)}`;
}

export function createTeamsApi(authorization: string, sessionSignal: AbortSignal) {
    return async function request<T>(path = "", method = "GET", body?: unknown): Promise<T> {
        if (sessionSignal.aborted) throw new DOMException("Session terminée", "AbortError");
        const controller = new AbortController();
        const abort = () => controller.abort();
        sessionSignal.addEventListener("abort", abort, { once: true });
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; abort(); }, 15_000);
        try {
            const response = await fetch(new URL(API_PATH + path, CLOUD_API_BASE), {
                method,
                headers: {
                    Authorization: `Bearer ${authorization}`,
                    "X-Midnightcord-Client": "gif-teams-v1",
                    ...(body === undefined ? {} : { "Content-Type": "application/json" })
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
                credentials: "omit",
                redirect: "error",
                cache: "no-store"
            });
            if (response.status === 204) return undefined as T;
            const text = await response.text();
            if (text.length > 4 * 1024 * 1024) throw new Error("Réponse du serveur trop volumineuse.");
            let data: any;
            try { data = JSON.parse(text); } catch {
                throw new TeamsError(response.status, "unavailable", "Le service de teams est momentanément indisponible.");
            }
            if (!response.ok) {
                const message = response.status === 409
                    ? "Le partage a changé sur un autre appareil. Actualise avant de réessayer."
                    : response.status === 404 ? "Cette team ou cette invitation n’est plus accessible."
                        : response.status === 429 ? "Trop de demandes. Réessaie dans une minute."
                            : response.status === 401 ? "La connexion à ton espace GIF a expiré."
                                : data?.message || "Impossible de terminer cette opération.";
                throw new TeamsError(response.status, String(data?.error ?? "request_failed"), message);
            }
            return data as T;
        } catch (error) {
            if (timedOut && !sessionSignal.aborted)
                throw new TeamsError(408, "request_timeout", "Le serveur n’a pas confirmé l’opération à temps. Actualise pour vérifier son état avant de réessayer.");
            throw error;
        } finally {
            clearTimeout(timeout);
            sessionSignal.removeEventListener("abort", abort);
        }
    };
}
