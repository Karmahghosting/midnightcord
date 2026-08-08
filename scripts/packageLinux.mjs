import { build } from "electron-builder";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const config = require(join(rootDir, "electron-builder.linux.cjs"));

const isDir = process.argv.includes("--dir");
const isRpmOnly = process.argv.includes("--rpm");
const requestedArch = process.argv.includes("--arm64")
    ? "arm64"
    : process.argv.includes("--x64")
      ? "x64"
      : process.arch;

if (requestedArch !== "x64" && requestedArch !== "arm64") {
    throw new Error(`Unsupported Linux architecture: ${requestedArch}`);
}

// The parent pnpm lifecycle must not leak into the isolated, dependency-free app.
delete process.env.npm_config_user_agent;
delete process.env.npm_execpath;
delete process.env.npm_node_execpath;

const stagingDir = await mkdtemp(join(tmpdir(), "midnightcord-package-"));

try {
    await copyFile(join(rootDir, "packaging", "package.json"), join(stagingDir, "package.json"));

    const options = {
        projectDir: stagingDir,
        config,
        linux: isRpmOnly ? ["rpm"] : [],
        dir: isDir,
        x64: requestedArch === "x64",
        arm64: requestedArch === "arm64"
    };

    await build(options);
} finally {
    await rm(stagingDir, { recursive: true, force: true });
}
