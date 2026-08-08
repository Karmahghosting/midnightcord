import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";

const targetPlugins = [
    "FakeVoice", "antiMoveDeco", "midnightcordAI", "ClearGroups", "ClearDMs", "messageCleaner",
    "leaveAllServers", "muteAllServers", "serverCloner", "silentEdit.tsx", "silentDelete",
    "showHiddenThings", "previewMessage", "passcodeLock", "channelWallpaper", "DynamicIslande",
    "fakeFriends", "lastSeen", "pinDms", "reverseImageSearch", "mutualScanner",
    "stereoInstaller.desktop", "Surveillance", "translate", "fakeDM", "fakeAccount",
    "massDM", "soundcloudPlayer", "youtubePlayer", "exportDM", "bulkFriendRemove",
    "sharePerms", "voiceChannelSearch", "wordBomb", "multiInstance", "customProfile",
    "tokenImporter", "autoCorrect", "autoReply", "autoResponder", "encryptedMessage",
    "floodPanel", "gifConvertor", "selfDestruct", "streamProof", "voiceDictation"
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

let modifiedFiles = 0;

for (const pluginFolder of targetPlugins) {
    const pluginPath = join("src/midnightcordplugins", pluginFolder);
    const files = getFiles(pluginPath);

    for (const file of files) {
        let content = readFileSync(file, "utf8");
        let modified = false;

        // Check if there are raw JSX strings to wrap
        const jsxTextMatches = [...content.matchAll(/>\s*([A-Za-z0-9!?.:,;'"\-\(\) ]{2,})\s*</g)];
        const validRawJSX = jsxTextMatches.filter(m => isRealText(m[1]));

        if (validRawJSX.length > 0) {
            // Check import
            if (!content.includes('autoTranslateMidnightcord')) {
                // Find relative path to autoTranslateMidnightcord
                const depth = file.split(/[/\\]/).length - file.split(/[/\\]/).indexOf("midnightcordplugins") - 2;
                const relPath = "../".repeat(Math.max(1, depth)) + "autoTranslateMidnightcord";
                content = `import { t } from "${relPath}";\n` + content;
            }

            for (const match of validRawJSX) {
                const str = match[1].trim();
                const rawPattern = new RegExp(`>\\s*${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`, "g");
                if (rawPattern.test(content)) {
                    content = content.replace(rawPattern, `>{t("${str}")}<`);
                    modified = true;
                }
            }

            if (modified) {
                writeFileSync(file, content, "utf8");
                modifiedFiles++;
                console.log(`Wrapped raw JSX in ${file}`);
            }
        }
    }
}

console.log(`Total files modified with t() wrapping: ${modifiedFiles}`);
