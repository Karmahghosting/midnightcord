import { readFileSync } from "fs";

const c = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");
const lines = c.split("\n");
const corrupt = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((line.includes("ru:") || line.includes("zh:")) && /(?:ru|zh): "[?]/.test(line)) {
        // Get the key from the same line or line above
        const prevLine = lines[i - 1] || line;
        const keyMatch = (prevLine + line).match(/"([^"]+)":\s*\{/);
        if (keyMatch) corrupt.push(keyMatch[1]);
    }
}
console.log("Still corrupt:", corrupt.length);
console.log("Examples:", corrupt.slice(0, 30));
