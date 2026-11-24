/*
 * Offline backup privacy regression checks
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/api/SettingsSync/offline.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
const copy = value => JSON.parse(JSON.stringify(value));
const key = "midnightcord-gif-folders-v1:1337883355840118887";
const otherKey = "midnightcord-gif-folders-v1:1395048695501688953";
const folder = { id: "folder-reactions", name: "Réactions", urls: ["https://tenor.com/view/reaction"] };
const record = {
    version: 1,
    folders: [folder],
    bindings: [{ teamId: "private-team", teamName: "Copains", folderId: folder.id, scope: "local-identity-hash", revision: 17, paused: null }]
};
const unrelated = { folders: ["another plugin"], bindings: ["must remain intact"] };

function fixture(entries = []) {
    const module = { exports: {} };
    const settings = { plugins: { GifTeams: { enabled: true } } };
    const writes = [];
    const dataStore = new Map(entries);
    const dependencies = {
        "@api/Settings": { PlainSettings: settings },
        "@utils/Logger": { Logger: class { error() { } warn() { } } },
        "@utils/web": { chooseFile() { }, saveFile() { } },
        "@webpack/common": { moment() { }, Toasts: { show() { }, genId() { return "toast"; }, Type: {} } },
        "..": { DataStore: {
            entries: async () => [...dataStore],
            setMany: async values => {
                writes.push(copy(values));
                for (const [id, value] of values) dataStore.set(id, value);
            }
        } }
    };
    runInNewContext(code, {
        module, exports: module.exports, console, Error,
        VencordNative: { settings: { get: () => settings, set: async () => { } }, quickCss: { get: async () => "", set: async () => { } } },
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; }
    });
    return { ...module.exports, dataStore, writes };
}

for (const type of ["all", "datastore"]) {
    test(`${type} export preserves GIF folders without transferring local sharing consent`, async () => {
        const original = copy(record);
        const f = fixture([[key, original], [otherKey, copy(record)], ["unrelated-plugin", unrelated], ["midnightcord_cloud_key", "recovery material"]]);
        const exported = JSON.parse(await f.exportSettings({ type }));
        const restored = new Map(exported.dataStore);
        assert.deepEqual(restored.get(key), { version: 1, folders: [folder], bindings: [] });
        assert.deepEqual(restored.get(otherKey).bindings, [], "Every Discord account entry must lose its device-local bindings");
        assert.deepEqual(restored.get("unrelated-plugin"), unrelated);
        assert.equal(restored.has("midnightcord_cloud_key"), false, "Existing credential exclusions remain active");
        assert.deepEqual(original, record, "Export must not detach the original device's active folder sharing");
        const target = fixture();
        await target.importSettings(JSON.stringify(exported), type);
        assert.deepEqual(copy(target.dataStore.get(key)), { version: 1, folders: [folder], bindings: [] });
    });

    test(`${type} import strips bindings from old backups before writing DataStore`, async () => {
        const f = fixture([[key, copy(record)]]);
        const oldBackup = { settings: { plugins: { GifTeams: { enabled: true } } }, dataStore: [[key, copy(record)], ["unrelated-plugin", unrelated]] };
        await f.importSettings(JSON.stringify(oldBackup), type);
        assert.equal(f.writes.length, 1);
        assert.deepEqual(f.writes[0], [[key, { version: 1, folders: [folder], bindings: [] }], ["unrelated-plugin", unrelated]]);
        assert.deepEqual(copy(f.dataStore.get(key).folders), [folder]);
        assert.deepEqual(copy(f.dataStore.get(key).bindings), []);
        assert.deepEqual(oldBackup.dataStore[0][1], record, "The original backup is not mutated");
    });
}

test("the sanitizer is scoped to known account folder records and does not import datastore for plugins-only restores", async () => {
    const strange = [
        ["midnightcord-gif-folders-v1:not-an-account", record],
        ["another:1337883355840118887", record],
        [key, { ...record, version: 2 }]
    ];
    const f = fixture(strange);
    const exported = JSON.parse(await f.exportSettings({ type: "datastore" }));
    assert.deepEqual(exported.dataStore, strange);
    await f.importSettings(JSON.stringify({ settings: { plugins: {} }, dataStore: [[key, record]] }), "plugins", true);
    assert.equal(f.writes.length, 0);
    const settingsOnly = JSON.parse(await f.exportSettings({ type: "plugins", syncDataStore: false }));
    assert.equal(Object.hasOwn(settingsOnly, "dataStore"), false);
});
