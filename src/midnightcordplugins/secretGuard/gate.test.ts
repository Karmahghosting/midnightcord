/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_TEXT_LENGTH } from "./detector";
import { GateRequest, SecretGate } from "./gate";

const DUMMY = "ghp_aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY";

function fixture(gate = new SecretGate()) {
    let content = DUMMY;
    let current = true;
    let prompts = 0;
    const request: GateRequest = {
        operation: {}, phase: "before", context: "account:channel:send",
        getContent: () => content,
        contextIsCurrent: () => current,
        confirm: async () => { prompts++; return true; }
    };
    gate.start();
    return { gate, request, text: (value: string) => { content = value; }, setCurrent: (value: boolean) => { current = value; }, prompts: () => prompts };
}

test("normal messages pass both stages without a prompt", async () => {
    const f = fixture();
    f.text("Bonjour !");
    assert.equal(await f.gate.validate(f.request), undefined);
    assert.equal(await f.gate.validate({ ...f.request, phase: "after" }), undefined);
    assert.equal(f.prompts(), 0);
});

test("an explicit approval applies once to the same operation and exact text across the two stages", async () => {
    const f = fixture();
    assert.equal(await f.gate.validate(f.request), undefined);
    assert.equal(await f.gate.validate({ ...f.request, phase: "after" }), undefined);
    assert.equal(f.prompts(), 1);
    assert.deepEqual(await f.gate.validate({ ...f.request, phase: "after" }), { cancel: true });
    assert.equal(await f.gate.validate({ ...f.request, operation: {} }), undefined);
    assert.equal(f.prompts(), 2);
});

test("a transformed secret is rescanned and requires a new explicit approval", async () => {
    const f = fixture();
    await f.gate.validate(f.request);
    f.text(`${DUMMY} transformed`);
    assert.equal(await f.gate.validate({ ...f.request, phase: "after" }), undefined);
    assert.equal(f.prompts(), 2);
});

test("a secret introduced after an initially clean message is caught", async () => {
    const f = fixture();
    f.text("clean input");
    await f.gate.validate(f.request);
    f.text(DUMMY);
    assert.deepEqual(await f.gate.validate({ ...f.request, phase: "after", confirm: async () => false }), { cancel: true });
});

test("cancel, modal failure, detector failure, and oversized text all fail closed", async () => {
    const f = fixture();
    assert.deepEqual(await f.gate.validate({ ...f.request, confirm: async () => false }), { cancel: true });
    assert.deepEqual(await f.gate.validate({ ...f.request, confirm: async () => { throw new Error("Modal unavailable"); } }), { cancel: true });
    const broken = fixture(new SecretGate(() => { throw new Error("Detector unavailable"); }));
    assert.deepEqual(await broken.gate.validate(broken.request), { cancel: true });
    f.text("x".repeat(MAX_TEXT_LENGTH + 1));
    assert.deepEqual(await f.gate.validate(f.request), { cancel: true });
});

test("pending approval is revoked if the parsed content, account, channel, or lifecycle changes", async () => {
    for (const change of [
        (f: ReturnType<typeof fixture>) => f.text("changed"),
        (f: ReturnType<typeof fixture>) => f.setCurrent(false),
        (f: ReturnType<typeof fixture>) => f.gate.invalidate(),
        (f: ReturnType<typeof fixture>) => f.gate.stop()
    ]) {
        const f = fixture();
        let accept!: (accepted: boolean) => void;
        const result = f.gate.validate({ ...f.request, confirm: () => new Promise(resolve => { accept = resolve; }) });
        change(f);
        accept(true);
        assert.deepEqual(await result, { cancel: true });
    }
});

test("context identity and lifecycle changes between stages invalidate prior approval even after switching back", async () => {
    for (const context of ["other-account:channel:send", "account:other-channel:send", "account:channel:edit:123"]) {
        const f = fixture();
        await f.gate.validate(f.request);
        assert.deepEqual(await f.gate.validate({ ...f.request, phase: "after", context }), { cancel: true });
    }
    const f = fixture();
    await f.gate.validate(f.request);
    f.gate.invalidate();
    assert.deepEqual(await f.gate.validate({ ...f.request, phase: "after" }), { cancel: true });
});

test("a canceled after-stage cannot be replayed with the same approval", async () => {
    const f = fixture();
    await f.gate.validate(f.request);
    f.text(`${DUMMY} changed`);
    assert.deepEqual(await f.gate.validate({ ...f.request, phase: "after", confirm: async () => false }), { cancel: true });
    f.text(DUMMY);
    assert.deepEqual(await f.gate.validate({ ...f.request, phase: "after" }), { cancel: true });
});
