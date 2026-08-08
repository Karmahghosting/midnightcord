import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

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

const files = getFiles("src/midnightcordplugins");
const tooltipsFound = [];

for (const file of files) {
    let content = readFileSync(file, "utf8");
    let modified = false;

    // Find tooltip="Some Text" or tooltipText="Some Text"
    const tooltipMatches = [...content.matchAll(/\b(tooltip|tooltipText|title)=["']([^"']+)["']/g)];
    for (const m of tooltipMatches) {
        const attr = m[1];
        const val = m[2].trim();
        if (val && val !== "Midnightcord" && val !== "Midnightcord AI" && !val.startsWith("http") && !/^\d+$/.test(val)) {
            tooltipsFound.push({ file, attr, val });
            
            // Check if file has t imported
            if (!content.includes('autoTranslateMidnightcord') && !content.includes('import { t }') && !content.includes('import { tPlugin as t }')) {
                const depth = file.split(/[/\\]/).length - file.split(/[/\\]/).indexOf("midnightcordplugins") - 2;
                const relPath = "../".repeat(Math.max(1, depth)) + "autoTranslateMidnightcord";
                content = `import { t } from "${relPath}";\n` + content;
            }

            const pattern = new RegExp(`\\b${attr}=["']${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, "g");
            content = content.replace(pattern, `${attr}={t("${val}")}`);
            modified = true;
        }
    }

    if (modified) {
        writeFileSync(file, content, "utf8");
        console.log(`Updated tooltips in ${file}`);
    }
}

console.log(`\nFound and updated ${tooltipsFound.length} tooltips across plugin files.`);
