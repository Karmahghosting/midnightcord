/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";

const logger = new Logger("GroqManager");

const DS_API_KEY = "groq-shared-api-key";

const GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
] as const;

let currentModelIdx = 0;
const modelCooldown: Record<string, number> = {};

let _settingsFallback: (() => string) | null = null;

export function registerSettingsFallback(fn: () => string) {
    _settingsFallback = fn;
}

export async function getGroqKey(): Promise<string> {
    const key = await DataStore.get(DS_API_KEY);
    if (typeof key === "string" && key.trim()) {
        return key.trim();
    }
    if (_settingsFallback) {
        try {
            const fallback = _settingsFallback();
            if (typeof fallback === "string" && fallback.trim()) {
                return fallback.trim();
            }
        } catch (err) {
            logger.error("Failed to run settings fallback function", err);
        }
    }
    return "";
}

export async function setGroqKey(key: string): Promise<void> {
    if (typeof key !== "string") {
        throw new Error("API key must be a string");
    }
    await DataStore.set(DS_API_KEY, key.trim());
}

function getAvailableModel(): string {
    const now = Date.now();
    for (let i = 0; i < GROQ_MODELS.length; i++) {
        const idx = (currentModelIdx + i) % GROQ_MODELS.length;
        const model = GROQ_MODELS[idx];
        const cooldownUntil = modelCooldown[model] ?? 0;
        if (now >= cooldownUntil) {
            currentModelIdx = idx;
            return model;
        }
    }

    let minCooldown = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < GROQ_MODELS.length; i++) {
        const cd = modelCooldown[GROQ_MODELS[i]] ?? 0;
        if (cd < minCooldown) {
            minCooldown = cd;
            bestIdx = i;
        }
    }
    currentModelIdx = bestIdx;
    return GROQ_MODELS[bestIdx];
}

function markModelRateLimited(model: string, retryAfterMs = 60_000): void {
    modelCooldown[model] = Date.now() + retryAfterMs;
    logger.warn(`Model ${model} in cooldown for ${retryAfterMs / 1000}s`);
    currentModelIdx = (currentModelIdx + 1) % GROQ_MODELS.length;
}

let queue = Promise.resolve();
const MIN_DELAY_MS = 200;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(() => fn());
    queue = result.then(
        () => new Promise(r => setTimeout(r, MIN_DELAY_MS)),
        () => new Promise(r => setTimeout(r, MIN_DELAY_MS)),
    );
    return result;
}

export interface GroqChatMessage {
    role: "system" | "user" | "assistant";
    content: string | any[];
}

export interface GroqCallOptions {
    messages: GroqChatMessage[];
    temperature?: number;
    maxTokens?: number;
    forceModel?: string;
    maxRetries?: number;
}

export async function groqChat(opts: GroqCallOptions): Promise<string> {
    if (!opts || typeof opts !== "object") {
        throw new Error("Invalid options object");
    }
    if (!Array.isArray(opts.messages)) {
        throw new Error("Messages must be an array");
    }
    for (const msg of opts.messages) {
        if (!msg || typeof msg !== "object") {
            throw new Error("Invalid message object");
        }
        if (msg.role !== "system" && msg.role !== "user" && msg.role !== "assistant") {
            throw new Error(`Invalid message role: ${msg.role}`);
        }
        if (typeof msg.content !== "string" && !Array.isArray(msg.content)) {
            throw new Error("Message content must be a string or array");
        }
    }
    return enqueue(() => _groqChat(opts));
}

async function _groqChat(opts: GroqCallOptions, attempt = 0): Promise<string> {
    const { messages, temperature = 0.7, maxTokens = 1000, forceModel, maxRetries = 3 } = opts;

    const apiKey = await getGroqKey();
    if (!apiKey) {
        throw new Error("Groq API key missing — configure it in Settings → MidnightcordAI");
    }

    const model = forceModel ?? getAvailableModel();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature,
                max_tokens: maxTokens,
                messages,
            }),
            signal: controller.signal,
        });

        if (res.status === 429) {
            if (attempt >= maxRetries) {
                throw new Error("Groq rate limit — try again in a moment");
            }

            const retryAfterHeader = res.headers.get("retry-after");
            let retryAfterMs = 60_000;
            if (retryAfterHeader) {
                const parsed = parseInt(retryAfterHeader, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    retryAfterMs = Math.min(300_000, parsed * 1000);
                }
            }

            markModelRateLimited(model, retryAfterMs);
            return _groqChat({ ...opts, forceModel: undefined }, attempt + 1);
        }

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Groq API ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = await res.json().catch(() => null);
        if (!data || typeof data !== "object") {
            throw new Error("Invalid response JSON from Groq");
        }

        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
            throw new Error("Groq response did not return a valid content string");
        }

        return content.trim();
    } catch (err: any) {
        if (err.name === "AbortError") {
            throw new Error("Groq API request timed out after 30 seconds");
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

export function getCurrentModel(): string {
    return GROQ_MODELS[currentModelIdx] ?? GROQ_MODELS[0];
}
