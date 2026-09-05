/*
 * Isolated regression tests for the real Spotify playback store
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const adapter = `
export const environment = {
    owner: 'discord-user-a',
    socket: { accountId: 'spotify-account-a', accessToken: 'fixture-only-not-a-real-token' },
    device: { id: 'device-a', is_active: true, volume_percent: 65 },
    nativeState: null,
    devices: [],
    activeResult: 'normal',
    connected: true,
    accounts: [{ id: 'spotify-account-a', type: 'spotify', revoked: false }],
    requests: [],
    responses: { get: [], post: [], put: [] },
    defaultGet: { status: 204 },
    logs: [],
    changes: 0,
    handlers: new Map(),
    subscribers: new Map()
};
const stores = new Set();
export const FluxDispatcher = {
    subscribe(type, listener) { if (!environment.subscribers.has(type)) environment.subscribers.set(type, new Set()); environment.subscribers.get(type).add(listener); },
    unsubscribe(type, listener) { environment.subscribers.get(type)?.delete(listener); },
    register(listener) { stores.add(listener); return listener; },
    unregister(listener) { stores.delete(listener); },
    waitFor() {},
    dispatch(event) {
        for (const [store, handlers] of environment.handlers) handlers[event.type]?.call(store, event);
        for (const listener of stores) listener(event);
        environment.subscribers.get(event.type)?.forEach(listener => listener(event));
    }
};
class Store {
    listeners = new Set();
    constructor(dispatcher, handlers = {}) { environment.handlers.set(this, handlers); }
    emitChange() { environment.changes++; this.listeners.forEach(listener => listener()); }
    addChangeListener(listener) { this.listeners.add(listener); }
    removeChangeListener(listener) { this.listeners.delete(listener); }
    getDispatchToken() { return 'fixture-dispatch-token'; }
    waitFor() {}
}
export const Flux = { Store };
export const UserStore = { getCurrentUser: () => environment.owner ? { id: environment.owner } : null };
const native = {
    getActiveSocketAndDevice() { return environment.activeResult === 'undefined' ? undefined : environment.activeResult === 'null' ? null : { socket: environment.socket, device: environment.device }; },
    getPlayerState: () => environment.nativeState,
    getPlayableComputerDevices: () => environment.devices,
    hasConnectedAccount: () => environment.connected
};
const api = Object.fromEntries(['get', 'post', 'put'].map(method => [method, (...args) => {
    environment.requests.push({ method, accountId: args[0], options: args[2] });
    const response = environment.responses[method].shift() ?? (method === 'get' ? environment.defaultGet : { status: 204 });
    try { return Promise.resolve(typeof response === 'function' ? response(...args) : response); }
    catch (error) { return Promise.reject(error); }
}]));
export function findByProps(...properties) { if (properties.includes('getActiveSocketAndDevice')) return native; throw new Error('Unexpected webpack fixture lookup: ' + properties.join(',')); }
export function findByPropsLazy(...properties) { if (properties.includes('vcSpotifyMarker')) return api; return findByProps(...properties); }
export function findStoreLazy(name) { if (name === 'ConnectedAccountsStore') return { getAccounts: () => environment.accounts }; throw new Error('Unexpected fixture store: ' + name); }
export const proxyLazyWebpack = factory => factory();
export const settings = { store: { useSpotifyUris: false } };
export const isPluginEnabled = () => false;
export const t = text => text;
export class Logger { constructor() {} error(...args) { environment.logs.push(args); } warn(...args) { environment.logs.push(args); } info() {} debug() {} }
export default { name: 'OpenInAppFixture' };
`;

const bundled = await build({
    stdin: {
        contents: 'export { SpotifyStore } from "./src/midnightcordplugins/musicControls/spotify/SpotifyStore.ts"; export { environment, FluxDispatcher } from "spotify-test-adapter";',
        resolveDir: rootDir,
        sourcefile: "spotify-sync-test-entry.mjs"
    },
    absWorkingDir: rootDir,
    tsconfig: join(rootDir, "tsconfig.json"),
    platform: "node",
    format: "cjs",
    bundle: true,
    write: false,
    plugins: [{
        name: "spotify-discord-adapters",
        setup(builder) {
            builder.onResolve({ filter: /^(spotify-test-adapter|@api\/PluginManager|@midnightcordplugins\/autoTranslateMidnightcord|@plugins\/openInApp|@webpack(?:\/common)?|@utils\/Logger|\.\.\/settings)$/ }, () => ({ path: "adapter", namespace: "spotify-test" }));
            builder.onLoad({ filter: /.*/, namespace: "spotify-test" }, () => ({ contents: adapter, loader: "js" }));
        }
    }]
});
const source = new vm.Script(bundled.outputFiles[0].text, { filename: "spotify-sync-store.cjs" });
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

function apiPlayback(id = "track-a", overrides = {}) {
    return { status: 200, body: {
        item: { id, name: `Title ${id}`, type: "track", duration_ms: 180_000, is_local: false, artists: [{ id: "artist-a", name: "Fixture artist", type: "artist", uri: "spotify:artist:fixture" }], album: { id: "album-a", name: "Fixture album", images: [{ url: "https://fixture.invalid/artwork.png", width: 64, height: 64 }] } },
        is_playing: true, progress_ms: 15_000, repeat_state: "off", shuffle_state: false,
        device: { id: "device-a", is_active: true, volume_percent: 65 }, ...overrides
    } };
}

function nativeTrack(id = "track-a", image = { url: "https://fixture.invalid/artwork.png", width: 64, height: 64 }) {
    return { id, name: `Title ${id}`, duration: 180_000, isLocal: false, artists: [{ id: "artist-a", name: "Fixture artist" }], album: { id: "album-a", name: "Fixture album", image } };
}

function playerEvent(track = nativeTrack(), overrides = {}) {
    return { type: "SPOTIFY_PLAYER_STATE", accountId: "spotify-account-a", track, isPlaying: true, volumePercent: 65, position: 15_000, actual_repeat: "off", shuffle: false, ...overrides };
}

function fixture(t) {
    let now = 1_800_000_000_000;
    let timerId = 0;
    const timers = new Map();
    const events = new Map();
    const logs = [];
    const cleanups = [];
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const schedule = (fn, delay = 0, repeat = 0) => {
        const id = ++timerId;
        timers.set(id, { id, fn, at: now + Math.max(0, Number(delay) || 0), repeat });
        return id;
    };
    const addEventListener = (name, listener) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener); };
    const removeEventListener = (name, listener) => { events.get(name)?.delete(listener); };
    const window = { addEventListener, removeEventListener, document: null };
    const document = { visibilityState: "visible", hidden: false, hasFocus: () => true, addEventListener, removeEventListener };
    const module = { exports: {} };
    const context = vm.createContext({
        module, exports: module.exports, Date: ClockDate, Promise, URL, URLSearchParams, AbortController,
        setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
        setInterval: (fn, delay) => schedule(fn, delay, delay), clearInterval: id => timers.delete(id),
        queueMicrotask, window, document, navigator: { onLine: true },
        console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args), log() {}, debug() {} },
        VencordNative: { native: { openExternal() {} } }
    });
    window.document = document;
    window.setTimeout = context.setTimeout;
    window.clearTimeout = context.clearTimeout;
    window.setInterval = context.setInterval;
    window.clearInterval = context.clearInterval;
    source.runInContext(context);
    const { SpotifyStore: store, environment: host, FluxDispatcher: dispatcher } = module.exports;
    const retain = () => { const release = store.retainSync(); cleanups.push(release); return release; };
    const dispatch = event => dispatcher.dispatch(event);
    const advance = async ms => {
        const end = now + ms;
        let iteration = 0;
        while (true) {
            const timer = [...timers.values()].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
            if (!timer) break;
            assert(++iteration < 1000, "Timer fixture runaway");
            now = timer.at;
            if (timer.repeat) timer.at += timer.repeat;
            else timers.delete(timer.id);
            timer.fn();
            await flush();
        }
        now = end;
        await flush();
    };
    t.after(() => { for (const cleanup of cleanups.reverse()) cleanup(); timers.clear(); });
    return { store, host, dispatch, retain, advance, timers, logs, events, focus: () => events.get("focus")?.forEach(listener => listener()), online: () => events.get("online")?.forEach(listener => listener()) };
}

test("initial retain discovers playback started before the component mounted", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback("already-playing");
    assert.equal(f.host.requests.length, 0, "store import does not poll");
    f.retain();
    await flush();
    assert.equal(f.store.track?.id, "already-playing");
    assert.equal(f.store.isPlaying, true);
    assert.equal(f.store.device?.id, "device-a");
    assert.equal(f.store.canControl, true);
    assert.equal(f.host.requests.filter(request => request.method === "get").length, 1);
});

test("native snapshot hydrates immediately while the API request remains pending", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.nativeState = playerEvent(nativeTrack("native-playing"));
    f.host.responses.get.push(() => request.promise);
    f.retain();
    assert.equal(f.store.track?.id, "native-playing");
    assert.equal(f.store.isPlaying, true);
    request.resolve(apiPlayback("native-playing"));
    await flush();
});

for (const absent of ["undefined", "null"]) test(`Spotify absent (${absent}) does not request or reject commands`, async t => {
    const f = fixture(t);
    f.host.activeResult = absent;
    f.host.socket = null;
    f.host.device = null;
    f.host.connected = false;
    f.retain();
    await flush();
    await Promise.all([f.store.refreshPlayback(), f.store.prev(), f.store.next(), f.store.setPlaying(true), f.store.seek(1000)]);
    assert.equal(f.host.requests.length, 0);
    assert.equal(f.store.canControl, false);
    assert.equal(f.store.track, null);
});

test("events update pause, next track and device without requiring another API request", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback();
    f.retain();
    await flush();
    const before = f.host.requests.length;
    f.dispatch(playerEvent(nativeTrack(), { isPlaying: false, position: 23_000 }));
    assert.equal(f.store.isPlaying, false);
    assert.equal(f.store.position, 23_000);
    assert.equal(f.store.device?.id, "device-a", "event omitting device preserves current device");
    assert.equal(f.store.canControl, true);
    f.dispatch(playerEvent(nativeTrack("track-b"), { position: 0 }));
    assert.equal(f.store.track?.id, "track-b");
    const nextDevice = { id: "device-b", is_active: true };
    f.host.device = nextDevice;
    f.dispatch({ type: "SPOTIFY_SET_DEVICES", accountId: "spotify-account-a", devices: [nextDevice] });
    assert.equal(f.store.device?.id, "device-b");
    assert.equal(f.host.requests.length, before);
});

test("playable device fallback enables control and a missing cover does not hide the track", async t => {
    const f = fixture(t);
    f.host.activeResult = "undefined";
    f.host.device = null;
    const fallbackDevice = { id: "fallback-device", is_active: true, volume_percent: 40 };
    f.host.devices = [{ socket: f.host.socket, device: fallbackDevice }];
    const pending = deferred();
    f.host.responses.get.push(() => pending.promise);
    f.host.nativeState = playerEvent(nativeTrack("no-cover", null));
    f.retain();
    assert.equal(f.store.track?.id, "no-cover");
    assert(f.store.track.album.image, "nullable native cover normalized to a usable object");
    assert.equal(f.store.device?.id, "fallback-device");
    pending.resolve(apiPlayback("no-cover", { device: fallbackDevice }));
    await flush();
    assert.equal(f.store.canControl, true);
});

test("API 204 clears stale playback state", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback();
    f.retain();
    await flush();
    f.host.responses.get.push({ status: 204 });
    await f.store.refreshPlayback();
    assert.equal(f.store.track, null);
    assert.equal(f.store.isPlaying, false);
    assert.equal(f.store.position, 0);
});

test("a late API response cannot overwrite a newer player event", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.responses.get.push(() => request.promise);
    f.retain();
    f.dispatch(playerEvent(nativeTrack("newer-event"), { isPlaying: false, position: 47_000 }));
    request.resolve(apiPlayback("old-api"));
    await flush();
    assert.equal(f.store.track?.id, "newer-event");
    assert.equal(f.store.isPlaying, false);
    assert.equal(f.store.position, 47_000);
});

test("temporary native session loss preserves playback and accepts the known account's event", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback();
    f.retain();
    await flush();
    f.host.activeResult = "undefined";
    f.host.devices = [];
    const before = f.host.requests.length;
    await f.store.refreshPlayback();
    assert.equal(f.store.track?.id, "track-a");
    assert.equal(f.store.canControl, false);
    assert.equal(f.host.requests.length, before);
    f.dispatch(playerEvent(nativeTrack("event-without-device"), { isPlaying: false }));
    assert.equal(f.store.track?.id, "event-without-device");
    assert.equal(f.store.isPlaying, false);
});

test("first event without a session requires a native account snapshot", async t => {
    const f = fixture(t);
    f.host.activeResult = "undefined";
    f.host.devices = [];
    f.retain();
    await flush();
    f.dispatch(playerEvent(nativeTrack("unproven")));
    assert.equal(f.store.track, null, "unproven account is not accepted");
    f.host.nativeState = playerEvent(nativeTrack("proven"));
    f.dispatch(playerEvent(nativeTrack("proven")));
    assert.equal(f.store.track?.id, "proven");
    assert.equal(f.host.requests.length, 0);
});

test("a pause requested during initial synchronization runs after the GET completes", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.responses.get.push(() => request.promise);
    f.retain();
    const pause = f.store.setPlaying(false);
    assert.equal(f.host.requests.filter(request => request.method === "put").length, 0);
    request.resolve(apiPlayback());
    await pause;
    await flush();
    const puts = f.host.requests.filter(request => request.method === "put");
    assert.equal(puts.length, 1);
    assert(puts[0].options.url.endsWith("/pause"));
});

test("only one command queues during a request and seek preserves its clamped target", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.nativeState = playerEvent(nativeTrack());
    f.host.responses.get.push(() => request.promise);
    f.retain();
    const seek = f.store.seek(999_999);
    const duplicateA = f.store.next();
    const duplicateB = f.store.setPlaying(false);
    request.resolve(apiPlayback());
    await Promise.all([seek, duplicateA, duplicateB]);
    const commands = f.host.requests.filter(request => request.method !== "get");
    assert.equal(commands.length, 1);
    assert(commands[0].options.url.endsWith("/seek"));
    assert.equal(commands[0].options.query.position_ms, 180_000);
    assert.equal(f.store.position, 180_000);
    assert.equal(f.store.isSettingPosition, false);
});

test("logout also invalidates a queued command before it can reach the API", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.responses.get.push(() => request.promise);
    f.retain();
    const pause = f.store.setPlaying(false);
    f.host.owner = null;
    f.dispatch({ type: "LOGOUT" });
    request.resolve(apiPlayback());
    await pause;
    await flush();
    assert.equal(f.host.requests.filter(request => request.method !== "get").length, 0);
    assert.equal(f.store.track, null);
});

test("account switching discards the old response and refreshes the new account", async t => {
    const f = fixture(t);
    const oldRequest = deferred();
    f.host.responses.get.push(() => oldRequest.promise);
    f.retain();
    f.host.owner = "discord-user-b";
    f.host.socket = { accountId: "spotify-account-b", accessToken: "fixture-token-b-not-real" };
    f.host.accounts = [{ id: "spotify-account-b", type: "spotify", revoked: false }];
    f.host.device = { id: "device-b", is_active: true };
    f.host.defaultGet = apiPlayback("new-account-track", { device: f.host.device });
    f.dispatch({ type: "CONNECTION_OPEN" });
    oldRequest.resolve(apiPlayback("old-account-track"));
    await flush();
    assert.notEqual(f.store.track?.id, "old-account-track");
    await f.advance(0);
    assert.equal(f.store.track?.id, "new-account-track");
    assert.equal(f.host.requests.at(-1).accountId, "spotify-account-b");
});

test("releasing the final consumer ignores an in-flight result without scheduling more work", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.responses.get.push(() => request.promise);
    const release = f.retain();
    release();
    request.resolve(apiPlayback("too-late"));
    await flush();
    assert.equal(f.store.track, null);
    assert.equal(f.timers.size, 0);
    assert.equal(f.host.requests.length, 1);
});

test("logout prevents an outstanding API response from resurrecting playback", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.nativeState = playerEvent(nativeTrack());
    f.host.responses.get.push(() => request.promise);
    f.retain();
    f.host.owner = null;
    f.host.socket = null;
    f.host.device = null;
    f.dispatch({ type: "LOGOUT" });
    request.resolve(apiPlayback("stale-after-logout"));
    await flush();
    assert.equal(f.store.track, null);
    assert.equal(f.store.canControl, false);
});

test("removing the Spotify connection rejects the old request and clears state", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.nativeState = playerEvent(nativeTrack());
    f.host.responses.get.push(() => request.promise);
    f.retain();
    f.host.socket = null;
    f.host.device = null;
    f.host.nativeState = null;
    f.host.connected = false;
    f.host.accounts = [];
    f.dispatch({ type: "USER_CONNECTIONS_UPDATE", connections: [] });
    const refresh = f.store.refreshPlayback();
    request.resolve(apiPlayback("stale-after-disconnect"));
    await refresh;
    await flush();
    assert.equal(f.store.track, null);
    assert.equal(f.store.canControl, false);
});

test("removing account A while B remains linked clears A despite its cached native snapshot", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback("account-a-track");
    f.host.nativeState = playerEvent(nativeTrack("account-a-track"));
    f.host.accounts.push({ id: "spotify-account-b", type: "spotify", revoked: false });
    f.retain();
    await flush();
    assert.equal(f.store.track?.id, "account-a-track");
    f.host.activeResult = "undefined";
    f.host.devices = [];
    f.host.accounts = [{ id: "spotify-account-b", type: "spotify", revoked: false }];
    f.dispatch({ type: "USER_CONNECTIONS_UPDATE", connections: f.host.accounts });
    assert.equal(f.store.track, null);
    f.dispatch(playerEvent(nativeTrack("removed-account-event")));
    assert.equal(f.store.track, null, "cached removed-account event cannot resurrect playback");
    assert.equal(f.store.canControl, false);
});

test("revoking the current account rejects in-flight results even when another Spotify account exists", async t => {
    const f = fixture(t);
    const request = deferred();
    f.host.nativeState = playerEvent(nativeTrack());
    f.host.accounts.push({ id: "spotify-account-b", type: "spotify", revoked: false });
    f.host.responses.get.push(() => request.promise);
    f.retain();
    f.host.accounts[0].revoked = true;
    f.dispatch({ type: "SPOTIFY_ACCOUNT_ACCESS_TOKEN_REVOKE", accountId: "spotify-account-a" });
    request.resolve(apiPlayback("revoked-account-result"));
    await flush();
    assert.equal(f.store.track, null);
    assert.equal(f.store.canControl, false);
});

test("multiple retainers and refresh calls share a single request and release all timers", async t => {
    const f = fixture(t);
    const pending = deferred();
    f.host.responses.get.push(() => pending.promise);
    const releaseA = f.retain();
    const releaseB = f.retain();
    const a = f.store.refreshPlayback();
    const b = f.store.refreshPlayback();
    f.focus();
    f.online();
    assert.equal(f.host.requests.filter(request => request.method === "get").length, 1);
    pending.resolve(apiPlayback());
    await Promise.all([a, b]);
    releaseA();
    const before = f.host.requests.length;
    releaseB();
    releaseB();
    assert.equal(f.timers.size, 0, "last release clears scheduled work");
    assert.equal([...f.events.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0, "last release removes event listeners");
    await f.advance(120_000);
    assert.equal(f.host.requests.length, before);
});

test("an event postpones fallback polling instead of adding a second timer", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback();
    f.retain();
    await flush();
    await f.advance(20_000);
    f.dispatch(playerEvent(nativeTrack(), { position: 35_000 }));
    const before = f.host.requests.length;
    await f.advance(20_000);
    assert.equal(f.host.requests.length, before);
    await f.advance(11_000);
    assert.equal(f.host.requests.length, before + 1);
});

test("API and command failures are handled without raw errors or rejected promises", async t => {
    const f = fixture(t);
    const rawError = new Error("private fixture detail must never be logged");
    f.host.responses.get.push(() => { throw rawError; });
    f.retain();
    await flush();
    assert.equal(typeof f.store.lastError, "string");
    f.host.defaultGet = apiPlayback();
    await f.advance(30_000);
    for (const [method, command] of [["post", () => f.store.prev()], ["post", () => f.store.next()], ["put", () => f.store.setPlaying(false)], ["put", () => f.store.seek(1000)]]) {
        f.host.responses[method].push(() => { throw rawError; });
        const before = f.host.requests.length;
        await command();
        assert.equal(f.host.requests.length, before + 1);
        await f.advance(30_000);
    }
    assert.equal(f.store.isSettingPosition, false);
    assert.equal([...f.logs, ...f.host.logs].flat().some(value => value === rawError || String(value).includes("private fixture detail")), false);
});

test("rate limits honor Retry-After and do not trigger repeated focus requests", async t => {
    const f = fixture(t);
    f.host.responses.get.push({ status: 429, headers: { "retry-after": "120" } });
    f.retain();
    await flush();
    assert.equal(f.store.canControl, false);
    assert.equal(typeof f.store.lastError, "string");
    f.host.defaultGet = apiPlayback();
    f.focus();
    f.online();
    await f.advance(119_999);
    assert.equal(f.host.requests.length, 1);
    await f.advance(1);
    assert.equal(f.host.requests.length, 2);
    assert.equal(f.store.lastError, null);
    assert.equal(f.store.canControl, true);
});

test("seek clamps requests and calculated playback position to the track duration", async t => {
    const f = fixture(t);
    f.host.defaultGet = apiPlayback();
    f.retain();
    await flush();
    await f.store.seek(-500);
    await f.store.seek(999_999);
    const seeks = f.host.requests.filter(request => request.options.url.endsWith("/seek"));
    assert.deepEqual(plain(seeks.map(request => request.options.query.position_ms)), [0, 180_000]);
    assert.equal(f.store.isSettingPosition, false);
    f.store.position = 179_950;
    await f.advance(100);
    assert.equal(f.store.position, 180_000);
    f.store.position = -100;
    assert.equal(f.store.mPosition, 0);
});
