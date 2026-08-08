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
    const list = readdirSync(dir);
    for (const file of list) {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(filePath));
        } else if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
            results.push(filePath);
        }
    }
    return results;
}

const atcContent = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");

let totalUntranslatedJSX = 0;
let totalMissingFromDict = 0;

for (const pluginFolder of targetPlugins) {
    const pluginDir = join("src/midnightcordplugins", pluginFolder);
    let files = [];
    try {
        const stat = statSync(pluginDir);
        if (stat.isDirectory()) files = getFiles(pluginDir);
        else files = [pluginDir];
    } catch {
        console.log("Could not find plugin dir:", pluginFolder);
        continue;
    }

    console.log(`\n=== Scanning ${pluginFolder} ===`);
    for (const file of files) {
        const content = readFileSync(file, "utf8");
        // Find t("...") calls
        const tCalls = [...content.matchAll(/\bt\(\s*"([^"]+)"\s*\)/g)].map(m => m[1]);
        const missingInDict = tCalls.filter(key => !atcContent.includes(`"${key}":`));
        
        // Find raw JSX text like >Some Text<
        const rawJSX = [...content.matchAll(/>\s*([A-Za-z][^<>{}\n]*[A-Za-z0-9!?.:])\s*</g)]
            .map(m => m[1].trim())
            .filter(str => str !== "Midnightcord" && str !== "Midnightcord AI" && !str.includes("https://"));

        if (rawJSX.length > 0) {
            console.log(`  [${file}] Raw JSX text (${rawJSX.length}):`, rawJSX);
            totalUntranslatedJSX += rawJSX.length;
        }
        if (missingInDict.length > 0) {
            console.log(`  [${file}] t() keys missing from autoTranslateMidnightcord (${missingInDict.length}):`, missingInDict);
            totalMissingFromDict += missingInDict.length;
        }
    }
}

console.log(`\nTotal Raw JSX string count: ${totalUntranslatedJSX}`);
console.log(`Total t() keys missing from dict: ${totalMissingFromDict}`);
