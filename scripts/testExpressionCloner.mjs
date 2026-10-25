/* SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = join(root, "src/plugins/expressionCloner/index.tsx");
const source = await readFile(file, "utf8");
const bundled = await build({ stdin: {
    contents: source + "\nexport { getGuildCandidates, getGuildMaxEmojiSlots, validateName, CloneModal, buildMenuItem, doClone, isGifUrl };",
    loader: "tsx", resolveDir: dirname(file), sourcefile: file
}, bundle: true, write: false, format: "cjs", platform: "node", plugins: [{ name: "discord-stubs", setup(builder) {
    builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, external: true }));
} }] });

const guild = (id, changes = {}) => ({ id, name: "Guild " + id, ownerId: "someone", features: new Set(), premiumTier: 0, premiumFeatures: { additionalEmojiSlots: 0 }, ...changes });
const emoji = changes => ({ t: "Emoji", id: "123456789012345678", name: "sample", isAnimated: false, ...changes });

function fixture() {
    const state = { guilds: {}, emojis: {}, stickers: {}, permissions: new Set(), permissionErrors: new Set(), user: { id: "me" }, uploads: [], fetches: [], toasts: [], hooks: [], hookIndex: 0, modal: null, closeCount: 0, readError: false };
    const React = {
        Fragment: "Fragment",
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useState(initial) {
            const key = state.hookIndex++;
            if (!(key in state.hooks)) state.hooks[key] = typeof initial === "function" ? initial() : initial;
            return [state.hooks[key], next => { state.hooks[key] = typeof next === "function" ? next(state.hooks[key]) : next; }];
        },
        useRef(initial) { return React.useState(() => ({ current: initial }))[0]; },
        useReducer(reducer, initial) { const [value, update] = React.useState(initial); return [value, action => update(previous => reducer(previous, action))]; },
        useMemo: fn => fn()
    };
    const uploadEmoji = async value => { state.uploads.push(value); };
    const permission = (_bit, candidate) => {
        if (state.permissionErrors.has(candidate.id)) throw new Error("Store unavailable");
        return state.permissions.has(candidate.id);
    };
    const aliases = {
        "@api/ContextMenu": { findGroupChildrenByChildId: (_id, children) => children },
        "@api/Settings": { migratePluginSettings: () => {} },
        "@components/BaseText": { BaseText: "BaseText" },
        "@components/Button": { Button: "Button" },
        "@components/Flex": { Flex: "Flex" },
        "@components/Heading": { Heading: "Heading" },
        "@components/Paragraph": { Paragraph: "Paragraph" },
        "@utils/constants": { Devs: { Ven: {}, Nuckyz: {} } },
        "@utils/discord": { getGuildAcronym: value => value.name.slice(0, 2), hasGuildFeature: (value, feature) => value.features?.has(feature) ?? false },
        "@utils/Logger": { Logger: class { error() {} } },
        "@utils/modal": {
            ModalRoot: "ModalRoot", ModalHeader: "ModalHeader", ModalContent: "ModalContent", ModalFooter: "ModalFooter", ModalSize: { MEDIUM: "medium" },
            openModalLazy: async factory => { state.modal = await factory(); return "modal-key"; }
        },
        "@utils/types": { __esModule: true, default: value => value },
        "@vencord/discord-types/enums": { StickerFormatType: { PNG: 1, APNG: 2, LOTTIE: 3, GIF: 4 } },
        "@webpack": { findByCodeLazy: (...codes) => {
            assert.deepEqual(codes, [".GUILD_EMOJIS(", "EMOJI_UPLOAD_START"], "No brittle emoji-capacity webpack lookup");
            return uploadEmoji;
        } },
        "@webpack/common": {
            React, TextInput: "TextInput", Tooltip: "Tooltip", Menu: { MenuItem: "MenuItem" },
            UserStore: { getCurrentUser: () => state.user },
            GuildStore: { getGuilds: () => state.guilds, getGuild: id => state.guilds[id] },
            EmojiStore: { getGuildEmoji: id => state.emojis[id] },
            StickersStore: { getStickersByGuildId: id => state.stickers[id] },
            PermissionStore: { can: permission }, PermissionsBits: { CREATE_GUILD_EXPRESSIONS: 1n },
            Constants: { Endpoints: { GUILD_STICKER_PACKS: id => `/guilds/${id}/stickers` } },
            FluxDispatcher: { dispatch: () => {} }, RestAPI: { post: async () => { throw new Error("Unexpected Discord REST call"); } },
            IconUtils: { getGuildIconURL: () => "https://example.test/icon.png" },
            Toasts: { show: value => state.toasts.push(value), Type: { SUCCESS: "success", FAILURE: "failure" }, genId: () => "toast" }
        }
    };
    const module = { exports: {} };
    vm.runInNewContext(bundled.outputFiles[0].text, {
        module, exports: module.exports, require: name => { assert(name in aliases, name); return aliases[name]; }, URL, Error,
        location: { protocol: "https:", origin: "https://discord.com" }, window: { GLOBAL_ENV: { CDN_HOST: "cdn.discordapp.com", MEDIA_PROXY_ENDPOINT: "https://media.discordapp.net" } },
        fetch: async url => { state.fetches.push(url); await state.fetchHold?.(); return { ok: true, blob: async () => ({ size: 100 }) }; },
        FileReader: class {
            readAsDataURL() { if (state.readError) this.onerror(); else { this.result = "data:image/png;base64,fixture"; this.onload(); } }
        }
    });
    const exports = module.exports;
    return { state, exports, render: data => { state.hookIndex = 0; return exports.CloneModal({ data }); } };
}

function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    const nested = tree.type === "Tooltip" ? tree.props.children[0]({}) : tree.props?.children;
    return [tree, ...nodes(nested)];
}
const texts = tree => {
    if (typeof tree === "string") return tree;
    if (!tree || typeof tree !== "object") return "";
    if (Array.isArray(tree)) return tree.map(texts).join(" ");
    return texts(tree.props?.children);
};
const cloneButtons = tree => nodes(tree).filter(node => node.type === "button");

test("modal uses explicit header, scrollable content and a working close button", async () => {
    const f = fixture();
    await f.exports.buildMenuItem("Emoji", () => emoji()).props.action();
    const modal = f.state.modal({ transitionState: 1, onClose: () => f.state.closeCount++ });
    assert.equal(modal.type, "ModalRoot");
    assert.match(texts(nodes(modal).find(node => node.type === "ModalHeader")), /Clone\s+sample/);
    const content = nodes(modal).find(node => node.type === "ModalContent");
    assert.equal(content.props.style.maxHeight, "60vh");
    nodes(modal).find(node => node.type === "ModalFooter").props.children[0].props.onClick();
    assert.equal(f.state.closeCount, 1);
});

test("emoji name is prefilled and sanitized without changing the source expression", () => {
    const f = fixture();
    const data = emoji({ name: "hello~2" });
    const input = nodes(f.render(data)).find(node => node.type === "TextInput");
    assert.equal(input.props.value, "hello");
    assert.equal(input.props.error, undefined);
    input.props.onChange("renamed");
    assert.equal(nodes(f.render(data)).find(node => node.type === "TextInput").props.value, "renamed");
    assert.equal(data.name, "hello~2");
});

test("empty candidate list explains permissions and capacity instead of a blank modal", () => {
    const f = fixture();
    f.state.guilds = { a: guild("a") };
    const tree = f.render(emoji());
    assert.equal(cloneButtons(tree).length, 0);
    assert.match(texts(tree), /No server is currently available/);
    assert.match(texts(tree), /Create Expressions permission/);
    f.state.permissions.add("a");
    nodes(tree).find(node => node.type === "Button").props.onClick();
    assert.equal(cloneButtons(f.render(emoji())).length, 1);
});

test("native permission checker handles permitted members and owners, but never unrelated guilds", () => {
    const f = fixture();
    f.state.guilds = { own: guild("own", { ownerId: "me" }), allowed: guild("allowed"), denied: guild("denied") };
    f.state.permissions.add("allowed");
    assert.deepEqual(Array.from(f.exports.getGuildCandidates(emoji()).guilds, item => item.id), ["allowed", "own"]);
    f.state.user = undefined;
    assert.equal(f.exports.getGuildCandidates(emoji()).guilds.length, 0);
});

test("emoji capacity comes from guild data, with managed and animated emojis counted separately", () => {
    const f = fixture();
    f.state.guilds = { normal: guild("normal", { ownerId: "me" }), extra: guild("extra", { ownerId: "me", premiumFeatures: { additionalEmojiSlots: 100 } }) };
    f.state.emojis.normal = Array.from({ length: 50 }, () => ({ animated: false, managed: false }));
    f.state.emojis.extra = [...f.state.emojis.normal, ...Array.from({ length: 200 }, () => ({ animated: false, managed: true }))];
    assert.deepEqual(Array.from(f.exports.getGuildCandidates(emoji()).guilds, item => item.id), ["extra"]);
    assert.equal(f.exports.getGuildCandidates(emoji({ isAnimated: true })).guilds.length, 2);
    assert.equal(f.exports.getGuildMaxEmojiSlots(guild("featured", { features: new Set(["MORE_EMOJI"]) })), 200);
    assert.equal(f.exports.getGuildMaxEmojiSlots(guild("uncached", { premiumFeatures: undefined })), 50);
});

test("an absent emoji cache and a broken guild entry do not crash all candidates", () => {
    const f = fixture();
    f.state.guilds = { empty: guild("empty", { ownerId: "me" }), bad: guild("bad") };
    f.state.permissionErrors.add("bad");
    const result = f.exports.getGuildCandidates(emoji());
    assert.equal(result.guilds[0].id, "empty");
    assert.equal(result.unavailable, true);
    assert.match(texts(f.render(emoji())), /Some servers could not be loaded/);
});

test("valid name boundaries are inclusive and invalid visible input disables clone actions", async () => {
    const f = fixture();
    assert.equal(f.exports.validateName("Emoji", "ab"), true);
    assert.equal(f.exports.validateName("Emoji", "a".repeat(32)), true);
    assert.equal(f.exports.validateName("Sticker", "ab"), true);
    assert.equal(f.exports.validateName("Sticker", "a".repeat(30)), true);
    for (const name of ["a", "a".repeat(33), "two words", ""]) assert.equal(typeof f.exports.validateName("Emoji", name), "string");
    f.state.guilds = { a: guild("a", { ownerId: "me" }) };
    const data = emoji();
    nodes(f.render(data)).find(node => node.type === "TextInput").props.onChange("invalid name");
    const button = cloneButtons(f.render(data))[0];
    assert.equal(button.props.disabled, true);
    await button.props.onClick();
    assert.equal(f.state.fetches.length, 0);
    assert.equal(f.state.uploads.length, 0);
});

test("clone button is keyboard accessible and a duplicate click cannot double upload", async () => {
    const f = fixture();
    f.state.guilds = { a: guild("a", { ownerId: "me" }) };
    let release;
    f.state.fetchHold = () => new Promise(resolve => { release = resolve; });
    const button = cloneButtons(f.render(emoji()))[0];
    assert.equal(button.type, "button");
    assert.equal(button.props.type, "button");
    const first = button.props.onClick();
    await button.props.onClick();
    assert.equal(f.state.fetches.length, 1);
    release();
    await first;
    assert.equal(f.state.uploads.length, 1);
    assert.equal(f.state.toasts.at(-1).type, "success");
});

test("revoked permissions during image loading cancel the upload and report failure", async () => {
    const f = fixture();
    f.state.guilds = { a: guild("a") }; f.state.permissions.add("a");
    f.state.fetchHold = async () => { f.state.permissions.delete("a"); };
    await f.exports.doClone("a", emoji());
    assert.equal(f.state.uploads.length, 0);
    assert.equal(f.state.toasts.at(-1).type, "failure");
    assert.match(f.state.toasts.at(-1).message, /no longer available/);
});

test("FileReader errors settle the clone instead of leaving the modal permanently busy", async () => {
    const f = fixture();
    f.state.guilds = { a: guild("a", { ownerId: "me" }) }; f.state.readError = true;
    const data = emoji();
    await cloneButtons(f.render(data))[0].props.onClick();
    assert.equal(cloneButtons(f.render(data))[0].props.disabled, false);
    assert.equal(f.state.uploads.length, 0);
    assert.equal(f.state.toasts.at(-1).type, "failure");
});

test("message menus tolerate missing reactions, missing message data and missing image URLs", () => {
    const f = fixture();
    const patch = f.exports.default.contextMenus.message;
    assert.doesNotThrow(() => patch([], { favoriteableId: "123456789012345678", favoriteableType: "emoji" }));
    const children = [];
    patch(children, { favoriteableId: "123456789012345678", favoriteableType: "emoji", message: { content: "<:sample:123456789012345678>" } });
    assert.equal(children.length, 1);
    for (const url of [undefined, null, "", "http://["]) assert.equal(f.exports.isGifUrl(url), false);
    assert.equal(f.exports.isGifUrl("https://cdn.discordapp.com/emojis/1.gif"), true);
});

test("picker context from a nested image uses its expression button's metadata", async () => {
    const f = fixture();
    const wrapper = { dataset: { id: "123456789012345678", name: "wave", type: "emoji" }, querySelector: () => ({ src: "https://cdn.discordapp.com/emojis/1.gif" }) };
    const children = [];
    f.exports.default.contextMenus["expression-picker"](children, { target: { closest: () => wrapper } });
    await children[0].props.action();
    assert.match(texts(f.state.modal({ transitionState: 1, onClose() {} })), /Clone\s+wave/);
});
