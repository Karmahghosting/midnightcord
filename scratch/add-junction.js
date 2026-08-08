const fs = require("fs");
const path = require("path");
const os = require("os");
const target = path.join(os.homedir(), "Documents", "Midnightcord", "userplugins");
const link = path.join(__dirname, "..", "src", "userplugins");

if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
}
if (!fs.existsSync(link)) {
    // Windows requires admin for symlinks but NOT for junctions.
    fs.symlinkSync(target, link, "junction");
}
console.log("Junction created.");
