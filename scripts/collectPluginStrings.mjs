import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const targetPlugins = [
    "FakeVoice",
    "antiMoveDeco",
    "midnightcordAI",
    "ClearGroups",
    "ClearDMs",
    "messageCleaner",
    "leaveAllServers",
    "muteAllServers",
    "serverCloner",
    "silentEdit.tsx",
    "silentDelete",
    "showHiddenThings",
    "previewMessage",
    "passcodeLock",
    "channelWallpaper",
    "DynamicIslande",
    "fakeFriends",
    "lastSeen",
    "pinDms",
    "reverseImageSearch",
    "mutualScanner",
    "stereoInstaller.desktop",
    "Surveillance",
    "translate"
];

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

const atcContent = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");

const allKeysToTranslate = new Set();
const rawStringsToWrap = [];

for (const pluginFolder of targetPlugins) {
    const pluginPath = join("src/midnightcordplugins", pluginFolder);
    const files = getFiles(pluginPath);

    for (const file of files) {
        const content = readFileSync(file, "utf8");

        // 1. Find t("...") or tPlugin("...") or useTranslation().t("...")
        const tMatches = [...content.matchAll(/\b(?:t|tPlugin)\(\s*"([^"]+)"\s*\)/g)];
        for (const m of tMatches) {
            allKeysToTranslate.add(m[1]);
        }

        // 2. Find raw JSX strings like >Some Text< or label="Some Text" or placeholder="Some Text"
        const jsxTextMatches = [...content.matchAll(/>\s*([A-Za-z][^<>{}\n]*[A-Za-z0-9!?.:])\s*</g)];
        for (const m of jsxTextMatches) {
            const str = m[1].trim();
            if (str !== "Midnightcord" && str !== "Midnightcord AI" && !str.startsWith("http") && !str.includes("{")) {
                rawStringsToWrap.push({ file, str });
                allKeysToTranslate.add(str);
            }
        }
    }
}

console.log(`\n=== Total unique keys collected from target plugins: ${allKeysToTranslate.size} ===`);
const missingInATC = [...allKeysToTranslate].filter(k => !atcContent.includes(`"${k}":`));
console.log(`Keys missing in autoTranslateMidnightcord: ${missingInATC.length}`);
console.log("\nSample missing keys:", missingInATC.slice(0, 30));
console.log(`\nRaw strings needing t() wrapping in JSX: ${rawStringsToWrap.length}`);
