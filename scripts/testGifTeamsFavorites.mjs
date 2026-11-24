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
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function fixture({ delayedStores = false } = {}) {
    const ready = deferred();
    const state = {
        user: { id: "1337883355840118887", username: "account", globalName: "Display name" },
        loaded: false, typeChecks: [], loadCalls: 0, reads: 0, drafts: [], snapshot: {},
        favoriteListeners: new Set(), userListeners: new Set()
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
        } } },
        UserSettingsProtoStore: delayedStores ? undefined : store,
        UserStore: delayedStores ? undefined : users
    };
    const dependencies = {
        "@utils/discord": { insertTextIntoChatInputBox: text => state.drafts.push(text) },
        "@webpack": { onceReady: ready.promise }, "@webpack/common": common
    };
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, Error, URL,
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
