import { readFileSync, writeFileSync } from "fs";

const file = "src/midnightcordplugins/stereoInstaller.desktop/index.tsx";
let content = readFileSync(file, "utf8");

const stringsToWrap = [
    "Discord Audio Collective",
    "Voice Playground",
    "Voice Playground source",
    "Corruption fix tutorial",
    "Replace index.js",
    "Auto-detect",
    "Browse",
    "Patch Discord voice",
    "Revert to backup"
];

let wrapCount = 0;
for (const str of stringsToWrap) {
    const rawPattern = new RegExp(`>\\s*${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`, "g");
    if (rawPattern.test(content)) {
        content = content.replace(rawPattern, `>{t("${str}")}<`);
        wrapCount++;
    }
}

writeFileSync(file, content, "utf8");
console.log(`Wrapped ${wrapCount} raw strings with t() in stereoInstaller.desktop/index.tsx`);
