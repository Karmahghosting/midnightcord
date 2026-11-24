/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

import { createCloudServer } from "../services/cloud-api/server.mjs";

const controllerCode = transformSync(await readFile(new URL("../src/midnightcordplugins/gifTeams/controller.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const serviceCode = transformSync(await readFile(new URL("../src/midnightcordplugins/gifTeams/service.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const cryptoCode = transformSync(await readFile(new URL("../src/api/SettingsSync/cloudCrypto.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const favoritesCode = transformSync(await readFile(new URL("../src/midnightcordplugins/gifTeams/favorites.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const clone = value => JSON.parse(JSON.stringify(value));

function evaluate(code, dependencies, extras = {}) {
    const module = { exports: {} };
    runInNewContext(code, {
        module, exports: module.exports, Error, DOMException, AbortController, URL, URLSearchParams,
        TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto, btoa, atob,
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
        ...extras
    });
    return module.exports;
}

const cloudCrypto = evaluate(cryptoCode, {});
const favoritesApi = evaluate(favoritesCode, {
    "@utils/discord": { insertTextIntoChatInputBox: () => { throw Error("No draft is modified in HTTP integration tests"); } },
    "@webpack": { onceReady: Promise.resolve() },
    "@webpack/common": {}
});
const gif = name => ({ url: `https://tenor.com/view/${name}`, src: `https://media.tenor.com/${name}/tenor.gif`, width: 320, height: 240, format: 1, title: name });

async function integration(t) {
    const dataDir = await mkdtemp(join(tmpdir(), "midnightcord-gif-client-integration-"));
    let externalCalls = 0;
    const server = createCloudServer({ dataDir, env: {}, fetchImpl: async () => { externalCalls++; throw Error("External network is forbidden in this integration test"); } });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const calls = [];
    const clients = [];
    const service = evaluate(serviceCode, {
        "@api/SettingsSync/cloudCrypto": cloudCrypto,
        "@api/SettingsSync/cloudSetup": { CLOUD_API_BASE: base }
    }, {
        async fetch(url, init) {
            assert.equal(new URL(url).origin, new URL(base).origin, "Only this test server can receive requests");
            calls.push({ url: String(url), method: init.method, authorization: init.headers.Authorization, body: init.body });
            return fetch(url, { ...init, headers: { ...init.headers, Origin: "https://discord.com" } });
        }
    });
    const exported = evaluate(controllerCode, {
        "@api/SettingsSync/cloudSetup": { createCloudIdentity: () => { throw Error("No real Cloud identity may be created"); }, getCloudKey: () => null },
        "./favorites": { getCurrentUser: () => null, loadFavorites: () => [], subscribeFavorites: () => () => {}, subscribeUser: () => () => {} },
        "./service": service
    });

    async function client(id, displayName, favorites) {
        const key = cloudCrypto.createCloudKey();
        const authorization = await service.deriveTeamsAuthorization(key, id);
        const state = { id, displayName, favorites };
        const controller = exported.createGifTeamsController({
            identity: async () => ({ userId: state.id, displayName: state.displayName, authorization }),
            currentUserId: () => state.id,
            favorites: async () => clone(state.favorites),
            subscribeFavorites: () => () => {}, subscribeUser: () => () => {},
            api: service.createTeamsApi
        });
        clients.push(controller);
        controller.start();
        await controller.refresh();
        return { controller, state, authorization, cloudAuthorization: await cloudCrypto.deriveCloudAuthorization(key) };
    }

    t.after(async () => {
        for (const client of clients) client.stop();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await rm(dataDir, { recursive: true, force: true });
    });
    return { client, calls, externalCalls: () => externalCalls };
}

test("real client and HTTP API keep team sharing private through invitation, sync, filtering and removal", async t => {
    const f = await integration(t);
    const owner = await f.client("1337883355840118887", "Owner", Array.from({ length: 65 }, (_, index) => gif(`owner-${index}`)));
    const guest = await f.client("1395048695501688953", "Guest", [gif("guest-selected"), gif("guest-private")]);
    const outsider = await f.client("1513621244753350737", "Outsider", [gif("outsider-private")]);
    await owner.controller.createTeam("Les amis");
    const created = owner.controller.getSnapshot();
    assert.equal(created.error, null);
    assert.equal(created.team.name, "Les amis");
    assert.equal(created.sharing.mode, "off");
    assert.equal(created.page.total, 0);
    const teamId = created.team.id;

    await outsider.controller.selectTeam(teamId);
    assert.equal(outsider.controller.getSnapshot().team, null);
    assert(outsider.controller.getSnapshot().error);

    await owner.controller.createInvite();
    const invite = owner.controller.getSnapshot().invite;
    assert(invite.code);
    await guest.controller.joinTeam(invite.code);
    assert.equal(guest.controller.getSnapshot().error, null);
    assert.equal(guest.controller.getSnapshot().team.role, "member");
    assert.equal(guest.controller.getSnapshot().sharing.mode, "off");
    assert.deepEqual(clone(guest.controller.getSnapshot().sharing.gifs), []);
    const guestId = guest.controller.getSnapshot().viewerId;
    const ownerId = owner.controller.getSnapshot().viewerId;

    await outsider.controller.joinTeam(invite.code);
    assert.equal(outsider.controller.getSnapshot().teams.length, 0, "Invitations are consumed once");

    await owner.controller.setSharing("auto");
    assert.equal(owner.controller.getSnapshot().error, null);
    assert.equal(owner.controller.getSnapshot().sharing.gifs.length, 65);
    await guest.controller.setSharing("manual", [gif("guest-selected").url]);
    assert.equal(guest.controller.getSnapshot().error, null);
    assert.equal(guest.controller.getSnapshot().sharing.gifs.length, 1);
    assert.equal(guest.controller.getSnapshot().page.total, 66);

    await guest.controller.loadPage(ownerId, 0);
    let visible = guest.controller.getSnapshot().page;
    assert.equal(visible.items.length, 60);
    assert.equal(visible.total, 65);
    assert.equal(visible.nextOffset, 60);
    assert(visible.items.every(item => item.memberId === ownerId && item.displayName === "Owner"));
    await guest.controller.loadPage(ownerId, visible.nextOffset);
    visible = guest.controller.getSnapshot().page;
    assert.equal(visible.items.length, 5);
    assert.equal(visible.nextOffset, null);

    owner.state.favorites = [gif("owner-new"), ...owner.state.favorites.slice(1)];
    await owner.controller.refresh();
    assert.equal(owner.controller.getSnapshot().error, null);
    await guest.controller.loadPage(ownerId);
    visible = guest.controller.getSnapshot().page;
    assert.equal(visible.total, 65);
    assert.equal(visible.items[0].url, gif("owner-new").url);
    assert(!visible.items.some(item => item.url === gif("owner-0").url));

    guest.state.favorites.push(gif("guest-also-private"));
    await guest.controller.refresh();
    assert.equal(guest.controller.getSnapshot().sharing.gifs.length, 1);
    await owner.controller.loadPage(guestId);
    assert.deepEqual(clone(owner.controller.getSnapshot().page.items.map(item => item.url)), [gif("guest-selected").url]);
    assert(f.calls.every(call => !call.body?.includes("guest-private") && !call.body?.includes("guest-also-private")), "Unselected favorites never leave the device");

    guest.state.favorites = guest.state.favorites.filter(item => item.url !== gif("guest-selected").url);
    await guest.controller.refresh();
    await owner.controller.loadPage(guestId);
    assert.equal(owner.controller.getSnapshot().page.total, 0);

    await owner.controller.removeMember(guestId);
    assert.equal(owner.controller.getSnapshot().error, null);
    await guest.controller.refresh();
    assert.equal(guest.controller.getSnapshot().teams.length, 0);
    assert.equal(guest.controller.getSnapshot().team, null);
    assert.equal(guest.controller.getSnapshot().page, null);
    await guest.controller.selectTeam(teamId);
    assert.equal(guest.controller.getSnapshot().team, null);
    assert(guest.controller.getSnapshot().error);

    await owner.controller.setSharing("off");
    assert.equal(owner.controller.getSnapshot().error, null);
    assert.equal(owner.controller.getSnapshot().sharing.gifs.length, 0);
    await owner.controller.deleteAccount();
    assert.equal(owner.controller.getSnapshot().teams.length, 0);
    assert.equal(owner.controller.getSnapshot().team, null);
    assert.equal(f.externalCalls(), 0);
    for (const client of [owner, guest, outsider]) {
        assert.notEqual(client.authorization, client.cloudAuthorization);
        assert(!f.calls.some(call => call.authorization === `Bearer ${client.cloudAuthorization}`));
    }
});

test("native favorite normalization and server canonicalization converge without repeated uploads", async t => {
    const f = await integration(t);
    const normalized = favoritesApi.normalizeFavorites({
        "https://tenor.com/view/video#fragment": { format: 2, src: "https://media.tenor.com/video/a.mp4#fragment", width: 320.8, height: 240, title: " video\u0000 " },
        "https://example.com/reaction.gif": { format: 1, src: "https://not-an-approved-preview.com/track.gif", width: NaN, height: 20000, title: "x".repeat(200) },
        "https://tenor.com/view/missing": { format: 1, src: undefined, width: 0, height: -5 },
        "https://tenor.com/view/video#duplicate": { format: 2, src: "https://media.tenor.com/video/old.mp4", order: -1 },
        "https://tenor.com/view/not-a-gif": { format: 0, src: "https://media.tenor.com/ignored.gif" },
        "https://127.0.0.1/private": { format: 1, src: "https://media.tenor.com/private.gif" }
    });
    assert.equal(normalized.length, 3);
    const owner = await f.client("1337883355840118887", "Owner", normalized);
    await owner.controller.createTeam("Canonical favorites");
    await owner.controller.setSharing("auto");
    assert.equal(owner.controller.getSnapshot().error, null);
    const sharing = owner.controller.getSnapshot().sharing;
    assert.equal(sharing.gifs.length, 3);
    assert.equal(sharing.gifs.find(gif => gif.url === "https://example.com/reaction.gif").src, "");
    const before = f.calls.filter(call => call.method === "PUT").length;
    for (let index = 0; index < 3; index++) await owner.controller.refresh();
    assert.equal(owner.controller.getSnapshot().error, null);
    assert.equal(f.calls.filter(call => call.method === "PUT").length, before, "Canonicalized values must not oscillate between client and server");
    assert.equal(f.externalCalls(), 0);
});
