import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

const bundled = await build({
    entryPoints: ["src/midnightcordplugins/privacyShield/privacyShield.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    write: false
});
const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
const { shouldSuppressNotification } = await import(`data:text/javascript;base64,${source}`);

const decide = (overrides = {}) => shouldSuppressNotification({
    active: true,
    enabled: true,
    event: {},
    message: { author: { id: "other-user" } },
    currentUserId: "current-user",
    isDirectMessage: false,
    ...overrides
});

test("leaves ordinary guild messages and the user's own messages alone", () => {
    assert.equal(decide(), false);
    assert.equal(decide({ message: { author: { id: "current-user" }, mention_everyone: true } }), false);
});

test("suppresses pushes, direct messages, and mentions only when enabled during a stream", () => {
    assert.equal(decide({ event: { isPushNotification: true } }), true);
    assert.equal(decide({ isDirectMessage: true }), true);
    assert.equal(decide({ message: { mentions: [{ id: "current-user" }] } }), true);
    assert.equal(decide({ message: { mention_everyone: true } }), true);
    assert.equal(decide({ message: { mention_roles: ["role-id"] } }), true);

    assert.equal(decide({ active: false, event: { isPushNotification: true } }), false);
    assert.equal(decide({ enabled: false, isDirectMessage: true }), false);
    assert.equal(decide({ currentUserId: undefined, event: { isPushNotification: true } }), false);
});
