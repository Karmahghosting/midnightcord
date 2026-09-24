/*
 * Midnightcord Cloud cryptography regression checks
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import { build } from "esbuild";

globalThis.crypto ??= webcrypto;

const bundled = await build({
    entryPoints: ["src/api/SettingsSync/cloudCrypto.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false
});
const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
const cryptoModule = await import(`data:text/javascript;base64,${source}`);

test("Cloud keys derive stable authorization without exposing the encryption key", async () => {
    const key = cryptoModule.createCloudKey();
    assert.match(key, /^mcc1-[A-Za-z0-9_-]{43}$/);
    assert.equal(cryptoModule.isCloudKey(key), true);
    assert.equal(cryptoModule.isCloudKey(`${key}x`), false);

    const first = await cryptoModule.deriveCloudAuthorization(key);
    const second = await cryptoModule.deriveCloudAuthorization(key);
    assert.equal(first, second);
    assert.match(first, /^mc1\.[A-Za-z0-9_-]{43}$/);
    assert.equal((await cryptoModule.getCloudFingerprint(key)).length, 10);
});

test("Cloud payloads use randomized authenticated encryption", async () => {
    const key = cryptoModule.createCloudKey();
    const otherKey = cryptoModule.createCloudKey();
    const plaintext = JSON.stringify({ plugins: { example: { enabled: true } }, quickCss: ".app { color: white; }" });
    const first = await cryptoModule.encryptCloudPayload(key, plaintext);
    const second = await cryptoModule.encryptCloudPayload(key, plaintext);

    assert.notDeepEqual(first, second, "fresh IVs must produce different ciphertext");
    assert.equal(await cryptoModule.decryptCloudPayload(key, first), plaintext);
    await assert.rejects(() => cryptoModule.decryptCloudPayload(otherKey, first));

    const tampered = first.slice();
    tampered[tampered.length - 1] ^= 1;
    await assert.rejects(() => cryptoModule.decryptCloudPayload(key, tampered));
    assert.notEqual(await cryptoModule.checksumBytes(first), await cryptoModule.checksumBytes(tampered));
});
