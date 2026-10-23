/*
 * Verify macOS installer bundles, including certificate-free pull request builds.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { signAsync } from "@electron/osx-sign";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function verifyMacInstaller({ appPath, electronVersion, identity }, {
    env = process.env,
    sign = signAsync,
    execute = execFileAsync
} = {}) {
    if (env.GITHUB_EVENT_NAME === "pull_request") {
        // electron-builder skips even ad-hoc signing for PRs. Sign this bundle
        // without opting into CSC_FOR_PULL_REQUEST or discovering a certificate.
        if (identity !== "-") throw new Error("Pull request installers require an explicit ad-hoc signing identity.");
        await sign({
            app: appPath,
            platform: "darwin",
            version: electronVersion,
            identity: "-",
            identityValidation: false,
            preAutoEntitlements: false,
            preEmbedProvisioningProfile: false,
            strictVerify: true,
            optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" })
        });
    }

    // Validate every build before the archive is created. Signing or verification
    // errors must fail packaging, including outside pull request CI.
    await execute("codesign", ["--verify", "--deep", "--strict", appPath]);
}
