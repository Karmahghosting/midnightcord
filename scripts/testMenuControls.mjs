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
import ts from "typescript";

function evaluate(source, dependencies = {}, globals = {}) {
    const module = { exports: {} };
    const { code } = transformSync(source, { loader: "ts", format: "cjs" });
    runInNewContext(code, { ...globals, module, exports: module.exports, require: name => {
        assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
        return dependencies[name];
    } });
    return module.exports;
}

// Exercise the production component filter, including memo/forwardRef unwrapping.
const webpackSource = readFileSync(new URL("../src/webpack/webpack.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("webpack.ts", webpackSource, ts.ScriptTarget.Latest, true);
const definitions = ast.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => ["stringMatches", "filters"].includes(declaration.name.getText(ast))));
assert.equal(definitions.length, 2);
const { filters } = evaluate(definitions.map(node => node.getText(ast)).join("\n"), {}, { canonicalizeMatch: value => value });
const menuSource = readFileSync(new URL("../src/webpack/common/menu.ts", import.meta.url), "utf8");

function fixture() {
    const listeners = [];
    const { Menu } = evaluate(menuSource, {
        "@webpack": { filters, waitFor: (filter, callback) => listeners.push({ filter, callback }), mapMangledModuleLazy: () => ({}) }
    });
    return { Menu, register(component) { for (const { filter, callback } of listeners) if (filter(component)) callback(component); } };
}

// Reduced shapes of Discord's old and current controls; never invoke Discord or the network.
function legacyControl() { interact(kind.SLIDER); return render({ handleSize:16 }); }
function currentControl() { interact(kind.SLIDER); return render({ inputRef: ref, onChangeEnd: change, passThroughVerticalArrowKeys:!0 }); }
function unrelatedSlider() { return render({ handleSize:16, passThroughVerticalArrowKeys:!0 }); }
function unrelatedInteraction() { interact(kind.SLIDER); return render({ unrelated: true }); }

test("the current slider is registered even though Discord removed its fixed handle size", () => {
    assert.equal(filters.componentByCode("SLIDER)", "handleSize:16")(currentControl), false);
    const f = fixture();
    f.register(currentControl);
    assert.equal(f.Menu.MenuSliderControl, currentControl);
});

test("older Discord slider controls remain supported", () => {
    const f = fixture();
    f.register(legacyControl);
    assert.equal(f.Menu.MenuSliderControl, legacyControl);
});

test("registration supports React memo and forwardRef wrappers without substituting unrelated controls", () => {
    const f = fixture();
    f.register(unrelatedSlider);
    f.register(unrelatedInteraction);
    assert.equal(f.Menu.MenuSliderControl, undefined);
    const wrapped = { $$typeof: Symbol.for("react.memo"), type: { $$typeof: Symbol.for("react.forward_ref"), render: currentControl } };
    f.register(wrapped);
    assert.equal(f.Menu.MenuSliderControl, wrapped);
    assert.equal(f.Menu.MenuSearchControl, undefined);
    assert.equal(f.Menu.Menu, undefined);
});

test("a control registered after the menu module is loaded becomes available", () => {
    const f = fixture();
    assert.equal(f.Menu.MenuSliderControl, undefined);
    f.register(currentControl);
    assert.equal(f.Menu.MenuSliderControl, currentControl);
});
