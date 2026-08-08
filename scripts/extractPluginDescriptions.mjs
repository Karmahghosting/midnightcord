#!/usr/bin/env node
/**
 * Extract all plugin names, descriptions, and setting keys from plugin source files.
 * Outputs a JSON file ready for translation.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PLUGIN_DIRS = [
    join(ROOT, "src/plugins"),
    join(ROOT, "src/midnightcordplugins"),
];

const pluginEntries = [];

// Mimic Vencord's case transformation
function wordsFromCamel(text) {
    return text.split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/).map(w => /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase());
}
function wordsToTitle(words) {
    return words.map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function extractFromFile(content) {
    // Match: name: "Something",
    const nameMatch = content.match(/^\s*name:\s*["'`]([^"'`]+)["'`]/m);
    
    // Match description value as string literal (handles escaped quotes)
    const rawDescriptions = [];
    const descRegex = /^\s*description:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/gm;
    let descMatch;
    while ((descMatch = descRegex.exec(content)) !== null) {
        const val = descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? "";
        const cleanVal = val.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        rawDescriptions.push(cleanVal);
    }
    const descriptions = rawDescriptions.filter(d =>
        d.length > 5 &&
        !d.includes("${") &&
        !d.startsWith("http")
    );

    // Extract setting keys
    // Settings are defined like:
    // const settings = definePluginSettings({
    //     keyName: { ... }
    // })
    // We'll look for property names right before "type: OptionType"
    const settingKeys = [];
    const settingMatches = [...content.matchAll(/^\s*([a-zA-Z0-9_]+):\s*{[\s\S]*?type:\s*OptionType/gm)];
    for (const match of settingMatches) {
        const key = match[1];
        settingKeys.push(wordsToTitle(wordsFromCamel(key)));
    }

    // Extract tPlugin/t translation keys (handles escaped quotes)
    const translationKeys = [];
    const tRegex = /(?:\btPlugin|\bt)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)\s*\)/g;
    let tMatch;
    while ((tMatch = tRegex.exec(content)) !== null) {
        const val = tMatch[1] ?? tMatch[2] ?? tMatch[3] ?? "";
        const cleanVal = val.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        translationKeys.push(cleanVal);
    }

    const name = nameMatch?.[1] ?? null;
    return { name, descriptions, settingKeys, translationKeys };
}

for (const dir of PLUGIN_DIRS) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginDir = join(dir, entry.name);
        const candidates = ["index.tsx", "index.ts", "index.jsx", "index.js"];

        for (const file of candidates) {
            const filePath = join(pluginDir, file);
            if (!existsSync(filePath)) continue;

            try {
                const content = readFileSync(filePath, "utf-8");
                const { name, descriptions, settingKeys, translationKeys } = extractFromFile(content);
                if (name) {
                    pluginEntries.push({ name, descriptions, settingKeys, translationKeys, file: filePath.replace(ROOT, "") });
                }
            } catch (e) {}
            break;
        }
    }
}

// Also scan .tsx files directly at root
for (const dir of PLUGIN_DIRS) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
            const filePath = join(dir, entry.name);
            try {
                const content = readFileSync(filePath, "utf-8");
                const { name, descriptions, settingKeys, translationKeys } = extractFromFile(content);
                if (name) {
                    pluginEntries.push({ name, descriptions, settingKeys, translationKeys, file: filePath.replace(ROOT, "") });
                }
            } catch (e) {}
        }
    }
}

// Deduplicate by name
const seen = new Set();
const unique = pluginEntries.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
});

// Collect all unique translation strings (names, descriptions, setting names)
const allStrings = new Set();
for (const p of unique) {
    allStrings.add(p.name);
    for (const d of p.descriptions) {
        allStrings.add(d);
    }
    for (const s of p.settingKeys) {
        allStrings.add(s);
    }
}

function scanDirForTranslations(dirPath) {
    if (!existsSync(dirPath)) return;
    const items = readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
        const fullPath = join(dirPath, item.name);
        if (item.isDirectory()) {
            scanDirForTranslations(fullPath);
        } else if (item.isFile() && (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") || fullPath.endsWith(".js") || fullPath.endsWith(".jsx"))) {
            try {
                const content = readFileSync(fullPath, "utf-8");
                const tRegex = /(?:\btPlugin|\bt)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)\s*\)/g;
                let tMatch;
                while ((tMatch = tRegex.exec(content)) !== null) {
                    const val = tMatch[1] ?? tMatch[2] ?? tMatch[3] ?? "";
                    const cleanVal = val.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
                    if (cleanVal.length > 0 && !cleanVal.includes("${")) {
                        allStrings.add(cleanVal);
                    }
                }
            } catch (e) {}
        }
    }
}

for (const dir of PLUGIN_DIRS) {
    scanDirForTranslations(dir);
}

// Add our detailed descriptions
try {
    const detailedContent = readFileSync(join(ROOT, "src/api/detailedPluginDescriptions.ts"), "utf-8");
    const match = detailedContent.match(/export const detailedPluginDescriptions: Record<string, string> = (\{[\s\S]*?\});/);
    if (match) {
        const parsed = JSON.parse(match[1]);
        for (const val of Object.values(parsed)) {
            allStrings.add(val);
        }
    }
} catch (e) {
    console.error("Could not parse detailedPluginDescriptions.ts", e);
}

const output = {
    plugins: unique,
    allDescriptions: [...allStrings].sort(),
};

writeFileSync(
    join(ROOT, "scripts/pluginDescriptions.json"),
    JSON.stringify(output, null, 2),
    "utf-8"
);

console.log(`Extracted ${unique.length} plugins, ${allStrings.size} unique strings.`);
console.log("Output: scripts/pluginDescriptions.json");
