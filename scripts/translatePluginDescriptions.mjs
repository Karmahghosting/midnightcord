#!/usr/bin/env node
/**
 * Batch-translate all plugin descriptions using Google Translate public endpoint.
 * Groups strings into batches to minimize API calls.
 * Generates src/api/pluginI18n.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INPUT = join(ROOT, "scripts/pluginDescriptions.json");
const CACHE_FILE = join(ROOT, "scripts/translationCache.json");
const OUTPUT = join(ROOT, "src/api/pluginI18n.ts");

const LANGUAGES = ["fr", "es", "ru", "zh-CN"];
const LANG_KEYS = ["fr", "es", "ru", "zh"];
const BATCH_SIZE = 40; // strings per API call
const DELAY_MS = 300; // ms between requests

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function translateBatch(strings, targetLang) {
    // Join with a unique separator that won't appear in translations
    const SEP = "\n⟦SEP⟧\n";
    const combined = strings.join(SEP);

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(combined)}`;

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Google Translate returns an array of [translated, original] pairs
        // Reassemble the full translated text
        let fullTranslated = "";
        if (Array.isArray(data[0])) {
            fullTranslated = data[0].map(pair => pair[0] || "").join("");
        }

        // Split back by separator (Google may translate the separator slightly)
        // Use a fuzzy split that handles slight variations
        const parts = fullTranslated.split(/\s*[\[⟦]SEP[\]⟧]\s*/i);

        if (parts.length === strings.length) {
            return parts.map(s => s.trim());
        }

        // Fallback: try simpler split
        const parts2 = fullTranslated.split(/\n{2,}/);
        if (parts2.length >= strings.length) {
            return strings.map((_, i) => (parts2[i] ?? "").trim());
        }

        // If split failed, return the original strings
        console.warn(`  ⚠ Split mismatch (got ${parts.length}, expected ${strings.length}) for ${targetLang}, retrying one-by-one...`);
        return null; // signal to retry individually
    } catch (e) {
        console.error(`  ✗ Error translating to ${targetLang}: ${e.message}`);
        return null;
    }
}

async function translateSingle(str, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(str)}`;
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        if (!res.ok) return str;
        const data = await res.json();
        return data[0]?.map(p => p[0] || "").join("") || str;
    } catch {
        return str;
    }
}

async function main() {
    if (!existsSync(INPUT)) {
        console.error("Run extractPluginDescriptions.mjs first!");
        process.exit(1);
    }

    const { plugins, allDescriptions } = JSON.parse(readFileSync(INPUT, "utf-8"));
    console.log(`📦 ${plugins.length} plugins, ${allDescriptions.length} unique descriptions`);

    // Load cache
    let cache = {};
    if (existsSync(CACHE_FILE)) {
        cache = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
        console.log(`📄 Loaded cache with ${Object.keys(cache).length} entries`);
    }

    const uncachedDescriptions = allDescriptions.filter(d => !cache[d]);
    console.log(`🔄 Need to translate ${uncachedDescriptions.length} strings to 4 languages`);

    // Process in batches per language
    for (let li = 0; li < LANGUAGES.length; li++) {
        const lang = LANGUAGES[li];
        const langKey = LANG_KEYS[li];

        const needTranslation = uncachedDescriptions.filter(d => !cache[d]?.[langKey]);
        if (needTranslation.length === 0) {
            console.log(`✅ ${lang}: already cached`);
            continue;
        }

        console.log(`\n🌍 Translating ${needTranslation.length} strings to ${lang}...`);

        const batches = [];
        for (let i = 0; i < needTranslation.length; i += BATCH_SIZE) {
            batches.push(needTranslation.slice(i, i + BATCH_SIZE));
        }

        for (let bi = 0; bi < batches.length; bi++) {
            const batch = batches[bi];
            process.stdout.write(`  Batch ${bi + 1}/${batches.length}... `);

            let results = await translateBatch(batch, lang);

            if (!results) {
                // Retry individually
                results = [];
                for (const str of batch) {
                    results.push(await translateSingle(str, lang));
                    await sleep(100);
                }
            }

            for (let i = 0; i < batch.length; i++) {
                const original = batch[i];
                cache[original] ??= {};
                cache[original][langKey] = results[i] || original;
            }

            // Save cache after each batch
            writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
            console.log(`✓`);
            await sleep(DELAY_MS);
        }
    }

    // Generate TypeScript file
    console.log("\n📝 Generating pluginI18n.ts...");

    const lines = [
        `/*`,
        ` * Midnightcord - Auto-generated plugin description translations`,
        ` * Generated by scripts/translatePluginDescriptions.mjs`,
        ` */`,
        ``,
        `import { Settings } from "@api/Settings";`,
        ``,
        `type LangMap = { fr?: string; es?: string; ru?: string; zh?: string };`,
        ``,
        `const pluginTranslations: Record<string, LangMap> = {`,
    ];

    for (const desc of allDescriptions) {
        const entry = cache[desc] ?? {};
        const fr = (entry.fr || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        const es = (entry.es || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        const ru = (entry.ru || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        const zh = (entry.zh || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
        const key = desc.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

        if (!fr && !es && !ru && !zh) continue;

        lines.push(`    "${key}": { ${fr ? `fr: "${fr}", ` : ""}${es ? `es: "${es}", ` : ""}${ru ? `ru: "${ru}", ` : ""}${zh ? `zh: "${zh}"` : ""} },`);
    }

    lines.push(`};`);
    lines.push(``);
    lines.push(`/**`);
    lines.push(` * Translate a plugin description/setting string.`);
    lines.push(` * Falls back to the original English string if no translation is available.`);
    lines.push(` */`);
    lines.push(`export function tPlugin(key: string): string {`);
    lines.push(`    const lang = (Settings.language as string) ?? "en";`);
    lines.push(`    if (!lang || lang === "en") return key;`);
    lines.push(`    return pluginTranslations[key]?.[lang as keyof LangMap] ?? key;`);
    lines.push(`}`);
    lines.push(``);

    writeFileSync(OUTPUT, lines.join("\n"), "utf-8");
    console.log(`✅ Generated ${OUTPUT}`);
    console.log(`   ${allDescriptions.length} strings, ${Object.keys(cache).length} cached translations`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
