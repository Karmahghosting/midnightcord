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
const controllerCode = transformSync(readFileSync(new URL("controller.ts", directory), "utf8"), { loader: "ts", format: "cjs" }).code;
const serviceCode = transformSync(readFileSync(new URL("service.ts", directory), "utf8"), { loader: "ts", format: "cjs" }).code;
const foldersCode = transformSync(readFileSync(new URL("folders.ts", directory), "utf8"), { loader: "ts", format: "cjs" }).code;
const importsCode = transformSync(readFileSync(new URL("imports.ts", directory), "utf8"), { loader: "ts", format: "cjs" }).code;
const cryptoCode = transformSync(readFileSync(new URL("../src/api/SettingsSync/cloudCrypto.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

function timers() {
    let nextId = 1;
    const timeouts = new Map();
    const intervals = new Map();
    return {
        timeouts, intervals,
        setTimeout(callback, ms) { const id = nextId++; timeouts.set(id, { callback, ms }); return id; },
        clearTimeout(id) { timeouts.delete(id); },
        setInterval(callback, ms) { const id = nextId++; intervals.set(id, { callback, ms }); return id; },
        clearInterval(id) { intervals.delete(id); },
        fireTimeouts() {
            const pending = [...timeouts.values()];
            timeouts.clear();
            for (const { callback } of pending) callback();
        }
    };
}

function evaluate(code, dependencies, extras = {}) {
    const module = { exports: {} };
    runInNewContext(code, {
        module, exports: module.exports, Error, TypeError, DOMException, AbortController, URL, URLSearchParams,
        TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto, btoa, atob,
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
        ...extras
    });
    return module.exports;
}

const cloudCrypto = evaluate(cryptoCode, {});

function serviceFixture(fetchImplementation = async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => "{}" })) {
    const clock = timers();
    const calls = [];
    const service = evaluate(serviceCode, {
        "@api/SettingsSync/cloudCrypto": cloudCrypto,
        "@api/SettingsSync/cloudSetup": { CLOUD_API_BASE: "https://api.midnightcord.fr/" }
    }, {
        ...clock,
        fetch: (url, init) => { calls.push({ url: String(url), init }); return fetchImplementation(url, init); }
    });
    return { service, clock, calls };
}

function gif(name) {
    return { url: `https://tenor.com/view/${name}`, src: `https://media.tenor.com/${name}/tenor.gif`, width: 320, height: 240, format: 1, title: name };
}
const alpha = gif("alpha");
const bravo = gif("bravo");
const charlie = gif("charlie");

function team(id = "team-one", mode = "off", gifs = []) {
    return { id, name: id, ownerId: "member-me", revision: 0, mode, gifs: clone(gifs), other: [] };
}

function fixture(initialTeams = [team()], favorites = [alpha, bravo], withFolders = false, withImports = false) {
    const clock = timers();
    const { service } = serviceFixture();
    const state = {
        userId: "1337883355840118887", token: "account-a", displayName: "Alice", connected: true,
        teams: new Map(initialTeams.map(item => [item.id, item])), favorites: clone(favorites), calls: [],
        sessions: [], identityCalls: [], loadCalls: 0, favoriteListeners: new Set(), userListeners: new Set(), imports: 0,
        nativeCalls: [], importEnabled: true, importListeners: new Set()
    };
    const emptyFavoriteModule = {
        getCurrentUser: () => { state.imports++; return null; },
        loadFavorites: () => { state.imports++; throw Error("Singleton must remain idle"); },
        subscribeFavorites: () => { state.imports++; }, subscribeUser: () => { state.imports++; },
        publicGifUrl: url => typeof url === "string" && url.startsWith("https://") ? url : null
    };
    const folderApi = evaluate(foldersCode, {
        "@api/DataStore": {}, "@api/SettingsSync/cloudCrypto": cloudCrypto, "./favorites": emptyFavoriteModule
    }, clock);
    const storage = new Map();
    const importApi = evaluate(importsCode, {
        "@api/DataStore": {}, "@api/SettingsSync/cloudCrypto": cloudCrypto, "./favorites": emptyFavoriteModule
    });
    const imports = importApi.createGifImportStore({
        currentUserId: () => state.userId,
        read: async key => clone(storage.get(key)),
        write: async (key, value) => {
            await state.importStorageHold?.();
            if (state.importStorageError) throw state.importStorageError;
            storage.set(key, clone(value));
        }
    });
    let folderId = 0;
    const folders = folderApi.createGifFolderStore({
        currentUserId: () => state.userId,
        favorites: async () => { if (state.favoritesError) throw state.favoritesError; return clone(state.favorites); },
        subscribeFavorites(callback) { state.favoriteListeners.add(callback); return () => state.favoriteListeners.delete(callback); },
        subscribeUser(callback) { state.userListeners.add(callback); return () => state.userListeners.delete(callback); },
        read: async key => clone(storage.get(key)),
        write: async (key, value) => { await state.storageHold?.(); storage.set(key, clone(value)); },
        newId: () => `folder-${++folderId}`
    });
    const exported = evaluate(controllerCode, {
        "@api/SettingsSync/cloudSetup": { createCloudIdentity: () => { state.imports++; }, getCloudKey: () => { state.imports++; } },
        "./favorites": emptyFavoriteModule, "./service": service, "./folders": folderApi,
        "./imports": importApi, "./settings": { settings: { store: { autoAddSharedFavorites: true } }, subscribeImportSettings: () => () => {} }
    }, clock);
    const summary = item => ({
        id: item.id, name: item.name, role: "owner", memberCount: 1 + item.other.length,
        gifCount: item.gifs.length + (item.received?.length ?? 0), updatedAt: item.updatedAt ?? "2026-11-24T12:00:00.000Z", mode: item.mode, sharingRevision: item.revision
    });
    const ownSharing = item => ({ mode: item.mode, gifs: item.gifs.map((item, i) => ({ id: `gif-${i}`, ...item })), revision: item.revision });
    const detail = item => ({ ...summary(item), ownerId: item.ownerId, members: [
        { id: "member-me", displayName: state.displayName, role: "owner", mode: item.mode, gifCount: item.gifs.length, updatedAt: "2026-11-24T12:00:00.000Z" },
        ...item.other
    ] });
    const controller = exported.createGifTeamsController({
        folders: withFolders ? folders : undefined,
        imports: withImports ? {
            store: imports,
            enabled: () => state.importEnabled,
            subscribe(listener) { state.importListeners.add(listener); return () => state.importListeners.delete(listener); },
            async add(gifs, userId, signal) {
                state.nativeCalls.push({ gifs: clone(gifs), userId, signal });
                await state.nativeHold?.();
                if (signal.aborted || state.userId !== userId) throw new DOMException("Import cancelled", "AbortError");
                if (state.nativeError) throw state.nativeError;
                const addedUrls = [];
                const existingUrls = [];
                for (const gif of gifs) {
                    if (state.favorites.some(item => item.url === gif.url)) existingUrls.push(gif.url);
                    else { state.favorites.push(clone(gif)); addedUrls.push(gif.url); }
                }
                for (const listener of state.favoriteListeners) listener();
                return { addedUrls, existingUrls, skippedUrls: [], skipped: [] };
            }
        } : undefined,
        async identity(create) {
            state.identityCalls.push(create);
            await state.identityHold?.(create);
            if (create) state.connected = true;
            return state.connected && state.userId ? { userId: state.userId, displayName: state.displayName, authorization: state.token } : null;
        },
        currentUserId: () => state.userId,
        async favorites() {
            state.loadCalls++;
            await state.favoritesHold?.();
            if (state.favoritesError) throw state.favoritesError;
            return clone(state.favorites);
        },
        subscribeFavorites(callback) { state.favoriteListeners.add(callback); return () => state.favoriteListeners.delete(callback); },
        subscribeUser(callback) { state.userListeners.add(callback); return () => state.userListeners.delete(callback); },
        api(token, signal) {
            state.sessions.push({ token, signal });
            return async (path = "", method = "GET", body) => {
                const call = { path, method, body: clone(body), token, signal, currentUser: state.userId };
                state.calls.push(call);
                await state.requestHold?.(call);
                if (state.requestError) {
                    const error = state.requestError(call);
                    if (error) throw error;
                }
                if (!path && method === "GET") return { viewerId: "member-me", teams: [...state.teams.values()].map(summary), limits: { maxGifs: 1000, maxTeams: 10, maxMembers: 25 } };
                if (path === "/account" && method === "DELETE") { state.teams.clear(); return; }
                const [pathname, query] = path.split("?");
                const [, id, action, memberId] = pathname.split("/").map(decodeURIComponent);
                const current = state.teams.get(id);
                if (!current) throw new service.TeamsError(404, "not_found", "Team inaccessible");
                if (!action && method === "GET") return detail(current);
                if ((method === "DELETE" && !action) || (method === "DELETE" && action === "membership")) { state.teams.delete(id); return; }
                if (action === "sharing") {
                    if (method === "GET") return ownSharing(current);
                    assert.equal(method, "PUT");
                    if (body.revision !== current.revision) throw new service.TeamsError(409, "conflict", "Sharing changed");
                    current.revision++;
                    current.mode = body.mode;
                    current.gifs = clone(body.gifs);
                    return ownSharing(current);
                }
                if (action === "gifs") {
                    const params = new URLSearchParams(query);
                    const offset = Number(params.get("offset"));
                    const limit = Number(params.get("limit")) || 60;
                    const items = [...current.gifs.map((item, i) => ({ id: `gif-${i}`, ...item, memberId: "member-me", displayName: state.displayName })), ...(current.received ?? [])];
                    const result = { items: items.slice(offset, offset + limit), total: items.length, offset, nextOffset: offset + limit < items.length ? offset + limit : null };
                    return state.pageTransform?.(result, call) ?? result;
                }
                if (action === "invites" && method === "POST") return { code: "private-single-use-code", expiresAt: "2026-11-25T12:00:00.000Z" };
                if (action === "invites" && method === "DELETE") return;
                if (action === "members" && method === "DELETE") { current.other = current.other.filter(item => item.id !== memberId); return; }
                throw Error(`Unhandled fixture route ${method} ${path}`);
            };
        }
    });
    return {
        state, controller, clock, service, folders, folderApi, storage, imports,
        writes: () => state.calls.filter(call => call.method !== "GET"),
        async start() { controller.start(); await controller.refresh(); await tick(); },
        async nextImport() {
            const pending = [...clock.timeouts.entries()].find(([, timer]) => timer.ms === 750);
            if (!pending) return false;
            const done = deferred();
            let began = false;
            const unsubscribe = controller.subscribe(() => {
                if (controller.getSnapshot().importing) began = true;
                else if (began) done.resolve();
            });
            clock.timeouts.delete(pending[0]);
            pending[1].callback();
            await done.promise;
            unsubscribe();
            await tick();
            return true;
        },
        async drainImports() {
            for (let pass = 0; pass < 20; pass++) if (!await this.nextImport()) return;
            throw Error("Imports failed to settle within bounded passes");
        },
        toggleImports(enabled) { state.importEnabled = enabled; for (const listener of state.importListeners) listener(); },
        notifyFavorites() { for (const listener of state.favoriteListeners) listener(); },
        notifyUser() { for (const listener of state.userListeners) listener(); }
    };
}

test("loading controller code creates no identity, subscriptions or network requests", () => {
    const f = fixture();
    assert.equal(f.state.imports, 0);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.clock.intervals.size, 0);
});

function receivingTeam(gifs, id = "team-one", own = []) {
    const item = team(id, own.length ? "auto" : "off", own);
    item.other = [{ id: "member-other", displayName: "Other", role: "member", mode: "manual", gifCount: gifs.length }];
    item.received = gifs.map((gif, index) => ({ ...gif, id: `other-${index}`, memberId: "member-other", displayName: "Other" }));
    return item;
}

test("shared GIFs arrive in native favorites in bounded pages without importing the viewer's own shares", async () => {
    const incoming = Array.from({ length: 245 }, (_, index) => gif(`received-${index}`));
    const f = fixture([receivingTeam(incoming, "team-one", [alpha])], [alpha], false, true);
    await f.start();
    assert.equal(f.state.nativeCalls.length, 0, "Receiving runs in background after the ordinary refresh");
    await f.nextImport();
    assert.equal(f.state.calls.filter(call => call.path.includes("limit=100")).length, 2);
    assert(f.controller.getSnapshot().importedCount < incoming.length);
    await f.drainImports();
    assert.equal(f.state.favorites.length, 246);
    assert.equal(f.controller.getSnapshot().importedCount, 245);
    assert(f.state.nativeCalls.every(call => call.gifs.length <= 100 && call.gifs.every(gif => gif.url !== alpha.url)));
    const requestCount = f.state.calls.length;
    f.clock.fireTimeouts();
    await tick();
    assert.equal(f.state.calls.length, requestCount, "Native import events must not start a redundant API refresh");
    await f.controller.refresh();
    assert.equal(await f.nextImport(), false, "Completed unchanged scans remain cached");
    f.controller.stop();
});

test("received GIFs are deduplicated across teams and a user-unfavorited GIF is never automatically re-added", async () => {
    const f = fixture([receivingTeam([alpha, bravo]), receivingTeam([bravo], "second")], [alpha], false, true);
    await f.start();
    await f.drainImports();
    assert.deepEqual(f.state.favorites.map(gif => gif.url), [alpha.url, bravo.url]);
    assert.equal(f.controller.getSnapshot().importedCount, 1);
    f.state.favorites = [alpha];
    for (const item of f.state.teams.values()) item.updatedAt = "2026-11-24T13:00:00.000Z";
    await f.controller.refresh();
    await f.drainImports();
    assert.deepEqual(f.state.favorites.map(gif => gif.url), [alpha.url]);
    assert.equal(f.state.nativeCalls.length, 1);
    f.controller.stop();
});

test("native imports stay out of automatic sharing on this device but explicit manual and folder selections can share them", async () => {
    const f = fixture([receivingTeam([bravo], "team-one", [alpha])], [alpha], true, true);
    await f.start();
    await f.drainImports();
    await f.controller.refresh();
    assert.deepEqual(f.state.teams.get("team-one").gifs.map(gif => gif.url), [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharing("auto");
    assert.deepEqual(f.writes().at(-1).body.gifs.map(gif => gif.url), [alpha.url]);
    await f.controller.setSharing("manual", [bravo.url]);
    assert.deepEqual(f.writes().at(-1).body.gifs.map(gif => gif.url), [bravo.url]);
    await f.folders.refresh();
    const folder = await f.folders.create("Repartagés", [bravo.url]);
    await f.controller.setSharingFolder(folder);
    assert.deepEqual(f.writes().at(-1).body.gifs.map(gif => gif.url), [bravo.url]);
    f.controller.stop();
});

test("generic native import failures stay visible without a retry loop or disabled forms", async () => {
    const f = fixture([receivingTeam([bravo])], [alpha], false, true);
    await f.start();
    f.state.nativeError = Error("Native settings unavailable");
    await f.nextImport();
    assert.equal(f.state.nativeCalls.length, 1);
    assert.equal(await f.nextImport(), false);
    const snapshot = f.controller.getSnapshot();
    assert.equal(snapshot.importError, "Native settings unavailable");
    assert.equal(snapshot.busy, false);
    assert.equal(snapshot.loading, false);
    assert.equal(snapshot.error, null);
    for (let i = 0; i < 20; i++) { f.notifyFavorites(); f.notifyUser(); }
    f.clock.fireTimeouts();
    await tick();
    assert.equal(f.state.nativeCalls.length, 1);
    assert.equal(f.controller.getSnapshot().importError, "Native settings unavailable");
    f.state.nativeError = null;
    await f.controller.refresh();
    await f.drainImports();
    assert.equal(f.controller.getSnapshot().importError, null);
    assert(f.state.favorites.some(gif => gif.url === bravo.url));
    f.controller.stop();
});

test("failed durable provenance prevents native writes and does not silently retry", async () => {
    const f = fixture([receivingTeam([bravo])], [alpha], false, true);
    await f.start();
    f.state.importStorageError = Error("Storage is full");
    await f.nextImport();
    assert.equal(f.state.nativeCalls.length, 0);
    assert.equal(f.controller.getSnapshot().importError, "Storage is full");
    assert.equal(await f.nextImport(), false);
    assert.deepEqual(f.state.favorites.map(gif => gif.url), [alpha.url]);
    f.controller.stop();
});

test("switching off auto-import cancels an already queued native update", async () => {
    const f = fixture([receivingTeam([bravo])], [alpha], false, true);
    await f.start();
    const arrived = deferred();
    const hold = deferred();
    f.state.nativeHold = () => { arrived.resolve(); return hold.promise; };
    const pass = f.nextImport();
    await arrived.promise;
    f.toggleImports(false);
    hold.resolve();
    await pass;
    await tick();
    assert.deepEqual(f.state.favorites.map(gif => gif.url), [alpha.url]);
    assert.equal(f.state.nativeCalls[0].signal.aborted, true);
    assert.equal(await f.nextImport(), false);
    f.state.nativeHold = null;
    f.toggleImports(true);
    await f.controller.refresh();
    await f.drainImports();
    assert(f.state.favorites.some(gif => gif.url === bravo.url));
    f.controller.stop();
});

test("an account change aborts pending native imports before they touch the new account", async () => {
    const f = fixture([receivingTeam([bravo])], [alpha], false, true);
    await f.start();
    const arrived = deferred();
    const hold = deferred();
    f.state.nativeHold = () => { arrived.resolve(); return hold.promise; };
    const pass = f.nextImport();
    await arrived.promise;
    f.state.userId = "1395048695501688953";
    f.state.token = "account-b";
    f.state.favorites = [charlie];
    f.notifyUser();
    hold.resolve();
    await pass;
    await f.controller.refresh();
    assert.deepEqual(f.state.favorites.map(gif => gif.url), [charlie.url]);
    assert.equal(f.state.nativeCalls[0].signal.aborted, true);
    f.controller.stop();
});

test("membership revocation stops incoming scans without removing previously imported native favorites", async () => {
    const f = fixture([receivingTeam([bravo])], [alpha], false, true);
    await f.start();
    await f.drainImports();
    f.state.teams.get("team-one").updatedAt = "2026-11-24T14:00:00.000Z";
    await f.controller.refresh();
    f.state.requestError = call => call.path.includes("limit=100") ? new f.service.TeamsError(404, "not_found", "Not a member") : null;
    await f.drainImports();
    assert.equal(f.controller.getSnapshot().teams.length, 0);
    assert.deepEqual(f.state.favorites.map(gif => gif.url), [alpha.url, bravo.url]);
    f.controller.stop();
});

test("invalid non-progressing incoming pagination stops rather than requesting the same page forever", async () => {
    const f = fixture([receivingTeam([bravo])], [alpha], false, true);
    f.state.pageTransform = result => ({ ...result, nextOffset: 0 });
    await f.start();
    await f.nextImport();
    assert.match(f.controller.getSnapshot().importError, /pagination/);
    assert.equal(f.state.nativeCalls.length, 0);
    assert.equal(await f.nextImport(), false);
    f.controller.stop();
});

async function folderFixture(initialTeams = [team()], favorites = [alpha, bravo, charlie]) {
    const f = fixture(initialTeams, favorites, true);
    await f.start();
    await f.folders.refresh();
    return f;
}

test("local folders work before Cloud activation and never publish themselves", async () => {
    const f = fixture([team()], [alpha, bravo], true);
    f.state.connected = false;
    await f.start();
    await f.folders.refresh();
    const id = await f.folders.create("Réactions", [alpha.url]);
    await f.folders.update(id, { name: "Amis", urls: [bravo.url] });
    f.clock.fireTimeouts();
    await tick();
    assert.deepEqual(clone(f.folders.getSnapshot().folders), [{ id, name: "Amis", urls: [bravo.url] }]);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.identityCalls.includes(true), false);
    f.controller.stop();
});

test("a team follows only its selected folder, including later additions and removals", async () => {
    const f = await folderFixture();
    const selected = await f.folders.create("Team", [alpha.url]);
    await f.folders.create("Privé", [charlie.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(selected);
    assert.deepEqual(f.writes().at(-1).body.gifs.map(gif => gif.url), [alpha.url]);
    assert.equal(f.writes().at(-1).body.mode, "manual");
    assert.deepEqual(clone(f.controller.getSnapshot().folderBinding), { folderId: selected, paused: null });
    await f.folders.setUrls(selected, [bravo.url]);
    f.clock.fireTimeouts();
    await f.controller.refresh();
    assert.deepEqual(f.writes().at(-1).body.gifs.map(gif => gif.url), [bravo.url]);
    const count = f.writes().length;
    await f.controller.refresh();
    assert.equal(f.writes().length, count, "Saving the updated binding must not start another upload");
    assert.equal(f.folders.getSnapshot().bindings[0].revision, f.state.teams.get("team-one").revision);
    f.controller.stop();
});

test("each team can follow a different folder without including unselected favorites", async () => {
    const f = await folderFixture([team("one"), team("two")]);
    const first = await f.folders.create("Un", [alpha.url]);
    const second = await f.folders.create("Deux", [bravo.url]);
    await f.controller.selectTeam("one");
    await f.controller.setSharingFolder(first);
    await f.controller.selectTeam("two");
    await f.controller.setSharingFolder(second);
    await f.folders.setUrls(first, [charlie.url]);
    await f.controller.refresh();
    assert.deepEqual(f.state.teams.get("one").gifs.map(gif => gif.url), [charlie.url]);
    assert.deepEqual(f.state.teams.get("two").gifs.map(gif => gif.url), [bravo.url]);
    f.controller.stop();
});

test("unfavorited folder entries disappear from sharing, but unavailable favorites never erase it", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url, bravo.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    const count = f.writes().length;
    f.state.favoritesError = Error("Favoris en cours de chargement");
    await f.controller.refresh();
    assert.equal(f.writes().length, count);
    assert.deepEqual(f.state.teams.get("team-one").gifs.map(gif => gif.url), [alpha.url, bravo.url]);
    f.state.favoritesError = null;
    f.state.favorites = [bravo, charlie];
    await f.controller.refresh();
    assert.deepEqual(f.state.teams.get("team-one").gifs.map(gif => gif.url), [bravo.url]);
    f.controller.stop();
});

test("any remote revision change pauses a folder even when the remote GIFs are unchanged", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    const count = f.writes().length;
    f.state.teams.get("team-one").revision++;
    f.state.favorites = [bravo];
    await f.controller.refresh();
    assert.equal(f.writes().length, count);
    assert(f.controller.getSnapshot().folderBinding.paused);
    assert.deepEqual(f.state.teams.get("team-one").gifs.map(gif => gif.url), [alpha.url]);
    await f.controller.refresh();
    assert.equal(f.writes().length, count, "A paused folder must not fall through to ordinary manual synchronization");
    f.controller.stop();
});

test("a conflicting folder upload pauses its binding and preserves the other device's changes", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    await f.folders.setUrls(id, [bravo.url]);
    f.state.requestError = call => call.method === "PUT" ? new f.service.TeamsError(409, "conflict", "Autre appareil") : null;
    await f.controller.refresh();
    assert(f.folders.getSnapshot().bindings[0].paused);
    assert.deepEqual(f.state.teams.get("team-one").gifs.map(gif => gif.url), [alpha.url]);
    const count = f.writes().length;
    f.state.requestError = null;
    await f.controller.refresh();
    assert.equal(f.writes().length, count);
    f.controller.stop();
});

test("folder edits during an upload are followed by one more refresh", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    await f.folders.setUrls(id, [bravo.url]);
    const pending = deferred();
    const arrived = deferred();
    f.state.requestHold = call => { if (call.method === "PUT") { arrived.resolve(); return pending.promise; } };
    const refresh = f.controller.refresh();
    await arrived.promise;
    await f.folders.setUrls(id, [charlie.url]);
    f.clock.fireTimeouts();
    pending.resolve();
    await refresh;
    f.state.requestHold = null;
    assert([...f.clock.timeouts.values()].some(timer => timer.ms === 1000));
    f.clock.fireTimeouts();
    await f.controller.refresh();
    assert.deepEqual(f.state.teams.get("team-one").gifs.map(gif => gif.url), [charlie.url]);
    f.controller.stop();
});

test("detaching during an in-flight upload cannot resurrect the folder binding", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    await f.folders.setUrls(id, [bravo.url]);
    const pending = deferred();
    const arrived = deferred();
    f.state.requestHold = call => { if (call.method === "PUT") { arrived.resolve(); return pending.promise; } };
    const refresh = f.controller.refresh();
    await arrived.promise;
    const binding = f.folders.getSnapshot().bindings[0];
    await f.folders.detachBinding(binding.teamId, binding.scope);
    pending.resolve();
    await refresh;
    assert.equal(f.folders.getSnapshot().bindings.length, 0);
    assert.equal(f.controller.getSnapshot().folderBinding, null);
    f.controller.stop();
});

test("disabling folder sharing clears the server before allowing deletion, and recreating its name stays unbound", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Amis", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    await assert.rejects(f.folders.remove(id), /Désactive d’abord/);
    await f.controller.setSharing("off");
    assert.equal(f.state.teams.get("team-one").gifs.length, 0);
    assert.equal(f.folders.getSnapshot().bindings.length, 0);
    await f.folders.remove(id);
    const replacement = await f.folders.create("Amis", [bravo.url]);
    assert.notEqual(replacement, id);
    const count = f.writes().length;
    await f.controller.refresh();
    assert.equal(f.writes().length, count);
    f.controller.stop();
});

test("changing the Cloud key never reuses the previous identity's folder binding", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    await f.folders.setUrls(id, [bravo.url]);
    const count = f.writes().length;
    f.state.token = "new-cloud-identity";
    await f.controller.refresh();
    await f.controller.selectTeam("team-one");
    assert.equal(f.writes().length, count);
    assert.equal(f.controller.getSnapshot().folderBinding, null);
    const old = f.folders.getSnapshot().bindings[0];
    await f.folders.detachBinding(old.teamId, old.scope);
    await f.folders.remove(id);
    assert.equal(f.folders.getSnapshot().folders.length, 0, "Old identity bindings remain explicitly detachable");
    f.controller.stop();
});

test("a missing persisted folder pauses safely instead of uploading an empty collection", async () => {
    const f = fixture([team("team-one", "manual", [alpha])], [alpha, bravo], true);
    const scope = await f.folderApi.folderIdentityScope(f.state.token);
    f.storage.set(`midnightcord-gif-folders-v1:${f.state.userId}`, {
        version: 1, folders: [], bindings: [{ teamId: "team-one", teamName: "Team", folderId: "missing", scope, revision: 0, paused: null }]
    });
    await f.start();
    await f.controller.selectTeam("team-one");
    assert.equal(f.writes().length, 0);
    assert.match(f.controller.getSnapshot().folderBinding.paused, /n’existe plus/);
    f.controller.stop();
});

test("restored folders without local consent bindings never publish until explicitly selected", async () => {
    const f = fixture([team("team-one", "manual", [alpha])], [alpha, bravo], true);
    f.storage.set(`midnightcord-gif-folders-v1:${f.state.userId}`, {
        version: 1, folders: [{ id: "restored", name: "Restauré", urls: [bravo.url] }], bindings: []
    });
    await f.start();
    assert.equal(f.writes().length, 0);
    await f.controller.selectTeam("team-one");
    assert.equal(f.controller.getSnapshot().folderBinding, null);
    await f.controller.setSharingFolder("restored");
    assert.deepEqual(f.writes().at(-1).body.gifs.map(gif => gif.url), [bravo.url]);
    f.controller.stop();
});

test("detaching while a folder upload verifies identity cancels it before the HTTP write", async () => {
    const f = await folderFixture();
    const id = await f.folders.create("Team", [alpha.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(id);
    await f.folders.setUrls(id, [bravo.url]);
    const count = f.writes().length;
    const pending = deferred();
    const arrived = deferred();
    f.state.favoritesHold = () => {
        f.state.identityHold = () => { arrived.resolve(); return pending.promise; };
    };
    const refresh = f.controller.refresh();
    await arrived.promise;
    const binding = f.folders.getSnapshot().bindings[0];
    await f.folders.detachBinding(binding.teamId, binding.scope);
    pending.resolve();
    await refresh;
    assert.equal(f.writes().length, count);
    assert.equal(f.folders.getSnapshot().bindings.length, 0);
    f.controller.stop();
});

test("a newer local detach wins over an explicit folder replacement already in flight", async () => {
    const f = await folderFixture();
    const first = await f.folders.create("Ancien", [alpha.url]);
    const next = await f.folders.create("Nouveau", [bravo.url]);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharingFolder(first);
    const pending = deferred();
    const arrived = deferred();
    f.state.requestHold = call => { if (call.method === "PUT") { arrived.resolve(); return pending.promise; } };
    const replace = f.controller.setSharingFolder(next);
    await arrived.promise;
    const binding = f.folders.getSnapshot().bindings[0];
    await f.folders.detachBinding(binding.teamId, binding.scope);
    pending.resolve();
    await replace;
    assert.equal(f.folders.getSnapshot().bindings.length, 0);
    assert.equal(f.controller.getSnapshot().folderBinding, null);
    f.controller.stop();
});

test("unlinked users remain idle until the explicit connection action", async () => {
    const f = fixture();
    f.state.connected = false;
    await f.start();
    assert.equal(f.controller.getSnapshot().connected, false);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.identityCalls.includes(true), false);
    await f.controller.initializeConnection();
    assert.equal(f.state.identityCalls.filter(create => create).length, 1);
    assert.equal(f.controller.getSnapshot().connected, true);
    assert.equal(f.writes().length, 0);
    f.controller.stop();
});

test("automatic sharing includes all current favorites and synchronizes later additions and removals", async () => {
    const f = fixture([team("team-one", "auto", [alpha])]);
    await f.start();
    assert.deepEqual(f.writes()[0].body.gifs.map(item => item.url), [alpha.url, bravo.url]);
    f.state.favorites = [bravo, charlie];
    await f.controller.refresh();
    assert.deepEqual(f.writes().at(-1).body.gifs.map(item => item.url), [bravo.url, charlie.url]);
    assert.equal(f.writes().at(-1).body.revision, 1);
    const writes = f.writes().length;
    await f.controller.refresh();
    assert.equal(f.writes().length, writes, "Unchanged favorites must not cause redundant uploads");
    f.controller.stop();
});

test("manual sharing never adds unselected favorites and removes a selected GIF that was unfavorited", async () => {
    const f = fixture([team("team-one", "manual", [alpha])]);
    await f.start();
    assert.equal(f.writes().length, 0);
    f.state.favorites = [bravo, charlie];
    await f.controller.refresh();
    assert.deepEqual(f.writes().at(-1).body.gifs, []);
    assert.equal(f.writes().at(-1).body.mode, "manual");
    f.controller.stop();
});

test("an explicit manual selection shares only favorites selected for that team", async () => {
    const f = fixture([team("team-one"), team("other-team")]);
    await f.start();
    await f.controller.selectTeam("team-one");
    await f.controller.setSharing("manual", [bravo.url, "https://tenor.com/view/not-a-favorite"]);
    assert.equal(f.writes().length, 1);
    assert.equal(f.writes()[0].path, "/team-one/sharing");
    assert.deepEqual(f.writes()[0].body.gifs.map(item => item.url), [bravo.url]);
    assert.deepEqual(f.state.teams.get("other-team").gifs, []);
    f.controller.stop();
});

test("off mode does not publish favorites and disabling sharing clears the remote collection", async () => {
    const f = fixture();
    await f.start();
    f.state.favorites = [alpha, bravo, charlie];
    await f.controller.refresh();
    assert.equal(f.writes().length, 0);
    await f.controller.selectTeam("team-one");
    await f.controller.setSharing("auto");
    assert.equal(f.state.teams.get("team-one").gifs.length, 3);
    await f.controller.setSharing("off");
    assert.deepEqual(f.writes().at(-1).body.gifs, []);
    assert.equal(f.writes().at(-1).body.mode, "off");
    const count = f.writes().length;
    await f.controller.refresh();
    assert.equal(f.writes().length, count);
    f.controller.stop();
});

test("unavailable favorites never become an empty upload or erase previously shared GIFs", async () => {
    const f = fixture([team("team-one", "auto", [alpha])]);
    f.state.favoritesError = Error("Favorites not loaded");
    await f.start();
    assert.equal(f.writes().length, 0);
    assert.deepEqual(f.state.teams.get("team-one").gifs, [alpha]);
    assert.equal(f.controller.getSnapshot().favoritesReady, false);
    assert.match(f.controller.getSnapshot().error, /not loaded/);
    f.state.favoritesError = null;
    f.state.favorites = [];
    await f.controller.refresh();
    assert.deepEqual(f.writes()[0].body.gifs, [], "A successfully loaded empty list may intentionally clear favorites");
    f.controller.stop();
});

test("bursts of favorite-store changes debounce into one refresh", async () => {
    const f = fixture([team("team-one", "auto", [alpha, bravo])]);
    await f.start();
    f.state.favorites.push(charlie);
    for (let i = 0; i < 30; i++) f.notifyFavorites();
    assert.equal(f.clock.timeouts.size, 1);
    f.clock.fireTimeouts();
    await f.controller.refresh();
    await tick();
    assert.equal(f.writes().length, 1);
    f.controller.stop();
    assert.equal(f.clock.timeouts.size, 0);
    assert.equal(f.clock.intervals.size, 0);
    assert.equal(f.state.favoriteListeners.size, 0);
    assert.equal(f.state.userListeners.size, 0);
});

test("updates to other Discord users never refresh the active account or interrupt typing", async () => {
    const f = fixture();
    await f.start();
    const requests = f.state.calls.length;
    const identities = f.state.identityCalls.length;
    const snapshots = [];
    const unsubscribe = f.controller.subscribe(() => snapshots.push(f.controller.getSnapshot()));
    for (let i = 0; i < 50; i++) { f.notifyUser(); await tick(); }
    assert.equal(f.state.calls.length, requests);
    assert.equal(f.state.identityCalls.length, identities);
    assert.equal(snapshots.length, 0, "Unrelated UserStore changes must not toggle errors, busy state or connected state");
    unsubscribe();
    f.controller.stop();
});

test("failed background refreshes keep the form usable and back off instead of flashing the error", async () => {
    const f = fixture();
    f.state.requestError = () => new f.service.TeamsError(0, "network_unavailable", "Connexion impossible");
    await f.start();
    const snapshots = [];
    const unsubscribe = f.controller.subscribe(() => snapshots.push(f.controller.getSnapshot()));
    assert.equal(f.state.calls.length, 1);
    assert.equal([...f.clock.timeouts.values()][0].ms, 5_000);
    for (let i = 0; i < 30; i++) { f.notifyUser(); f.notifyFavorites(); }
    for (const { callback } of f.clock.intervals.values()) callback();
    await tick();
    assert.equal(f.state.calls.length, 1, "Store events and periodic refreshes must respect the pending backoff");
    assert.equal(f.clock.timeouts.size, 1);
    for (const delay of [10_000, 20_000, 40_000, 60_000, 60_000]) {
        f.clock.fireTimeouts();
        await tick();
        assert.equal([...f.clock.timeouts.values()][0].ms, delay);
    }
    assert(snapshots.every(snapshot => snapshot.connected && !snapshot.busy && !snapshot.loading));
    assert(snapshots.every(snapshot => snapshot.error === "Connexion impossible"), "An automatic retry must not erase the error before it succeeds");
    f.state.requestError = null;
    f.clock.fireTimeouts();
    await tick();
    assert.equal(f.controller.getSnapshot().error, null);
    assert.equal(f.clock.timeouts.size, 0);
    unsubscribe();
    f.controller.stop();
});

test("server retry delays are respected while an explicit refresh can retry immediately", async () => {
    const f = fixture();
    f.state.requestError = () => new f.service.TeamsError(429, "rate_limited", "Patientez", 90_000);
    await f.start();
    assert.equal([...f.clock.timeouts.values()][0].ms, 90_000);
    const requests = f.state.calls.length;
    f.state.requestError = null;
    await f.controller.refresh();
    assert.equal(f.state.calls.length, requests + 1);
    assert.equal(f.clock.timeouts.size, 0);
    assert.equal(f.controller.getSnapshot().error, null);
    assert.equal(f.controller.getSnapshot().busy, false);
    f.controller.stop();
});

test("switching accounts during backoff aborts the old identity and immediately loads the new account", async () => {
    const f = fixture();
    f.state.requestError = () => new f.service.TeamsError(503, "unavailable", "Service indisponible");
    await f.start();
    const oldSession = f.state.sessions[0];
    assert.equal(f.clock.timeouts.size, 1);
    f.state.userId = "1395048695501688953";
    f.state.token = "account-b";
    f.state.requestError = null;
    f.notifyUser();
    await tick();
    assert.equal(oldSession.signal.aborted, true);
    assert.equal(f.state.calls.at(-1).token, "account-b");
    assert.equal(f.clock.timeouts.size, 0);
    assert.equal(f.controller.getSnapshot().error, null);
    assert.equal(f.controller.getSnapshot().connected, true);
    f.controller.stop();
});

test("stopping the plugin cancels scheduled network retries", async () => {
    const f = fixture();
    f.state.requestError = () => new f.service.TeamsError(408, "request_timeout", "Délai dépassé");
    await f.start();
    const requests = f.state.calls.length;
    assert.equal(f.clock.timeouts.size, 1);
    f.controller.stop();
    assert.equal(f.clock.timeouts.size, 0);
    assert.equal(f.clock.intervals.size, 0);
    f.clock.fireTimeouts();
    f.notifyUser();
    f.notifyFavorites();
    await tick();
    assert.equal(f.state.calls.length, requests);
});

test("a concurrent sharing conflict is surfaced without retrying or replacing the newer collection", async () => {
    const f = fixture([team("team-one", "auto", [alpha])]);
    f.state.requestError = call => call.method === "PUT" ? new f.service.TeamsError(409, "conflict", "Sharing changed") : null;
    await f.start();
    assert.equal(f.writes().length, 1);
    assert.deepEqual(f.state.teams.get("team-one").gifs, [alpha]);
    assert.match(f.controller.getSnapshot().error, /Sharing changed/);
    f.controller.stop();
});

test("a stale manual editor does not silently overwrite another device's newer selection", async () => {
    const f = fixture([team("team-one", "manual", [alpha])]);
    await f.start();
    await f.controller.selectTeam("team-one");
    const remote = f.state.teams.get("team-one");
    remote.revision++;
    remote.gifs = [bravo];
    await f.controller.setSharing("manual", [alpha.url]);
    assert.equal(f.writes().length, 0, "A stale visible revision must be detected before sending a replacement");
    assert.deepEqual(remote.gifs, [bravo]);
    assert(f.controller.getSnapshot().error);
    f.controller.stop();
});

test("a dirty UI draft keeps its expected revision even after background refresh loads newer sharing", async () => {
    const f = fixture([team("team-one", "manual", [alpha])]);
    await f.start();
    await f.controller.selectTeam("team-one");
    const editingRevision = f.controller.getSnapshot().sharing.revision;
    const remote = f.state.teams.get("team-one");
    remote.revision++;
    remote.gifs = [bravo];
    await f.controller.refresh();
    assert.equal(f.controller.getSnapshot().sharing.revision, editingRevision + 1);
    await f.controller.setSharing("manual", [alpha.url], editingRevision);
    assert.equal(f.writes().length, 0);
    assert.deepEqual(remote.gifs, [bravo]);
    assert(f.controller.getSnapshot().error);
    f.controller.stop();
});

test("an unconfirmed request timeout is visible to the user and is never reported as a successful save", async () => {
    const f = fixture();
    await f.start();
    await f.controller.selectTeam("team-one");
    f.state.requestError = call => call.method === "PUT" ? new f.service.TeamsError(408, "request_timeout", "Le serveur n’a pas confirmé l’opération à temps.") : null;
    await f.controller.setSharing("auto");
    assert.match(f.controller.getSnapshot().error, /pas confirmé/);
    assert.equal(f.controller.getSnapshot().busy, false);
    assert.equal(f.controller.getSnapshot().sharing.mode, "off");
    assert.equal(f.writes().length, 1);
    f.controller.stop();
});

test("membership revocation removes cached details, GIFs and invitation codes", async () => {
    const f = fixture([team("team-one", "manual", [alpha])]);
    await f.start();
    await f.controller.selectTeam("team-one");
    await f.controller.createInvite();
    assert.equal(f.controller.getSnapshot().page.items.length, 1);
    assert(f.controller.getSnapshot().invite);
    f.state.teams.clear();
    await f.controller.refresh();
    const snapshot = f.controller.getSnapshot();
    assert.equal(snapshot.team, null);
    assert.equal(snapshot.page, null);
    assert.equal(snapshot.sharing, null);
    assert.equal(snapshot.invite, null);
    f.controller.stop();
});

test("a forbidden page refresh discards previously visible private content", async () => {
    const f = fixture([team("team-one", "manual", [alpha])]);
    await f.start();
    await f.controller.selectTeam("team-one");
    f.state.requestError = call => call.path.includes("/gifs") ? new f.service.TeamsError(404, "not_found", "Team inaccessible") : null;
    await f.controller.loadPage();
    assert.equal(f.controller.getSnapshot().page, null);
    assert.equal(f.controller.getSnapshot().team, null);
    f.controller.stop();
});

test("switching Discord accounts aborts the old session and cannot publish the new account's favorites under it", async () => {
    const f = fixture([team("team-one", "auto", [alpha])], [alpha]);
    await f.start();
    const gate = deferred();
    f.state.favoritesHold = () => gate.promise;
    const pending = f.controller.refresh();
    await tick();
    f.state.userId = "1395048695501688953";
    f.state.token = "account-b";
    f.state.favorites = [bravo];
    f.notifyUser();
    assert.equal(f.state.sessions[0].signal.aborted, true);
    assert.equal(f.controller.getSnapshot().page, null);
    gate.resolve();
    await pending;
    await tick();
    assert.equal(f.writes().filter(call => call.token === "account-a").length, 0);
    f.state.favoritesHold = null;
    await f.controller.refresh();
    assert.equal(f.writes().at(-1)?.token, "account-b");
    f.controller.stop();
});

test("switching accounts during an in-flight refresh automatically starts the new session", async () => {
    const f = fixture([team("team-one", "auto", [alpha])], [alpha]);
    await f.start();
    const gate = deferred();
    f.state.requestHold = call => call.path === "" && call.token === "account-a" ? gate.promise : undefined;
    const pending = f.controller.refresh();
    await tick();
    f.state.userId = "1395048695501688953";
    f.state.token = "account-b";
    f.state.favorites = [bravo];
    f.notifyUser();
    gate.resolve();
    await pending;
    await tick();
    assert(f.state.sessions.some(item => item.token === "account-b"), "The new account should not wait for a minute or manual refresh");
    assert.equal(f.writes().filter(call => call.token === "account-a").length, 0);
    f.controller.stop();
});

test("Cloud identity replacement invalidates old sessions before further writes", async () => {
    const f = fixture([team("team-one", "auto", [alpha])], [alpha]);
    await f.start();
    f.state.token = "new-cloud-key-same-discord-user";
    f.state.favorites = [bravo];
    await f.controller.refresh();
    assert.equal(f.state.sessions[0].signal.aborted, true);
    assert.equal(f.writes().length, 1);
    assert.equal(f.writes()[0].token, f.state.token);
    f.controller.stop();
});

test("a Cloud key change while favorites load cannot publish into the previous identity's teams", async () => {
    const f = fixture([team("team-one", "auto", [alpha])], [alpha]);
    await f.start();
    const gate = deferred();
    f.state.favoritesHold = () => gate.promise;
    const pending = f.controller.refresh();
    await tick();
    f.state.token = "replacement-key";
    f.state.favorites = [bravo];
    gate.resolve();
    await pending;
    await tick();
    assert.equal(f.writes().filter(call => call.token === "account-a").length, 0);
    assert.equal(f.state.sessions[0].signal.aborted, true);
    f.controller.stop();
});

test("unlinking the Cloud identity while favorites load cancels every pending publication", async () => {
    const f = fixture([team("team-one", "auto", [alpha])], [alpha]);
    await f.start();
    const gate = deferred();
    f.state.favoritesHold = () => gate.promise;
    const pending = f.controller.refresh();
    await tick();
    f.state.connected = false;
    f.state.favorites = [bravo];
    gate.resolve();
    await pending;
    await tick();
    assert.equal(f.writes().length, 0);
    assert.equal(f.controller.getSnapshot().connected, false);
    assert.equal(f.controller.getSnapshot().team, null);
    assert.equal(f.state.sessions[0].signal.aborted, true);
    f.controller.stop();
});

test("an old private page response cannot repopulate the cache after a Cloud key change", async () => {
    const f = fixture([team("team-one", "manual", [alpha])]);
    await f.start();
    await f.controller.selectTeam("team-one");
    const gate = deferred();
    f.state.requestHold = call => call.path.includes("/gifs") ? gate.promise : undefined;
    const pending = f.controller.loadPage();
    await tick();
    f.state.token = "replacement-key";
    gate.resolve();
    await pending;
    await tick();
    assert.equal(f.controller.getSnapshot().page, null);
    assert.equal(f.controller.getSnapshot().team, null);
    assert.equal(f.state.sessions[0].signal.aborted, true);
    f.controller.stop();
});

test("stopping during an in-flight request ignores late data and never uploads", async () => {
    const f = fixture([team("team-one", "auto", [alpha])], [bravo]);
    const gate = deferred();
    f.state.requestHold = () => gate.promise;
    f.controller.start();
    await tick();
    f.controller.stop();
    gate.resolve();
    await f.controller.refresh();
    await tick();
    assert.equal(f.state.sessions[0].signal.aborted, true);
    assert.equal(f.writes().length, 0);
    assert.equal(f.controller.getSnapshot().connected, false);
    assert.equal(f.controller.getSnapshot().teams.length, 0);
});

test("queued destructive actions cannot retarget themselves to another selected team", async () => {
    const f = fixture([team("team-one"), team("team-two")]);
    await f.start();
    await f.controller.selectTeam("team-one");
    const switchTeam = f.controller.selectTeam("team-two");
    const deleteVisibleTeam = f.controller.deleteTeam();
    await Promise.all([switchTeam, deleteVisibleTeam]);
    assert(f.state.teams.has("team-two"), "A click made while team-one was visible must never delete team-two");
    f.controller.stop();
});

test("member filtering and pagination stay scoped to the selected private team", async () => {
    const f = fixture();
    await f.start();
    await f.controller.selectTeam("team-one");
    await f.controller.loadPage("member-other", 60);
    const call = f.state.calls.at(-1);
    assert.equal(call.method, "GET");
    const request = new URL(call.path, "https://example.test");
    assert.equal(request.pathname, "/team-one/gifs");
    assert.equal(request.searchParams.get("member"), "member-other");
    assert.equal(request.searchParams.get("offset"), "60");
    assert.equal(request.searchParams.get("limit"), "60");
    f.controller.stop();
});

test("GIF credentials are deterministic, account-specific and distinct from the Cloud credential", async () => {
    const { service } = serviceFixture();
    const key = cloudCrypto.createCloudKey();
    const first = await service.deriveTeamsAuthorization(key, "1337883355840118887");
    const repeat = await service.deriveTeamsAuthorization(key, "1337883355840118887");
    const other = await service.deriveTeamsAuthorization(key, "1395048695501688953");
    assert.equal(first, repeat);
    assert.match(first, /^mc1\.[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, other);
    assert.notEqual(first, await cloudCrypto.deriveCloudAuthorization(key));
    assert.notEqual(first, key);
    await assert.rejects(service.deriveTeamsAuthorization(key, "not-an-id"));
});

test("API requests send only the scoped credential to Midnightcord and reject redirects", async () => {
    const f = serviceFixture();
    const api = f.service.createTeamsApi("mc1.scoped-credential", new AbortController().signal);
    await api("/team-one/sharing", "PUT", { mode: "off", gifs: [], revision: 4 });
    assert.equal(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.equal(url, "https://api.midnightcord.fr/v1/cloud/gif-teams/team-one/sharing");
    assert.equal(init.headers.Authorization, "Bearer mc1.scoped-credential");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init.body), { mode: "off", gifs: [], revision: 4 });
    assert.equal(f.clock.timeouts.size, 0);
});

test("API timeout and session cancellation abort requests without leaving timers", async () => {
    const f = serviceFixture((_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const session = new AbortController();
    const api = f.service.createTeamsApi("credential", session.signal);
    const first = api();
    assert.equal([...f.clock.timeouts.values()][0].ms, 15_000);
    f.clock.fireTimeouts();
    await assert.rejects(first, error => error instanceof f.service.TeamsError && error.status === 408 && error.code === "request_timeout");
    assert.equal(f.clock.timeouts.size, 0);
    const second = api();
    session.abort();
    await assert.rejects(second, { name: "AbortError" });
    assert.equal(f.clock.timeouts.size, 0);
    const requests = f.calls.length;
    await assert.rejects(api(), { name: "AbortError" });
    assert.equal(f.calls.length, requests);
});

test("API handles bodyless deletion and reports server errors without leaking response internals", async () => {
    let response = { ok: true, status: 204, text: async () => { throw Error("204 must not parse a body"); } };
    const f = serviceFixture(async () => response);
    const api = f.service.createTeamsApi("credential", new AbortController().signal);
    assert.equal(await api("/team-one", "DELETE"), undefined);
    response = { ok: false, status: 409, headers: new Headers(), text: async () => JSON.stringify({ error: "conflict", message: "backend implementation detail" }) };
    await assert.rejects(api(), error => error instanceof f.service.TeamsError && error.status === 409 && !error.message.includes("backend implementation detail"));
    response = { ok: false, status: 503, headers: new Headers(), text: async () => "<html>upstream unavailable</html>" };
    await assert.rejects(api(), error => error instanceof f.service.TeamsError && !error.message.includes("<html>"));
    assert.equal(f.clock.timeouts.size, 0);
});

test("a proxy HTML rate-limit response is readable and retains its retry delay", async () => {
    const f = serviceFixture(async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": "45" }), text: async () => "<html>429 Too Many Requests nginx</html>" }));
    const api = f.service.createTeamsApi("credential", new AbortController().signal);
    await assert.rejects(api(), error => error instanceof f.service.TeamsError
        && error.status === 429 && error.code === "rate_limited" && error.retryAfterMs === 45_000
        && !error.message.includes("<html>") && !error.message.includes("nginx"));
    assert.equal(f.clock.timeouts.size, 0);
});

test("Retry-After dates and numeric values are bounded, with a safe default for malformed values", async () => {
    for (const [value, minimum, maximum] of [
        ["999999", 120_000, 120_000], ["0", 1_000, 1_000], ["-30", 1_000, 1_000],
        [new Date(Date.now() + 30_000).toUTCString(), 28_000, 30_000],
        ["invalid", 60_000, 60_000]
    ]) {
        const f = serviceFixture(async () => ({ ok: false, status: 429, headers: new Headers({ "Retry-After": value }), text: async () => "" }));
        await assert.rejects(f.service.createTeamsApi("credential", new AbortController().signal)(), error =>
            error.status === 429 && error.retryAfterMs >= minimum && error.retryAfterMs <= maximum);
        assert.equal(f.clock.timeouts.size, 0);
    }
});

test("fetch transport failures become stable actionable errors without losing cancellation semantics", async () => {
    const f = serviceFixture(async () => { throw new TypeError("Failed to fetch"); });
    await assert.rejects(f.service.createTeamsApi("credential", new AbortController().signal)(), error =>
        error instanceof f.service.TeamsError && error.status === 0 && error.code === "network_unavailable"
        && !error.message.includes("Failed to fetch") && error.message.includes("saisies"));
    assert.equal(f.clock.timeouts.size, 0);
});
