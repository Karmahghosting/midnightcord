import { readFileSync } from "fs";

const content = readFileSync("src/midnightcordplugins/autoTranslateMidnightcord/index.ts", "utf8");
const matches = content.match(/"en":/g) || [];
console.log(`Total valid translated keys in autoTranslateMidnightcord: ${matches.length}`);
