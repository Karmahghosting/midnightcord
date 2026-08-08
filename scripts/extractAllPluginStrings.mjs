import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const targetDirs = ["src/midnightcordplugins", "src/components", "src/plugins", "src/api"];

function getFiles(dir) {
    let results = [];
    try {
        const stat = statSync(dir);
        if (!stat.isDirectory()) return [dir];
        const list = readdirSync(dir);
        for (const file of list) {
            const filePath = join(dir, file);
            const s = statSync(filePath);
            if (s && s.isDirectory()) {
                results = results.concat(getFiles(filePath));
            } else if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
                results.push(filePath);
            }
        }
    } catch {}
    return results;
}

function isRealText(str) {
    if (!str || typeof str !== "string") return false;
    str = str.trim();
    if (str.length < 2) return false;
    if (str === "Midnightcord" || str === "Midnightcord AI") return false;
    if (str.startsWith("http://") || str.startsWith("https://")) return false;
    if (/^[\d.,:\-_\/\\()=?>!#%&*+]+$/.test(str)) return false;
    if (str.includes("Promise") || str.includes("Promise<") || str.includes("=>") || str.includes("className")) return false;
    if (str.includes("${") || (str.includes("...") && str.length < 4)) return false;
    if (/^[0-9]+$/.test(str)) return false;
    return /[a-zA-Z\u00C0-\u024F]/.test(str);
}

const extractedStrings = new Set();

for (const dir of targetDirs) {
    const files = getFiles(dir);
    for (const file of files) {
        if (file.includes("autoTranslateMidnightcord")) continue;
        const content = readFileSync(file, "utf8");

        // 1. t("...") and tPlugin("...")
        const tMatches = [...content.matchAll(/\b(?:t|tPlugin)\(\s*["']([^"']+)["']\s*\)/g)];
        for (const m of tMatches) {
            if (isRealText(m[1])) extractedStrings.add(m[1].trim());
        }

        // 2. description: "..."
        const descMatches = [...content.matchAll(/description:\s*["']([^"']+)["']/g)];
        for (const m of descMatches) {
            if (isRealText(m[1])) extractedStrings.add(m[1].trim());
        }

        // 3. title: "..."
        const titleMatches = [...content.matchAll(/title:\s*["']([^"']+)["']/g)];
        for (const m of titleMatches) {
            if (isRealText(m[1])) extractedStrings.add(m[1].trim());
        }
    }
}

const result = Array.from(extractedStrings).sort();
writeFileSync("scripts/extractedStrings.json", JSON.stringify(result, null, 2), "utf8");
console.log(`Cleaned total strings count across ALL src components & plugins: ${result.length}`);
