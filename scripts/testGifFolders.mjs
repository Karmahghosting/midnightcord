/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const directory = new URL("../src/midnightcordplugins/gifTeams/", import.meta.url);
const compile = file => transformSync(readFileSync(file, "utf8"), { loader: "ts", format: "cjs" }).code;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const key = userId => `midnightcord-gif-folders-v1:${userId}`;
const alpha = { url: "https://tenor.com/view/alpha", src: "", width: 320, height: 240 };
const bravo = { ...alpha, url: "https://tenor.com/view/bravo" };
const userA = "1337883355840118887";
const userB = "1395048695501688953";
function evaluate(code, dependencies) {
    const module = { exports: {} };
    runInNewContext(code, {
        module, exports: module.exports, Error, DOMException, URL, TextEncoder, Uint8Array, ArrayBuffer, crypto: webcrypto, btoa,
        setTimeout, clearTimeout,
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; }
    });
    return module.exports;
}
const cloudCrypto = evaluate(compile(new URL("../src/api/SettingsSync/cloudCrypto.ts", import.meta.url)), {});
const favoritesApi = evaluate(compile(new URL("favorites.ts", directory)), {
    "@utils/discord": {}, "@webpack": { onceReady: Promise.resolve(), findLazy: () => ({}), findByPropsLazy: () => ({}) }, "@webpack/common": {}
});
const folderApi = evaluate(compile(new URL("folders.ts", directory)), {
    "@api/DataStore": {}, "@api/SettingsSync/cloudCrypto": cloudCrypto, "./favorites": favoritesApi
});
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
function fixture() {
    const state = { userId: userA, favorites: [alpha, bravo], readCount: 0, writeCount: 0, favoriteCount: 0 };
    const storage = new Map();
    const users = new Set();
    const favorites = new Set();
    let next = 0;
    const store = folderApi.createGifFolderStore({
        currentUserId: () => state.userId,
        favorites: async () => { state.favoriteCount++; await state.favoriteHold?.(); if (state.favoriteError) throw state.favoriteError; return clone(state.favorites); },
        subscribeUser: listener => { users.add(listener); return () => users.delete(listener); },
        subscribeFavorites: listener => { favorites.add(listener); return () => favorites.delete(listener); },
        read: async name => { state.readCount++; const value = clone(storage.get(name)); await state.readHold?.(); return value; },
        write: async (name, value) => { state.writeCount++; await state.writeHold?.(); if (state.writeError) throw state.writeError; storage.set(name, clone(value)); },
        newId: () => `folder-${++next}`
    });
    return {
        state, storage, store,
        async start() { store.start(); await store.refresh(); },
        notifyUser() { for (const listener of users) listener(); },
        notifyFavorites() { for (const listener of favorites) listener(); }
    };
}
async function binding(folderId, overrides = {}) {
    return { teamId: "team-one", teamName: "Amis", folderId, scope: await folderApi.folderIdentityScope("test-credential"), revision: 4, paused: null, ...overrides };
}

test("folder names and selections save atomically, preserve stable IDs and survive restart", async () => {
    const f = fixture();
    await f.start();
    const id = await f.store.create("Réactions", [alpha.url]);
    await f.store.update(id, { name: "Amis", urls: [bravo.url, bravo.url, "https://tenor.com/view/not-favorite"] });
    assert.deepEqual(clone(f.store.getSnapshot().folders), [{ id, name: "Amis", urls: [bravo.url] }]);
    f.store.stop();
    await f.start();
    assert.deepEqual(clone(f.store.getSnapshot().folders), [{ id, name: "Amis", urls: [bravo.url] }]);
    f.store.stop();
});

test("real identity digests and paused bindings survive restart without persisting credentials", async () => {
    const f = fixture();
    await f.start();
    const id = await f.store.create("Partagés", [alpha.url]);
    const saved = await binding(id, { paused: "Autre appareil" });
    await f.store.saveBinding(userA, saved);
    assert.equal(saved.scope.length, 43);
    assert(!JSON.stringify(f.storage.get(key(userA))).includes("test-credential"));
    f.store.stop();
    await f.start();
    assert.equal(f.store.getSnapshot().ready, true);
    assert.deepEqual(clone(f.store.getSnapshot().bindings), [saved]);
    await assert.rejects(f.store.remove(id), /Désactive d’abord/);
    await f.store.detachBinding(saved.teamId, saved.scope);
    await f.store.remove(id);
    assert.equal(f.store.getSnapshot().folders.length, 0);
    f.store.stop();
});

test("switching Discord accounts never reuses folders, even with identical names and GIFs", async () => {
    const f = fixture();
    await f.start();
    const idA = await f.store.create("Amis", [alpha.url]);
    f.state.userId = userB;
    f.notifyUser();
    assert.equal(f.store.getSnapshot().folders.length, 0);
    await f.store.refresh();
    const idB = await f.store.create("Amis", [alpha.url]);
    assert.notEqual(idA, idB);
    assert.deepEqual(clone(f.storage.get(key(userA)).folders), [{ id: idA, name: "Amis", urls: [alpha.url] }]);
    f.state.userId = userA;
    f.notifyUser();
    await f.store.refresh();
    assert.equal(f.store.getSnapshot().folders[0].id, idA);
    f.store.stop();
});

test("same-account UserStore notifications do not reload local data or disturb snapshots", async () => {
    const f = fixture();
    await f.start();
    const snapshot = f.store.getSnapshot();
    const reads = f.state.readCount;
    const favorites = f.state.favoriteCount;
    for (let i = 0; i < 50; i++) f.notifyUser();
    assert.equal(f.store.getSnapshot(), snapshot);
    assert.equal(f.state.readCount, reads);
    assert.equal(f.state.favoriteCount, favorites);
    f.store.stop();
});

test("failed favorite loading preserves folders and prevents an empty selection from replacing them", async () => {
    const f = fixture();
    await f.start();
    const id = await f.store.create("Amis", [alpha.url]);
    f.state.favoriteError = Error("Favoris indisponibles");
    await f.store.refresh();
    assert.equal(f.store.getSnapshot().favoritesReady, false);
    assert.throws(() => f.store.setUrls(id, []), /chargement/);
    await f.store.rename(id, "Copains");
    assert.deepEqual(clone(f.store.getSnapshot().folders), [{ id, name: "Copains", urls: [alpha.url] }]);
    f.store.stop();
});

test("persistence failure cannot partially rename a folder or change its selected GIFs", async () => {
    const f = fixture();
    await f.start();
    const id = await f.store.create("Avant", [alpha.url]);
    f.state.writeError = Error("Disque indisponible");
    await assert.rejects(f.store.update(id, { name: "Après", urls: [bravo.url] }), /Disque/);
    const expected = [{ id, name: "Avant", urls: [alpha.url] }];
    assert.deepEqual(clone(f.store.getSnapshot().folders), expected);
    assert.deepEqual(f.storage.get(key(userA)).folders, expected);
    f.store.stop();
});

test("corrupt persisted folders fail closed instead of being overwritten with an empty collection", async () => {
    const f = fixture();
    const corrupt = { version: 1, folders: [{ id: "bad", name: "Unsafe", urls: ["http://127.0.0.1/secret"] }], bindings: [] };
    f.storage.set(key(userA), corrupt);
    await f.start();
    assert.equal(f.store.getSnapshot().ready, false);
    assert(f.store.getSnapshot().error);
    assert.throws(() => f.store.create("New"), /chargement/);
    assert.deepEqual(f.storage.get(key(userA)), corrupt);
    assert.equal(f.state.writeCount, 0);
    f.store.stop();
});

test("a delayed storage response from the previous account cannot populate the new account", async () => {
    const f = fixture();
    f.storage.set(key(userA), { version: 1, folders: [{ id: "old", name: "Private A", urls: [alpha.url] }], bindings: [] });
    const hold = deferred();
    f.state.readHold = () => hold.promise;
    f.store.start();
    const old = f.store.refresh();
    f.state.userId = userB;
    f.state.readHold = null;
    f.notifyUser();
    await f.store.refresh();
    hold.resolve();
    await old;
    assert.equal(f.store.getSnapshot().userId, userB);
    assert.equal(f.store.getSnapshot().folders.length, 0);
    f.store.stop();
});

test("a write completed after account switching stays under the old key and cannot publish into the new account", async () => {
    const f = fixture();
    await f.start();
    const id = await f.store.create("A", [alpha.url]);
    const hold = deferred();
    const arrived = deferred();
    f.state.writeHold = () => { arrived.resolve(); return hold.promise; };
    const write = f.store.rename(id, "A saved");
    await arrived.promise;
    f.state.userId = userB;
    f.notifyUser();
    await f.store.refresh();
    hold.resolve();
    await assert.rejects(write, error => error.name === "AbortError");
    assert.equal(f.store.getSnapshot().userId, userB);
    assert.equal(f.store.getSnapshot().folders.length, 0);
    assert(!f.storage.has(key(userB)));
    f.store.stop();
});

test("a stale binding update cannot resurrect a detached binding or replace a newer revision", async () => {
    const f = fixture();
    await f.start();
    const id = await f.store.create("Amis");
    const initial = await binding(id);
    await f.store.saveBinding(userA, initial);
    assert.equal(await f.store.saveBinding(userA, { ...initial, revision: 5 }, 4), true);
    assert.equal(await f.store.saveBinding(userA, { ...initial, revision: 6 }, 4), false);
    assert.equal(f.store.getSnapshot().bindings[0].revision, 5);
    await f.store.detachBinding(initial.teamId, initial.scope);
    assert.equal(await f.store.saveBinding(userA, { ...initial, revision: 6 }, 5), false);
    assert.equal(f.store.getSnapshot().bindings.length, 0);
    f.store.stop();
});

test("folder edits emit sync notifications but saving binding revisions does not create a refresh loop", async () => {
    const f = fixture();
    await f.start();
    let edits = 0;
    f.store.subscribeEdits(() => edits++);
    const id = await f.store.create("Amis");
    assert.equal(edits, 1);
    const linked = await binding(id);
    await f.store.saveBinding(userA, linked);
    await f.store.saveBinding(userA, { ...linked, revision: 5 }, linked.revision);
    assert.equal(edits, 1);
    await f.store.setUrls(id, [alpha.url]);
    assert.equal(edits, 2);
    f.store.stop();
});
