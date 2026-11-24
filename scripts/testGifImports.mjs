/*
 * Shared GIF import provenance regression checks
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const compile = path => transformSync(readFileSync(new URL(path, import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function evaluate(code, dependencies) {
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, Error, TypeError, DOMException, URL, TextEncoder, TextDecoder,
        Uint8Array, ArrayBuffer, crypto: webcrypto, btoa, atob,
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; }
    });
    return module.exports;
}
const cloudCrypto = evaluate(compile("../src/api/SettingsSync/cloudCrypto.ts"), {});
const favorites = evaluate(compile("../src/midnightcordplugins/gifTeams/favorites.ts"), {
    "./preview": evaluate(compile("../src/midnightcordplugins/gifTeams/preview.ts"), {}),
    "@utils/discord": { insertTextIntoChatInputBox() { throw Error("No chat writes are allowed"); } },
    "@webpack": { onceReady: Promise.resolve(), findLazy: () => ({}), findByPropsLazy: () => ({}) },
    "@webpack/common": { UserStore: { getCurrentUser: () => null } }
});
const importsCode = compile("../src/midnightcordplugins/gifTeams/imports.ts");
const imports = evaluate(importsCode, {
    "@api/DataStore": { get() { throw Error("Singleton must stay idle"); }, set() { throw Error("Singleton must stay idle"); } },
    "@api/SettingsSync/cloudCrypto": cloudCrypto,
    "./favorites": favorites
});
const account = "1337883355840118887";
const anotherAccount = "1395048695501688953";
const key = userId => `midnightcord-gif-imports-v1:${userId}`;
const gif = name => ({ url: `https://tenor.com/view/${name}`, src: `https://media.tenor.com/${name}/tenor.gif`, format: 1, width: 320, height: 240 });
const alpha = gif("alpha"), bravo = gif("bravo");

function fixture() {
    const state = { userId: account, reads: [], writes: [], storage: new Map() };
    const create = () => imports.createGifImportStore({
        currentUserId: () => state.userId,
        async read(id) { state.reads.push(id); await state.readHold?.(); return copy(state.storage.get(id)); },
        async write(id, data) {
            await state.writeHold?.();
            if (state.writeError) throw state.writeError;
            state.writes.push({ key: id, data: copy(data) });
            state.storage.set(id, copy(data));
        }
    });
    return { state, store: create(), create };
}

test("provenance is reserved before import, persisted as hashes and survives restart", async () => {
    const f = fixture();
    const prepared = await f.store.prepare(account, [alpha, bravo], []);
    assert.deepEqual(copy(prepared.gifs), [alpha, bravo]);
    assert.deepEqual(copy(prepared.freshUrls), [alpha.url, bravo.url]);
    assert.equal(f.state.writes.length, 1);
    const persisted = f.state.storage.get(key(account));
    assert.equal(Object.keys(persisted.entries).length, 2);
    for (const [id, value] of Object.entries(persisted.entries)) {
        assert.match(id, /^[A-Za-z0-9_-]{43}$/);
        assert.deepEqual(value, { seen: false, imported: true });
    }
    assert.equal(JSON.stringify(persisted).includes("tenor.com"), false);
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha, bravo])), []);
    await f.store.confirm(account, [alpha.url], [], prepared.freshUrls);
    const restarted = f.create();
    const again = await restarted.prepare(account, [alpha, bravo], []);
    assert.deepEqual(copy(again.gifs), [bravo], "An acknowledged import is not added again after the user unfavorites it");
    assert.deepEqual(copy(again.freshUrls), [], "An ambiguous previous import is not treated as a new personal favorite");
    await restarted.confirm(account, [], [bravo.url], again.freshUrls);
    assert.deepEqual(copy(await restarted.filterAutomatic(account, [alpha, bravo])), []);
});

test("an old unsupported preview remains retryable after the resolver is fixed", async () => {
    const f = fixture();
    const recovered = { url: "https://gif.fxtwitter.com/tweet_video/HQoRP4IbwAAzfCG.webp", src: "", format: 2, width: 320, height: 180 };
    const originallySkipped = await f.store.prepare(account, [recovered], []);
    // The previous adapter reported unsupported_preview, so there was no added
    // or existing native URL to acknowledge. A restart must retain that fact.
    await f.store.confirm(account, [], [], originallySkipped.freshUrls);
    assert(Object.values(f.state.storage.get(key(account)).entries).every(entry => entry.seen === false));
    const retry = await f.create().prepare(account, [recovered], []);
    assert.deepEqual(copy(retry.gifs), [recovered]);
    assert.deepEqual(copy(retry.freshUrls), []);
    await f.store.confirm(account, [recovered.url], [], retry.freshUrls);
    assert.deepEqual(copy((await f.create().prepare(account, [recovered], [])).gifs), [], "Once imported, a subsequent user removal remains respected");
});

test("favorites owned before a team import stay eligible for automatic sharing", async () => {
    const f = fixture();
    const prepared = await f.store.prepare(account, [alpha, bravo], [alpha]);
    assert.deepEqual(copy(prepared.gifs), [bravo]);
    assert.deepEqual(copy(prepared.freshUrls), [bravo.url]);
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha, bravo])), [alpha]);
    await f.store.confirm(account, [bravo.url], [], prepared.freshUrls);
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha, bravo])), [alpha]);
    const removed = await f.store.prepare(account, [alpha, bravo], []);
    assert.deepEqual(copy(removed.gifs), [], "Neither a removed personal favorite nor a removed imported one is reinjected");
});

test("a personal favorite added during a fresh import is distinguished from an ambiguous older reservation", async () => {
    const f = fixture();
    const prepared = await f.store.prepare(account, [alpha], []);
    await f.store.confirm(account, [], [alpha.url], prepared.freshUrls);
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha])), [alpha]);

    const pending = await f.store.prepare(account, [bravo], []);
    assert.deepEqual(copy(pending.freshUrls), [bravo.url]);
    const restarted = f.create();
    const retry = await restarted.prepare(account, [bravo], []);
    assert.deepEqual(copy(retry.freshUrls), []);
    await restarted.confirm(account, [], [bravo.url], retry.freshUrls);
    assert.deepEqual(copy(await restarted.filterAutomatic(account, [alpha, bravo])), [alpha], "A native write before a crash must never leak through auto-sharing on retry");
});

test("empty, duplicate and unsafe incoming URLs do not pollute the ledger", async () => {
    const f = fixture();
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha])), [alpha]);
    assert.equal(f.state.writes.length, 0);
    assert.deepEqual(copy(await f.store.prepare(account, [], [])), { gifs: [], freshUrls: [] });
    assert.equal(f.state.writes.length, 0);
    const prepared = await f.store.prepare(account, [alpha, { ...alpha, url: alpha.url + "#duplicate" }, { ...bravo, url: "https://127.0.0.1/private" }], []);
    assert.deepEqual(copy(prepared.gifs), [alpha]);
    assert.equal(Object.keys(f.state.storage.get(key(account)).entries).length, 1);
});

test("failed durable reservations abort preparation and do not publish a partial cache", async () => {
    const f = fixture();
    f.state.writeError = Error("storage unavailable");
    await assert.rejects(f.store.prepare(account, [alpha], []), /storage unavailable/);
    assert.equal(f.state.storage.size, 0);
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha])), [alpha]);
    f.state.writeError = null;
    const prepared = await f.store.prepare(account, [alpha], []);
    assert.deepEqual(copy(prepared.freshUrls), [alpha.url]);
    assert.equal(f.state.writes.length, 1);
});

test("the bounded ledger refuses new provenance without forgetting acknowledged removals", async () => {
    const f = fixture();
    const entries = {};
    for (let index = 0; index < 50_000; index++) {
        const id = Buffer.alloc(32);
        id.writeUInt32BE(index);
        entries[id.toString("base64url")] = { seen: true, imported: true };
    }
    f.state.storage.set(key(account), { version: 1, entries });
    await assert.rejects(f.store.prepare(account, [alpha], []), /limite/);
    assert.equal(f.state.writes.length, 0);
    assert.equal(Object.keys(f.state.storage.get(key(account)).entries).length, 50_000);
    assert.deepEqual(copy(await f.store.filterAutomatic(account, [alpha])), [alpha]);
});

test("corrupt persistence fails closed for both import and outgoing automatic sharing", async () => {
    for (const record of [null, { version: 2, entries: {} }, { version: 1, entries: [] }, { version: 1, entries: { invalid: { seen: false, imported: true } } }]) {
        const f = fixture();
        f.state.storage.set(key(account), record);
        await assert.rejects(f.store.prepare(account, [alpha], []), /illisible/);
        await assert.rejects(f.store.filterAutomatic(account, [alpha]), /illisible/);
        assert.equal(f.state.writes.length, 0);
        assert.deepEqual(f.state.storage.get(key(account)), record);
    }
});

test("each Discord account has a separate ledger and pending reads reject account changes or aborts", async () => {
    const f = fixture();
    const prepared = await f.store.prepare(account, [alpha], []);
    await f.store.confirm(account, [alpha.url], [], prepared.freshUrls);
    f.state.userId = anotherAccount;
    assert.deepEqual(copy(await f.store.filterAutomatic(anotherAccount, [alpha])), [alpha]);
    assert.equal(f.state.storage.has(key(anotherAccount)), false);

    for (const change of ["user", "abort"]) {
        const f = fixture();
        const gate = deferred();
        f.state.readHold = () => gate.promise;
        const signal = new AbortController();
        const pending = f.store.filterAutomatic(account, [alpha], signal.signal);
        for (let i = 0; i < 10; i++) await Promise.resolve();
        if (change === "user") f.state.userId = anotherAccount;
        else signal.abort();
        gate.resolve();
        await assert.rejects(pending, { name: "AbortError" });
        assert.equal(f.state.writes.length, 0);
    }
    const signal = new AbortController();
    signal.abort();
    await assert.rejects(f.store.prepare(anotherAccount, [bravo], [], signal.signal), { name: "AbortError" });
    assert.equal(f.state.storage.has(key(anotherAccount)), false);
});
