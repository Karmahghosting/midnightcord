/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ProviderId = "groq" | "openai" | "nanogpt" | "mistral" | "custom";

export interface ProviderInfo {
    id: ProviderId;
    label: string;
    baseUrl: string;
    defaultModel: string;
    visionModel?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
    groq: {
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: "openai/gpt-oss-120b",
        visionModel: "meta-llama/llama-4-scout-17b-16e-instruct"
    },
    openai: {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4.1-mini",
        visionModel: "gpt-4.1-mini"
    },
    nanogpt: {
        id: "nanogpt",
        label: "NanoGPT",
        baseUrl: "https://api.nano-gpt.com/api/v1",
        defaultModel: "openai/gpt-oss-120b",
        visionModel: "openai/gpt-4o-mini"
    },
    mistral: {
        id: "mistral",
        label: "Mistral",
        baseUrl: "https://api.mistral.ai/v1",
        defaultModel: "mistral-large-latest",
        visionModel: "pixtral-large-latest"
    },
    custom: {
        id: "custom",
        label: "Custom (OpenAI-compatible)",
        baseUrl: "",
        defaultModel: ""
    }
};

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string | any[];
}

export interface ProviderChatOptions {
    provider: ProviderId;
    apiKey: string;
    baseUrl?: string;
    messages: ChatMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
}

export function normalizeProvider(value: string | undefined | null): ProviderId {
    return value && value in PROVIDERS ? value as ProviderId : "groq";
}

export function providerBaseUrl(provider: ProviderId, customBaseUrl?: string) {
    const base = provider === "custom" ? (customBaseUrl?.trim() ?? "") : PROVIDERS[provider].baseUrl;
    return base.replace(/\/+$/, "");
}

export async function providerChat(options: ProviderChatOptions): Promise<string> {
    const { provider, apiKey, messages, model, temperature = 0.7, maxTokens = 1000, timeoutMs = 30_000 } = options;
    const info = PROVIDERS[provider];
    const baseUrl = providerBaseUrl(provider, options.baseUrl);

    if (!baseUrl) {
        throw new Error("Custom provider base URL missing — configure it in Settings → MidnightcordAI");
    }

    if (!apiKey?.trim()) {
        throw new Error(`${info.label} API key missing — configure it in Settings → MidnightcordAI`);
    }

    if (!model?.trim()) {
        throw new Error(`${info.label} model missing — configure it in Settings → MidnightcordAI`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model,
                temperature,
                max_tokens: maxTokens,
                messages
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`${info.label} API ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = await response.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;

        if (typeof content === "string") return content.trim();

        if (Array.isArray(content)) {
            const text = content
                .map((part: any) => typeof part === "string" ? part : part?.text ?? "")
                .join("")
                .trim();
            if (text) return text;
        }

        throw new Error(`${info.label} response did not return a valid content string`);
    } catch (error: any) {
        if (error?.name === "AbortError") {
            throw new Error(`${info.label} API request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
