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

const code = transformSync(readFileSync(new URL("../src/midnightcordplugins/gifTeams/picker.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs" }).code;
const React = {
    isValidElement: node => !!node && typeof node === "object" && node.$$typeof === "element",
    cloneElement: (node, props) => ({ ...node, key: props.key ?? node.key, props: { ...node.props, ...props } })
};
const dependencies = {
    "@components/Button": {}, "@components/ErrorBoundary": {}, "@components/Icons": {},
    "@webpack/common": { React }, "./folders": {},
    "./favorites": { publicGifUrl(value) {
        if (typeof value !== "string") return null;
        try { const url = new URL(value); url.hash = ""; return url.protocol === "https:" ? url.href : null; } catch { return null; }
    } }
};
const module = { exports: {} };
runInNewContext(code, { module, exports: module.exports, Set, WeakMap, require: name => {
    assert(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
} });
const { filterPickerContent } = module.exports;
const a = { url: "https://tenor.com/view/a", src: "https://media.tenor.com/a.gif" };
const b = { url: "https://tenor.com/view/b", src: "https://media.tenor.com/b.gif" };
const grid = data => ({ $$typeof: "element", type: "NativeGifGrid", key: "native", props: { data, query: "cats", onSelectGIF: () => "original-handler" } });

test("folder filtering keeps the native grid and its handlers without mutating favorites", () => {
    const original = grid(Object.freeze([a, b]));
    const filtered = filterPickerContent(original, [a.url], "account:folder");
    assert.equal(filtered.type, original.type);
    assert.equal(filtered.props.onSelectGIF, original.props.onSelectGIF);
    assert.equal(filtered.props.query, "cats");
    assert.equal(filtered.props.data.length, 1);
    assert.equal(filtered.props.data[0], a);
    assert.equal(original.props.data.length, 2);
    assert.notEqual(filtered.key, original.key, "reset native grid keyboard position when changing folders");
});

test("folders intersect the already searched native results instead of adding hidden entries", () => {
    const original = grid([b]);
    assert.equal(filterPickerContent(original, [a.url], "folder").props.data.length, 0);
    assert.equal(filterPickerContent(original, [], "empty-folder").props.data.length, 0);
    assert.equal(filterPickerContent(original, undefined, "all"), original);
});

test("unrecognized Discord grid shapes remain untouched", () => {
    for (const original of [null, undefined, "Loading", { type: "NotReact" }, grid(undefined), grid({ items: [a] })]) {
        assert.equal(filterPickerContent(original, [a.url], "folder"), original);
    }
});

test("invalid rows are ignored and fragment-normalized native URLs match favorites", () => {
    const original = grid([null, {}, { url: "javascript:alert(1)" }, { ...a, url: a.url + "#preview" }]);
    const filtered = filterPickerContent(original, [a.url], "folder");
    assert.equal(filtered.props.data.length, 1);
    assert.equal(filtered.props.data[0], original.props.data[3]);
});
