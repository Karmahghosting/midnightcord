/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

// A source argument allows verifying that the same cases fail before a patch.
const source = readFileSync(process.argv[2] ? resolve(process.argv[2]) : new URL("../src/components/settings/tabs/updater/index.tsx", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "tsx", format: "cjs", jsxFactory: "createElement" });
const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });

function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object") return [];
    return [value, ...nodes(value.props?.children)];
}

function text(value) {
    if (Array.isArray(value)) return value.map(text).join("");
    if (value == null || typeof value === "boolean") return "";
    return typeof value === "object" ? text(value.props?.children) : String(value);
}

function fixture(options = {}) {
    const state = [];
    const effects = [];
    let cursor = 0;
    let tree;
    const calls = { check: 0, update: 0, rebuild: 0, toast: 0, restart: 0, errors: [] };
    function useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    }
    function useRef(initial) { return useState(() => ({ current: initial }))[0]; }
    function useEffect(effect) {
        const index = cursor++;
        if (!(index in state)) { state[index] = true; effects.push(effect); }
    }
    const updater = {
        isOutdated: options.detectedAtOpen ?? false,
        changes: [{ hash: "test", author: "Midnightcord", message: "A new verified release" }],
        checkForUpdates: async () => {
            calls.check++;
            return updater.isOutdated = await (options.check?.() ?? true);
        },
        update: async () => { calls.update++; return options.update?.() ?? true; },
        rebuild: async () => {
            calls.rebuild++;
            const result = await (options.rebuild?.() ?? true);
            if (result) updater.isOutdated = false;
            return result;
        },
        UpdateLogger: { error: (...args) => calls.errors.push(args) }
    };
    const dependencies = {
        "@api/i18n": { t: value => value },
        "@components/settings": { SettingsTab: "SettingsTab", wrapTab: Component => Component },
        "@utils/margins": { Margins: {} },
        "@utils/native": { relaunch: () => { calls.restart++; } },
        "@utils/updater": updater,
        "@webpack/common": {
            React: { createElement }, useState, useRef, useEffect,
            Toasts: {
                // Reproduce a lazy Discord export that resolves to undefined.
                show: () => { calls.toast++; Reflect.apply(undefined, null, []); },
                genId: () => "toast-id", Type: { SUCCESS: "success" }, Position: { BOTTOM: 1 }
            }
        }
    };
    for (const name of ["Button", "Card", "Divider", "Flex", "Heading", "Link", "Paragraph", "Span"])
        dependencies[`@components/${name}`] = { [name]: name };
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, createElement, VERSION: "test", require: name => {
        assert(Object.hasOwn(dependencies, name), `Unexpected updater dependency: ${name}`);
        return dependencies[name];
    } });
    function render() { cursor = 0; return tree = module.exports.default(); }
    function button(label) {
        const result = nodes(tree).find(node => node.type === "Button" && text(node) === label);
        assert(result, `Missing button: ${label}`);
        return result.props;
    }
    async function flush() {
        for (const effect of effects.splice(0)) effect();
        await new Promise(setImmediate);
        render();
    }
    render();
    return {
        calls, render, button, flush,
        text: () => text(tree),
        errors: () => nodes(tree).filter(node => node.type === "Span" && node.props.color === "text-danger").map(text),
        click: async label => { const control = button(label); assert(!control.disabled); await control.onClick(); await flush(); }
    };
}

function assertReady(f) {
    assert.match(f.text(), /Update verified\. Restart Midnightcord to apply it\./);
    assert.deepEqual(f.errors(), [], "A verified update must not also be presented as failed");
    assert.equal(f.button("Restart Midnightcord").disabled, false);
    assert.equal(f.calls.restart, 0, "Preparing an update must never restart Discord automatically");
}

test("a broken Discord toast cannot turn a successfully staged update into a failure", async () => {
    const f = fixture();
    await f.click("Check for Updates");
    assertReady(f);
    assert.equal(f.calls.update, 1);
    assert.equal(f.calls.rebuild, 1);
    assert.deepEqual(f.calls.errors, []);
    await f.click("Restart Midnightcord");
    assert.equal(f.calls.restart, 1);
});

test("automatic preparation at open succeeds when the Discord toast export is unavailable", async () => {
    const f = fixture({ detectedAtOpen: true });
    await f.flush();
    assertReady(f);
    assert.equal(f.calls.check, 0);
    assert.equal(f.calls.rebuild, 1);
});

test("an up-to-date check remains successful without Discord toasts", async () => {
    const f = fixture({ check: () => false });
    await f.click("Check for Updates");
    assert.match(f.text(), /You are running the latest version/);
    assert.deepEqual(f.errors(), []);
    assert.equal(f.calls.update, 0);
    assert.equal(f.calls.rebuild, 0);
    assert.equal(f.calls.restart, 0);
});

for (const failure of ["update-false", "update-reject", "rebuild-false", "rebuild-reject"]) {
    test(`a real ${failure} still shows an error and never offers restart`, async () => {
        const phase = failure.startsWith("update") ? "update" : "rebuild";
        const f = fixture({ [phase]: () => {
            if (failure.endsWith("reject")) throw new Error("Network or checksum failure");
            return false;
        } });
        await f.click("Check for Updates");
        assert.equal(f.errors().length, 1);
        assert.match(f.errors()[0], /^Update failed:/);
        assert.doesNotMatch(f.text(), /Update verified\.|Restart Midnightcord/);
        assert.equal(f.button("Retry Update").disabled, false);
        assert.equal(f.calls.restart, 0);
        if (phase === "update") assert.equal(f.calls.rebuild, 0);
    });
}

test("a failed check remains visible without claiming the client is current", async () => {
    const f = fixture({ check: () => { throw new Error("Release service unavailable"); } });
    await f.click("Check for Updates");
    assert.deepEqual(f.errors(), ["Check for Updates: Release service unavailable"]);
    assert.doesNotMatch(f.text(), /You are running the latest version|Update verified\./);
    assert.equal(f.calls.update, 0);
});

test("retry replaces a real update failure with the verified state", async () => {
    let attempts = 0;
    const f = fixture({ rebuild: () => { if (++attempts === 1) throw new Error("Checksum mismatch"); return true; } });
    await f.click("Check for Updates");
    assert.match(f.errors()[0], /Checksum mismatch/);
    await f.click("Retry Update");
    assertReady(f);
    assert.equal(f.calls.rebuild, 2);
});

test("overlapping preparation requests stage once and only enable restart after verification", async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const f = fixture({ detectedAtOpen: true, rebuild: () => pending });
    const staleClick = f.button("Retry Update").onClick;
    await f.flush();
    await staleClick();
    f.render();
    assert.equal(f.calls.rebuild, 1);
    assert.equal(f.button("Downloading and verifying...").disabled, true);
    assert.doesNotMatch(f.text(), /Update verified\.|Restart Midnightcord/);
    finish(true);
    await f.flush();
    assertReady(f);
    assert.equal(f.calls.rebuild, 1);
});
