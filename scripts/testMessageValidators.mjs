/*
 * Regression tests for outgoing message validation and transformation order
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const bundled = await build({
    stdin: {
        contents: 'export * from "./src/api/MessageEvents.ts"; export { logs } from "@utils/Logger";',
        resolveDir: rootDir,
        sourcefile: "message-validator-test-entry.mjs"
    },
    absWorkingDir: rootDir,
    tsconfig: join(rootDir, "tsconfig.json"),
    platform: "node",
    format: "esm",
    bundle: true,
    write: false,
    plugins: [{
        name: "discord-test-adapters",
        setup(build) {
            build.onResolve({ filter: /^(@utils\/Logger|@webpack\/common)$/ }, ({ path }) => ({ path, namespace: "test-adapter" }));
            build.onLoad({ filter: /.*/, namespace: "test-adapter" }, ({ path }) => ({
                contents: path === "@utils/Logger"
                    ? "export const logs = []; export class Logger { error(...args) { logs.push(args); } }"
                    : "export const MessageStore = { getMessage() { return undefined; } };"
            }));
        }
    }]
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
let fixtureId = 0;

async function fixture(kind) {
    const api = await import(`${moduleUrl}#fixture-${fixtureId++}`);
    const suffix = kind === "send" ? "Send" : "Edit";
    const replyOptions = { messageReference: undefined, allowedMentions: { parse: [], repliedUser: false } };
    return {
        logs: api.logs,
        addValidator: api[`addMessagePre${suffix}Validator`],
        removeValidator: api[`removeMessagePre${suffix}Validator`],
        addListener: api[`addMessagePre${suffix}Listener`],
        removeListener: api[`removeMessagePre${suffix}Listener`],
        run(content = "original", channelId = "100000") {
            const message = { content, validNonShortcutEmojis: [], invalidEmojis: [], tts: false };
            const options = { content, channel: { id: channelId }, openWarningPopout() {} };
            const result = kind === "send"
                ? api._handlePreSend(channelId, message, options, replyOptions)
                : api._handlePreEdit(channelId, "200000", message);
            return { result, message, options, replyOptions };
        },
        validator(callback) {
            return kind === "send"
                ? (channelId, message, options, context) => callback(message, context, channelId, options)
                : (channelId, messageId, message, context) => {
                    assert.equal(messageId, "200000");
                    return callback(message, context, channelId);
                };
        },
        listener(callback) {
            return kind === "send"
                ? (channelId, message, options) => callback(message, channelId, options)
                : (channelId, messageId, message) => callback(message, channelId);
        }
    };
}

for (const kind of ["send", "edit"]) {
    test(`${kind}: an async before validator blocks text before any transformation`, async () => {
        const f = await fixture(kind);
        const phases = [];
        f.addListener(f.listener(message => { message.content = "transformed"; }));
        f.addValidator(f.validator(async (message, context) => {
            await Promise.resolve();
            phases.push(context.phase);
            assert.equal(message.content, "sensitive original");
            return { cancel: true };
        }));
        const operation = f.run("sensitive original");
        assert.equal(await operation.result, true);
        assert.equal(operation.message.content, "sensitive original");
        assert.deepEqual(phases, ["before"]);
        assert.deepEqual(f.logs, []);
    });

    test(`${kind}: final validation sees all awaited transformations and may cancel`, async () => {
        const f = await fixture(kind);
        const observed = [];
        f.addValidator(f.validator((message, context, channelId, options) => {
            observed.push([context.phase, message.content]);
            assert.equal(channelId, "100000");
            if (kind === "send") assert.deepEqual(options.replyOptions.allowedMentions.parse, []);
            return { cancel: message.content === "expanded secret" };
        }));
        f.addListener(f.listener(async message => {
            await Promise.resolve();
            message.content = "expanded";
        }));
        f.addListener(f.listener(message => { message.content += " secret"; }));
        const operation = f.run("alias");
        assert.equal(await operation.result, true);
        assert.deepEqual(observed, [["before", "alias"], ["after", "expanded secret"]]);
        if (kind === "send") assert.equal(operation.options.replyOptions, operation.replyOptions);
    });

    test(`${kind}: ordinary cancellation skips remaining transforms and after validators`, async () => {
        const f = await fixture(kind);
        const observed = [];
        f.addValidator(f.validator((_, context) => { observed.push(context.phase); }));
        f.addListener(f.listener(async () => {
            observed.push("cancelled by listener");
            return { cancel: true };
        }));
        f.addListener(f.listener(() => { observed.push("unexpected later listener"); }));
        assert.equal(await f.run().result, true);
        assert.deepEqual(observed, ["before", "cancelled by listener"]);
    });

    test(`${kind}: unregistering a validator during transformation cannot bypass final validation`, async () => {
        const f = await fixture(kind);
        const phases = [];
        const validator = f.validator((message, context) => {
            phases.push(context.phase);
            return { cancel: message.content === "expanded secret" };
        });
        f.addValidator(validator);
        f.addListener(f.listener(async message => {
            await Promise.resolve();
            f.removeValidator(validator);
            message.content = "expanded secret";
        }));
        assert.equal(await f.run("alias").result, true);
        assert.deepEqual(phases, ["before", "after"]);
        assert.equal(await f.run("another alias").result, false);
        assert.deepEqual(phases, ["before", "after"]);
    });

    test(`${kind}: validator failures cancel in either phase without logging error contents`, async () => {
        for (const failurePhase of ["before", "after"]) {
            const f = await fixture(kind);
            let transformed = 0;
            const syntheticSecret = "synthetic-sensitive-error-content";
            f.addValidator(f.validator(async (_, context) => {
                if (context.phase === failurePhase) throw new Error(syntheticSecret);
            }));
            f.addListener(f.listener(() => { transformed++; }));
            assert.equal(await f.run().result, true);
            assert.equal(transformed, failurePhase === "before" ? 0 : 1);
            assert.deepEqual(f.logs, [["Message validation failed; the operation was cancelled."]]);
            assert.equal(JSON.stringify(f.logs).includes(syntheticSecret), false);
        }
    });

    test(`${kind}: concurrent operations share identity only within their own two phases`, async () => {
        const f = await fixture(kind);
        const contexts = new Map();
        f.addValidator(f.validator(async (_, context, channelId) => {
            await Promise.resolve();
            const observed = contexts.get(channelId) ?? [];
            observed.push(context);
            contexts.set(channelId, observed);
        }));
        f.addListener(f.listener(async () => { await Promise.resolve(); }));
        const first = f.run("one", "100001");
        const second = f.run("two", "100002");
        assert.deepEqual(await Promise.all([first.result, second.result]), [false, false]);
        const one = contexts.get("100001");
        const two = contexts.get("100002");
        for (const contextPair of [one, two]) {
            assert.deepEqual(contextPair.map(context => context.phase), ["before", "after"]);
            assert.equal(typeof contextPair[0].operation, "object");
            assert.ok(contextPair[0].operation);
            assert.equal(contextPair[0].operation, contextPair[1].operation);
        }
        assert.notEqual(one[0].operation, two[0].operation);
    });

    test(`${kind}: registration deduplicates, removal stops callbacks, and re-registration works`, async () => {
        const f = await fixture(kind);
        const phases = [];
        let transforms = 0;
        const validator = f.validator((_, context) => { phases.push(context.phase); });
        const listener = f.listener(() => { transforms++; });
        assert.equal(f.addValidator(validator), validator);
        f.addValidator(validator);
        assert.equal(f.addListener(listener), listener);
        f.addListener(listener);
        assert.equal(await f.run().result, false);
        assert.deepEqual(phases, ["before", "after"]);
        assert.equal(transforms, 1);
        assert.equal(f.removeValidator(validator), true);
        assert.equal(f.removeValidator(validator), false);
        assert.equal(f.removeListener(listener), true);
        assert.equal(await f.run().result, false);
        assert.deepEqual(phases, ["before", "after"]);
        assert.equal(transforms, 1);
        f.addValidator(validator);
        assert.equal(await f.run().result, false);
        assert.deepEqual(phases, ["before", "after", "before", "after"]);
    });
}
