/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CommandLine } from "./cli";

if (CommandLine.values.repair) {
    (async () => {
        const { State } = await import("./settings");
        if (State.store.MidnightcordDir) {
            console.error("Cannot repair: using custom Midnightcord directory.");
            process.exit(1);
        }
        console.log("Repairing Midnightcord...");
        const { downloadVencordAsar } = await import("./utils/vencordLoader");
        await downloadVencordAsar();
        console.log("Repair complete.");
        process.exit(0);
    })();
} else {
    require("./startup");
}
