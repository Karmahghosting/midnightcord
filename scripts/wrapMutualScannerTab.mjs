import { readFileSync, writeFileSync } from "fs";

let content = readFileSync("src/midnightcordplugins/mutualScanner/MutualScannerTab.tsx", "utf8");

// Ensure t import
if (!content.includes('import { t } from "../autoTranslateMidnightcord";')) {
    content = 'import { t } from "../autoTranslateMidnightcord";\n' + content;
}

// 1. Wrap raw JSX text >Text<
content = content.replace(/>\s*([A-Za-z0-9!?.:,;\-' shadow\(\)]{2,})\s*</g, (match, p1) => {
    const trimmed = p1.trim();
    if (!trimmed) return match;
    if (trimmed.startsWith("{") || trimmed.endsWith("}")) return match;
    if (trimmed === "Midnightcord" || trimmed === "Midnightcord AI") return match;
    if (/^[0-9]+$/.test(trimmed)) return match;
    return `>{t("${trimmed}")}<`;
});

// 2. Wrap showToast("...")
content = content.replace(/showToast\(\s*["']([^"']+)["']/g, (match, p1) => {
    return `showToast(t("${p1}")`;
});

// 3. Wrap title="...", placeholder="...", description="..."
content = content.replace(/(placeholder|title|label)\s*=\s*["']([^"']+)["']/g, (match, attr, p1) => {
    if (p1 === "Midnightcord" || p1.startsWith("http")) return match;
    return `${attr}={t("${p1}")}`;
});

writeFileSync("src/midnightcordplugins/mutualScanner/MutualScannerTab.tsx", content, "utf8");
console.log("Wrapped MutualScannerTab.tsx!");
