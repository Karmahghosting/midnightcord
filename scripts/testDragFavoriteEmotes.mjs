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

function load(relative, dependencies, loader = "ts") {
    const { code } = transformSync(readFileSync(new URL(relative, import.meta.url), "utf8"), { loader, format: "cjs" });
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, require: name => {
        assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
        return dependencies[name];
    } });
    return module.exports;
}

function fixture() {
    const state = { hooks: [], refs: [], updates: [], warnings: [], settings: { emojis: ["a", "b", "c"] } };
    const identity = element => { state.refs.push(element); return element; };
    const createElement = (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } });
    const common = {
        React: { createElement }, useRef: value => ({ current: value }), useCallback: value => value,
        useState: value => [value, next => { state.after = next; }],
        useDrag: factory => {
            state.hooks.push("drag");
            if (state.unavailable) throw new Error("Missing drag-and-drop hook");
            state.drag = factory();
            return [{ isDragging: false }, identity];
        },
        useDrop: factory => {
            state.hooks.push("drop"); state.drop = factory();
            return [{ canDrop: false, isOver: false }, identity];
        },
        UserSettingsActionCreators: { FrecencyUserSettingsActionCreators: { async updateAsync(key, updater, delay) {
            state.updates.push({ key, delay });
            if (state.rejectUpdate) throw new Error("Update failed");
            state.updateResult = updater(state.settings);
        } } }
    };
    const ErrorBoundary = { wrap: (Component, options) => props => {
        try { return Component(props); } catch { return options.fallback({ wrappedProps: props }); }
    } };
    const loaded = load("../src/plugins/dragFavoriteEmotes/index.tsx", {
        "./styles.css": {}, "@components/ErrorBoundary": { __esModule: true, default: ErrorBoundary },
        "@utils/constants": { EquicordDevs: { PWall: {} } }, "@utils/Logger": { Logger: class { warn(value) { state.warnings.push(value); } } },
        "@utils/types": { __esModule: true, default: value => value }, "@webpack": { findByPropsLazy: () => ({ INFREQUENT_USER_ACTION: 7 }) },
        "@webpack/common": common
    }, "tsx");
    function render(props) {
        let element = loaded.default.EmojiButton(props);
        while (typeof element.type === "function" && element.type !== props.Component) element = element.type(element.props);
        return element;
    }
    return { ...loaded, state, render };
}

const { canonicalizeMatch } = load("../src/utils/patches.ts", { "./intlHash": { runtimeHashMessageKey: () => "glqNsf" } });
const descriptor = (id, category = "FAVORITES") => ({ category, emoji: { id } });
const native = () => null;
const turn = () => new Promise(resolve => setImmediate(resolve));

// The button call and tooltip branch follow the cached public Discord web.f803cc09a978437c.js module.
// This is a regression fixture, not a claim that today's authenticated Discord bundle is identical.
const factory = `function Item(e){let{descriptor:t,showTooltip:A}=e,[y,D]=s.useState("");let P=t.emoji,k=e.ref,H=(0,a.jsx)(nv,{ref:k,emoji:P,isFavorite:true,onClick:e.onClick});return A?(0,a.jsx)(Tooltip,{text:intl.t.glqNsf,delay:200,children:H}):H}`;

test("one patch wraps the native button without adding hooks or changing conditional tooltip branches", () => {
    const { default: plugin } = fixture();
    const patch = plugin.patches[0];
    const match = canonicalizeMatch(patch.replacement.match);
    const changed = factory.replace(match, patch.replacement.replace.replaceAll("$self", "plugin"));
    assert.notEqual(changed, factory);
    assert.equal(plugin.patches.length, 1);
    assert.equal(Array.isArray(patch.replacement), false, "No partially applied hook/ref patch sequence");
    assert.equal(changed.includes("collected"), false);
    const renderCounts = [];
    for (const showTooltip of [false, true, false]) {
        let hooks = 0;
        const click = () => {};
        const props = { descriptor: descriptor("a"), showTooltip, ref: {}, onClick: click };
        const original = runInNewContext(`(${changed})`, { plugin, s: { useState: () => { hooks++; return ["", () => {}]; } },
            a: { jsx: (type, props) => ({ type, props }) }, nv: native, Tooltip: "tooltip", intl: { t: { glqNsf: "Favorite" } } })(props);
        const button = showTooltip ? original.props.children : original;
        assert.equal(button.type, plugin.EmojiButton);
        assert.equal(button.props.Component, native);
        assert.equal(button.props.originalRef, props.ref);
        assert.equal(button.props.descriptor, props.descriptor);
        assert.equal(button.props.onClick, click);
        renderCounts.push(hooks);
    }
    assert.deepEqual(renderCounts, [1, 1, 1], "The host's hook count never depends on the tooltip branch");
});

test("a changed Discord call shape leaves the entire factory untouched", () => {
    const { default: plugin } = fixture();
    const patch = plugin.patches[0].replacement;
    const changedDiscord = factory.replace("ref:k,emoji:P,isFavorite", "emoji:P,ref:k,isFavorite");
    assert.equal(changedDiscord.replace(canonicalizeMatch(patch.match), patch.replace), changedDiscord);
});

test("missing descriptors, categories and favorite IDs render the original button without DnD hooks", () => {
    const f = fixture();
    for (const data of [undefined, null, {}, { category: "FAVORITES" }, descriptor("a", "RECENT"), descriptor("a", "GUILD")]) {
        const ref = {};
        const click = () => {};
        const button = f.render({ Component: native, originalRef: ref, descriptor: data, onClick: click, disabled: true });
        assert.equal(button.type, native);
        assert.equal(button.props.ref, ref);
        assert.equal(button.props.onClick, click);
        assert.equal(button.props.disabled, true);
        assert.equal(Object.hasOwn(button.props, "descriptor"), false);
        assert.equal(Object.hasOwn(button.props, "Component"), false);
    }
    assert.deepEqual(f.state.hooks, []);
});

test("valid custom and unicode favorites select their stored identifiers", () => {
    const { favoriteId } = fixture();
    assert.equal(favoriteId(descriptor("123456789012345678")), "123456789012345678");
    assert.equal(favoriteId({ category: "FAVORITES", emoji: { uniqueName: "slight_smile" } }), "slight_smile");
    assert.equal(favoriteId({ category: "FAVORITES", emoji: { uniqueName: "", id: "a" } }), "a");
    assert.equal(favoriteId({ category: "FAVORITES", emoji: { uniqueName: 123 } }), undefined);
});

test("favorite buttons preserve native handlers, styles and refs while attaching both connectors", () => {
    const f = fixture();
    const ref = { current: null };
    const click = () => {};
    const contextMenu = () => {};
    const style = { width: 40 };
    const button = f.render({ Component: native, originalRef: ref, descriptor: descriptor("a"), onClick: click, onContextMenu: contextMenu, style });
    assert.equal(button.type, native, "No wrapper DOM is inserted into the emoji grid");
    assert.equal(button.props.onClick, click);
    assert.equal(button.props.onContextMenu, contextMenu);
    assert.equal(button.props.style, style);
    const node = { getBoundingClientRect: () => ({ left: 0, width: 40 }) };
    button.props.ref(node);
    assert.equal(ref.current, node);
    assert.deepEqual(f.state.refs, [node, node]);
    button.props.ref(null);
    assert.equal(ref.current, null);
    assert.deepEqual(f.state.hooks, ["drag", "drop"]);
    assert.equal(f.state.drag.type, f.state.drop.accept);
    assert.notEqual(f.state.drag.type, "emoji", "Unrelated emoji drags cannot mutate favorites");
});

test("native callback refs retain both React 18 null callbacks and React 19 cleanup behavior", () => {
    for (const cleanup of [false, true]) {
        const f = fixture();
        const values = [];
        const originalRef = node => { values.push(node); if (node && cleanup) return () => values.push("cleaned"); };
        const button = f.render({ Component: native, originalRef, descriptor: descriptor("a") });
        const node = {};
        button.props.ref(node);
        button.props.ref(null);
        assert.deepEqual(values, cleanup ? [node, "cleaned"] : [node, null]);
    }
});

test("an unavailable drag hook falls back to the original emoji button instead of crashing the picker", () => {
    const f = fixture();
    f.state.unavailable = true;
    const ref = {};
    const button = f.render({ Component: native, originalRef: ref, descriptor: descriptor("a"), title: "favorite" });
    assert.equal(button.type, native);
    assert.equal(button.props.title, "favorite");
    assert.equal(button.props.ref, ref);
});

test("reordering handles both directions and can place a favorite at the end", () => {
    const { reorderFavorites } = fixture();
    for (const [source, target, after, expected] of [
        ["c", "a", false, ["c", "a", "b"]], ["a", "c", false, ["b", "a", "c"]],
        ["a", "c", true, ["b", "c", "a"]], ["c", "a", true, ["a", "c", "b"]]
    ]) {
        const data = { emojis: ["a", "b", "c"] };
        assert.equal(reorderFavorites(data, source, target, after), undefined);
        assert.deepEqual(data.emojis, expected);
    }
});

test("missing or stale favorites never remove the last item or insert an unknown ID", () => {
    const { reorderFavorites } = fixture();
    for (const [source, target] of [[undefined, "a"], ["a", undefined], ["missing", "a"], ["a", "missing"], ["a", "a"], ["a", "b"]]) {
        const data = { emojis: ["a", "b", "c"] };
        assert.equal(reorderFavorites(data, source, target), false);
        assert.deepEqual(data.emojis, ["a", "b", "c"]);
    }
    for (const data of [undefined, null, {}, { emojis: null }, { emojis: "abc" }, { emojis: ["a", {}, "b"] }]) {
        const before = JSON.stringify(data);
        assert.equal(reorderFavorites(data, "a", "b"), false);
        assert.equal(JSON.stringify(data), before);
    }
});

test("dropping updates Discord's latest settings once and suppresses nested, stale and self drops", async () => {
    const f = fixture();
    const button = f.render({ Component: native, descriptor: descriptor("c") });
    button.props.ref({ getBoundingClientRect: () => ({ left: 0, width: 40 }) });
    const monitor = { getClientOffset: () => ({ x: 30, y: 0 }), didDrop: () => false };
    assert.equal(f.state.drop.canDrop({ id: "a" }), true);
    assert.equal(f.state.drop.canDrop({ id: "c" }), false);
    assert.equal(f.state.drop.canDrop({}), false);
    f.state.drop.drop({ id: "a" }, monitor);
    await turn();
    assert.deepEqual(f.state.settings.emojis, ["b", "c", "a"]);
    assert.deepEqual(f.state.updates, [{ key: "favoriteEmojis", delay: 7 }]);
    f.state.drop.drop({ id: "c" }, monitor);
    f.state.drop.drop({ id: "a" }, { ...monitor, didDrop: () => true });
    f.state.drop.drop({}, monitor);
    assert.equal(f.state.updates.length, 1);
    f.state.settings.emojis = ["b", "c"];
    f.state.drop.drop({ id: "a" }, monitor);
    await turn();
    assert.deepEqual(f.state.settings.emojis, ["b", "c"]);
    assert.equal(f.state.updateResult, false);
});

test("a rejected settings update is handled without an unhandled rejection or UI exception", async () => {
    const f = fixture();
    f.render({ Component: native, descriptor: descriptor("c") });
    f.state.rejectUpdate = true;
    f.state.drop.drop({ id: "a" }, { getClientOffset: () => null, didDrop: () => false });
    await turn();
    assert.equal(f.state.warnings.length, 1);
    assert.deepEqual(f.state.settings.emojis, ["a", "b", "c"]);
});
