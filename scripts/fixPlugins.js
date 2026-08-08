const fs = require("fs");
const path = require("path");

const pluginDir = "c:\\Users\\zzafi\\Documents\\GitHub\\midnightcord\\src\\midnightcordplugins";
const plugins = [
"autoTranslateMidnightcord", "autoUnmute", "crashHandler", "noUnblockToJump", "showHiddenThings", "spotifyCrack", "unlimitedAccounts", "VolumeBooster", "abreviation", "antiMoveDeco", "autoCorrect", "autoReply", "autoResponder", "backpack", "bigFileUpload", "bulkFriendRemove", "callTimer", "channelWallpaper", "ClientDiagnostics", "compactMode", "customProfile", "disableCallIdle", "DMBomb", "doubleEmoji", "encryptedMessage", "eventLogs", "exportDM", "fakeAccount", "fakeDM", "fakeFriends", "FakeVoice", "fastPFP", "floodPanel", "followMe", "followUser", "gifConvertor", "hideAttachments", "iconViewer", "imageZoom", "lastSeen", "leaveAllServers", "liveWallpaper", "lockGroup", "massDM", "memberCount", "messageCleaner", "messageLogger", "multiInstance", "muteAllServers", "mutualScanner", "midnightcordAI", "midnightcordUpdater", "pinDms", "previewMessage", "realtimeTimestamps", "reverseImageSearch", "selfDestruct", "serverCloner", "sharePerms", "showHiddenChannels", "showID", "silentDelete", "SmoothType", "soundcloudPlayer", "stealthMode", "streamProof", "Surveillance", "themeLibrary", "tokenImporter", "translate", "userVoiceShow", "validUser", "viewIcons", "voiceChannelSearch", "voiceDictation", "voiceDownload", "voiceMessages", "whosWatching", "wordBom"
];

for (const p of plugins) {
    const indexPath = path.join(pluginDir, p, "index.tsx");
    const tsPath = path.join(pluginDir, p, "index.ts");
    
    let fileToModify = fs.existsSync(indexPath) ? indexPath : fs.existsSync(tsPath) ? tsPath : null;
    if (fileToModify) {
        let content = fs.readFileSync(fileToModify, "utf8");
        
        // Remove ALL existing `enabledByDefault: true,` that might have been added before
        content = content.replace(/\s*enabledByDefault:\s*true,?\n?/g, "\n");
        
        // Find `definePlugin({` and then the `name: "..."` property
        // We will insert `enabledByDefault: true,` right after `name: "..."`
        content = content.replace(/(definePlugin\(\s*\{[\s\S]*?name:\s*["'][^"']+["'],?)/, "$1\n    enabledByDefault: true,");
        
        fs.writeFileSync(fileToModify, content);
        console.log(`Fixed ${p}`);
    }
}
