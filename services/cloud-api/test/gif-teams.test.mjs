import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCloudServer } from "../server.mjs";

const BASE = "/v1/cloud/gif-teams";
const token = () => `mc1.${randomBytes(32).toString("base64url")}`;
const gif = (name = "hello") => ({ url: `https://tenor.com/view/${name}`, src: `https://media.tenor.com/${name}/clip.mp4`, width: 320, height: 240, title: name, format: 2 });

async function fixture(t) {
    const dataDir = await mkdtemp(join(tmpdir(), "midnightcord-gif-teams-"));
    let clock = Date.parse("2026-11-24T12:00:00Z");
    let server;
    let base;
    let networkRequests = 0;
    const start = async () => {
        server = createCloudServer({ dataDir, now: () => clock, fetchImpl: () => { networkRequests++; throw new Error("No external fetch is allowed"); } });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    };
    const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
    await start();
    t.after(async () => { await stop(); await rm(dataDir, { recursive: true, force: true }); });
    const request = (credential, suffix = "", method = "GET", body, headers = {}) => fetch(`${base}${suffix.startsWith("/v1/") ? suffix : BASE + suffix}`, {
        method, headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = async (credential, suffix, method, body, status = 200) => {
        const response = await request(credential, suffix, method, body);
        const result = await response.json();
        assert.equal(response.status, status, JSON.stringify(result));
        return result;
    };
    return {
        request, json, dataDir,
        teamPath: id => join(dataDir, "gif-teams", "teams", id),
        create: (credential, name = "Les copains") => json(credential, "", "POST", { name, displayName: "Owner" }, 201),
        invite: (credential, id) => json(credential, `/${id}/invites`, "POST", undefined, 201),
        join: (credential, code, displayName = "Member") => json(credential, "/join", "POST", { code, displayName }),
        share: (credential, id, gifs = [gif()], revision = 0, mode = "manual", displayName = "Contributor") => json(credential, `/${id}/sharing`, "PUT", { mode, gifs, revision, displayName }),
        restart: async () => { await stop(); await start(); },
        advance: ms => { clock += ms; },
        networkRequests: () => networkRequests
    };
}

test("private teams require credentials, default to off and expose only public member identifiers", async t => {
    const f = await fixture(t);
    const owner = token();
    const outsider = token();
    assert.equal((await f.request(null)).status, 401);
    const team = await f.create(owner);
    assert.equal(team.mode, "off");
    assert.equal(team.sharingRevision, 0);
    assert.equal(team.memberCount, 1);
    assert.equal(team.gifCount, 0);
    assert.equal(team.members[0].id, team.ownerId);
    assert.equal(team.members[0].role, "owner");
    assert.equal(Object.hasOwn(team.members[0], "accountId"), false);
    const ownerList = await f.json(owner, "", "GET");
    assert.equal(ownerList.viewerId, team.ownerId);
    assert.equal(ownerList.teams[0].id, team.id);
    assert.deepEqual(ownerList.limits, { maxTeams: 10, maxMembers: 25, maxGifs: 1000 });
    assert.deepEqual((await f.json(outsider, "", "GET")).teams, []);
    for (const suffix of [`/${team.id}`, `/${team.id}/sharing`, `/${team.id}/gifs`, `/${team.id}/gifs?member=${team.ownerId}`]) {
        assert.equal((await f.request(outsider, suffix)).status, 404);
    }
    const raw = JSON.stringify(ownerList);
    assert.equal(raw.includes(owner), false);
    assert.equal(raw.includes(createHash("sha256").update(`midnightcord-cloud:${owner}`).digest("hex")), false);
    assert.equal((await f.request(owner, "", "GET", undefined, { Origin: "https://malicious.example" })).status, 403);
    const allowed = await f.request(owner, "", "GET", undefined, { Origin: "https://discord.com" });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://discord.com");
    assert.equal(allowed.headers.get("cache-control"), "no-store");
    const head = await f.request(owner, `/${team.id}`, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
});

test("single-use invites admit one concurrent recipient and never grant owner permissions", async t => {
    const f = await fixture(t);
    const owner = token(), alice = token(), bob = token();
    const team = await f.create(owner);
    const invite = await f.invite(owner, team.id);
    const responses = await Promise.all([alice, bob].map(member => f.request(member, "/join", "POST", { code: invite.code, displayName: "Guest", role: "owner", ownerId: "spoof" })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 404]);
    const joined = responses[0].status === 200 ? alice : bob;
    const state = await f.json(joined, `/${team.id}`, "GET");
    assert.equal(state.role, "member");
    assert.equal(state.mode, "off");
    assert.equal(state.memberCount, 2);
    assert.equal((await f.request(joined, `/${team.id}/invites`, "POST")).status, 403);
    assert.equal((await f.request(joined, `/${team.id}`, "DELETE")).status, 403);
    assert.equal((await f.request(joined, `/${team.id}/members/${team.ownerId}`, "DELETE")).status, 403);
    assert.equal((await f.request(token(), "/join", "POST", { code: invite.code, displayName: "Other" })).status, 404);
    const metadata = await readFile(join(f.teamPath(team.id), "team.json"), "utf8");
    assert.equal(metadata.includes(invite.code), false);
});

test("invitation rotation, revocation, expiry and persistence work without storing raw codes", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    const first = await f.invite(owner, team.id);
    const second = await f.invite(owner, team.id);
    assert.equal((await f.request(token(), "/join", "POST", { code: first.code, displayName: "Guest" })).status, 404);
    assert.equal((await f.request(owner, `/${team.id}/invites`, "DELETE")).status, 204);
    assert.equal((await f.request(token(), "/join", "POST", { code: second.code, displayName: "Guest" })).status, 404);
    const expired = await f.invite(owner, team.id);
    f.advance(24 * 60 * 60_000);
    assert.equal((await f.request(token(), "/join", "POST", { code: expired.code, displayName: "Guest" })).status, 404);
    const fresh = await f.invite(owner, team.id);
    const metadata = await readFile(join(f.teamPath(team.id), "team.json"), "utf8");
    assert.equal(metadata.includes(fresh.code), false);
    await f.restart();
    const member = await f.join(token(), fresh.code);
    assert.equal(member.memberCount, 2);
    assert.equal(f.networkRequests(), 0);
});

test("automatic and manual snapshots preserve previews, contributors and pagination; off clears data", async t => {
    const f = await fixture(t);
    const owner = token(), member = token();
    const team = await f.create(owner);
    await f.join(member, (await f.invite(owner, team.id)).code, "Alice");
    const first = await f.share(owner, team.id, [gif("one"), gif("two"), gif("two")], 0, "auto", "Yohan");
    assert.equal(first.gifs.length, 2);
    assert.equal(first.gifs[0].format, 2);
    assert.equal(first.gifs[0].src, gif("one").src);
    assert.equal(first.revision, 1);
    await f.share(member, team.id, [gif("one"), gif("three")], 0, "manual", "Alice");
    let list = await f.json(member, `/${team.id}/gifs?offset=1&limit=2`, "GET");
    assert.equal(list.total, 4);
    assert.equal(list.nextOffset, 3);
    assert.deepEqual(list.items.map(item => item.title), ["two", "one"]);
    assert.deepEqual(list.items.map(item => item.displayName), ["Yohan", "Alice"]);
    assert.notEqual(list.items[0].memberId, list.items[1].memberId);
    list = await f.json(member, `/${team.id}/gifs?member=${team.ownerId}&limit=100`, "GET");
    assert.equal(list.total, 2);
    assert.equal(list.nextOffset, null);
    await f.share(owner, team.id, [gif("four")], 1, "auto");
    assert.equal((await readdir(f.teamPath(team.id))).filter(name => name.startsWith("share-")).length, 2, "Old owner generation was removed");
    await f.share(owner, team.id, [], 2, "off");
    assert.equal((await readdir(f.teamPath(team.id))).filter(name => name.startsWith("share-")).length, 1);
    list = await f.json(member, `/${team.id}/gifs?member=${team.ownerId}`, "GET");
    assert.deepEqual(list.items, []);
    assert.equal(list.total, 0);
    assert.equal((await f.json(owner, "", "GET")).teams[0].sharingRevision, 3);
    assert.equal(f.networkRequests(), 0, "The API never fetches a GIF URL");
});

test("concurrent edits use member revisions and cannot silently overwrite another device", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    const responses = await Promise.all(["one", "two"].map(name => f.request(owner, `/${team.id}/sharing`, "PUT", { mode: "auto", gifs: [gif(name)], revision: 0, displayName: "Owner" })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const state = await f.json(owner, `/${team.id}/sharing`, "GET");
    assert.equal(state.revision, 1);
    assert.equal(state.gifs.length, 1);
    await f.share(owner, team.id, [gif("three")], 1);
    assert.equal((await f.json(owner, `/${team.id}/sharing`, "GET")).revision, 2);
});

test("leaving and removal revoke reads and writes and delete member collections", async t => {
    const f = await fixture(t);
    const owner = token(), alice = token(), bob = token();
    const team = await f.create(owner);
    await f.join(alice, (await f.invite(owner, team.id)).code);
    await f.join(bob, (await f.invite(owner, team.id)).code);
    await f.share(alice, team.id);
    await f.share(bob, team.id);
    assert.equal((await f.request(owner, `/${team.id}/membership`, "DELETE")).status, 409);
    assert.equal((await f.request(alice, `/${team.id}/membership`, "DELETE")).status, 204);
    const bobId = (await f.json(bob, "", "GET")).viewerId;
    assert.equal((await f.request(owner, `/${team.id}/members/${bobId}`, "DELETE")).status, 204);
    for (const former of [alice, bob]) {
        assert.equal((await f.request(former, `/${team.id}/gifs`)).status, 404);
        assert.equal((await f.request(former, `/${team.id}/sharing`, "PUT", { mode: "manual", gifs: [gif()], revision: 1, displayName: "Former" })).status, 404);
        assert.deepEqual((await f.json(former, "", "GET")).teams, []);
    }
    assert.equal((await readdir(f.teamPath(team.id))).filter(name => name.startsWith("share-")).length, 0);
    await f.restart();
    assert.equal((await f.request(bob, `/${team.id}`)).status, 404);
    assert.equal((await f.json(owner, `/${team.id}`, "GET")).memberCount, 1);
});

test("deleting a team or the caller account clears memberships and persistent collections", async t => {
    const f = await fixture(t);
    const owner = token(), member = token(), other = token();
    const owned = await f.create(owner);
    const foreign = await f.create(other);
    await f.join(member, (await f.invite(owner, owned.id)).code);
    await f.join(owner, (await f.invite(other, foreign.id)).code);
    await f.share(owner, owned.id);
    await f.share(owner, foreign.id);
    assert.equal((await f.request(owner, "/account", "DELETE")).status, 204);
    assert.deepEqual((await f.json(owner, "", "GET")).teams, []);
    assert.deepEqual((await f.json(member, "", "GET")).teams, []);
    assert.equal((await f.json(other, `/${foreign.id}`, "GET")).memberCount, 1);
    assert.equal((await readdir(f.teamPath(foreign.id))).filter(name => name.startsWith("share-")).length, 0);
    await assert.rejects(readFile(join(f.teamPath(owned.id), "team.json")), { code: "ENOENT" });
    assert.equal((await f.request(other, `/${foreign.id}`, "DELETE")).status, 204);
    await f.restart();
    assert.deepEqual((await f.json(other, "", "GET")).teams, []);
});

test("ordinary Cloud account erasure also removes teams using the same credential", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    await f.share(owner, team.id);
    const response = await f.request(owner, "/v1/cloud/account", "DELETE", undefined, { "X-Midnightcord-Confirm": "delete-account" });
    assert.equal(response.status, 204);
    assert.deepEqual((await f.json(owner, "", "GET")).teams, []);
});

test("HTTPS URLs are normalized, unsafe hosts rejected and unknown preview providers are not embedded", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    const invalid = ["http://tenor.com/view/a", "javascript:alert(1)", "https://localhost/a", "https://127.0.0.1/a", "https://2130706433/a", "https://[::1]/a", "https://user:pass@tenor.com/a", "https://tenor.com:444/a", "https://intranet.local/a", "https://somewhere.internal/a", "https://192.168.1.5/a", "https://metadata.google.internal/a"];
    for (const url of invalid) {
        const response = await f.request(owner, `/${team.id}/sharing`, "PUT", { mode: "auto", gifs: [{ ...gif(), url }], revision: 0, displayName: "Owner" });
        assert.equal(response.status, 400, url);
        assert.equal((await response.json()).error, "invalid_gif_url");
    }
    const state = await f.share(owner, team.id, [{ ...gif(), url: "https://tenor.com/view/a#fragment", src: "https://tracking.net/pixel.gif", width: -1, height: 99_999, title: "x".repeat(200) }]);
    assert.equal(state.gifs[0].src, "");
    assert.equal(state.gifs[0].url, "https://tenor.com/view/a");
    assert.equal(state.gifs[0].width, 0);
    assert.equal(state.gifs[0].height, 0);
    assert.equal(state.gifs[0].title.length, 120);
    assert.equal(f.networkRequests(), 0);
});

test("invalid modes, large collections, page bounds and method errors leave existing data untouched", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    for (const body of [
        { mode: "anything", gifs: [] }, { mode: "off", gifs: [gif()] },
        { mode: "manual", gifs: Array.from({ length: 1001 }, () => gif()) }, { mode: "auto", gifs: {} }
    ]) {
        const response = await f.request(owner, `/${team.id}/sharing`, "PUT", { revision: 0, displayName: "Owner", ...body });
        assert.equal(response.status, 400);
    }
    assert.equal((await f.request(owner, `/${team.id}/sharing`, "PUT", { revision: 0, mode: "off", gifs: [], displayName: " " })).status, 400);
    for (const query of ["offset=-1", "offset=999999", "limit=101", "limit=0", "offset=1.5"]) {
        assert.equal((await f.request(owner, `/${team.id}/gifs?${query}`)).status, 400);
    }
    assert.equal((await f.request(owner, `/${team.id}/gifs?member=not-a-member`)).status, 404);
    assert.equal((await f.request(owner, `/${team.id}/sharing`, "DELETE")).status, 405);
    assert.equal((await f.request(owner, "/..%2F..%2Fprivate", "GET")).status, 404);
    assert.equal((await f.request(owner, "", "POST")).status, 415);
    assert.deepEqual((await f.json(owner, `/${team.id}/sharing`, "GET")).gifs, []);
});

test("team and member quotas count memberships and release capacity after leaving", async t => {
    const f = await fixture(t);
    const owner = token();
    const first = await f.create(owner);
    for (let index = 1; index < 10; index++) await f.create(owner, `Team ${index}`);
    assert.equal((await f.request(owner, "", "POST", { name: "Too many", displayName: "Owner" })).status, 409);
    assert.equal((await f.request(owner, `/${first.id}`, "DELETE")).status, 204);
    const team = await f.create(owner);
    const members = [];
    for (let index = 0; index < 24; index++) {
        const member = token();
        members.push(member);
        await f.join(member, (await f.invite(owner, team.id)).code);
    }
    const invite = await f.invite(owner, team.id);
    assert.equal((await f.request(token(), "/join", "POST", { code: invite.code, displayName: "Too many" })).status, 409);
    assert.equal((await f.request(members[0], `/${team.id}/membership`, "DELETE")).status, 204);
    assert.equal((await f.join(token(), invite.code)).memberCount, 25);
});

test("collections and modes survive restart and do not count as encrypted backup accounts", async t => {
    const f = await fixture(t);
    const owner = token(), member = token();
    const team = await f.create(owner);
    await f.join(member, (await f.invite(owner, team.id)).code);
    await f.share(owner, team.id, [gif("persist")], 0, "auto");
    await f.restart();
    const sharing = await f.json(owner, `/${team.id}/sharing`, "GET");
    assert.equal(sharing.mode, "auto");
    assert.equal(sharing.revision, 1);
    assert.equal(sharing.gifs[0].title, "persist");
    assert.equal((await f.json(member, `/${team.id}/gifs`, "GET")).items.length, 1);
    assert.equal((await f.json(null, "/v1/cloud/stats", "GET")).accountsWithBackups, 0);
});

test("a failed metadata commit does not advance revisions or publish the staged collection", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    await f.share(owner, team.id, [gif("before")]);
    const metadataPath = join(f.teamPath(team.id), "team.json");
    const original = await readFile(metadataPath);
    await rm(metadataPath);
    await mkdir(metadataPath);
    const response = await f.request(owner, `/${team.id}/sharing`, "PUT", { mode: "auto", gifs: [gif("after")], revision: 1, displayName: "Owner" });
    assert.equal(response.status, 503);
    const state = await f.json(owner, `/${team.id}/sharing`, "GET");
    assert.equal(state.revision, 1);
    assert.equal(state.gifs[0].title, "before");
    assert.equal((await readdir(f.teamPath(team.id))).filter(name => name.startsWith("share-")).length, 1);
    await rm(metadataPath, { recursive: true });
    await writeFile(metadataPath, original);
    await f.share(owner, team.id, [gif("retry")], 1);
});

test("corrupt persisted metadata fails closed instead of replacing teams with empty state", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    const path = join(f.teamPath(team.id), "team.json");
    await writeFile(path, "corrupt-private-state");
    await f.restart();
    assert.equal((await f.request(owner)).status, 503);
    assert.equal((await f.request(owner, "", "POST", { name: "Overwrite?", displayName: "Owner" })).status, 503);
    assert.equal(await readFile(path, "utf8"), "corrupt-private-state");
});

test("oversized JSON is rejected without altering the previous collection", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    await f.share(owner, team.id);
    const response = await f.request(owner, `/${team.id}/sharing`, "PUT", { mode: "manual", revision: 1, displayName: "x".repeat(2 * 1024 * 1024), gifs: [] });
    assert.equal(response.status, 413);
    assert.equal((await f.json(owner, `/${team.id}/sharing`, "GET")).revision, 1);
});

test("rotating credentials cannot bypass the per-IP GIF team rate limit", async t => {
    const f = await fixture(t);
    for (let index = 0; index < 120; index++) assert.equal((await f.request(token())).status, 200);
    const limited = await f.request(token());
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal((await f.request(null, "/v1/cloud/health")).status, 200, "The GIF limit does not block ordinary Cloud health");
    f.advance(60_000);
    assert.equal((await f.request(token())).status, 200);
});

test("startup removes uncommitted collection generations and retired teams without removing current data", async t => {
    const f = await fixture(t);
    const owner = token();
    const team = await f.create(owner);
    await f.share(owner, team.id);
    const orphan = join(f.teamPath(team.id), `share-${team.ownerId}-999-aaaaaaaaaaaa.json`);
    await writeFile(orphan, "[]");
    const retired = join(f.dataDir, "gif-teams", "teams", `.deleted-${team.id}-bbbbbbbbbbbb`);
    await mkdir(retired);
    await writeFile(join(retired, "old.json"), "private retired data");
    await f.restart();
    assert.equal((await f.json(owner, `/${team.id}/sharing`, "GET")).gifs.length, 1);
    await assert.rejects(readFile(orphan), { code: "ENOENT" });
    await assert.rejects(readdir(retired), { code: "ENOENT" });
    assert.equal((await readdir(f.teamPath(team.id))).filter(name => name.startsWith("share-")).length, 1);
});

test("global capacity bounds the metadata index while leaving existing teams readable", async t => {
    const f = await fixture(t);
    const owner = token();
    const ownerAccount = createHash("sha256").update(`midnightcord-cloud:${owner}`).digest("hex");
    let first;
    for (let group = 0; group < 20; group++) {
        await Promise.all(Array.from({ length: 50 }, async (_, index) => {
            const id = randomBytes(16).toString("base64url");
            const accountId = group === 0 && index === 0 ? ownerAccount : randomBytes(32).toString("hex");
            if (accountId === ownerAccount) first = id;
            await mkdir(f.teamPath(id), { recursive: true });
            await writeFile(join(f.teamPath(id), "team.json"), JSON.stringify({
                schema: 1, id, name: "Stored team", owner: accountId, updatedAt: "2026-11-24T12:00:00Z", invite: null,
                members: [{ accountId, displayName: "Owner", mode: "off", revision: 0, gifCount: 0, file: null, updatedAt: "2026-11-24T12:00:00Z" }]
            }));
        }));
    }
    assert.equal((await f.request(token(), "", "POST", { name: "Over capacity", displayName: "Owner" })).status, 503);
    assert.equal((await f.json(owner, `/${first}`, "GET")).name, "Stored team");
    assert.equal((await f.request(owner, `/${first}`, "DELETE")).status, 204);
    assert.equal((await f.create(token())).memberCount, 1);
});
