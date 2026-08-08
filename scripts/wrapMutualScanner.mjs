import { readFileSync, writeFileSync } from "fs";

const file = "src/midnightcordplugins/mutualScanner/MutualScannerTab.tsx";
let content = readFileSync(file, "utf8");

// Add import if not present
if (!content.includes('from "../autoTranslateMidnightcord"')) {
    content = 'import { t } from "../autoTranslateMidnightcord";\n' + content;
}

const stringsToWrap = [
    "Already your friend",
    "No candidates with mutual friends were found in this scope.",
    "Rewarm",
    "Server Scope",
    "Pick the servers whose members should be checked for any mutual friend relationship with your account.",
    "Select visible",
    "Manual Cache Warmup",
    "No servers match this filter.",
    "Live Run",
    "Run the sweep sequentially, watch matches appear, and stop it at any time.",
    "Max members per server",
    "Warmup member budget",
    "Target friend user ID",
    "Only match users who share this specific person as a mutual friend with you. Leave empty to match anyone with any mutual friend.",
    "Skip users already in your friends",
    "Useful if you only want new or non-friend candidates.",
    "Warm member cache before scan",
    "Attempts to expand each selected guild beyond what is already in GuildMemberStore before scanning.",
    "Start Scan",
    "Discard Progress",
    "Clear History",
    "Run a scan to populate live matches",
    "Results appear here as soon as the scanner finds profiles with any mutual friend relationship, then fade out after 30s while the saved run stays in history.",
    "Warmup runs one guild at a time through the shared hydration service. It can reuse a temporary local member index from recent runs, stops on timeout, or earlier if the per-guild member budget is reached. Set the budget to 0 for no member cap.",
    "Run History",
    "Saved locally per account on this device.",
    "No saved runs match this filter",
    "Broaden the search or run a new scan to build a stronger local history."
];

let wrapCount = 0;
for (const str of stringsToWrap) {
    const rawPattern = new RegExp(`>\\s*${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`, "g");
    if (rawPattern.test(content)) {
        content = content.replace(rawPattern, `>{t("${str}")}<`);
        wrapCount++;
    }
}

writeFileSync(file, content, "utf8");
console.log(`Wrapped ${wrapCount} raw strings with t() in MutualScannerTab.tsx`);
