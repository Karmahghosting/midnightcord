import { readFileSync } from "fs";

const c = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");
const lines = c.split("\n");

let corruptRu = 0, corruptZh = 0;
const corruptKeys = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find ru: "..." or zh: "..." 
    const ruMatch = line.match(/ru:\s*"([^"]*)"/);
    const zhMatch = line.match(/zh:\s*"([^"]*)"/);
    
    if (ruMatch) {
        // Check if the value contains only ? (meaning all chars were corrupted)
        const val = ruMatch[1];
        // If val contains ANY ? and no Cyrillic or CJK chars
        const hasCyrillic = /[\u0400-\u04ff]/.test(val);
        const hasQuestionMark = val.includes("?");
        if (!hasCyrillic && hasQuestionMark && val.length > 0) {
            corruptRu++;
            // Extract key
            const prevLines = lines.slice(Math.max(0, i-2), i+1).join(" ");
            const keyMatch = prevLines.match(/"([^"]+)":\s*\{/);
            if (keyMatch) corruptKeys.push({key: keyMatch[1].slice(0, 40), lang: "ru", val: val.slice(0,30)});
        }
    }
    
    if (zhMatch) {
        const val = zhMatch[1];
        const hasCJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(val);
        const hasQuestionMark = val.includes("?");
        if (!hasCJK && hasQuestionMark && val.length > 0) {
            corruptZh++;
        }
    }
}

console.log(`Corrupt ru: ${corruptRu}`);
console.log(`Corrupt zh: ${corruptZh}`);
console.log("\nSample corrupt entries:");
corruptKeys.slice(0, 20).forEach(e => console.log(`  [${e.lang}] "${e.key}": "${e.val}"`));
