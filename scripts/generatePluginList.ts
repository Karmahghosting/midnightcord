/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { readdirSync, writeFileSync, existsSync, mkdirSync, symlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getEntryPoint, isPluginFile, parseDevs, parseEquicordDevs, parseFile, PluginData } from "./utils";

(async () => {
    parseDevs();
    parseEquicordDevs();

    // Setup userplugins
    try {
        const userTarget = join(homedir(), "Documents", "Midnightcord", "userplugins");
        const srcLink = join(process.cwd(), "src", "userplugins");
        if (!existsSync(userTarget)) mkdirSync(userTarget, { recursive: true });
        if (!existsSync(srcLink)) {
            // "junction" works on Windows without admin rights, "dir" is fallback for others
            symlinkSync(userTarget, srcLink, process.platform === "win32" ? "junction" : "dir");
        }
    } catch (e) {
        console.error("[Midnightcord] Failed to setup userplugins link", e);
    }

    const args = process.argv.slice(2);

    const equicordFlag = args.includes("--equicord");
    const vencordFlag = args.includes("--vencord");
    const midnightcordFlag = args.includes("--midnightcord");

    let dirs: string[];

    if (midnightcordFlag) {
        dirs = ["src/midnightcordplugins"];
    } else if (equicordFlag) {
        dirs = ["src/midnightcordplugins", "src/userplugins"];
    } else if (vencordFlag) {
        dirs = ["src/plugins", "src/plugins/_core"];
    } else {
        dirs = ["src/plugins", "src/plugins/_core", "src/midnightcordplugins", "src/userplugins"];
    }


    const outputPath = args.find(a => !a.startsWith("--")) ?? null;

    const plugins = [] as PluginData[];

    await Promise.all(
        dirs.flatMap(dir =>
            readdirSync(dir, { withFileTypes: true })
                .filter(isPluginFile)
                .map(async dirent => {
                    try {
                        const [data] = await parseFile(await getEntryPoint(dir, dirent));
                        plugins.sort().push(data);
                    } catch (e) {
                        console.warn(`[SKIP] ${dir}/${dirent.name}: ${(e as Error).message}`);
                    }
                })
        )
    );

    const data = JSON.stringify(plugins);

    if (outputPath) {
        writeFileSync(outputPath, data);
    } else {
        console.log(data);
    }
})();
