/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

// @ts-check

import "../suppressExperimentalWarnings.js";
import "../checkNodeVersion.js";

import { exec, execSync } from "child_process";
import esbuild, { build, context } from "esbuild";
import { constants as FsConstants, readFileSync } from "fs";
import { access, mkdir, readdir, readFile } from "fs/promises";
import { minify as minifyHtml } from "html-minifier-terser";
import { homedir } from "os";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

import { getPluginTarget } from "../utils.mjs";

const PackageJSON = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf-8"));

export const VERSION = PackageJSON.version;
// https://reproducible-builds.org/docs/source-date-epoch/
export const BUILD_TIMESTAMP = Number(process.env.SOURCE_DATE_EPOCH) * 1000 || Date.now();

export const watch = process.argv.includes("--watch");
export const IS_DEV = watch || process.argv.includes("--dev");
export const IS_REPORTER = process.argv.includes("--reporter");
export const IS_ANTI_CRASH_TEST = process.argv.includes("--anti-crash-test");
export const IS_STANDALONE = process.argv.includes("--standalone");
export const IS_COMPANION_TEST = IS_REPORTER && process.argv.includes("--companion-test");
if (!IS_COMPANION_TEST && process.argv.includes("--companion-test"))
    console.error("--companion-test must be run with --reporter for any effect");

export const IS_UPDATER_DISABLED = process.argv.includes("--disable-updater");
export const gitHash = process.env.MIDNIGHTCORD_HASH || execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();

export const banner = {
    js: `
// Midnightcord ${gitHash}
// Standalone: ${IS_STANDALONE}
// Platform: ${IS_STANDALONE === false ? process.platform : "Universal"}
// Updater Disabled: ${IS_UPDATER_DISABLED}
`.trim()
};

/**
 * JSON.stringify all values in an object
 * @type {(obj: Record<string, any>) => Record<string, string>}
 */
export function stringifyValues(obj) {
    for (const key in obj) {
        obj[key] = JSON.stringify(obj[key]);
    }
    return obj;
}

/**
 * @param {import("esbuild").BuildOptions[]} buildConfigs
 */
export async function buildOrWatchAll(buildConfigs) {
    if (watch) {
        await Promise.all(buildConfigs.map(cfg =>
            context(cfg).then(ctx => ctx.watch())
        ));
    } else {
        await Promise.all(buildConfigs.map(cfg => build(cfg)))
            .catch(error => {
                console.error(error.message);
                process.exit(1); // exit immediately to skip the rest of the builds
            });
    }
}

const PluginDefinitionNameMatcher = /definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/;
/**
 * @param {string} base
 * @param {import("fs").Dirent} dirent
 */
export async function resolvePluginName(base, dirent) {
    const fullPath = join(base, dirent.name);
    const content = dirent.isFile()
        ? await readFile(fullPath, "utf-8")
        : await (async () => {
            for (const file of ["index.ts", "index.tsx"]) {
                try {
                    return await readFile(join(fullPath, file), "utf-8");
                } catch {
                    continue;
                }
            }
            throw new Error(`Invalid plugin ${fullPath}: could not resolve entry point`);
        })();

    return PluginDefinitionNameMatcher.exec(content)?.[3]
        ?? (() => {
            throw new Error(`Invalid plugin ${fullPath}: must contain definePlugin call with simple string name property as first property`);
        })();
}

export async function exists(path) {
    return await access(path, FsConstants.F_OK)
        .then(() => true)
        .catch(() => false);
}

// https://github.com/evanw/esbuild/issues/619#issuecomment-751995294
/**
 * @type {import("esbuild").Plugin}
 */
export const makeAllPackagesExternalPlugin = {
    name: "make-all-packages-external",
    setup(build) {
        const filter = /^[^./]|^\.[^./]|^\.\.[^/]/; // Must not start with "/" or "./" or "../"
        build.onResolve({ filter }, args => ({ path: args.path, external: true }));
    }
};

/**
 * @type {(kind: "web" | "discordDesktop" | "vesktop" | "equibop") => import("esbuild").Plugin}
 */
export const globPlugins = kind => ({
    name: "glob-plugins",
    setup: build => {
        const filter = /^~plugins$/;
        build.onResolve({ filter }, args => {
            return {
                namespace: "import-plugins",
                path: args.path
            };
        });

        build.onLoad({ filter, namespace: "import-plugins" }, async () => {
            const pluginDirs = ["plugins/_api", "plugins/_core", "plugins", "userplugins", "midnightcordplugins", "midnightcordplugins/_api"];
            
            let blacklist = [];
            try {
                const blacklistContent = await readFile(join(process.cwd(), "blacklist.txt"), "utf-8");
                blacklist = blacklistContent.split("\n").map(l => l.trim()).filter(l => l);
            } catch(e) {}
            
            let code = "";
            let pluginsCode = "\n";
            let metaCode = "\n";
            let excludedCode = "\n";
            let i = 0;
            for (const dir of pluginDirs) {
                const userPlugin = dir === "userplugins";

                const fullDir = `./src/${dir}`;
                if (!await exists(fullDir)) continue;
                const files = await readdir(fullDir, { withFileTypes: true });
                for (const file of files) {
                    const fileName = file.name;
                    if (fileName.startsWith("_") || fileName.startsWith(".")) continue;
                    if (fileName === "index.ts") continue;
                    if (fileName.endsWith(".ini")) continue;

                    const isDir = file.isDirectory();
                    const isSupportedFile = /\.(tsx?|jsx?|css)$/.test(fileName);
                    if (!isDir && !isSupportedFile) continue;

                    const target = getPluginTarget(fileName);
                    const cleanFileName = fileName.replace(/\.tsx?$/, "").replace(/\.jsx?$/, "").replace(/\.css$/, "");

                    if (kind === "web" && blacklist.includes(cleanFileName)) {
                        const name = await resolvePluginName(fullDir, file);
                        excludedCode += `${JSON.stringify(name)}:${JSON.stringify(target || "web")},\n`;
                        continue;
                    }

                    if (target && !IS_REPORTER) {
                        const excluded =
                            (target === "dev" && !IS_DEV) ||
                            (target === "web" && kind === "discordDesktop") ||
                            (target === "desktop" && kind === "web") ||
                            (target === "discordDesktop" && kind !== "discordDesktop") ||
                            (target === "vesktop" && kind !== "vesktop" && kind !== "equibop") ||
                            (target === "equibop" && kind !== "equibop" && kind !== "vesktop");

                        if (excluded) {
                            const name = await resolvePluginName(fullDir, file);
                            excludedCode += `${JSON.stringify(name)}:${JSON.stringify(target)},\n`;
                            continue;
                        }
                    }

                    const folderName = `src/${dir}/${fileName}`;
                    const mod = `p${i}`;

                    if (userPlugin && fileName.endsWith(".css")) {
                        const pluginName = fileName.replace(/\.css$/, "");
                        code += `import ${mod}_css from "./${dir}/${fileName}";\n`;
                        code += `const ${mod} = { name: ${JSON.stringify(pluginName)}, description: "User style loaded as a plugin", authors: [{ name: "User", id: 0n }], start() {}, stop() {} };\n`;
                    } else {
                        code += `import ${mod} from "./${dir}/${fileName.replace(/\.tsx?$/, "")}";\n`;
                    }

                    pluginsCode += `[${mod}.name]:${mod},\n`;
                    metaCode += `[${mod}.name]:${JSON.stringify({ folderName, userPlugin })},\n`;
                    i++;
                }
            }
            code += `export default {${pluginsCode}};export const PluginMeta={${metaCode}};export const ExcludedPlugins={${excludedCode}};`;

            // ─── External User Plugins (~/Documents/Midnightcord/userplugins/) ───────────
            // Scan and auto-create the external userplugins directory.
            const externalUserPluginsDir = join(homedir(), "Documents", "Midnightcord", "userplugins");
            try {
                await mkdir(externalUserPluginsDir, { recursive: true });
            } catch { /* already exists or permission error — silently skip */ }

            let externalPluginsCode = "";
            let externalPluginsMapCode = "\n";
            let externalMetaCode = "\n";
            let j = 0;
            if (await exists(externalUserPluginsDir)) {
                const externalFiles = await readdir(externalUserPluginsDir, { withFileTypes: true }).catch(() => []);
                for (const file of externalFiles) {
                    const fileName = file.name;
                    if (fileName.startsWith("_") || fileName.startsWith(".")) continue;
                    if (fileName === "index.ts" || fileName === "index.tsx") continue;
                    if (fileName.endsWith(".ini")) continue;

                    const isDir = file.isDirectory();
                    const isSupportedFile = /\.(tsx?|jsx?|css)$/.test(fileName);
                    if (!isDir && !isSupportedFile) continue;

                    const absPath = join(externalUserPluginsDir, fileName);
                    const mod = `up${j}`;
                    const folderName = `external/userplugins/${fileName}`;

                    try {
                        if (isDir) {
                            // Try index.ts then index.tsx
                            let entryPoint = null;
                            for (const entry of ["index.ts", "index.tsx"]) {
                                const full = join(absPath, entry);
                                if (await exists(full)) { entryPoint = full; break; }
                            }
                            if (!entryPoint) continue;
                            externalPluginsCode += `import ${mod} from ${JSON.stringify(entryPoint)};\n`;
                        } else if (fileName.endsWith(".css")) {
                            const pluginName = fileName.replace(/\.css$/, "");
                            externalPluginsCode += `import ${mod}_css from ${JSON.stringify(absPath)};\n`;
                            externalPluginsCode += `const ${mod} = { name: ${JSON.stringify(pluginName)}, description: "User style", authors: [{ name: "User", id: 0n }], start() {}, stop() {} };\n`;
                        } else {
                            externalPluginsCode += `import ${mod} from ${JSON.stringify(absPath.replace(/\.tsx?$/, "").replace(/\.jsx?$/, ""))};\n`;
                        }
                        externalPluginsMapCode += `[${mod}.name]:${mod},\n`;
                        externalMetaCode += `[${mod}.name]:${JSON.stringify({ folderName, userPlugin: true })},\n`;
                        j++;
                    } catch { /* skip broken plugin */ }
                }
            }

            if (j > 0) {
                // Merge external plugins into the existing export
                code = code.replace(
                    /export default \{(.*)\};export const PluginMeta=\{(.*)\};export const ExcludedPlugins=\{(.*)\};/s,
                    (_, plugs, meta, excl) =>
                        `${externalPluginsCode}export default {${plugs}${externalPluginsMapCode}};export const PluginMeta={${meta}${externalMetaCode}};export const ExcludedPlugins={${excl}};`
                );
            }
            return {
                contents: code,
                resolveDir: "./src",
                watchDirs: pluginDirs.map(d => resolve("src", d)),
            };
        });
    }
});

/**
 * @type {import("esbuild").Plugin}
 */
export const gitHashPlugin = {
    name: "git-hash-plugin",
    setup: build => {
        const filter = /^~git-hash$/;
        build.onResolve({ filter }, args => ({
            namespace: "git-hash", path: args.path
        }));
        build.onLoad({ filter, namespace: "git-hash" }, () => ({
            contents: `export default "${gitHash}"`
        }));
    }
};

/**
 * @type {import("esbuild").Plugin}
 */
export const gitRemotePlugin = {
    name: "git-remote-plugin",
    setup: build => {
        const filter = /^~git-remote$/;
        build.onResolve({ filter }, args => ({
            namespace: "git-remote", path: args.path
        }));
        build.onLoad({ filter, namespace: "git-remote" }, async () => {
            let remote = process.env.MIDNIGHTCORD_REMOTE;
            if (!remote) {
                const res = await promisify(exec)("git remote get-url origin", { encoding: "utf-8" });
                remote = res.stdout.trim()
                    .replace("https://github.com/", "")
                    .replace("git@github.com:", "")
                    .replace(/.git$/, "");
            }

            return { contents: `export default "${remote}"` };
        });
    }
};

/**
 * @type {import("esbuild").Plugin}
 */
export const fileUrlPlugin = {
    name: "file-uri-plugin",
    setup: build => {
        const filter = /^file:\/\/.+$/;
        build.onResolve({ filter }, args => ({
            namespace: "file-uri",
            path: args.path,
            pluginData: {
                uri: args.path,
                path: join(args.resolveDir, args.path.slice("file://".length).split("?")[0])
            }
        }));
        build.onLoad({ filter, namespace: "file-uri" }, async ({ pluginData: { path, uri } }) => {
            const { searchParams } = new URL(uri);
            const base64 = searchParams.has("base64");
            const minify = searchParams.has("minify");
            const noTrim = searchParams.get("trim") === "false";

            const encoding = base64 ? "base64" : "utf-8";

            let content;
            if (!minify) {
                content = await readFile(path, encoding);
                if (!noTrim) content = content.trimEnd();
            } else {
                if (path.endsWith(".html")) {
                    content = await minifyHtml(await readFile(path, "utf-8"), {
                        collapseWhitespace: true,
                        removeComments: true,
                        minifyCSS: true,
                        minifyJS: true,
                        removeEmptyAttributes: true,
                        removeRedundantAttributes: true,
                        removeScriptTypeAttributes: true,
                        removeStyleLinkTypeAttributes: true,
                        useShortDoctype: true
                    });
                } else if (/[mc]?[jt]sx?$/.test(path)) {
                    const res = await esbuild.build({
                        entryPoints: [path],
                        write: false,
                        minify: true
                    });
                    content = res.outputFiles[0].text;
                } else {
                    throw new Error(`Don't know how to minify file type: ${path}`);
                }

                if (base64 && !content.startsWith("data:"))
                    content = Buffer.from(content).toString("base64");
            }

            return {
                contents: `export default ${JSON.stringify(content)}`
            };
        });
    }
};

/**
 * @type {(filter: RegExp, message: string) => import("esbuild").Plugin}
 */
export const banImportPlugin = (filter, message) => ({
    name: "ban-imports",
    setup: build => {
        build.onResolve({ filter }, () => {
            return { errors: [{ text: message }] };
        });
    }
});

const styleModule = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "module/style.js"), "utf-8");

/**
 * @type {import("esbuild").Plugin}
 */
export const stylePlugin = {
    name: "style-plugin",
    setup: ({ onResolve, onLoad }) => {
        onResolve({ filter: /\.css\?managed$/, namespace: "file" }, ({ path, resolveDir }) => ({
            path: relative(process.cwd(), join(resolveDir, path.replace("?managed", ""))),
            namespace: "managed-style",
        }));
        onLoad({ filter: /\.css$/, namespace: "managed-style" }, async ({ path }) => {
            const css = await readFile(path, "utf-8");
            const name = relative(process.cwd(), path).replaceAll("\\", "/");

            return {
                loader: "js",
                contents: styleModule
                    .replaceAll("STYLE_SOURCE", JSON.stringify(css))
                    .replaceAll("STYLE_NAME", JSON.stringify(name))
            };
        });
    }
};

/**
 * @type {import("esbuild").BuildOptions}
 */
export const commonOpts = {
    logLevel: "info",
    bundle: true,
    minify: !watch && !IS_REPORTER,
    sourcemap: watch ? "inline" : "external",
    legalComments: "linked",
    banner,
    plugins: [fileUrlPlugin, gitHashPlugin, gitRemotePlugin, stylePlugin],
    external: ["~plugins", "~git-hash", "~git-remote", "/assets/*"],
    inject: [join(dirname(fileURLToPath(import.meta.url)), "inject/react.mjs")],
    jsx: "transform",
    jsxFactory: "VencordCreateElement",
    jsxFragment: "VencordFragment",
    alias: {
        "@main": "./src/main",
        "@api": "./src/api",
        "@components": "./src/components",
        "@utils": "./src/utils",
        "@debug": "./src/debug",
        "@plugins": "./src/plugins",
        "@shared": "./src/shared",
        "@webpack/common": "./src/webpack/common",
        "@webpack/patcher": "./src/webpack/patchWebpack",
        "@webpack": "./src/webpack/webpack",
        "@midnightcordplugins": "./src/midnightcordplugins",
        "@equicordplugins": "./src/plugins",
        "@Midnightcord/types/webpack/common": "./src/webpack/common",
        "@Midnightcord/types/webpack": "./src/webpack/webpack",
        "@Midnightcord/types/utils": "./src/utils",
        "@Midnightcord/types/components": "./src/components",
        "@Midnightcord/types/api": "./src/api",
        "@Midnightcord/types/plugins": "./src/plugins",
        "@Midnightcord/types": "./src",
        "@equicord/types/webpack/common": "./src/webpack/common",
        "@equicord/types/webpack": "./src/webpack/webpack",
        "@equicord/types/utils": "./src/utils",
        "@equicord/types/components": "./src/components",
        "@equicord/types/api": "./src/api",
        "@equicord/types": "./src",
    }
};


export const commonRendererPlugins = [
    banImportPlugin(/^react$/, "Cannot import from react. React and hooks should be imported from @webpack/common"),
    banImportPlugin(/^electron(\/.*)?$/, "Cannot import electron in browser code. You need to use a native.ts file"),
    banImportPlugin(/^ts-pattern$/, "Cannot import from ts-pattern. match and P should be imported from @webpack/common"),
    // @ts-expect-error this is never undefined
    ...commonOpts.plugins
];
