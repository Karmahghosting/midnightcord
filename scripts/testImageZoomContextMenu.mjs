/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const source = readFileSync(new URL("../src/midnightcordplugins/imageZoom/index.tsx", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "tsx", format: "cjs" });

function fixture() {
    const settings = { store: {}, use() { throw new Error("A context menu patch must not call React hooks"); } };
    const calls = { debounce: [], createRoot: [] };
    const Menu = Object.fromEntries(["MenuGroup", "MenuCheckboxItem", "MenuControlItem", "MenuSliderControl"].map(name => [name, name]));
    const dependencies = {
        "@api/Settings": { definePluginSettings: options => {
            settings.store = Object.fromEntries(Object.entries(options).map(([name, option]) => [name, option.default]));
            return settings;
        } },
        "@shared/debounce": { debounce: (handler, delay) => { calls.debounce.push(delay); return handler; } },
        "@utils/constants": { Devs: { Aria: {} } },
        "@utils/Logger": { Logger: class {} },
        "@utils/types": { __esModule: true, default: value => value, OptionType: { BOOLEAN: 1, SLIDER: 2 } },
        "@webpack/common": { Menu, createRoot: value => { calls.createRoot.push(value); throw new Error("Unexpected magnifier mount"); } },
        "./components/Magnifier": { Magnifier: "Magnifier" },
        "./constants": { ELEMENT_ID: "image-zoom-fixture" },
        "./styles.css?managed": { default: "fixture-style" }
    };
    const module = { exports: {} };
    const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
    runInNewContext(code, {
        module, exports: module.exports, React,
        require: name => { assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; }
    });
    return { Menu, settings, calls, patch: module.exports.default.contextMenus["image-context"] };
}

function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
}

const image = { src: "https://cdn.discordapp.com/attachments/123/456/photo.png" };

test("image menu construction uses no hooks or magnifier side effects", () => {
    const f = fixture();
    const children = [];
    assert.doesNotThrow(() => f.patch(children, image));
    assert.equal(children.length, 1);
    assert.equal(nodes(children).filter(node => node.type === "MenuCheckboxItem").length, 2);
    assert.equal(nodes(children).filter(node => node.type === "MenuControlItem").length, 3);
    assert.equal(f.calls.debounce.length, 0, "Control renderers are deferred until Discord requests them");
    assert.equal(f.calls.createRoot.length, 0);
});

test("links, status emojis and missing context do not add image controls", () => {
    const f = fixture();
    for (const props of [undefined, null, { href: "https://example.test/" }, { target: { classList: { contains: value => value === "emoji" } } }]) {
        const children = [];
        assert.doesNotThrow(() => f.patch(children, props));
        assert.equal(children.length, 0);
    }
    assert.doesNotThrow(() => f.patch(undefined, image));
});

test("switching the shared menu between image and link contexts never changes hook usage", () => {
    const f = fixture();
    for (const props of [image, { href: "https://example.test/" }, image, null, image]) {
        assert.doesNotThrow(() => f.patch([], props));
    }
});

test("a temporarily unavailable slider keeps both checkboxes and never creates undefined elements", () => {
    for (const missing of ["MenuSliderControl", "MenuControlItem"]) {
        const f = fixture();
        const component = f.Menu[missing];
        delete f.Menu[missing];
        const children = [];
        f.patch(children, image);
        assert.equal(nodes(children).filter(node => node.type === "MenuCheckboxItem").length, 2);
        assert.equal(nodes(children).filter(node => node.type === "MenuControlItem").length, 0);
        assert(nodes(children).every(node => node.type != null));
        f.Menu[missing] = component;
        const next = [];
        f.patch(next, image);
        assert.equal(nodes(next).filter(node => node.type === "MenuControlItem").length, 3, "Later menu openings regain every slider");
    }
});

test("unavailable base menu components leave native children untouched", () => {
    for (const missing of ["MenuGroup", "MenuCheckboxItem"]) {
        const f = fixture();
        delete f.Menu[missing];
        const original = { type: "MenuItem", props: { id: "copy-image" } };
        const children = [original];
        f.patch(children, image);
        assert.deepEqual(children, [original]);
    }
});

test("reapplying the image menu patch does not duplicate controls", () => {
    const f = fixture();
    const children = [];
    f.patch(children, image);
    f.patch(children, image);
    assert.equal(children.length, 1);
    assert.equal(nodes(children).filter(node => node.props?.id === "vc-zoom").length, 1);
});

test("checkbox actions read current settings and stay correct across repeated actions", () => {
    const f = fixture();
    const children = [];
    f.patch(children, image);
    for (const [id, key] of [["vc-square", "square"], ["vc-nearest-neighbour", "nearestNeighbour"]]) {
        const item = nodes(children).find(node => node.props?.id === id);
        assert.equal(item.props.checked, false);
        item.props.action();
        assert.equal(f.settings.store[key], true);
        item.props.action();
        assert.equal(f.settings.store[key], false);
        f.settings.store[key] = true;
        const next = [];
        f.patch(next, image);
        assert.equal(nodes(next).find(node => node.props?.id === id).props.checked, true);
    }
});

test("all native slider controls retain bounds, refs, keyboard props and setting updates", () => {
    const f = fixture();
    const children = [];
    f.patch(children, image);
    for (const [id, key, minimum, maximum, next] of [
        ["vc-zoom", "zoom", 1, 50, 5],
        ["vc-size", "size", 50, 1000, 250],
        ["vc-zoom-speed", "zoomSpeed", 0.1, 5, 0.75]
    ]) {
        const item = nodes(children).find(node => node.props?.id === id);
        const ref = { current: null };
        const input = item.props.control({ tabIndex: 0, "aria-label": item.props.label }, ref);
        assert.equal(input.type, "MenuSliderControl");
        assert.equal(input.props.ref, ref);
        assert.equal(input.props.tabIndex, 0);
        assert.equal(input.props["aria-label"], item.props.label);
        assert.equal(input.props.minValue, minimum);
        assert.equal(input.props.maxValue, maximum);
        assert.equal(input.props.value, f.settings.store[key]);
        input.props.onChange(next);
        assert.equal(f.settings.store[key], next);
        if (key === "zoomSpeed") assert.equal(input.props.renderValue(next), "0.750x");
    }
    assert.deepEqual(f.calls.debounce, [100, 100, 100]);
});
