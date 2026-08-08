#!/usr/bin/env node
import { readFileSync } from "fs";

const content = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");

// Count ? chars in ru/zh values
const lines = content.split("\n");
let corrupt = 0, total = 0;
for (const line of lines) {
    if (line.includes("ru:") || line.includes("zh:")) {
        total++;
        // ru: "??????" or zh: "??"
        if (/(?:ru|zh): "[?]/.test(line)) corrupt++;
    }
}
console.log(`Total lang lines: ${total}, Corrupt (literal ?): ${corrupt}`);
console.log(`Quality: ${Math.round((1 - corrupt/total)*100)}%`);
