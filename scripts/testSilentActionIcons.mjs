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

const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
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

function fixture(path) {
    const popovers = new Map();
    const calls = [];
    const unexpectedCall = (...args) => { calls.push(args); throw new Error("No Discord action expected in icon test"); };
    const messageActions = { startEditMessage: unexpectedCall, editMessage: unexpectedCall, deleteMessage: unexpectedCall };
    const dependencies = {
        "@api/Commands": { ApplicationCommandInputType: {}, ApplicationCommandOptionType: {}, sendBotMessage: unexpectedCall },
        "@api/ContextMenu": { findGroupChildrenByChildId: (_id, children) => children },
        "@api/MessagePopover": {
            addMessagePopoverButton: (name, render, icon) => popovers.set(name, { render, icon }),
            removeMessagePopoverButton: name => popovers.delete(name)
        },
        "@api/Settings": { definePluginSettings: settings => ({ store: Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value.default])) }) },
        "@components/Icons": icons,
        "@utils/types": { __esModule: true, default: plugin => plugin, OptionType: {} },
        "@utils/silentMessageAttachments": { preserveSilentAttachments: unexpectedCall, assertPreservedAttachments: unexpectedCall },
        "@webpack": { findByPropsLazy: () => messageActions },
        "@webpack/common": {
            ChannelStore: { getChannel: id => ({ id }) }, UserStore: { getCurrentUser: () => ({ id: "me" }) },
            Constants: { Endpoints: {} }, Menu: { MenuItem: "MenuItem" }, MessageStore: { getMessage: unexpectedCall },
            RestAPI: { get: unexpectedCall, post: unexpectedCall, del: unexpectedCall }, showToast: unexpectedCall, Toasts: { Type: {} }
        },
        "./autoTranslateMidnightcord": { t: value => value },
        "../autoTranslateMidnightcord": { t: value => value }
    };
    return { plugin: load(path, dependencies).default, popovers, calls };
}

function renderIcon(Icon, props = {}) {
    let result = createElement(Icon, props);
    while (typeof result.type === "function") result = result.type(result.props);
    return result;
}

const cases = [
    { name: "SilentEdit", path: "../src/midnightcordplugins/silentEdit.tsx", id: "silent-edit", icon: icons.PencilIcon },
    { name: "SilentDelete", path: "../src/midnightcordplugins/silentDelete/index.tsx", id: "silent-delete", icon: icons.DeleteIcon }
];
const message = { id: "message", channel_id: "channel", author: { id: "me" }, content: "Example", attachments: [] };

for (const item of cases) {
    test(`${item.name}: both Discord menu renderers receive one visible left-hand icon`, () => {
        const { plugin, calls } = fixture(item.path);
        const children = [];
        plugin.contextMenus.message(children, { message });
        assert.equal(children.length, 1);
        const { props } = children[0];
        assert.equal(props.id, item.id);
        // These two branches match Discord's cached MenuItem implementation: modern menus
        // use leadingAccessory and ignore icon; legacy menus use iconLeft (and icon at right).
        const modern = props.leadingAccessory?.type === "icon" ? props.leadingAccessory.icon : undefined;
        const legacy = props.iconLeft;
        assert.equal(modern, item.icon);
        assert.equal(legacy, item.icon);
        assert.equal(props.icon, undefined, "Do not duplicate the icon on the right in legacy menus");
        for (const Icon of [modern, legacy]) {
            const svg = renderIcon(Icon, { className: "discord-menu-icon", width: 24, height: 24, "aria-hidden": true });
            assert.equal(svg.type, "svg");
            assert.equal(svg.props.width, 24);
            assert.equal(svg.props.height, 24);
            assert.equal(svg.props.viewBox, "0 0 24 24");
            assert(svg.props.className.includes("discord-menu-icon"), "Preserve Discord's icon class");
            assert.equal(svg.props["aria-hidden"], true);
            assert(svg.props.children.flat(Infinity).some(child => child?.type === "path" && child.props.d.length > 30));
        }
        assert.equal(calls.length, 0);
    });

    test(`${item.name}: message hover icon and registration survive the menu compatibility fix`, () => {
        const { plugin, popovers, calls } = fixture(item.path);
        plugin.start();
        const registration = popovers.get(item.name);
        assert.equal(registration.icon, item.icon);
        const entry = registration.render(message);
        assert.equal(entry.icon, item.icon);
        assert.equal(typeof entry.onClick, "function");
        assert.equal(renderIcon(entry.icon, { width: 24, height: 24 }).type, "svg");
        plugin.stop();
        assert.equal(popovers.size, 0);
        assert.equal(calls.length, 0);
    });

    test(`${item.name}: another user's message does not get silent actions`, () => {
        const { plugin, popovers, calls } = fixture(item.path);
        const other = { ...message, author: { id: "someone-else" } };
        const children = [];
        plugin.contextMenus.message(children, { message: other });
        assert.equal(children.length, 0);
        plugin.start();
        assert.equal(popovers.get(item.name).render(other), null);
        plugin.stop();
        assert.equal(calls.length, 0);
    });
}
