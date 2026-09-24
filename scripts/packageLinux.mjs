import { build } from "electron-builder";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const config = require(join(rootDir, "electron-builder.linux.cjs"));

const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--dir", "--rpm", "--deb", "--arm64", "--x64", "--help"]);
for (const arg of args) {
    if (!allowedArgs.has(arg)) throw new Error(`Unknown Linux packaging option: ${arg}`);
}
if (args.has("--help")) {
    console.log("Usage: node scripts/packageLinux.mjs [--x64 | --arm64] [--dir | --deb | --rpm]");
    console.log("Packages the Install Vencord injector only; build the native desktop payload first.");
    process.exit(0);
}
if (args.has("--x64") && args.has("--arm64")) throw new Error("Choose one architecture per build.");
if (["--dir", "--deb", "--rpm"].filter(arg => args.has(arg)).length > 1) throw new Error("Choose one packaging target per build.");
const requestedArch = args.has("--arm64")
    ? "arm64"
    : args.has("--x64")
      ? "x64"
      : process.arch;

if (requestedArch !== "x64" && requestedArch !== "arm64") {
    throw new Error(`Unsupported Linux architecture: ${requestedArch}`);
}

for (const relativePath of [
    "packaging/linux-entry.cjs", "packaging/start-installer.cjs", "packaging/linux/install-vencord", "packaging/linux/register-installer.sh", "packaging/linux/register-installer.mjs",
    "installer/main.cjs", "installer/preload.cjs", "installer/core.mjs", "installer/worker.mjs", "installer/ui/index.html",
    "scripts/nativeInjection.mjs", "static/icon.png", "dist/desktop/patcher.js", "dist/desktop/preload.js", "dist/desktop/renderer.js", "dist/desktop/renderer.css"
]) {
    try {
        if (!(await stat(join(rootDir, relativePath))).isFile()) throw new Error("Not a file");
    } catch {
        throw new Error(`Required installer file is missing: ${relativePath}. Build the native desktop payload first.`);
    }
}

// The parent pnpm lifecycle must not leak into the isolated, dependency-free app.
delete process.env.npm_config_user_agent;
delete process.env.npm_execpath;
delete process.env.npm_node_execpath;

const stagingParent = await realpath(tmpdir());
const stagingDir = await mkdtemp(join(stagingParent, "midnightcord-linux-"));

try {
    const rootPackage = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
    await writeFile(join(stagingDir, "package.json"), JSON.stringify({
        name: "midnightcord",
        version: rootPackage.version,
        description: "Install, repair or remove Midnightcord in Discord.",
        main: "packaging/linux-entry.cjs",
        homepage: rootPackage.homepage,
        license: "GPL-3.0-or-later",
        author: "Midnightcord contributors"
    }, null, 2) + "\n");
    const launcherDir = join(stagingDir, "launchers");
    await mkdir(launcherDir);
    const launchers = ["install-vencord", "register-installer.sh", "register-installer.mjs"];
    for (const name of launchers) {
        const destination = join(launcherDir, name);
        await copyFile(join(rootDir, "packaging", "linux", name), destination);
        await chmod(destination, name.endsWith(".mjs") ? 0o644 : 0o755);
    }
    config.extraFiles = [{ from: launcherDir, to: ".", filter: launchers }];
    const afterInstall = join(stagingDir, "after-install.tpl");
    const standardAfterInstall = await readFile(require.resolve("app-builder-lib/templates/linux/after-install.tpl"), "utf8");
    await writeFile(afterInstall, standardAfterInstall + `
# Retire the command from the former standalone client during package upgrades.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove midnightcord /opt/Midnightcord/midnightcord || true
fi
if [ -L /usr/bin/midnightcord ]; then
    legacy_target=$(readlink /usr/bin/midnightcord)
    if [ "$legacy_target" = /etc/alternatives/midnightcord ]; then
        legacy_target=$(readlink /etc/alternatives/midnightcord || true)
    fi
    if [ "$legacy_target" = /opt/Midnightcord/midnightcord ]; then
        rm -f /usr/bin/midnightcord
    fi
fi
`);
    for (const target of ["deb", "rpm"]) {
        config[target].fpm = [`${join(launcherDir, "install-vencord")}=/usr/bin/install-vencord`];
        config[target].afterInstall = afterInstall;
    }

    const options = {
        projectDir: stagingDir,
        config,
        publish: "never",
        linux: args.has("--rpm") ? ["rpm"] : args.has("--deb") ? ["deb"] : [],
        dir: args.has("--dir"),
        x64: requestedArch === "x64",
        arm64: requestedArch === "arm64"
    };

    const artifacts = await build(options);
    for (const artifact of artifacts) {
        if (!/\.(?:AppImage|deb|rpm|tar\.gz)$/.test(artifact)) continue;
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(artifact)) hash.update(chunk);
        await writeFile(`${artifact}.sha256`, `${hash.digest("hex")}  ${basename(artifact)}\n`);
    }
} finally {
    if (dirname(stagingDir) !== stagingParent || !basename(stagingDir).startsWith("midnightcord-linux-")) {
        throw new Error("Refusing to remove an unexpected staging directory.");
    }
    await rm(stagingDir, { recursive: true, force: true });
}
