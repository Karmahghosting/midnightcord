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

function fixture(initialTeams = [team()], favorites = [alpha, bravo]) {
    const clock = timers();
    const { service } = serviceFixture();
    const state = {
        userId: "1337883355840118887", token: "account-a", displayName: "Alice", connected: true,
        teams: new Map(initialTeams.map(item => [item.id, item])), favorites: clone(favorites), calls: [],
        sessions: [], identityCalls: [], loadCalls: 0, favoriteListeners: new Set(), userListeners: new Set(), imports: 0
    };
    const emptyFavoriteModule = {
        getCurrentUser: () => { state.imports++; return null; },
        loadFavorites: () => { state.imports++; throw Error("Singleton must remain idle"); },
        subscribeFavorites: () => { state.imports++; }, subscribeUser: () => { state.imports++; }
    };
    const exported = evaluate(controllerCode, {
        "@api/SettingsSync/cloudSetup": { createCloudIdentity: () => { state.imports++; }, getCloudKey: () => { state.imports++; } },
        "./favorites": emptyFavoriteModule, "./service": service
    }, clock);
    const summary = item => ({
        id: item.id, name: item.name, role: "owner", memberCount: 1 + item.other.length,
        gifCount: item.gifs.length, updatedAt: "2026-11-24T12:00:00.000Z", mode: item.mode, sharingRevision: item.revision
    });
    const ownSharing = item => ({ mode: item.mode, gifs: item.gifs.map((item, i) => ({ id: `gif-${i}`, ...item })), revision: item.revision });
    const detail = item => ({ ...summary(item), ownerId: item.ownerId, members: [
        { id: "member-me", displayName: state.displayName, role: "owner", mode: item.mode, gifCount: item.gifs.length, updatedAt: "2026-11-24T12:00:00.000Z" },
        ...item.other
    ] });
    const controller = exported.createGifTeamsController({
        async identity(create) {
            state.identityCalls.push(create);
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
                    const items = current.gifs.map((item, i) => ({ id: `gif-${i}`, ...item, memberId: "member-me", displayName: state.displayName }));
                    return { items: items.slice(offset, offset + 60), total: items.length, offset, nextOffset: offset + 60 < items.length ? offset + 60 : null };
                }
                if (action === "invites" && method === "POST") return { code: "private-single-use-code", expiresAt: "2026-11-25T12:00:00.000Z" };
                if (action === "invites" && method === "DELETE") return;
                if (action === "members" && method === "DELETE") { current.other = current.other.filter(item => item.id !== memberId); return; }
                throw Error(`Unhandled fixture route ${method} ${path}`);
            };
        }
    });
    return {
        state, controller, clock, service,
        writes: () => state.calls.filter(call => call.method !== "GET"),
        async start() { controller.start(); await controller.refresh(); await tick(); },
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
