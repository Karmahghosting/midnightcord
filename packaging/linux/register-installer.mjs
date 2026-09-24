import { chmod, copyFile, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const marker = "# Midnightcord Install Vencord launcher";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--unregister")) {
    throw new Error("Usage: register-installer.sh [--unregister]");
}
const dataHome = isAbsolute(process.env.XDG_DATA_HOME ?? "") ? process.env.XDG_DATA_HOME : join(homedir(), ".local", "share");
const command = join(homedir(), ".local", "bin", "install-vencord");
const desktop = join(dataHome, "applications", "midnightcord-installer.desktop");
const icon = join(dataHome, "icons", "hicolor", "256x256", "apps", "midnightcord-installer.png");
const sourceIcon = join(scriptDir, "resources", "app", "static", "icon.png");

async function ownedFile(path) {
    try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || !(await readFile(path, "utf8")).split("\n").includes(marker)) {
            throw new Error(`Refusing to replace an unrelated file: ${path}`);
        }
        return true;
    } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
    }
}

// Check both destinations before changing either; never overwrite a user's launcher.
const commandExists = await ownedFile(command);
const desktopExists = await ownedFile(desktop);
if (args[0] === "--unregister") {
    if (commandExists) await unlink(command);
    if (desktopExists) await unlink(desktop);
    if (commandExists || desktopExists) {
        try {
            if ((await lstat(icon)).isFile() && (await readFile(icon)).equals(await readFile(sourceIcon))) await unlink(icon);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
    console.log("Install Vencord user launcher removed.");
} else {
    const target = await realpath(process.env.APPIMAGE || join(scriptDir, "midnightcord-installer"));
    if (!(await lstat(target)).isFile()) throw new Error("The installer executable is missing.");
    if (target.includes("/.mount_") || [target, command, desktop, icon].some(path => /[\r\n\0]/.test(path))) {
        throw new Error("A persistent installer path is required. Keep the AppImage or extracted folder in a permanent location.");
    }
    const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    const desktopQuote = value => '"' + value.replaceAll("\\", "\\\\\\\\").replace(/["`$]/g, char => "\\\\" + char).replaceAll("%", "%%") + '"';
    const desktopValue = value => value.replaceAll("\\", "\\\\");
    const launcherText = `#!/bin/sh\n${marker}\nexec ${shellQuote(target)} --install-vencord "$@"\n`;
    const desktopText = `${marker}\n[Desktop Entry]\nVersion=1.0\nType=Application\nName=Install Vencord\nComment=Install, repair or remove Midnightcord in Discord\nExec=${desktopQuote(command)}\nIcon=${desktopValue(icon)}\nTerminal=false\nCategories=Utility;\nStartupWMClass=midnightcord-installer\n`;
    try {
        const info = await lstat(icon);
        if (!info.isFile() || info.isSymbolicLink() || (!commandExists && !desktopExists && !(await readFile(icon)).equals(await readFile(sourceIcon)))) {
            throw new Error(`Refusing to replace an unrelated icon: ${icon}`);
        }
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    for (const path of [command, desktop, icon]) await mkdir(dirname(path), { recursive: true });
    await copyFile(sourceIcon, icon);
    for (const [path, content, mode] of [[command, launcherText, 0o755], [desktop, desktopText, 0o644]]) {
        const temporary = `${path}.${process.pid}.tmp`;
        let created = false;
        try {
            await writeFile(temporary, content, { flag: "wx", mode });
            created = true;
            await chmod(temporary, mode);
            await rename(temporary, path);
        } finally {
            if (created) await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
        }
    }
    console.log(`Install Vencord added to the applications menu. Command: ${command}`);
}
