import { readFileSync } from "fs";

// Get all keys from autoTranslateMidnightcord
const atc = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");
const atcKeys = new Set();
const regex1 = /^\s*"([^"]+)":\s*\{/gm;
let m;
while ((m = regex1.exec(atc)) !== null) atcKeys.add(m[1]);

// Get all keys from i18n.ts
const i18n = readFileSync("src/api/i18n.ts", "utf8");
const i18nKeys = new Set();
const regex2 = /^\s*"([^"]+)":\s*\{/gm;
while ((m = regex2.exec(i18n)) !== null) i18nKeys.add(m[1]);

// Find overlap
const overlap = [...atcKeys].filter(k => i18nKeys.has(k));
const onlyInAtc = [...atcKeys].filter(k => !i18nKeys.has(k));
const onlyInI18n = [...i18nKeys].filter(k => !atcKeys.has(k));

console.log(`ATC keys: ${atcKeys.size}`);
console.log(`i18n keys: ${i18nKeys.size}`);
console.log(`Overlap: ${overlap.length}`);
console.log(`Only in ATC: ${onlyInAtc.length}`);
console.log("\nKeys only in ATC (need translations):", onlyInAtc.slice(0, 20));
