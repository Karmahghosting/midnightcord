/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { MAX_MATCHES_PER_KIND, MAX_TEXT_LENGTH, scanSecrets, SecretKind } from "./detector";

const DUMMY_BODY = "aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY";
const DUMMY_DISCORD = `${btoa("123456789012345678")}.AbC123.${DUMMY_BODY}`;
const keys: [string, SecretKind][] = [
    [DUMMY_DISCORD, "discord"],
    [`mfa.${DUMMY_BODY.repeat(2)}`, "discord"],
    [`ghp_${DUMMY_BODY}`, "apiKey"],
    [`github_pat_${DUMMY_BODY.repeat(2)}`, "apiKey"],
    [`glpat-${DUMMY_BODY}`, "apiKey"],
    [`sk-proj-${DUMMY_BODY}`, "apiKey"],
    [`sk_live_${DUMMY_BODY}`, "apiKey"],
    [`gsk_${DUMMY_BODY}`, "apiKey"],
    [`AIza${DUMMY_BODY}`, "apiKey"],
    [`xoxb-${DUMMY_BODY}`, "apiKey"],
    [`-----BEGIN PRIVATE KEY-----\n${DUMMY_BODY}\n-----END PRIVATE KEY-----`, "privateKey"],
    [`-----BEGIN OPENSSH PRIVATE KEY-----\n${DUMMY_BODY}\n-----END OPENSSH PRIVATE KEY-----`, "privateKey"],
    [`API_KEY="${DUMMY_BODY}"`, "assignment"],
    [`{"client_secret": "${DUMMY_BODY}"}`, "assignment"],
    ["password=CorrectHorseBatteryStaple", "assignment"],
    ["https://alice:FakePassword87@example.invalid/path", "credentialUrl"],
    ["postgresql://alice:FakePassword87@localhost/test", "credentialUrl"]
];

test("recognizes fabricated common secret formats without returning any secret text", () => {
    for (const [input, expected] of keys) {
        const result = scanSecrets(input);
        assert.ok(result.findings.some(finding => finding.kind === expected), `Missing category ${expected}`);
        assert.equal(result.tooLong, false);
        assert.equal(JSON.stringify(result).includes(DUMMY_BODY), false);
        for (const finding of result.findings) assert.deepEqual(Object.keys(finding).sort(), ["count", "kind"]);
    }
});

test("does not flag prose, placeholder examples, environment references, public keys, URLs, or JWTs as Discord tokens", () => {
    const ordinary = [
        "Salut, merci pour ton aide !",
        "token: authentication",
        "secret: confidentiality",
        "api_key=process.env.API_KEY",
        "password: ${MY_PASSWORD}",
        "client_secret=your-secret-here",
        "token=example_token",
        "api_key=REDACTED_REDACTED",
        "password=xxxxxxxxxxxxxxxxxxxxxxxxxx",
        "password=aaaaaaaaaaaaaaaaaaaaaaaaaa",
        "password = os.environ['PASSWORD']",
        "https://user:password@example.invalid",
        "https://github.com/example/repo",
        "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
        `-----BEGIN PUBLIC KEY-----\n${DUMMY_BODY}\n-----END PUBLIC KEY-----`,
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY"
    ];
    for (const input of ordinary) assert.deepEqual(scanSecrets(input), { findings: [], tooLong: false }, "Unexpected warning on non-secret fixture");
});

test("aggregates a bounded number of categories, resets regex state, and refuses oversized text", () => {
    const result = scanSecrets(`${DUMMY_DISCORD} `.repeat(100));
    assert.deepEqual(result.findings, [{ kind: "discord", count: MAX_MATCHES_PER_KIND }]);
    assert.deepEqual(scanSecrets("ordinary text"), { findings: [], tooLong: false });
    assert.ok(scanSecrets(DUMMY_DISCORD).findings.length);
    assert.deepEqual(scanSecrets("x".repeat(MAX_TEXT_LENGTH + 1)), { findings: [], tooLong: true });
    assert.throws(() => scanSecrets(null as unknown as string), /Invalid outgoing text/);
});

test("bounded adversarial max-size inputs finish without catastrophic backtracking", () => {
    const cases = [
        "a".repeat(MAX_TEXT_LENGTH),
        "-----BEGIN PRIVATE KEY-----" + " ".repeat(MAX_TEXT_LENGTH - 27),
        "https://" + "a:".repeat(15_996),
        "api_key=".repeat(4000),
        "sk-proj-" + "a".repeat(MAX_TEXT_LENGTH - 8),
        "Word.abcdef.".repeat(2666)
    ];
    const start = performance.now();
    for (let i = 0; i < 25; i++) for (const input of cases) scanSecrets(input);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 3000, "150 bounded scans exceeded the generous regression threshold");
});
