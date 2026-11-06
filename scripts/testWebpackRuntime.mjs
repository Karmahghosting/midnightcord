/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

import { transformSync } from "esbuild";

const source = readFileSync(new URL("../src/webpack/patchWebpack.ts", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "ts", format: "cjs" });
const searchSource = readFileSync(new URL("../src/webpack/webpack.ts", import.meta.url), "utf8");
const searchCode = transformSync(searchSource, { loader: "ts", format: "cjs" }).code;

function searchFixture(legacyLoaded = false) {
    const dependencies = {
        "@debug/Tracer": { traceFunction: (_name, fn) => fn },
        "@utils/lazy": { makeLazy: fn => fn, proxyLazy: fn => fn },
        "@utils/lazyReact": { LazyComponent: fn => fn },
        "@utils/Logger": { Logger: class { info() {} warn() {} error() {} } },
        "@utils/patches": { canonicalizeMatch: value => value },
        "@utils/text": { escapeRegExp: value => value }
    };
    const module = { exports: {} };
    runInContext(searchCode, createContext({
        module, exports: module.exports,
        require: name => {
            assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
        IS_DEV: false, IS_REPORTER: false, IS_ANTI_CRASH_TEST: false
    }));
    const first = { getVoiceState() {} };
    const second = { selectVoiceChannel() {} };
    const circularExports = {
        get pending() { throw new ReferenceError("Cannot access export before initialization"); },
        initialized: second
    };
    const modules = {
        1: { id: 1, exports: first },
        2: { id: 2, exports: circularExports },
        3: { id: 3, exports: null },
        4: undefined
    };
    if (legacyLoaded) for (const entry of Object.values(modules)) if (entry) entry.loaded = true;
    module.exports._initWebpack({ c: modules });
    return { api: module.exports, first, second, circularExports };
}

function fixture({ eagerPatches = false, includeModuleId = true, withPatch = false } = {}) {
    const observedIds = [];
    const blacklistedIds = [];
    const subscriptionIds = [];
    const webpack = {
        wreq: undefined,
        factoryListeners: new Set(),
        moduleListeners: new Set([(_exports, id) => observedIds.push(id)]),
        waitForSubscriptions: new Map([[exports => exports.marker === "fixture" || exports.marker === "patched-fixture", (_exports, id) => subscriptionIds.push(id)]]),
        _blacklistBadModules: (_cache, _exports, id) => { blacklistedIds.push(id); return false; },
        _initWebpack: wreq => { webpack.wreq = wreq; },
        findModuleFactory: () => undefined
    };
    const dependencies = {
        "@api/Settings": { Settings: { eagerPatches } },
        "@debug/Tracer": { traceFunctionWithResults: (_name, fn) => (...args) => [fn(...args), 0] },
        "@utils/lazy": { makeLazy: fn => fn },
        "@utils/Logger": { Logger: class { info() {} warn() {} error() {} debug() {} } },
        "@utils/misc": { interpolateIfDefined: (strings, ...values) => strings.reduce((s, part, i) => s + part + (values[i] ?? ""), "") },
        "./webpack": webpack
    };
    const module = { exports: {} };
    const context = createContext({
        module, exports: module.exports,
        require: name => {
            assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
        IS_DEV: false, IS_REPORTER: false,
        setTimeout: () => 1, clearTimeout: () => {},
        includeModuleId
    });
    runInContext(code, context, { filename: "patchWebpack.js" });
    if (withPatch) {
        module.exports.patches.push({
            plugin: "RuntimeTest", find: "marker: () =>",
            replacement: [{ match: /"fixture"/, replace: '"patched-fixture"' }]
        });
    }
    // Reduced Discord runtime: current modules have no loaded field. Also exercise
    // an id-less variant. Keep exports:{} and the asset URL for runtime detection.
    runInContext(`
        globalThis.runtime = function requireModule(id) {
            if (runtime.c[id]) return runtime.c[id].exports;
            const module = {exports:{}};
            if (includeModuleId) module.id = id;
            runtime.c[id] = module;
            runtime.m[id](module, module.exports, runtime);
            return module.exports;
        };
        runtime.c = {};
        runtime.u = id => id + ".js";
        runtime.d = () => { throw new Error("Patcher did not replace native export definition"); };
        const factories = {
            42(module, exports, require) {
                require.d(exports, {}, { A: class Example {}, marker: "fixture" });
            },
            43(module, exports, require) {
                require.d(exports, { marker: () => "fixture" });
            },
            626584(module, exports, require) {
                // Discord build 667580 directly exports its logger constructor.
                const Logger = class { constructor(name) { this.name = name; } };
                require.d(exports, {}, { A: Logger });
            },
            329563(module, exports, require) {
                // The immediately following libdiscore consumer used to throw
                // "i.A is not a constructor" when the third argument was lost.
                const i = require(626584);
                module.exports = new i.A("libdiscore");
            }
        };
        globalThis.originalFactories = { ...factories };
        runtime.m = factories;
        runtime.p = "/assets/";
    `, context, { filename: "https://discord.com/assets/web.fixture.js" });
    assert.equal(webpack.wreq, context.runtime, "Production runtime interception must run");
    return { ...context, observedIds, blacklistedIds, subscriptionIds };
}

test("current direct value exports preserve constructors and permit Discord startup", () => {
    const f = fixture();
    const exports = f.runtime(42);
    assert.equal(typeof exports.A, "function");
    assert.ok(new exports.A() instanceof exports.A);
    assert.equal(exports.marker, "fixture");
    assert.equal(Object.getOwnPropertyDescriptor(exports, "A").configurable, true);
});

test("the Discord 667580 logger export can be constructed by libdiscore", () => {
    const f = fixture();
    assert.equal(f.runtime(329563).name, "libdiscore");
});

test("legacy getter exports stay live and coexist with direct values", () => {
    const f = fixture();
    let value = 1;
    const exports = { existing: "preserved" };
    const getters = Object.assign(Object.create({ inherited: () => "ignore" }), { current: () => value });
    const values = Object.assign(Object.create({ inheritedValue: "ignore" }), { zero: 0, falseValue: false, existing: "replace", current: "replace" });
    f.runtime.d(exports, getters, values);
    value = 2;
    assert.equal(exports.current, 2);
    assert.equal(exports.zero, 0);
    assert.equal(exports.falseValue, false);
    assert.equal(exports.existing, "preserved");
    assert.equal(Object.hasOwn(exports, "inherited"), false);
    assert.equal(Object.hasOwn(exports, "inheritedValue"), false);
    assert.equal(f.runtime(43).marker, "fixture");
});

test("exports can be provided only through the optional third argument", () => {
    const f = fixture();
    const exports = {};
    f.runtime.d(exports, undefined, { value: 0 });
    assert.equal(exports.value, 0);
});

for (const eagerPatches of [false, true]) {
    test(`modules without id restore their own factory and notify the correct id (eager=${eagerPatches})`, () => {
        const f = fixture({ eagerPatches, includeModuleId: false });
        f.runtime(43);
        assert.equal(f.runtime.m[43], f.originalFactories[43]);
        assert.equal(Object.hasOwn(f.runtime.m, "undefined"), false);
        assert.deepEqual(f.observedIds, ["43"]);
        assert.deepEqual(f.blacklistedIds, ["43"]);
        assert.deepEqual(f.subscriptionIds, ["43"]);
    });

    test(`successfully patched factories preserve the module id (eager=${eagerPatches})`, () => {
        const f = fixture({ eagerPatches, withPatch: true });
        assert.equal(f.runtime(43).marker, "patched-fixture");
        assert.equal(f.runtime.m[43], f.originalFactories[43]);
        assert.equal(Object.hasOwn(f.runtime.m, ""), false);
        assert.equal(Object.hasOwn(f.runtime.m, "undefined"), false);
        assert.deepEqual(f.observedIds, ["43"]);
        assert.deepEqual(f.blacklistedIds, ["43"]);
        assert.deepEqual(f.subscriptionIds, ["43"]);
    });
}

for (const legacyLoaded of [false, true]) {
    test(`cached module searches find exports and skip uninitialized getters (loaded flag=${legacyLoaded})`, () => {
        const { api, first, second } = searchFixture(legacyLoaded);
        assert.equal(api.findByProps("getVoiceState"), first);
        assert.equal(api.findByProps("selectVoiceChannel"), second);
        assert.deepEqual(Array.from(api.findAll(m => typeof m.getVoiceState === "function" || typeof m.selectVoiceChannel === "function")), [first, second]);
        assert.deepEqual(Array.from(api.findBulk(api.filters.byProps("getVoiceState"), api.filters.byProps("selectVoiceChannel"))), [first, second]);
        let found;
        api.waitFor("selectVoiceChannel", (exports, id) => { found = { exports, id }; });
        assert.deepEqual(found, { exports: second, id: "2" });
        assert.equal(api.waitForSubscriptions.size, 0);
    });
}

test("CSS module filters skip circular imports whose export getters throw", () => {
    const { api, circularExports } = searchFixture();
    assert.equal(api.filters.byClassNames("container")(circularExports), false);
    assert.equal(api.filters.byClassNames("container")({ container: "container_example" }), true);
});

test("searches survive throwing filter properties and keep valid exports from the same module", () => {
    const { api, first, second } = searchFixture();
    const uninitialized = {
        get getVoiceState() { throw new ReferenceError("Cannot access export before initialization"); }
    };
    api._initWebpack({ c: {
        1: { exports: {
            get getVoiceState() { throw new ReferenceError("Cannot access export before initialization"); },
            nestedPending: uninitialized,
            initialized: first
        } },
        2: { exports: second }
    } });

    assert.equal(api.findByProps("getVoiceState"), first);
    assert.deepEqual(Array.from(api.findAll(api.filters.byProps("getVoiceState"))), [first]);
    assert.deepEqual(Array.from(api.findBulk(api.filters.byProps("getVoiceState"), api.filters.byProps("selectVoiceChannel"))), [first, second]);
    let found;
    api.waitFor("getVoiceState", (exports, id) => { found = { exports, id }; });
    assert.deepEqual(found, { exports: first, id: "1" });
    assert.equal(api.waitForSubscriptions.size, 0);
});

test("legacy modules explicitly marked unloaded are skipped until they finish loading", () => {
    const { api, first, second } = searchFixture();
    const partial = { getVoiceState() {}, selectVoiceChannel() {} };
    const unfinished = { loaded: false, exports: partial };
    api._initWebpack({ c: {
        1: unfinished,
        2: { loaded: true, exports: first },
        3: { loaded: true, exports: second }
    } });

    assert.equal(api.findByProps("getVoiceState"), first);
    assert.deepEqual(Array.from(api.findAll(api.filters.byProps("getVoiceState"))), [first]);
    assert.deepEqual(Array.from(api.findBulk(api.filters.byProps("getVoiceState"), api.filters.byProps("selectVoiceChannel"))), [first, second]);
    let found;
    api.waitFor("getVoiceState", (exports, id) => { found = { exports, id }; });
    assert.deepEqual(found, { exports: first, id: "2" });

    unfinished.loaded = true;
    assert.equal(api.findByProps("getVoiceState"), partial);
});

test("a circular export remains searchable after its getter is initialized", () => {
    const { api } = searchFixture();
    let ready = false;
    const exports = {
        get getVoiceState() {
            if (!ready) throw new ReferenceError("Cannot access export before initialization");
            return () => {};
        }
    };
    api._initWebpack({ c: { 1: { exports } } });
    assert.equal(api.findByProps("getVoiceState"), null);
    ready = true;
    assert.equal(api.findByProps("getVoiceState"), exports);
});
