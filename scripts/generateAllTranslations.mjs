import { readFileSync, writeFileSync } from "fs";

// Load all extracted strings
const strings = JSON.parse(readFileSync("scripts/extractedStrings.json", "utf8"));
console.log(`Loaded ${strings.length} strings to translate.`);

// Read current autoTranslateMidnightcord index.ts
const atcContent = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");

// Parse existing entries in autoTranslateMidnightcord
const existingEntries = {};
const entryRegex = /"((?:[^"\\]|\\.)*)":\s*\{\s*en:\s*"((?:[^"\\]|\\.)*)",\s*es:\s*"((?:[^"\\]|\\.)*)",\s*ru:\s*"((?:[^"\\]|\\.)*)",\s*zh:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
let match;
while ((match = entryRegex.exec(atcContent)) !== null) {
    existingEntries[match[1]] = {
        en: match[2],
        es: match[3],
        ru: match[4],
        zh: match[5]
    };
}

console.log(`Existing entries in autoTranslateMidnightcord: ${Object.keys(existingEntries).length}`);

// Find strings that are not in existingEntries or have missing/corrupt translations
const missingStrings = strings.filter(s => {
    if (s === "Midnightcord" || s === "Midnightcord AI") return false;
    const existing = existingEntries[s];
    if (!existing) return true;
    if (!existing.es || !existing.ru || !existing.zh) return true;
    if (existing.ru.includes("?") || existing.zh.includes("?")) return true;
    return false;
});

console.log(`Missing or incomplete strings: ${missingStrings.length}`);

// We will fetch translations for missingStrings using free Google Translate API
async function translateText(text, targetLang) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data[0]) {
            return data[0].map(item => item[0]).join("");
        }
    } catch (e) {
        console.error(`Error translating "${text}" to ${targetLang}:`, e.message);
    }
    return text;
}

async function main() {
    const newTranslations = { ...existingEntries };
    let count = 0;

    for (const str of missingStrings) {
        count++;
        if (count % 20 === 0 || count === missingStrings.length) {
            console.log(`Translating ${count}/${missingStrings.length}...`);
        }

        const [es, ru, zh] = await Promise.all([
            translateText(str, "es"),
            translateText(str, "ru"),
            translateText(str, "zh-CN")
        ]);

        newTranslations[str] = {
            en: str,
            es: es || str,
            ru: ru || str,
            zh: zh || str
        };

        // Small delay to be polite to free API
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`Total translated entries ready: ${Object.keys(newTranslations).length}`);

    // Format new autoTranslateMidnightcord index.ts
    let newContent = `/*
 * Midnightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import definePlugin from "@utils/types";

export type SupportedLang = "en" | "es" | "ru" | "zh";
export type TranslationMap = Record<string, Record<SupportedLang, string>>;

export const translations: TranslationMap = {\n`;

    const keys = Object.keys(newTranslations).sort();
    for (const k of keys) {
        const entry = newTranslations[k];
        const escapeQuote = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        newContent += `    "${escapeQuote(k)}": { en: "${escapeQuote(entry.en)}", es: "${escapeQuote(entry.es)}", ru: "${escapeQuote(entry.ru)}", zh: "${escapeQuote(entry.zh)}" },\n`;
    }

    newContent += `};

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
                { label: "Español", value: "es" },
                { label: "Русский", value: "ru" },
                { label: "中文", value: "zh" },
            ]
        },
    },
});

export function t(key: string): string {
    const lang = ((Settings.language as SupportedLang) ?? "en") as SupportedLang;
    if (lang === "en") return key;
    return translations[key]?.[lang] ?? translations[key]?.en ?? key;
}

export function useTranslation() {
    const lang = ((Settings.language as SupportedLang) ?? "en") as SupportedLang;
    return {
        t: (key: string) => {
            if (lang === "en") return key;
            return translations[key]?.[lang] ?? translations[key]?.en ?? key;
        },
        lang,
    };
}
`;

    writeFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", newContent, "utf8");
    console.log("Successfully updated autoTranslateMidnightcord/index.ts!");
}

main();
