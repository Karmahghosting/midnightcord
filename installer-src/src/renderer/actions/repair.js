import {progress} from "../stores/installation";
import {promises as fs} from "fs";
import path from "path";
import {killDiscord, startDiscord} from "./utils/kill";
import {log, lognewline} from "./utils/log";

const RESTART_DISCORD_PROGRESS = 100;

async function repairShims(paths) {
    process.noAsar = true;
    const progressPerLoop = (RESTART_DISCORD_PROGRESS - progress.value) / paths.length;
    for (const resPath of paths) {
        log(`Repairing Midnightcord in: ${resPath}`);
        try {
            log("Closing Discord...");
            killDiscord(resPath, log);

            // Just start it to verify
            log("Restarting Discord...");
            startDiscord(resPath);
            progress.set(progress.value + progressPerLoop);
        } catch (err) {
            log(`❌ Could not repair Midnightcord in ${resPath}`);
            log(`❌ ${err.message}`);
            return err;
        }
    }
}

export default async function(paths) {
    try {
        log("Starting Repair...");
        const err = await repairShims(Object.values(paths));
        if (err) return false;

        progress.set(RESTART_DISCORD_PROGRESS);
        lognewline("Repair complete!");
        return true;
    } catch (err) {
        lognewline("❌ Repair failed");
        log(`❌ ${err.message}`);
        return false;
    }
}