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

const source = readFileSync(new URL("../src/midnightcordplugins/gifTeams/favorites.ts", import.meta.url), "utf8");
const code = transformSync(source, { loader: "ts", format: "cjs" }).code;
const previewCode = transformSync(readFileSync(new URL("../src/midnightcordplugins/gifTeams/preview.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const previewModule = { exports: {} };
runInNewContext(previewCode, { module: previewModule, exports: previewModule.exports, URL });
const previewApi = previewModule.exports;
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

// Discord's current FavoriteGIF protobuf: enum format, string src, uint32
// width/height/order. FavoriteGIFs stores map entries and hideTooltip.
function protobufSize(values) {
    const varint = n => { let size = 1; while (n >= 128) { size++; n = Math.floor(n / 128); } return size; };
    const string = value => { const bytes = Buffer.byteLength(value); return varint(bytes) + bytes; };
    let size = values.hideTooltip ? 2 : 0;
    for (const [url, gif] of Object.entries(values.gifs)) {
        let item = gif.src ? 1 + string(gif.src) : 0;
        for (const key of ["format", "width", "height", "order"]) if (gif[key]) item += 1 + varint(gif[key]);
        const entry = 1 + string(url) + 1 + varint(item) + item;
        size += 1 + varint(entry) + entry;
    }
    return size;
}

function fixture({ delayedStores = false } = {}) {
    const ready = deferred();
    const state = {
        user: { id: "1337883355840118887", username: "account", globalName: "Display name" },
        loaded: false, typeChecks: [], loadCalls: 0, reads: 0, drafts: [], snapshot: {},
        favoriteListeners: new Set(), userListeners: new Set(), updates: [], commits: 0, binarySizes: []
    };
    const store = {
        hasLoaded(type) { state.typeChecks.push(type); return state.loaded; },
        get frecencyWithoutFetchingLatest() { state.reads++; return state.snapshot; },
        addChangeListener(listener) { state.favoriteListeners.add(listener); },
        removeChangeListener(listener) { state.favoriteListeners.delete(listener); }
    };
    const users = {
        getCurrentUser: () => state.user,
        addChangeListener(listener) { state.userListeners.add(listener); },
        removeChangeListener(listener) { state.userListeners.delete(listener); }
    };
    const common = {
        UserSettingsActionCreators: { FrecencyUserSettingsActionCreators: { type: "native-frecency-settings", async loadIfNecessary() {
            state.loadCalls++;
            await state.hold?.();
            if (state.loadError) throw state.loadError;
        }, getCurrentValue: () => state.snapshot, async updateAsync(section, callback, seconds) {
            state.updates.push({ section, seconds });
            await state.updateHold?.();
            const values = clone(state.snapshot.favoriteGifs ?? { gifs: {}, hideTooltip: false });
            const accepted = callback(values) !== false;
            if (state.updateError) throw state.updateError;
            if (accepted && !state.ignoreCommit) {
                state.snapshot.favoriteGifs = values;
                state.commits++;
                for (const listener of state.favoriteListeners) listener();
            }
            state.afterCommit?.();
        } } },
        UserSettingsProtoStore: delayedStores ? undefined : store,
        UserStore: delayedStores ? undefined : users
    };
    const nativeProtos = [
        { typeName: "discord_protos.discord_users.v1.FavoriteGIFs", toBinary: values => {
            const length = protobufSize(values);
            state.binarySizes.push(length);
            return { length };
        } },
        { typeName: "discord_protos.discord_users.v1.FavoriteGIF", create: fields => ({ format: 0, src: "", width: 0, height: 0, order: 0, ...fields }) }
    ];
    const dependencies = {
        "./preview": previewApi,
        "@utils/discord": { insertTextIntoChatInputBox: text => state.drafts.push(text) },
        "@webpack": { onceReady: ready.promise, findLazy: predicate => nativeProtos.find(predicate), findByPropsLazy: () => ({ INFREQUENT_USER_ACTION: 0 }) }, "@webpack/common": common
    };
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, Error, URL, DOMException,
        require(name) { assert(Object.hasOwn(dependencies, name), name); return dependencies[name]; }
    });
    return {
        api: module.exports, state,
        async resolveReady() { common.UserSettingsProtoStore = store; common.UserStore = users; ready.resolve(); await ready.promise; await Promise.resolve(); },
        emitFavorites() { for (const callback of state.favoriteListeners) callback(); },
        emitUser() { for (const callback of state.userListeners) callback(); }
    };
}

test("native favorite normalization preserves GIFs and videos, order and safe metadata only", () => {
    const { api } = fixture();
    const favorites = clone(api.normalizeFavorites({
        "https://tenor.com/view/older": { format: 1, src: "https://media.tenor.com/older/a.gif", order: 1, width: 320.4, height: 240, title: " old\u0000 title " },
        "https://tenor.com/view/video": { format: 2, src: "https://media.tenor.com/video/a.mp4", order: 4, width: 480, height: 270, title: "video" },
        "https://cdn.discordapp.com/attachments/file": { format: 0, src: "https://example.com/file#encoded-FavouriteAnything-file", order: 9 },
        "https://tenor.com/view/unknown": { format: 99, src: "https://media.tenor.com/unknown/a.gif", order: 8 },
        "https://tenor.com/view/broken": null
    }));
    assert.deepEqual(favorites.map(gif => gif.url), ["https://tenor.com/view/video", "https://tenor.com/view/older"]);
    assert.equal(favorites[0].format, 2);
    assert.equal(favorites[0].src, "https://media.tenor.com/video/a.mp4");
    assert.equal(favorites[1].width, 320);
    assert.equal(favorites[1].title, "old title");
    assert.equal(Object.hasOwn(favorites[0], "order"), false);
});

const twitterGif = "https://gif.fxtwitter.com/tweet_video/HQoRP4IbwAAzfCG.webp";
test("old fxtwitter favorites recover their direct preview and image format without changing their saved native entry", () => {
    const { api } = fixture();
    const old = { [twitterGif]: { src: "", format: 2, width: 320, height: 180, order: 3 } };
    const before = clone(old);
    const [normalized] = api.normalizeFavorites(old);
    assert.equal(normalized.url, twitterGif);
    assert.equal(normalized.src, twitterGif);
    assert.equal(normalized.format, 1);
    assert.deepEqual(old, before, "Read normalization must not silently rewrite personal favorites");
});

test("known media extensions override obsolete formats while opaque previews preserve their native format", () => {
    for (const extension of ["gif", "webp", "avif", "png", "jpg", "jpeg"]) {
        const src = `https://media.tenor.com/media/image.${extension.toUpperCase()}?download=clip.mp4#fragment`;
        assert.deepEqual(clone(previewApi.resolveGifPreview({ url: "https://tenor.com/view/item", src, format: 2 })), { src: src.replace("#fragment", ""), format: 1 });
    }
    for (const extension of ["mp4", "webm"]) {
        const src = `https://media.tenor.com/media/video.${extension}?v=1`;
        assert.deepEqual(clone(previewApi.resolveGifPreview({ url: "https://tenor.com/view/item", src, format: 1 })), { src, format: 2 });
    }
    const opaque = "https://media.tenor.com/opaque?filename=video.mp4";
    assert.equal(previewApi.resolveGifPreview({ url: "https://tenor.com/view/item", src: opaque, format: 2 }).format, 2);
    assert.equal(previewApi.resolveGifPreview({ url: "https://tenor.com/view/item", src: opaque, format: 1 }).format, 1);
});

test("implicit previews require a direct media URL on an exact approved host", () => {
    assert.deepEqual(clone(previewApi.resolveGifPreview({ url: twitterGif, src: "", format: 2 })), { src: twitterGif, format: 1 });
    for (const url of [
        "https://tenor.com/view/a", "https://tenor.com/view/a.gif", "https://giphy.com/gifs/page",
        "https://gif.fxtwitter.com/opaque", "https://gif.fxtwitter.com/page?file=image.webp",
        "https://gif.fxtwitter.com.evil.example.net/a.webp", "https://sub.gif.fxtwitter.com/a.webp",
        "https://images.fxtwitter.com/a.webp", "https://fxtwitter.com/a.webp", "https://arbitrary.example.net/a.gif"
    ]) assert.equal(previewApi.resolveGifPreview({ url, src: "", format: 2 }), null, url);
    assert.equal(previewApi.resolveGifPreview({ url: "https://tenor.com/view/a", src: "https://arbitrary.example.net/a.gif", format: 1 }), null);
});

const sharedGif = name => ({ url: `https://tenor.com/view/${name}`, src: `https://media.tenor.com/${name}/tenor.gif`, format: 1, width: 320, height: 240 });
const importFor = (f, gifs, signal = new AbortController().signal) => f.api.importSharedFavorites(gifs, f.state.user.id, signal);

test("native import accepts old fxtwitter snapshots and persists corrected image or video formats", async () => {
    const f = fixture();
    f.state.loaded = true;
    const webp = { url: twitterGif, src: "", format: 2, width: 320, height: 180 };
    const jpeg = { ...sharedGif("jpeg"), src: "https://cdn.discordapp.com/attachments/reaction.jpeg", format: 2 };
    const mp4 = { ...sharedGif("mp4"), src: "https://media.tenor.com/reaction.mp4", format: 1 };
    const result = clone(await importFor(f, [webp, jpeg, mp4]));
    assert.deepEqual(result.addedUrls, [twitterGif, jpeg.url, mp4.url]);
    assert.deepEqual(result.skippedUrls, []);
    const saved = f.state.snapshot.favoriteGifs.gifs;
    assert.equal(saved[twitterGif].src, twitterGif);
    assert.equal(saved[twitterGif].format, 1);
    assert.equal(saved[jpeg.url].format, 1);
    assert.equal(saved[mp4.url].format, 2);
    const original = clone(saved[twitterGif]);
    await importFor(f, [{ ...webp, src: "https://media.tenor.com/different.mp4" }]);
    assert.deepEqual(saved[twitterGif], original, "Already owned native favorites remain untouched");
});

test("shared GIF imports use one native update and preserve every existing entry and its order", async () => {
    const f = fixture();
    f.state.loaded = true;
    const existing = { format: 1, src: "https://media.tenor.com/existing/tenor.gif", width: 100, height: 80, order: 7, extensionMetadata: { retain: true } };
    const file = { format: 0, src: "https://cdn.discordapp.com/attachments/file#favourite-anything", width: 100, height: 80, order: 12, custom: "leave alone" };
    f.state.snapshot = { favoriteGifs: { gifs: { "https://tenor.com/view/existing": clone(existing), "https://cdn.discordapp.com/attachments/file": clone(file) }, hideTooltip: false, untouched: "keep" } };
    const result = clone(await importFor(f, [sharedGif("first"), sharedGif("existing"), sharedGif("second"), { ...sharedGif("first"), url: "https://tenor.com/view/first#duplicate" }]));
    assert.deepEqual(result.addedUrls, [sharedGif("first").url, sharedGif("second").url]);
    assert.deepEqual(result.existingUrls, [sharedGif("existing").url]);
    assert.deepEqual(result.skippedUrls, []);
    assert.deepEqual(f.state.updates, [{ section: "favoriteGifs", seconds: 0 }]);
    assert.equal(f.state.commits, 1);
    const saved = f.state.snapshot.favoriteGifs;
    assert.deepEqual(saved.gifs["https://tenor.com/view/existing"], existing);
    assert.deepEqual(saved.gifs["https://cdn.discordapp.com/attachments/file"], file);
    assert.equal(saved.gifs[sharedGif("first").url].order, 13);
    assert.equal(saved.gifs[sharedGif("second").url].order, 14);
    assert.equal(saved.hideTooltip, true);
    assert.equal(saved.untouched, "keep");
});

test("unsafe or unsupported shared previews never enter native favorites", async () => {
    const f = fixture();
    f.state.loaded = true;
    const result = clone(await importFor(f, [
        { ...sharedGif("unsafe"), url: "https://127.0.0.1/private" },
        { ...sharedGif("unknown"), src: "https://tracking.example.com/a.gif" },
        { ...sharedGif("missing"), src: "" },
        { ...sharedGif("file"), format: 0 },
        { ...sharedGif("broken"), width: 0 },
        { ...sharedGif("large"), height: 1e20 },
        { ...sharedGif("video"), src: "https://media.tenor.com/video/tenor.mp4", format: 2 }
    ]));
    assert.deepEqual(result.addedUrls, [sharedGif("video").url]);
    assert.equal(result.skipped.length, 6);
    assert.equal(result.skipped.filter(item => item.reason === "unsupported_preview").length, 2);
    assert.equal(f.state.snapshot.favoriteGifs.gifs[sharedGif("video").url].format, 2);
    assert.equal(Object.keys(f.state.snapshot.favoriteGifs.gifs).length, 1);
});

test("native capacity rejects overflowing entries while preserving existing favorites and accepting smaller ones", async () => {
    const f = fixture();
    f.state.loaded = true;
    const legacyUrl = "https://cdn.discordapp.com/attachments/legacy";
    const legacy = { format: 0, src: "x".repeat(762_400), width: 0, height: 0, order: 9 };
    f.state.snapshot = { favoriteGifs: { gifs: { [legacyUrl]: legacy }, hideTooltip: false } };
    const big = { ...sharedGif("too-large"), src: "https://media.tenor.com/" + "x".repeat(900) + ".gif" };
    const result = clone(await importFor(f, [big, sharedGif("fits")]));
    assert.deepEqual(result.addedUrls, [sharedGif("fits").url]);
    assert.deepEqual(result.skipped, [{ url: big.url, reason: "capacity" }]);
    assert(f.state.binarySizes.some(size => size > 762_880));
    assert(protobufSize(f.state.snapshot.favoriteGifs) <= 762_880);
    assert.deepEqual(f.state.snapshot.favoriteGifs.gifs[legacyUrl], legacy);
});

test("batch and uint32 order bounds never renumber or replace old favorites", async () => {
    const f = fixture();
    f.state.loaded = true;
    const inputs = Array.from({ length: 103 }, (_, index) => sharedGif(`batch-${index}`));
    const first = clone(await importFor(f, inputs));
    assert.equal(first.addedUrls.length, 100);
    assert.equal(first.skipped.filter(item => item.reason === "batch_limit").length, 3);
    const second = clone(await importFor(f, inputs));
    assert.equal(second.existingUrls.length, 100);
    assert.equal(second.addedUrls.length, 3);
    f.state.snapshot.favoriteGifs.gifs[inputs[0].url].order = 0xffffffff;
    const saturated = clone(await importFor(f, [sharedGif("no-order-space")]));
    assert.deepEqual(saturated.skipped, [{ url: sharedGif("no-order-space").url, reason: "order_limit" }]);
    assert.equal(f.state.snapshot.favoriteGifs.gifs[inputs[0].url].order, 0xffffffff);
    assert.equal(f.state.commits, 2);
});

test("native imports fail closed for unloaded or malformed favorite settings", async () => {
    const f = fixture();
    await assert.rejects(importFor(f, [sharedGif("first")]), /chargement/);
    assert.equal(f.state.updates.length, 0);
    f.state.loaded = true;
    f.state.snapshot = { favoriteGifs: { gifs: [] } };
    await assert.rejects(importFor(f, [sharedGif("first")]), /format/);
    assert.equal(f.state.commits, 0);
});

test("account changes and cancellation are checked again inside Discord's asynchronous mutator", async () => {
    for (const stage of ["initial-load", "native-update"]) {
        for (const change of ["user", "abort"]) {
            const f = fixture();
            f.state.loaded = true;
            const gate = deferred();
            if (stage === "initial-load") f.state.hold = () => gate.promise;
            else f.state.updateHold = () => gate.promise;
            const abort = new AbortController();
            const pending = importFor(f, [sharedGif("must-not-save")], abort.signal);
            for (let i = 0; i < 10; i++) await Promise.resolve();
            if (change === "user") f.state.user = { id: "1395048695501688953", username: "other" };
            else abort.abort();
            gate.resolve();
            await assert.rejects(pending, { name: "AbortError" });
            assert.equal(f.state.commits, 0, `${change} during ${stage}`);
            assert.deepEqual(f.state.snapshot, {});
        }
    }
});

test("native imports merge at mutation time and acknowledge only the committed account snapshot", async () => {
    const f = fixture();
    f.state.loaded = true;
    const gate = deferred();
    f.state.updateHold = () => gate.promise;
    const pending = importFor(f, [sharedGif("shared")]);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const addedByUser = { ...sharedGif("personal"), order: 33 };
    f.state.snapshot.favoriteGifs = { gifs: { [addedByUser.url]: addedByUser }, hideTooltip: false };
    gate.resolve();
    assert.deepEqual(clone((await pending).addedUrls), [sharedGif("shared").url]);
    assert.deepEqual(f.state.snapshot.favoriteGifs.gifs[addedByUser.url], addedByUser);
    assert.equal(f.state.snapshot.favoriteGifs.gifs[sharedGif("shared").url].order, 34);

    f.state.ignoreCommit = true;
    const unconfirmed = clone(await importFor(f, [sharedGif("ignored")]));
    assert.deepEqual(unconfirmed.addedUrls, []);
    assert.deepEqual(unconfirmed.skipped, [{ url: sharedGif("ignored").url, reason: "unconfirmed" }]);
    f.state.afterCommit = () => { f.state.user = { id: "1395048695501688953", username: "other" }; };
    await assert.rejects(importFor(f, [sharedGif("late-user-change")]), { name: "AbortError" });
});

test("missing or unsupported previews do not discard a valid favorite or load third-party preview hosts", () => {
    const { api } = fixture();
    const favorites = clone(api.normalizeFavorites({
        "https://example.com/unknown.gif": { format: 1, src: "https://tracking.example.com/unique.gif", width: -1, height: 1e20 },
        "https://tenor.com/view/missing": { format: 1, src: undefined },
        "https://giphy.com/gifs/valid": { format: 1, src: "https://media2.giphy.com/media/id/giphy.gif", width: 200, height: 300 }
    }));
    assert.equal(favorites.length, 3);
    assert.equal(favorites[0].src, "");
    assert.equal(favorites[1].src, "");
    assert.equal(favorites[2].src, "https://media2.giphy.com/media/id/giphy.gif");
    assert.equal(favorites[0].width, 0);
    assert.equal(favorites[0].height, 0);
});

test("URL normalization excludes credentials, local destinations, IPs and non-HTTPS URLs", () => {
    const { api } = fixture();
    for (const url of [
        "http://tenor.com/view/one", "javascript:alert(1)", "https://u:p@tenor.com/view/one",
        "https://localhost/x", "https://127.0.0.1/x", "https://2130706433/x", "https://[::1]/x",
        "https://api.internal/x", "https://machine.home.arpa/x", "https://server.local/x", "https://example.com:8443/x",
        "https://tenor.com/" + "x".repeat(2048)
    ]) assert.equal(api.publicGifUrl(url), null, url);
    assert.equal(api.publicGifUrl("https://tenor.com/view/a#fragment"), "https://tenor.com/view/a");
    const items = clone(api.normalizeFavorites({
        "https://tenor.com/view/a#one": { format: 1, src: "https://media.tenor.com/a.gif", order: 2 },
        "https://tenor.com/view/a#two": { format: 1, src: "https://media.tenor.com/older.gif", order: 1 }
    }));
    assert.equal(items.length, 1);
    assert.equal(items[0].src, "https://media.tenor.com/a.gif");
});

test("a pending native settings load never yields an authoritative empty snapshot", async () => {
    const f = fixture();
    await assert.rejects(f.api.loadFavorites(), /chargement/);
    assert.equal(f.state.loadCalls, 1);
    assert.deepEqual(f.state.typeChecks, ["native-frecency-settings"]);
    assert.equal(f.state.reads, 0);
    f.state.loaded = true;
    assert.deepEqual(clone(await f.api.loadFavorites()), []);
    assert.equal(f.state.reads, 1);
});

test("native load errors and malformed loaded snapshots do not erase a remote collection", async () => {
    const f = fixture();
    f.state.loaded = true;
    f.state.loadError = Error("Native load rejected");
    await assert.rejects(f.api.loadFavorites(), /Native load rejected/);
    assert.equal(f.state.reads, 0);
    f.state.loadError = null;
    for (const gifs of ["bad", 123, []]) {
        f.state.snapshot = { favoriteGifs: { gifs } };
        await assert.rejects(f.api.loadFavorites(), undefined, `Malformed snapshot ${JSON.stringify(gifs)} must not look empty`);
    }
});

test("changing Discord accounts while native favorites load rejects the mixed snapshot", async () => {
    const f = fixture();
    const gate = deferred();
    f.state.hold = () => gate.promise;
    f.state.loaded = true;
    const pending = f.api.loadFavorites();
    f.state.user = { id: "1395048695501688953", username: "other" };
    gate.resolve();
    await assert.rejects(pending, /compte Discord a changé/);
    assert.equal(f.state.reads, 0);
    f.state.user = null;
    await assert.rejects(f.api.loadFavorites(), /Connectez-vous/);
});

test("store subscriptions report changes and detach cleanly on stop", () => {
    const f = fixture();
    let favorites = 0, users = 0;
    const stopFavorites = f.api.subscribeFavorites(() => favorites++);
    const stopUsers = f.api.subscribeUser(() => users++);
    assert.equal(favorites, 1);
    assert.equal(users, 1);
    f.emitFavorites(); f.emitUser();
    assert.equal(favorites, 2);
    assert.equal(users, 2);
    stopFavorites(); stopUsers();
    f.emitFavorites(); f.emitUser();
    assert.equal(favorites, 2);
    assert.equal(users, 2);
    assert.equal(f.state.favoriteListeners.size, 0);
    assert.equal(f.state.userListeners.size, 0);
});

test("late store availability attaches once, while an already stopped subscription stays detached", async () => {
    const f = fixture({ delayedStores: true });
    let changes = 0;
    const unsubscribe = f.api.subscribeFavorites(() => changes++);
    const stopUser = f.api.subscribeUser(() => { throw Error("Stopped callback cannot run"); });
    stopUser();
    assert.equal(changes, 0);
    await f.resolveReady();
    assert.equal(changes, 1);
    assert.equal(f.state.favoriteListeners.size, 1);
    assert.equal(f.state.userListeners.size, 0);
    unsubscribe();
});

test("selecting a GIF only inserts a safe URL into the draft and never sends a message", () => {
    const f = fixture();
    f.api.insertGif("https://tenor.com/view/reaction#unused");
    assert.deepEqual(f.state.drafts, ["https://tenor.com/view/reaction "]);
    for (const url of ["javascript:alert(1)", "https://127.0.0.1/private", "http://tenor.com/view/reaction"])
        assert.throws(() => f.api.insertGif(url));
    assert.equal(f.state.drafts.length, 1);
    assert.equal(f.state.loadCalls, 0);
    assert.equal(f.state.favoriteListeners.size, 0);
});
