import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ARRPC_VERSION = "1.3.5";
const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const targets = Object.freeze({
    "darwin-arm64": {
        asset: "arrpc-bun-darwin-arm64",
        sha256: "5ba5157ec769867a4a9ecc94905cb1d2568a66d7835b8695394aa499676973bd"
    },
    "darwin-x64": {
        asset: "arrpc-bun-darwin-x64",
        sha256: "2b13160c4ad42bdc0ce4eae6b22c8395d4ef1023938df4020008f2d9a232979e"
    },
    "linux-arm64": {
        asset: "arrpc-bun-linux-arm64",
        sha256: "fd0383d2a3ec01084b7673b18be32711f1516d1275386de6ff43554f64dd978e"
    },
    "linux-x64": {
        asset: "arrpc-bun-linux-x64",
        sha256: "ad6fc4e8011c161b252df2d9dbc2eb453749cc0578104bd03e7fade9dbaf7223"
    },
    "windows-x64": {
        asset: "arrpc-bun-windows-x64.exe",
        sha256: "3f1c958645115f556bd9b8bc1ccf83936fd0070e8336e1f4e6697b04e2a298f9"
    }
});

async function hashFile(path) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

export async function fetchArrpcBinary(platform, arch) {
    const platformName = platform === "win32" ? "windows" : platform;
    const target = targets[`${platformName}-${arch}`];
    if (!target) throw new Error(`Unsupported arRPC target: ${platformName}-${arch}`);

    const suffix = platformName === "windows" ? ".exe" : "";
    const destination = join(rootDir, "static", "dist", `arrpc-${platformName}-${arch}${suffix}`);
    const temporary = destination + ".download";

    try {
        if (await hashFile(destination).catch(() => "") === target.sha256) {
            console.log(`Using verified arRPC ${ARRPC_VERSION} binary for ${platformName}-${arch}`);
            return destination;
        }

        await mkdir(dirname(destination), { recursive: true });
        await rm(temporary, { force: true });

        const url = `https://github.com/Creationsss/arrpc-bun/releases/download/v${ARRPC_VERSION}/${target.asset}`;
        const response = await fetch(url, {
            redirect: "follow",
            headers: { "User-Agent": "Midnightcord-build" }
        });
        if (!response.ok || !response.body) throw new Error(`arRPC download failed with HTTP ${response.status}`);

        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { mode: 0o755 }));
        const actualHash = await hashFile(temporary);
        if (actualHash !== target.sha256) {
            throw new Error(`arRPC checksum mismatch for ${platformName}-${arch}`);
        }

        await chmod(temporary, 0o755);
        await rename(temporary, destination);
        console.log(`Downloaded and verified arRPC ${ARRPC_VERSION} for ${platformName}-${arch}`);
        return destination;
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}
