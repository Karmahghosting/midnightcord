/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Midnightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { transformSync } from "esbuild";

const source = readFileSync(new URL("../src/main/csp/index.ts", import.meta.url), "utf8");
const code = transformSync(source, { loader: "ts", format: "cjs" }).code;

function patch(headers) {
    let listener;
    const module = { exports: {} };
    const dependencies = {
        "@main/settings": { NativeSettings: { store: { customCspRules: {} } } },
        electron: { session: { defaultSession: { webRequest: { onHeadersReceived(callback) { listener = callback; } } } } }
    };
    runInNewContext(code, { module, exports: module.exports, console, require(name) {
        assert(Object.hasOwn(dependencies, name), name);
        return dependencies[name];
    } });
    module.exports.initCsp();
    let response;
    listener({ url: "https://discord.com/app", resourceType: "mainFrame", responseHeaders: headers }, result => { response = result; });
    assert.equal(response.cancel, false);
    return response.responseHeaders;
}

test("Discord's actual header hook permits FxTwitter images and video without scripts or connections", () => {
    const headers = patch({ "Content-Security-Policy": ["default-src 'self'; img-src 'self' https://media.tenor.com; media-src 'self' https://media.tenor.com; script-src 'self'; connect-src 'self'"] });
    const policy = Object.fromEntries(headers["Content-Security-Policy"][0].split(";").map(part => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name, values];
    }));
    for (const directive of ["img-src", "media-src"]) {
        assert(policy[directive].includes("https://gif.fxtwitter.com"), directive);
        assert(policy[directive].includes("https://media.tenor.com"), "Existing provider stays permitted");
    }
    for (const directive of ["default-src", "script-src", "connect-src", "frame-src", "worker-src"])
        assert(!policy[directive]?.some(value => value.includes("fxtwitter")), directive);
    assert(!Object.values(policy).flat().some(value => value.includes("*.fxtwitter")));
});

test("preview policy preserves default-src restrictions when explicit image or media directives are absent", () => {
    const headers = patch({ "content-security-policy": ["default-src 'self'; object-src 'none'"] });
    const policy = headers["content-security-policy"][0];
    assert.match(policy, /img-src 'self'[^;]*https:\/\/gif\.fxtwitter\.com/);
    assert.match(policy, /media-src 'self'[^;]*https:\/\/gif\.fxtwitter\.com/);
    assert.match(policy, /object-src 'none'/);
});
