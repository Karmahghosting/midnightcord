/* Regression tests for the real migration engine and disk transaction; no live Discord data. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
async function load(file) {
    const result = await build({ entryPoints: [join(root, file)], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" });
    const module = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, Buffer, TextEncoder, URL, Date, console, setTimeout });
    return module.exports;
}
const engine = await load("src/midnightcordplugins/vencordMigration/engine.ts");
const fs = await load("src/midnightcordplugins/vencordMigration/filesystem.ts");
const source = (settings, quickCss = "", themes = []) => ({ id: "fixture", label: "Fixture", settings, quickCss, themes, warnings: [] });
const registry = { Good: { options: { color: { type: "string" }, count: { type: "number" }, mode: { type: "select", values: ["a", "b"] }, apiKey: { type: "string" }, customUploaderURL: { type: "string" }, config: { type: "string" } } }, Internal: { required: true, options: {} }, TokenImporter: { options: {} } };
const plan = (src, current = {}, choices = {}, existingCss = "", existingThemes = []) => engine.planMigration(src, current, existingCss, existingThemes, registry, { ...engine.defaultOptions, ...choices });
const plain = value => JSON.parse(JSON.stringify(value));
async function rendererRegistryFixture() {
    const panel = join(root, "src/midnightcordplugins/vencordMigration/Panel.tsx");
    const settings = join(root, "src/api/Settings.ts");
    const result = await build({ stdin: { contents: `export { createMigrationRegistry } from ${JSON.stringify(panel)}; export { Settings, SettingsStore, FORCE_DISABLED_DEFAULT_PLUGIN_KEYS } from ${JSON.stringify(settings)};`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent", loader: { ".css": "empty" }, plugins: [{ name: "renderer-fixtures", setup(builder) {
        builder.onResolve({ filter: /^(~plugins|@components\/(Button|Heading|Notice|Paragraph|Switch)|@webpack\/common)$/ }, args => ({ path: args.path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "~plugins"
            ? 'export default {Good:{name:"Good",options:{}},AudioLimiter:{name:"AudioLimiter",options:{}},RoleColorEverywhere:{name:"RoleColorEverywhere",options:{}}};'
            : "export const Button=()=>{},Heading=()=>{},Notice={},Paragraph=()=>{},Switch=()=>{},React={},useEffect=()=>{},useRef=()=>{},useState=()=>{};" }));
    } }] });
    const module = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, TextEncoder, URL, Date, console, setTimeout, window: { localStorage: {} }, IS_REPORTER: false, VencordNative: { settings: { get: () => ({ plugins: {}, cloudOnboarding: "handled" }), set: async () => {} } } });
    return module.exports;
}
async function fixture(t) {
    const base = await mkdtemp(join(tmpdir(), "midnightcord-migration-test-"));
    t.after(async () => { if (resolve(base).startsWith(resolve(tmpdir()) + "/midnightcord-migration-test-") || resolve(base).startsWith(resolve(tmpdir()) + "\\midnightcord-migration-test-")) await rm(base, { recursive: true, force: true }); });
    await mkdir(join(base, "settings")); await mkdir(join(base, "themes"));
    return base;
}
test("official export and raw settings parse; other exports are rejected", () => {
    assert.equal(engine.parseBackup('{"settings":{"plugins":{}},"quickCss":"body{}"}').quickCss, "body{}");
    assert.ok(engine.parseBackup('{"plugins":{}}').settings.plugins);
    assert.throws(() => engine.parseBackup('{"dataStore":[]}'));
    assert.throws(() => engine.parseBackup('{"settings":{"plugins":[]}}'));
});
test("prototype pollution, depth, size and invalid CSS are rejected", () => {
    assert.throws(() => engine.parseBackup('{"plugins":{"__proto__":{"polluted":true}}}'));
    assert.equal({}.polluted, undefined);
    let deep = {}; for (let i = 0; i < 30; i++) deep = { value: deep };
    assert.throws(() => engine.parseBackup(JSON.stringify({ plugins: {}, deep })));
    assert.throws(() => engine.parseBackup(" ".repeat(engine.MAX_JSON_BYTES + 1)));
    assert.throws(() => engine.parseBackup('{"plugins":{},"quickCss":42}'));
});
test("preserve mode keeps existing values, imports only missing recognized options", () => {
    const current = { plugins: { Good: { enabled: false, color: "old" } }, cloud: { enabled: true } };
    const src = source({ plugins: { Good: { enabled: true, color: "new", count: 3 } } });
    const result = plan(src, current);
    assert.deepEqual(plain(result.settings.plugins.Good), { enabled: false, color: "old", count: 3 });
    assert.equal(result.conflicts, 2); assert.equal(result.imported, 1);
    assert.equal(current.plugins.Good.count, undefined);
    assert.equal(src.settings.plugins.Good.color, "new");
});
test("actual renderer registry excludes the same plugins forced off by Settings at startup", async () => {
    const renderer = await rendererRegistryFixture();
    const schemas = renderer.createMigrationRegistry();
    assert.equal(renderer.FORCE_DISABLED_DEFAULT_PLUGIN_KEYS.has("audiolimiter"), true);
    const result = engine.planMigration(source({ plugins: { Good: { enabled: true }, AudioLimiter: { enabled: true }, RoleColorEverywhere: { enabled: true } } }), {}, "", [], schemas, { ...engine.defaultOptions, replace: true });
    assert.deepEqual(plain(result.skippedPlugins), ["AudioLimiter", "RoleColorEverywhere"]);
    assert.deepEqual(plain(result.settings.plugins), { Good: { enabled: true } });
});
test("actual SettingsStore startup defaults require explicit replacement to adopt enabled Vencord plugins", async () => {
    const renderer = await rendererRegistryFixture();
    assert.equal(renderer.Settings.plugins.Good.enabled, false, "Reading plugin state materializes the default");
    const src = source({ plugins: { Good: { enabled: true } } });
    const args = [src, renderer.SettingsStore.plain, "", [], renderer.createMigrationRegistry()];
    const keep = engine.planMigration(...args, engine.defaultOptions);
    assert.equal(keep.imported, 0); assert.equal(keep.conflicts, 1);
    const replace = engine.planMigration(...args, { ...engine.defaultOptions, replace: true });
    assert.equal(replace.settings.plugins.Good.enabled, true);
    assert.equal(renderer.Settings.plugins.Good.enabled, false, "Preview does not mutate the actual store");
});
test("explicit replace affects compatible values only and preserves unrelated settings", () => {
    const result = plan(source({ plugins: { Good: { enabled: true } }, cloud: { enabled: false }, language: "bad" }), { plugins: { Good: { enabled: false }, Other: { enabled: true } }, cloud: { enabled: true } }, { replace: true });
    assert.equal(result.settings.plugins.Good.enabled, true);
    assert.equal(result.settings.plugins.Other.enabled, true);
    assert.equal(result.settings.cloud.enabled, true);
    assert.equal(result.settings.language, undefined);
});
test("unknown, internal and identity plugins are not imported; credentials excluded", () => {
    const result = plan(source({ plugins: { Good: { enabled: true, apiKey: "private", customUploaderURL: "https://secret", config: "sk-" + "A".repeat(30), unknown: 5 }, Gone: { enabled: true }, Internal: { enabled: false }, TokenImporter: { enabled: true } }, cloud: { enabled: true }, dataStore: ["private"] }));
    assert.deepEqual(plain(result.settings.plugins), { Good: { enabled: true } });
    assert.deepEqual(plain(result.skippedPlugins), ["Gone", "Internal", "TokenImporter"]);
    assert.equal(result.skippedFields, 4);
    assert.equal(result.settings.cloud, undefined);
});
test("plugin option types and enum values are validated", () => {
    const result = plan(source({ plugins: { Good: { enabled: "yes", color: {}, count: 1e12, mode: "unknown" } } }));
    assert.equal(result.imported, 0); assert.equal(result.skippedFields, 4);
});
test("CSS and theme imports are opt-in, conflicts preserve current files", () => {
    const src = source({ plugins: {}, enabledThemes: ["one.css", "absent.css"] }, "new-css", [{ name: "one.css", content: "one" }]);
    assert.equal(plan(src).quickCss, undefined); assert.equal(plan(src).themes.length, 0);
    const result = plan(src, {}, { quickCss: true, themes: true }, "old-css", ["one.css"]);
    assert.equal(result.quickCss, undefined); assert.equal(result.themes.length, 0); assert.equal(result.conflicts, 2);
    const replace = plan(src, { enabledThemes: ["current.css"] }, { quickCss: true, themes: true, replace: true }, "old-css", ["one.css"]);
    assert.equal(replace.quickCss, "new-css"); assert.deepEqual(plain(replace.settings.enabledThemes), ["current.css", "one.css"]);
});
test("online themes use explicit opt-in, reject credentials, HTTP, query tokens and invalid URLs", () => {
    const src = source({ plugins: {}, themeLinks: ["https://themes.example/a.css", "http://example/a.css", "https://user:pass@example/a.css", "https://example/a.css?token=secret", "javascript:alert(1)"], themeNames: { "https://themes.example/a.css": "Ocean" } });
    assert.equal(plan(src).settings.themeLinks, undefined);
    const result = plan(src, {}, { onlineThemes: true });
    assert.deepEqual(plain(result.settings.themeLinks), ["https://themes.example/a.css"]);
    assert.equal(result.settings.themeNames["https://themes.example/a.css"], "Ocean");
    assert.equal(result.skippedFields, 4);
});
test("safe theme names reject traversal, Windows device names, scripts and hidden files", () => {
    for (const name of ["../bad.css", "a/b.css", "a\\b.css", "CON.css", ".hidden.css", "x.js", "x.css:evil"]) assert.equal(engine.safeThemeName(name), false, name);
    assert.equal(engine.safeThemeName("My theme.theme.css"), true);
});
test("discovery resolves Windows, macOS and Linux including XDG and explicit override", () => {
    assert.equal(fs.vencordDirectories("win32", "C:\\Users\\u")[0], "C:\\Users\\u\\AppData\\Roaming\\Vencord");
    assert.equal(fs.vencordDirectories("darwin", "/Users/u")[0], "/Users/u/Library/Application Support/Vencord");
    assert.equal(fs.vencordDirectories("linux", "/home/u", undefined, "/custom/config")[0], "/custom/config/Vencord");
    assert.equal(fs.vencordDirectories("linux", "/home/u", undefined, undefined, undefined, "/override")[0], "/override");
    assert.ok(fs.vencordDirectories("linux", "/home/u", undefined, undefined, "/discord/userData").includes("/discord/VencordData"));
});
test("installation reads only settings, QuickCSS and CSS; does not read native tokens or plugin JS", async t => {
    const base = await fixture(t);
    await writeFile(join(base, "settings/settings.json"), '{"plugins":{"Good":{"enabled":true}}}');
    await writeFile(join(base, "settings/native-settings.json"), '{"token":"never-read"}');
    await writeFile(join(base, "settings/quickCss.css"), "body{}");
    await writeFile(join(base, "themes/one.css"), "one"); await writeFile(join(base, "themes/malicious.js"), "process.exit()");
    const read = await fs.readInstallation(base);
    assert.equal(read.quickCss, "body{}"); assert.equal(read.themes.length, 1);
    assert.equal(JSON.stringify(read).includes("never-read"), false);
});
test("linked settings directories are rejected and file size bounded", async t => {
    const base = await fixture(t);
    await writeFile(join(base, "settings/settings.json"), '{"plugins":{}}');
    await assert.rejects(fs.readBounded(join(base, "settings/settings.json"), 4));
    const link = join(base, "linked");
    await symlink(join(base, "settings"), link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(fs.realDirectory(link));
});
test("real file transaction creates recovery backup and leaves source installation untouched", async t => {
    const base = await fixture(t);
    const oldSettings = JSON.stringify({ plugins: { Good: { enabled: false } }, cloud: { enabled: true } });
    await writeFile(join(base, "settings/settings.json"), oldSettings); await writeFile(join(base, "settings/quickCss.css"), "old-css"); await writeFile(join(base, "themes/one.css"), "old-theme");
    const backup = await fs.applyFiles({ settingsDir: join(base, "settings"), themesDir: join(base, "themes"), backupDir: join(base, "backups"), oldSettings, newSettings: '{"plugins":{}}', quickCss: "new-css", themes: [{ name: "one.css", content: "new-theme" }] });
    const saved = JSON.parse(await readFile(join(base, "backups", backup, "settings-backup.json"), "utf8"));
    assert.equal(saved.settings.cloud.enabled, true); assert.equal(saved.quickCss, "old-css");
    assert.equal(await readFile(join(base, "backups", backup, "themes", "one.css"), "utf8"), "old-theme");
    assert.equal(await readFile(join(base, "themes/one.css"), "utf8"), "new-theme");
    assert.equal(await readFile(join(base, "settings/quickCss.css"), "utf8"), "new-css");
    if (process.platform !== "win32") assert.equal((await stat(join(base, "backups", backup, "settings-backup.json"))).mode & 0o777, 0o600);
});
test("manual recovery manifest restores complete settings, empty CSS and removes newly added themes", async t => {
    const base = await fixture(t);
    const oldSettings = '{"plugins":{}}';
    await writeFile(join(base, "settings/settings.json"), oldSettings);
    await writeFile(join(base, "settings/quickCss.css"), "");
    await writeFile(join(base, "themes/quickCss.css"), "original-theme");
    const backup = await fs.applyFiles({ settingsDir: join(base, "settings"), themesDir: join(base, "themes"), backupDir: join(base, "backups"), oldSettings, newSettings: '{"plugins":{"Good":{"enabled":true}}}', quickCss: "imported-css", themes: [{ name: "quickCss.css", content: "replacement-theme" }, { name: "new.css", content: "new-theme" }] });
    const directory = join(base, "backups", backup);
    const recovery = JSON.parse(await readFile(join(directory, "recovery.json"), "utf8"));
    assert.equal(await readFile(recovery.settings.source, "utf8"), oldSettings);
    assert.equal(await readFile(recovery.quickCss.source, "utf8"), "");
    assert.equal(await readFile(recovery.themes[0].source, "utf8"), "original-theme", "Theme named quickCss.css does not overwrite the QuickCSS recovery file");
    assert.equal(recovery.themes[1].source, null);
    assert.equal(recovery.themes[1].destination, join(base, "themes/new.css"));
    for (const file of [recovery.settings, recovery.quickCss, ...recovery.themes]) {
        if (file.source === null) await rm(file.destination);
        else await writeFile(file.destination, await readFile(file.source));
    }
    assert.equal(await readFile(join(base, "settings/settings.json"), "utf8"), oldSettings);
    assert.equal(await readFile(join(base, "settings/quickCss.css"), "utf8"), "");
    assert.deepEqual(await readdir(join(base, "themes")), ["quickCss.css"]);
    assert.match(await readFile(join(directory, "README.txt"), "utf8"), /ne fusionnez pas/);
});
test("a failed target write rolls back preceding theme writes", async t => {
    const base = await fixture(t);
    await mkdir(join(base, "settings/settings.json"));
    await writeFile(join(base, "themes/existing.css"), "keep");
    await assert.rejects(fs.applyFiles({ settingsDir: join(base, "settings"), themesDir: join(base, "themes"), backupDir: join(base, "backups"), oldSettings: '{"plugins":{}}', newSettings: '{"plugins":{"Good":{}}}', themes: [{ name: "existing.css", content: "replace" }, { name: "new.css", content: "new" }] }), /restaurés/);
    assert.equal(await readFile(join(base, "themes/existing.css"), "utf8"), "keep");
    assert.deepEqual(await readdir(join(base, "themes")), ["existing.css"]);
});
test("a concurrent settings change aborts the transaction and removes newly created CSS", async t => {
    const base = await fixture(t);
    await writeFile(join(base, "settings/settings.json"), '{"plugins":{}}');
    let checks = 0;
    await assert.rejects(fs.applyFiles({ settingsDir: join(base, "settings"), themesDir: join(base, "themes"), backupDir: join(base, "backups"), oldSettings: '{"plugins":{}}', newSettings: '{"plugins":{"Good":{}}}', quickCss: "new-css", themes: [], guard() { if (++checks > 1) throw new Error("concurrent-change"); } }), /restaurés/);
    assert.deepEqual(await readdir(join(base, "settings")), ["settings.json"]);
    assert.equal(await readFile(join(base, "settings/settings.json"), "utf8"), '{"plugins":{}}');
});
test("backup failure prevents any writes", async t => {
    const base = await fixture(t);
    await writeFile(join(base, "backup-file"), "file"); await writeFile(join(base, "settings/settings.json"), "keep");
    await assert.rejects(fs.applyFiles({ settingsDir: join(base, "settings"), themesDir: join(base, "themes"), backupDir: join(base, "backup-file"), oldSettings: '{"plugins":{}}', newSettings: "new", themes: [] }));
    assert.equal(await readFile(join(base, "settings/settings.json"), "utf8"), "keep");
});

async function nativeFixture(t) {
    const base = await fixture(t);
    const vencord = join(base, "Vencord");
    await mkdir(join(vencord, "settings"), { recursive: true }); await mkdir(join(vencord, "themes"));
    await writeFile(join(vencord, "settings/settings.json"), JSON.stringify({ plugins: { Good: { enabled: true, apiKey: "source-secret" } } }));
    const state = { plain: { plugins: {} }, setData(value) { this.plain = value; } };
    const module = { exports: {} };
    const result = await build({ entryPoints: [join(root, "src/midnightcordplugins/vencordMigration/native.ts")], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent", plugins: [{ name: "fixture-services", setup(builder) {
        builder.onResolve({ filter: /^(@main\/settings|@main\/utils\/constants|electron|node:os)$/ }, args => ({ path: args.path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "@main/settings" ? "export const RendererSettings = globalThis.fixtureStore;" : args.path === "@main/utils/constants" ? `export const DATA_DIR=${JSON.stringify(base)}, SETTINGS_DIR=${JSON.stringify(join(base, "settings"))}, THEMES_DIR=${JSON.stringify(join(base, "themes"))};` : args.path === "node:os" ? `export const homedir=()=>${JSON.stringify(base)};` : "export const BrowserWindow={fromWebContents:()=>null}, dialog={showOpenDialog:async()=>({canceled:true,filePaths:[]})}, shell={openPath:async()=>''};" }));
    } }] });
    vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, Buffer, TextEncoder, URL, Date, console, setTimeout, fixtureStore: state, process: { platform: process.platform, env: { APPDATA: base, XDG_CONFIG_HOME: base, VENCORD_USER_DATA_DIR: vencord } } });
    const frame = { url: "https://discord.com/channels/@me" };
    const sender = { id: 42, mainFrame: frame, once() {}, on() {} };
    return { api: module.exports, event: { sender, senderFrame: frame }, state, base, vencord };
}
test("native discovery exposes opaque source IDs, preview filters credentials, application backs up and never changes Vencord", async t => {
    const { api, event, state, base, vencord } = await nativeFixture(t);
    const before = await readFile(join(vencord, "settings/settings.json"), "utf8");
    const found = await api.discover(event);
    assert.equal(found.sources.length, 1); assert.equal(JSON.stringify(found).includes("source-secret"), false); assert.equal(found.sources[0].settings, undefined);
    const preview = await api.preview(event, found.sources[0].id, registry, engine.defaultOptions);
    assert.equal(preview.imported, 1); assert.equal(preview.skippedFields, 1);
    const result = await api.apply(event, preview.id);
    assert.equal(state.plain.plugins.Good.enabled, true); assert.equal(state.plain.plugins.Good.apiKey, undefined);
    assert.equal(await readFile(join(vencord, "settings/settings.json"), "utf8"), before);
    assert.ok((await readdir(join(base, "migration-backups"))).includes(result.backup));
    await assert.rejects(api.apply(event, preview.id), /expiré/);
});
test("native receipt rejects stale settings and source handles from another window", async t => {
    const { api, event, state } = await nativeFixture(t);
    const found = await api.discover(event);
    const preview = await api.preview(event, found.sources[0].id, registry, engine.defaultOptions);
    state.plain.plugins.Other = { enabled: true };
    await assert.rejects(api.apply(event, preview.id), /changé/);
    const other = { ...event, sender: { ...event.sender, id: 43 } };
    await assert.rejects(api.preview(other, found.sources[0].id, registry, engine.defaultOptions), /expiré/);
    await assert.rejects(api.preview(event, "../../not-a-file", registry, engine.defaultOptions), /expiré/);
});
test("native migration rejects an untrusted origin or child frame", async t => {
    const { api, event } = await nativeFixture(t);
    const badFrame = { url: "https://evil.example/" };
    await assert.rejects(api.discover({ sender: { ...event.sender, mainFrame: badFrame }, senderFrame: badFrame }), /non autorisée/);
    await assert.rejects(api.discover({ ...event, senderFrame: { ...event.senderFrame } }), /non autorisée/);
});
