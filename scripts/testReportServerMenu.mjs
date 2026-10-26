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

const createElement = (type, props, ...children) => ({ type, props: { ...props, children }, $$typeof: "react-element-fixture" });
const isValidElement = value => !!value && value.$$typeof === "react-element-fixture";
function load(path, dependencies) {
    const { code } = transformSync(readFileSync(new URL(path, import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsxFactory: "createElement" });
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, createElement, require: name => {
        assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
        return dependencies[name];
    } });
    return module.exports;
}

const icons = load("../src/components/Icons.tsx", {
    "./iconStyles.css": {},
    "@utils/discord": { getIntlMessage: value => value },
    "@utils/misc": { classes: (...values) => values.filter(Boolean).join(" ") }
});

function fixture() {
    const opened = [];
    let stopped = 0;
    const plugin = load("../src/midnightcordplugins/reportServer/index.tsx", {
        "@components/Icons": icons,
        "@utils/types": { __esModule: true, default: value => value },
        "@webpack/common": { Menu: { MenuGroup: "MenuGroup", MenuItem: "MenuItem" }, React: { isValidElement } },
        "./reporting": { openServerReport: guild => opened.push(guild), stopReports() { stopped++; } }
    }).default;
    return { plugin, opened, get stopped() { return stopped; } };
}

test("disabling the plugin cancels pending reporting through its lifecycle hook", () => {
    const state = fixture();
    assert.equal(state.stopped, 0);
    state.plugin.stop();
    assert.equal(state.stopped, 1);
    assert.equal(state.opened.length, 0);
});

function entries(node) {
    if (Array.isArray(node)) return node.flatMap(entries);
    if (!isValidElement(node)) return [];
    return [...(node.type === "MenuItem" ? [node] : []), ...entries(node.props.children)];
}

function renderIcon(Icon, props) {
    let result = createElement(Icon, props);
    while (typeof result.type === "function") result = result.type(result.props);
    return result;
}

const guild = { id: "1337883355840118887", name: "Serveur de test", privateField: "must not be forwarded" };
const contexts = ["guild-context", "guild-header-popout"];

test("both server menus add a manual action without opening or submitting any report", () => {
    const { plugin, opened } = fixture();
    assert.equal(plugin.enabledByDefault, true);
    assert.equal(plugin.name, "ReportServer");
    for (const context of contexts) {
        const children = [null, false, createElement("MenuItem", { id: "leave", label: "Quitter" })];
        const before = [...children];
        plugin.contextMenus[context](children, { guild });
        assert.equal(opened.length, 0);
        assert.deepEqual(children.slice(0, before.length), before);
        const item = entries(children).find(node => node.props.id === "midnightcord-report-server");
        assert.equal(item.props.label, "Signaler le serveur");
        assert.equal(typeof item.props.action, "function");
    }
});

test("clicking the action opens the exact selected server once and only passes its name and ID", () => {
    const { plugin, opened } = fixture();
    const children = [];
    const source = { ...guild };
    plugin.contextMenus["guild-context"](children, { guild: source });
    source.id = "1395048695501688953";
    source.name = "Another server";
    entries(children)[0].props.action();
    assert.equal(opened.length, 1);
    assert.equal(opened[0].id, guild.id);
    assert.equal(opened[0].name, guild.name);
    assert.deepEqual(Object.keys(opened[0]).sort(), ["id", "name"]);
});

test("folders, missing props and invalid server IDs do not gain a report action", () => {
    const { plugin, opened } = fixture();
    for (const context of contexts) {
        for (const props of [undefined, null, {}, { folderId: "123" }, { guild: null }, ...[undefined, 1337, "", "@me", "123", "0".repeat(18), "x".repeat(18)].map(id => ({ guild: { id, name: "Invalid" } }))]) {
            const children = [];
            assert.doesNotThrow(() => plugin.contextMenus[context](children, props));
            assert.equal(children.length, 0);
        }
        assert.doesNotThrow(() => plugin.contextMenus[context](null, { guild }));
    }
    assert.equal(opened.length, 0);
});

test("reapplying the patch cannot duplicate its own nested menu entry", () => {
    const { plugin, opened } = fixture();
    const children = [];
    plugin.contextMenus["guild-context"](children, { guild });
    plugin.contextMenus["guild-context"](children, { guild });
    assert.equal(entries(children).length, 1);
    assert.equal(opened.length, 0);
});

test("an existing server-report entry prevents a duplicate without mutating its subtree", () => {
    const { plugin, opened } = fixture();
    for (const id of ["report", "report-server", "report-guild", "server-report", "guild-report", "REPORT_SERVER", "reportGuild"]) {
        const original = createElement("MenuItem", { id, label: "Existing report" });
        const group = createElement("MenuGroup", {}, [null, original]);
        const children = [group];
        const before = JSON.stringify(children);
        plugin.contextMenus["guild-header-popout"](children, { guild });
        assert.equal(JSON.stringify(children), before);
        assert.equal(entries(children).length, 1);
    }
    assert.equal(opened.length, 0);
});

test("unrelated report tools and untrusted labels do not hide the server action", () => {
    const { plugin } = fixture();
    for (const id of ["report-bug", "report-message", "support"]) {
        const children = [createElement("MenuItem", { id, label: "Signaler le serveur" })];
        plugin.contextMenus["guild-context"](children, { guild });
        assert.equal(entries(children).length, 2);
    }
});

test("both menu versions use the existing shield SVG and preserve Discord's styling props", () => {
    const { plugin } = fixture();
    const children = [];
    plugin.contextMenus["guild-context"](children, { guild });
    const { props } = entries(children)[0];
    assert.equal(props.icon, undefined, "Legacy menus must not get an additional right-hand icon");
    assert.equal(props.iconLeft, icons.ShieldIcon);
    assert.equal(props.leadingAccessory.type, "icon");
    assert.equal(props.leadingAccessory.icon, icons.ShieldIcon);
    for (const Icon of [props.iconLeft, props.leadingAccessory.icon]) {
        const result = renderIcon(Icon, { className: "discord-menu-icon", width: 24, height: 24, "aria-hidden": true });
        assert.equal(result.type, "svg");
        assert.equal(result.props.width, 24);
        assert.equal(result.props.height, 24);
        assert.equal(result.props["aria-hidden"], true);
        assert(result.props.className.includes("discord-menu-icon"));
        assert(result.props.children.flat(Infinity).some(child => child?.type === "path" && child.props.d.length > 30));
    }
});

test("a partially loaded server keeps a readable name for its report flow", () => {
    const { plugin, opened } = fixture();
    const children = [];
    plugin.contextMenus["guild-context"](children, { guild: { id: guild.id } });
    entries(children)[0].props.action();
    assert.equal(opened[0].id, guild.id);
    assert.equal(opened[0].name, "Serveur Discord");
});
