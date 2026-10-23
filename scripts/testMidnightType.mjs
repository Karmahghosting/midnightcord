/* SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/midnightcordplugins/midnightType/controller.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { TypingController, canComplete, cleanSuggestion } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function fixture(t) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let draft = { identity: "account:channel:editor", text: "Je te souhaite une" };
    const jobs = [], cancelled = [], changes = [];
    let failures = 0;
    const controller = new TypingController({
        current: () => draft,
        complete: (id, text) => new Promise((resolve, reject) => jobs.push({ id, text, resolve, reject })),
        cancel: id => cancelled.push(id), changed: value => changes.push(value),
        failed: () => failures++, delay: () => 500
    });
    return { controller, jobs, cancelled, changes, failures: () => failures,
        set: value => { draft = value; }, draft: () => draft, tick: () => t.mock.timers.tick(500) };
}

test("typing waits for a pause and only predicts the latest draft", async t => {
    const f = fixture(t);
    f.controller.observe(); t.mock.timers.tick(400);
    f.set({ ...f.draft(), text: "Je te souhaite une très" }); f.controller.observe();
    t.mock.timers.tick(400); assert.equal(f.jobs.length, 0);
    t.mock.timers.tick(100); assert.equal(f.jobs.length, 1);
    assert.equal(f.jobs[0].text, "Je te souhaite une très");
    f.jobs[0].resolve(" belle journée !"); await flush();
    assert.equal(f.changes.at(-1).text, " belle journée !");
});

test("superseded inference cannot overwrite a newer suggestion", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.set({ ...f.draft(), text: "Merci pour votre" }); f.controller.observe(); f.tick();
    assert.deepEqual(f.cancelled, [f.jobs[0].id]);
    f.jobs[1].resolve(" aide !"); await flush();
    f.jobs[0].resolve(" bonne journée !"); await flush();
    assert.equal(f.changes.at(-1).text, " aide !");
});

test("channel or account changes reject identical-text results", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.set({ identity: "other-account:other-channel:editor", text: f.draft().text });
    f.jobs[0].resolve(" bonne journée !"); await flush();
    assert.equal(f.changes.at(-1), undefined);
    assert.equal(f.controller.take(false), "");
});

test("blur, native autocomplete and IME contexts cancel pending work", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.set(undefined); f.controller.observe();
    assert.equal(f.cancelled.length, 1);
    f.jobs[0].resolve(" stale text"); await flush();
    assert.equal(f.changes.at(-1), undefined);
});

test("Escape dismisses without requesting again until the draft changes", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.jobs[0].resolve(" bonne soirée !"); await flush();
    f.controller.dismiss(); f.controller.observe(); f.tick();
    assert.equal(f.jobs.length, 1);
    assert.equal(f.controller.take(false), "");
});

test("Tab can accept one word or a short phrase, never sends a message", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.jobs[0].resolve(" bonne soirée !"); await flush();
    assert.equal(f.controller.take(true), " bonne ");
    assert.equal(f.controller.take(false), "");
    f.set({ ...f.draft(), text: "Merci pour votre" }); f.controller.observe(); f.tick();
    f.jobs[1].resolve(" aide aujourd'hui !"); await flush();
    assert.equal(f.controller.take(false), " aide aujourd'hui !");
});

test("acceptance revalidates the current caret context", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.jobs[0].resolve(" bonne soirée !"); await flush();
    f.set({ ...f.draft(), text: "Je ne souhaite plus" });
    assert.equal(f.controller.take(false), "");
});

test("reset removes a displayed suggestion and all delayed work", async t => {
    const f = fixture(t); f.controller.observe(); f.controller.reset(); f.tick();
    assert.equal(f.jobs.length, 0);
    f.controller.observe(); f.tick(); f.controller.reset();
    f.jobs[0].resolve(" stale"); await flush();
    assert.equal(f.changes.at(-1), undefined);
});

test("inference failures are handled and stale failures do not change UI", async t => {
    const f = fixture(t); f.controller.observe(); f.tick();
    f.jobs[0].reject(new Error("offline-runtime-unavailable")); await flush();
    assert.equal(f.failures(), 1);
    f.set({ ...f.draft(), text: "Bonjour à tous" }); f.controller.observe(); f.tick();
    f.controller.reset(); f.jobs[1].reject(new Error("cancelled")); await flush();
    assert.equal(f.failures(), 1);
});

test("context sent to the model is bounded while freshness uses the full draft", async t => {
    const f = fixture(t); f.set({ ...f.draft(), text: "bonjour ".repeat(300) }); f.controller.observe(); f.tick();
    assert.equal(f.jobs[0].text.length, 1024);
    assert.equal(f.controller.take(false), "");
});

test("commands, active mention/emoji tokens, URLs and excessive input are left to Discord", () => {
    for (const value of ["hello @some", "hello :smile", "hello #general", "/help", "visit https://example.com", "```code", "a".repeat(4001), "hi"]) {
        assert.equal(canComplete(value), false, value);
    }
    assert.equal(canComplete("Salut comment vas-tu"), true);
});

test("completion cleanup rejects mention injection and preserves simple punctuation", () => {
    for (const value of ["@everyone", "<@12345>", "```js", "<|im_end|>", "https://example.com"]) assert.equal(cleanSuggestion(value, "Bonjour"), "");
    assert.equal(cleanSuggestion("Merci beaucoup", "Merci"), " beaucoup");
    assert.equal(cleanSuggestion(" world", "Hello "), "world");
    assert.equal(cleanSuggestion("!", "Hello"), "!");
    assert.equal(cleanSuggestion("amour", "l’"), "amour");
    assert(cleanSuggestion(" word".repeat(200), "Hello").length <= 161);
});
