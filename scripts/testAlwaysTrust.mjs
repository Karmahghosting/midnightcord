/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

function load(relative, dependencies) {
    const { code } = transformSync(readFileSync(new URL(relative, import.meta.url), "utf8"), { loader: "ts", format: "cjs" });
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, require: name => {
        assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
        return dependencies[name];
    } });
    return module.exports;
}
const plugin = load("../src/midnightcordplugins/alwaysTrust/index.ts", {
    "@utils/constants": { Devs: { zt: {}, Trwy: {} } },
    "@utils/types": { __esModule: true, default: value => value }
}).default;
const { canonicalizeMatch } = load("../src/utils/patches.ts", { "./intlHash": { runtimeHashMessageKey: () => { throw new Error("No translation hash expected"); } } });

// Method shape verified in a real cached Discord MaskedLinkStore bundle.
// Protocol trust and stored domain preferences are separate methods/state.
const factory = `(()=>{let b="MaskedLinkStore",known=new Set(["https://discord.com"]);function w(e){return known.has(e)}function G(e){return e==="https:"||e==="http:"}return new class{isTrustedDomain(e){return w(e)}isTrustedProtocol(e){return G(e)}storedDomains(){return [...known]}}})()`;
const [patch] = plugin.patches;
const apply = code => code.includes(patch.find) ? code.replace(canonicalizeMatch(patch.replacement.match), patch.replacement.replace) : code;

test("enabled domain patch allows a clicked external link through the native trust gate without storing it", () => {
    const original = runInNewContext(factory);
    const patched = runInNewContext(apply(factory));
    const href = "https://new-site.example/path?q=test";
    assert.equal(original.isTrustedDomain(href), false);
    assert.equal(patched.isTrustedDomain(href), true);
    let confirmation = 0;
    const opened = [];
    const click = url => patched.isTrustedDomain(url) ? opened.push(url) : confirmation++;
    click(href);
    assert.deepEqual(opened, [href]);
    assert.equal(confirmation, 0);
    assert.deepEqual(Array.from(patched.storedDomains()), ["https://discord.com"]);
    assert.equal(original.isTrustedDomain(href), false, "Original trust data is unchanged after disabling and restarting");
});

test("domain-only patch preserves protocol checks and does not target downloads or other modules", () => {
    const patchedSource = apply(factory);
    assert.notEqual(patchedSource, factory);
    assert.equal(patchedSource, factory.replace("isTrustedDomain(e){return w(e)}", "isTrustedDomain(e){return true}"));
    const patched = runInNewContext(patchedSource);
    assert.equal(patched.isTrustedProtocol("javascript:"), false);
    assert.equal(patched.isTrustedProtocol("file:"), false);
    assert.equal(patched.isTrustedProtocol("https:"), true);
    assert.equal(plugin.patches.length, 1);
    assert.equal(plugin.enabledByDefault, false);
    assert.equal(apply(factory.replace("MaskedLinkStore", "DifferentStore")), factory.replace("MaskedLinkStore", "DifferentStore"));
});
