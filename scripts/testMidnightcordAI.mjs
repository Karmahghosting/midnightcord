/*
 * Regression checks for native Shop navigation and the independent AI entry points.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { transformSync } from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const sourceUrl = new URL("../src/midnightcordplugins/midnightcordAI/index.tsx", import.meta.url);
const { code } = transformSync(readFileSync(sourceUrl, "utf8"), {
    loader: "tsx",
    format: "cjs",
    jsxFactory: "React.createElement"
});

function loadPlugin() {
    const modals = [];
    const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
    const dependencies = {
        "@api/Settings": { definePluginSettings: () => ({ store: { apiKey: "" } }) },
        "@api/ContextMenu": {
            findGroupChildrenByChildId: (id, children) => children.find(child => child.props?.children?.some(item => item.props?.id === id))?.props.children
        },
        "@utils/types": { __esModule: true, default: value => value, OptionType: {} },
        "@utils/modal": { openModal: render => modals.push(render) },
        "@webpack": { findByPropsLazy: () => ({}) },
        "@webpack/common": { React, Menu: { MenuItem: "MenuItem" } },
        "../autoTranslateMidnightcord": { t: value => value },
        "./groqManager": { registerSettingsFallback: () => {} }
    };
    const module = { exports: {} };
    runInNewContext(code, {
        module,
        exports: module.exports,
        require: name => dependencies[name] ?? {},
        document: new Proxy({}, { get() { throw new Error("AI must not mutate native Shop navigation."); } }),
        MutationObserver: class {
            constructor() { throw new Error("AI must not install a navigation DOM observer."); }
        }
    });
    return { plugin: module.exports.default, modals };
}

test("AI leaves native Shop routing and startup DOM untouched", () => {
    const { plugin, modals } = loadPlugin();
    assert.equal(plugin.patches?.length ?? 0, 0);
    assert.doesNotThrow(() => plugin.start());
    assert.equal(modals.length, 0);
});

test("the toolbox still opens the AI modal independently of Shop", () => {
    const { plugin, modals } = loadPlugin();
    plugin.toolboxActions["Midnightcord AI"]();
    assert.equal(modals.length, 1);
    const rootProps = { transitionState: 1 };
    const element = modals[0](rootProps);
    assert.equal(typeof element.type, "function");
    assert.equal(element.props.rootProps, rootProps);
});

test("message action preserves native actions and opens AI with the selected text", () => {
    const { plugin, modals } = loadPlugin();
    const copy = { props: { id: "copy-text" } };
    const following = { props: { id: "another-native-action" } };
    const nativeGroup = { props: { children: [copy, following] } };
    const children = [nativeGroup];
    plugin.contextMenus.message(children, { message: { content: "  Explain this message  " } });
    assert.equal(children.length, 1);
    assert.equal(nativeGroup.props.children[0], copy);
    assert.equal(nativeGroup.props.children[2], following);
    const action = nativeGroup.props.children[1];
    assert.equal(action.props.id, "nai-ask");
    action.props.action();
    assert.equal(modals.length, 1);
    assert.equal(modals[0]({}).props.initialMessage, "Explain this message");
});

test("message action works without a copy-text group and ignores empty messages", () => {
    const { plugin } = loadPlugin();
    const existing = { props: { id: "native-action" } };
    const children = [existing];
    plugin.contextMenus.message(children, { message: { content: " " } });
    assert.equal(children.length, 1);
    plugin.contextMenus.message(children, { message: { content: "Selected text" } });
    assert.equal(children.length, 2);
    assert.equal(children[0], existing);
    assert.equal(children[1].props.id, "nai-ask");
});
