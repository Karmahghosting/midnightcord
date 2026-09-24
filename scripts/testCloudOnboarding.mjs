import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { build } from "esbuild";

const bundled = await build({
    stdin: {
        contents: `export { PlainSettings } from "./src/api/Settings.ts";
            export { createCloudOnboarding } from "./src/api/SettingsSync/cloudOnboardingFlow.ts";
            export { exportSettings, importSettings } from "./src/api/SettingsSync/offline.ts";`,
        resolveDir: process.cwd()
    },
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2022",
    write: false,
    plugins: [{
        name: "onboarding-fixtures",
        setup(builder) {
            const mocks = new Map([
                ["~plugins", "export default { RequiredPlugin: { required: true } };"],
                ["@webpack/common", "export const React = {}; export const useEffect = () => {}; export const moment = () => {}; export const Toasts = { show() {}, genId() {}, Type: {} };"],
                ["@utils/localStorage", "export const localStorage = {};"],
                ["@utils/Logger", "export class Logger { warn() {} error() {} info() {} }"],
                ["@utils/types", "export const OptionType = {};"],
                ["@utils/web", "export const chooseFile = () => {}; export const saveFile = () => {};"],
                ["..", "export const DataStore = { entries: async () => [], setMany: async () => {} };"],
            ]);
            builder.onResolve({ filter: /.*/ }, args => mocks.has(args.path) ? { path: args.path, namespace: "onboarding-fixtures" } : undefined);
            builder.onLoad({ filter: /.*/, namespace: "onboarding-fixtures" }, args => ({ contents: mocks.get(args.path), loader: "js" }));
        }
    }]
});

function load(raw = {}, reporter = false) {
    let settings = structuredClone(raw);
    const writes = [];
    const context = {
        module: { exports: {} },
        IS_REPORTER: reporter,
        VencordNative: {
            settings: {
                get: () => settings,
                set: async value => { settings = value; writes.push(structuredClone(value)); }
            },
            quickCss: { get: async () => "", set: async () => {} }
        }
    };
    vm.runInNewContext(bundled.outputFiles[0].text, context);
    return { ...context.module.exports, writes };
}

function onboarding(fixture) {
    const state = { prompts: [], opened: 0, errors: 0, identity: false, failRead: false, failSave: false };
    const dependencies = {
        getState: () => fixture.PlainSettings.cloudOnboarding,
        saveState: async value => {
            if (state.failSave) throw new Error("Disk unavailable");
            fixture.PlainSettings.cloudOnboarding = value;
        },
        isCloudEnabled: () => fixture.PlainSettings.cloud.enabled,
        hasIdentity: async () => {
            if (state.failRead) throw new Error("Local storage unavailable");
            return state.identity;
        },
        showPrompt: confirm => state.prompts.push(confirm),
        openSettings: () => { state.opened++; },
        onError: () => { state.errors++; }
    };
    return { state, dependencies, offer: fixture.createCloudOnboarding(dependencies) };
}

test("fresh renderer installs are detected before defaults and required plugins are added", () => {
    for (const raw of [{}, { arRPC: true }, { arRPC: true, discordBranch: "stable", minimizeToTray: true }]) {
        const fixture = load(raw);
        assert.equal(fixture.PlainSettings.cloudOnboarding, "pending");
        assert.equal(fixture.PlainSettings.cloud.enabled, false);
        assert.equal(fixture.PlainSettings.plugins.RequiredPlugin.enabled, true);
        assert.equal(fixture.writes[0].cloudOnboarding, "pending", "pending state survives a restart before the prompt");
    }
});

test("existing renderer preferences and reporter builds do not receive first-install setup", async () => {
    for (const raw of [{ plugins: {} }, { cloud: { enabled: false } }, { cloud: { url: "https://legacy.invalid", authenticated: true } }, { autoUpdate: false }, { notifications: {} }, { language: "fr" }, { plugins: {}, cloudOnboarding: "unknown-future-state" }]) {
        const fixture = load(raw);
        assert.equal(fixture.PlainSettings.cloudOnboarding, "handled");
        const { state, offer } = onboarding(fixture);
        await offer();
        assert.equal(state.prompts.length, 0);
    }
    const reporter = load({}, true);
    assert.equal(reporter.PlainSettings.cloudOnboarding, undefined);
    const { state, offer } = onboarding(reporter);
    await offer();
    assert.equal(state.prompts.length, 0);
});

test("a pending first launch survives defaults being saved before Discord becomes ready", async () => {
    const original = load({});
    const restarted = load(original.writes[0]);
    const { state, offer } = onboarding(restarted);
    await offer();
    assert.equal(state.prompts.length, 1);
    assert.equal(restarted.PlainSettings.cloudOnboarding, "handled");
});

test("dismissing or declining setup remains handled across restarts without enabling Cloud", async () => {
    const fixture = load({});
    const { state, offer } = onboarding(fixture);
    await Promise.all([offer(), offer()]);
    assert.equal(state.prompts.length, 1);
    assert.equal(fixture.PlainSettings.cloudOnboarding, "handled", "persist before any modal interaction");
    assert.equal(fixture.PlainSettings.cloud.enabled, false);
    assert.equal(state.identity, false);
    assert.equal(state.opened, 0);

    const restarted = onboarding(load(fixture.PlainSettings));
    await restarted.offer();
    assert.equal(restarted.state.prompts.length, 0);
});

test("accepting only opens setup so the user can choose a new key or import an existing one", async () => {
    const fixture = load({});
    const { state, offer } = onboarding(fixture);
    await offer();
    assert.equal(state.opened, 0);
    state.prompts[0]();
    assert.equal(state.opened, 1);
    assert.equal(fixture.PlainSettings.cloud.enabled, false);
    assert.equal(state.identity, false);
});

test("an existing local recovery key or enabled Cloud skips onboarding", async () => {
    for (const enabled of [false, true]) {
        const fixture = load({});
        fixture.PlainSettings.cloud.enabled = enabled;
        const { state, offer } = onboarding(fixture);
        state.identity = !enabled;
        await offer();
        assert.equal(state.prompts.length, 0);
        assert.equal(fixture.PlainSettings.cloudOnboarding, "handled");
    }
});

test("storage failures never enable Cloud or show an unpersisted prompt, and can retry next startup", async () => {
    for (const failure of ["failRead", "failSave"]) {
        const fixture = load({});
        const { state, offer } = onboarding(fixture);
        state[failure] = true;
        await offer();
        await offer();
        assert.equal(state.errors, 1);
        assert.equal(state.prompts.length, 0);
        assert.equal(fixture.PlainSettings.cloudOnboarding, "pending");
        assert.equal(fixture.PlainSettings.cloud.enabled, false);
        const restarted = onboarding(load(fixture.PlainSettings));
        await restarted.offer();
        assert.equal(restarted.state.prompts.length, 1);
    }
});

test("local onboarding state is neither exported nor overwritten by backups or Cloud imports", async () => {
    const fixture = load({ cloudOnboarding: "handled", plugins: {} });
    const backup = JSON.parse(await fixture.exportSettings({ type: "all", syncDataStore: false }));
    assert.equal(Object.hasOwn(backup.settings, "cloudOnboarding"), false);
    assert.equal(Object.hasOwn(backup.settings, "cloud"), false);
    for (const cloud of [false, true]) {
        await fixture.importSettings(JSON.stringify({ settings: { cloudOnboarding: "pending", plugins: {} } }), "plugins", cloud);
        assert.equal(fixture.PlainSettings.cloudOnboarding, "handled");
    }
});
