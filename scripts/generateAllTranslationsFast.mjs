import { readFileSync, writeFileSync } from "fs";

const strings = JSON.parse(readFileSync("scripts/extractedStrings.json", "utf8"));
const atcContent = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");

const existingEntries = {};
const entryRegex = /"((?:[^"\\]|\\.)*)":\s*\{\s*en:\s*"((?:[^"\\]|\\.)*)"(?:,\s*fr:\s*"((?:[^"\\]|\\.)*)")?(?:,\s*ar:\s*"((?:[^"\\]|\\.)*)")?(?:,\s*es:\s*"((?:[^"\\]|\\.)*)")?(?:,\s*ru:\s*"((?:[^"\\]|\\.)*)")?(?:,\s*zh:\s*"((?:[^"\\]|\\.)*)")?\s*\}/g;
let match;
while ((match = entryRegex.exec(atcContent)) !== null) {
    existingEntries[match[1]] = {
        en: match[2],
        fr: match[3],
        ar: match[4],
        es: match[5],
        ru: match[6],
        zh: match[7]
    };
}

const missingStrings = strings.filter(s => {
    if (s === "Midnightcord" || s === "Midnightcord AI") return false;
    const existing = existingEntries[s];
    if (!existing) return true;
    if (!existing.fr || !existing.ar || !existing.es || !existing.ru || !existing.zh) return true;
    return false;
});

console.log(`Missing/Incomplete strings: ${missingStrings.length}`);

async function translateText(text, targetLang) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data[0]) {
            return data[0].map(item => item[0]).join("");
        }
    } catch {}
    return text;
}

async function processBatch(batch) {
    return Promise.all(batch.map(async (str) => {
        const existing = existingEntries[str] || {};
        const [fr, ar, es, ru, zh] = await Promise.all([
            existing.fr ? Promise.resolve(existing.fr) : translateText(str, "fr"),
            existing.ar ? Promise.resolve(existing.ar) : translateText(str, "ar"),
            existing.es ? Promise.resolve(existing.es) : translateText(str, "es"),
            existing.ru ? Promise.resolve(existing.ru) : translateText(str, "ru"),
            existing.zh ? Promise.resolve(existing.zh) : translateText(str, "zh-CN")
        ]);
        return { str, fr: fr || str, ar: ar || str, es: es || str, ru: ru || str, zh: zh || str };
    }));
}

async function main() {
    const newTranslations = { ...existingEntries };
    const BATCH_SIZE = 40;
    
    for (let i = 0; i < missingStrings.length; i += BATCH_SIZE) {
        const batch = missingStrings.slice(i, i + BATCH_SIZE);
        const results = await processBatch(batch);
        for (const res of results) {
            newTranslations[res.str] = {
                en: res.str,
                fr: res.fr,
                ar: res.ar,
                es: res.es,
                ru: res.ru,
                zh: res.zh
            };
        }
        console.log(`Progress: ${Math.min(i + BATCH_SIZE, missingStrings.length)}/${missingStrings.length}`);
    }

    const fileHeader = `/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import definePlugin from "@utils/types";

export type SupportedLang = "en" | "fr" | "ar" | "es" | "ru" | "zh";
export type TranslationMap = Record<string, Record<SupportedLang, string>>;

export const translations: TranslationMap = {\n`;

    const fileFooter = `\n};

export default definePlugin({
    name: "AutoTranslateMidnightcord",
    enabledByDefault: true,
    required: true,
    description: "Automatic translation for Midnightcord.",
    authors: [{ name: "Trigger", id: 0n }],
    options: {
        autoTranslate: {
            description: "Automatically translate strings",
            type: 4, // select
            options: [
                { label: "English", value: "en", default: true },
                { label: "Français", value: "fr" },
                { label: "العربية", value: "ar" },
                { label: "Español", value: "es" },
                { label: "Русский", value: "ru" },
                { label: "中文", value: "zh" },
            ]
        },
    },
});

function normalizeLang(lang: string): SupportedLang {
    if (!lang) return "en";
    const l = lang.toLowerCase();
    if (l.startsWith("fr")) return "fr";
    if (l.startsWith("ar")) return "ar";
    if (l.startsWith("es")) return "es";
    if (l.startsWith("ru")) return "ru";
    if (l.startsWith("zh")) return "zh";
    return "en";
}

export function t(key: string): string {
    const rawLang = (Settings.language as string) ?? "en";
    const lang = normalizeLang(rawLang);
    if (lang === "en") return key;
    return translations[key]?.[lang] ?? translations[key]?.en ?? key;
}

export function useTranslation() {
    const rawLang = (Settings.language as string) ?? "en";
    const lang = normalizeLang(rawLang);
    return {
        t: (key: string) => {
            if (lang === "en") return key;
            return translations[key]?.[lang] ?? translations[key]?.en ?? key;
        },
        lang,
    };
}
`;

    const keys = Object.keys(newTranslations).sort();
    let entriesStr = "";
    for (const key of keys) {
        const item = newTranslations[key];
        const safeKey = JSON.stringify(key);
        const safeEn = JSON.stringify(item.en || key);
        const safeFr = JSON.stringify(item.fr || key);
        const safeAr = JSON.stringify(item.ar || key);
        const safeEs = JSON.stringify(item.es || key);
        const safeRu = JSON.stringify(item.ru || key);
        const safeZh = JSON.stringify(item.zh || key);
        entriesStr += `    ${safeKey}: { en: ${safeEn}, fr: ${safeFr}, ar: ${safeAr}, es: ${safeEs}, ru: ${safeRu}, zh: ${safeZh} },\n`;
    }

    writeFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", fileHeader + entriesStr + fileFooter, "utf8");
    console.log("Done! Written all translations to autoTranslateMidnightcord/index.ts.");
}

main().catch(console.error);
