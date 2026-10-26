/*
 * Offline native reporting adapter tests. Never connects to Discord or submits a report.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const source = readFileSync(new URL("../src/midnightcordplugins/reportServer/reporting.tsx", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "tsx", format: "cjs" });
const guildId = "1337883355840118887";
const otherId = "1395048695501688953";
const target = { id: guildId, name: "Selected server" };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
};

function fixture(options = {}) {
    const guild = { ...target, getIconURL() {} };
    const state = { user: { id: "viewer" }, guild, loaded: options.loaded ?? true };
    const calls = { loads: [], open: [], fallback: [], warnings: [] };
    const loaders = [];
    const nativeOpen = async (...args) => {
        calls.open.push(args);
        if (options.nativeOpen) await options.nativeOpen(...args);
    };
    const nativeFactory = () => "isEligibleForFeedback getInteractingModalContext";
    const dependencies = {
        "@utils/Logger": { Logger: class { warn(...args) { calls.warnings.push(args); } } },
        "@webpack": {
            wreq: { get m() { return state.loaded ? { nativeFactory } : {}; } },
            extractAndLoadChunks: async (search, matcher) => {
                const index = search.includes("GuildChannelUserContextMenu") ? 0 : 1;
                loaders.push({ search, matcher });
                calls.loads.push(index);
                const result = await (index === 0 ? options.bootstrap?.() ?? true : options.form?.() ?? true);
                if (index === 0 && result) state.loaded = true;
                return result;
            },
            filters: { byCode: (...parts) => value => typeof value === "function" && parts.every(part => String(value).includes(part)) },
            mapMangledModule: (search, mappers) => {
                assert.deepEqual(Array.from(search), ["isEligibleForFeedback", "getInteractingModalContext"]);
                assert.equal(typeof mappers.open, "function");
                return options.missingOpener ? {} : { open: nativeOpen };
            }
        },
        "@webpack/common": {
            UserStore: { getCurrentUser: () => state.user },
            GuildStore: { getGuild: id => id === guildId ? state.guild : undefined }
        },
        "./UnavailableModal": { openReportUnavailable: value => calls.fallback.push(value) }
    };
    const module = { exports: {} };
    runInNewContext(code, {
        module, exports: module.exports,
        require: name => {
            assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
            return dependencies[name];
        }
    });
    return { ...module.exports, state, calls, loaders, guild };
}

test("loading the plugin makes no request; click opens only the normal guild form with the real store record", async () => {
    const f = fixture();
    assert.equal(f.calls.loads.length, 0);
    assert.equal(f.calls.open.length, 0);
    f.openServerReport(target);
    await flush();
    assert.deepEqual(f.calls.loads, [1]);
    assert.equal(f.calls.open.length, 1);
    const [report, options, callbacks] = f.calls.open[0];
    assert.equal(report.name, "guild");
    assert.equal(report.record, f.guild);
    assert.deepEqual(Object.keys(report), ["name", "record"]);
    assert.deepEqual(Object.keys(options), []);
    assert.deepEqual(Object.keys(callbacks), ["onClose"]);
    assert.equal(f.calls.fallback.length, 0);
});

test("module bootstrap and form loading run only when needed, with a double-click lock until close", async () => {
    const waiting = deferred();
    const f = fixture({ loaded: false, bootstrap: () => waiting.promise });
    f.openServerReport(target);
    f.openServerReport(target);
    assert.deepEqual(f.calls.loads, [0]);
    waiting.resolve(true);
    await flush();
    assert.deepEqual(f.calls.loads, [0, 1]);
    assert.equal(f.calls.open.length, 1);
    f.openServerReport(target);
    await flush();
    assert.equal(f.calls.open.length, 1);
    f.calls.open[0][2].onClose();
    assert.equal(f.calls.fallback.length, 0, "Closing a displayed native form is not an error");
    f.openServerReport(target);
    await flush();
    assert.equal(f.calls.open.length, 2);
});

test("invalid, missing, or mismatched guild records and logged-out users cannot reach the opener", async () => {
    const f = fixture();
    for (const input of [null, {}, { id: "123" }, { id: 42 }, { id: "../../x" }]) f.openServerReport(input);
    assert.equal(f.calls.loads.length, 0);
    for (const mutate of [
        () => { f.state.guild = undefined; },
        () => { f.state.guild = { id: otherId }; },
        () => { f.state.guild = f.guild; f.state.user = undefined; }
    ]) {
        mutate();
        f.openServerReport(target);
    }
    await flush();
    assert.equal(f.calls.open.length, 0);
    assert.equal(f.calls.fallback.length, 3);
});

test("the selection is captured and account/guild are checked again after loading", async () => {
    for (const mutate of [f => { f.state.user = { id: "other-viewer" }; }, f => { f.state.guild = undefined; }]) {
        const waiting = deferred();
        const f = fixture({ form: () => waiting.promise });
        const selected = { ...target };
        f.openServerReport(selected);
        selected.id = otherId;
        mutate(f);
        waiting.resolve(true);
        await flush();
        assert.equal(f.calls.open.length, 0);
        assert.equal(f.calls.fallback.length, 1);
        assert.equal(f.calls.fallback[0].id, guildId);
    }
});

test("failed bootstrap, form preload, missing export and rejected opener show the unavailable dialog", async () => {
    for (const options of [
        { loaded: false, bootstrap: async () => false },
        { form: async () => false },
        { form: async () => { throw Error("network failure"); } },
        { missingOpener: true },
        { nativeOpen: async () => { throw Error("native failure"); } },
        // Discord's current opener absorbs GET failures and invokes onClose.
        { nativeOpen: async (_report, _options, callbacks) => { callbacks.onClose(); } }
    ]) {
        const f = fixture(options);
        f.openServerReport(target);
        await flush();
        assert.equal(f.calls.fallback.length, 1);
        f.openServerReport(target);
        await flush();
        assert.equal(f.calls.fallback.length, 2, "Failure releases the request lock");
    }
});

test("disabling while chunks load cancels late opening and late error dialogs", async () => {
    for (const result of [true, false]) {
        const waiting = deferred();
        const f = fixture({ form: () => waiting.promise });
        f.openServerReport(target);
        f.stopReports();
        waiting.resolve(result);
        await flush();
        assert.equal(f.calls.open.length, 0);
        assert.equal(f.calls.fallback.length, 0);
    }
});

test("a transient chunk failure can recover on a later click", async () => {
    let failed = true;
    const f = fixture({ form: async () => {
        if (failed) throw Error("offline");
        return true;
    } });
    f.openServerReport(target);
    await flush();
    assert.equal(f.calls.fallback.length, 1);
    failed = false;
    f.openServerReport(target);
    await flush();
    assert.equal(f.calls.open.length, 1);
});

test("the bootstrap matcher selects the reporting user menu rather than another lazy loader", async () => {
    const f = fixture({ loaded: false });
    f.openServerReport(target);
    await flush();
    const matcher = new RegExp(f.loaders[0].matcher.source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)"));
    // Shape extracted from Discord's public client; IDs are deliberately changed.
    const factory = 'function factory(){Promise.all([r.e("99")]).then(r.bind(r,55));return unrelated;} '
        + 'async function menu(){let{default:e}=await Promise.all([r.e("21"),r.e("35")]).then(r.bind(r,47));'
        + 'return t=>(0,b.jsx)(e,{...t,user:a,guildId:A,channel:r,showMediaItems:!0,onInteraction:(0,DN.s)("GuildChannelUserContextMenu",np.A.RTC_PANEL,{targetUserId:a.id})})}';
    const result = matcher.exec(factory);
    assert.ok(result);
    assert.equal(result[1], 'r.e("21"),r.e("35")');
    assert.equal(result[2], "47");
    assert.equal(matcher.test('Promise.all([r.e("99")]).then(r.bind(r,55));return unrelated;'), false);
});

test("the adapter has no submission API, staff variant, anonymous reporting or hardcoded Discord IDs", () => {
    assert.doesNotMatch(source, /RestAPI|fetch\(|\.post\(|SUBMIT_REPORT|guild_urf|variant:\s*["']staff|\b(?:882276|928658|474610|685961)\b/);
});
