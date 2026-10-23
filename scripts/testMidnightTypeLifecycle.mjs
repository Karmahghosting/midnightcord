/* SPDX-License-Identifier: GPL-3.0-or-later */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundle = await build({
    entryPoints: [`${root}/src/midnightcordplugins/midnightType/runtime.ts`],
    bundle: true, platform: "node", format: "cjs", write: false
});
const module = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), process, Buffer, Error,
    fetch: globalThis.fetch, AbortController, AbortSignal, setTimeout, clearTimeout
});
const { TypeRuntime, terminateRuntimeProcess } = module.exports;
const turn = () => new Promise(resolve => setImmediate(resolve));

class ProcessFixture extends EventEmitter {
    exitCode = null;
    signalCode = null;
    pid = 12345;
    signals = [];
    kill(signal) { this.signals.push(signal ?? "SIGTERM"); return true; }
    exit() { this.exitCode = 0; this.emit("exit", 0); }
}

test("termination waits for OS process exit, not only kill() acknowledgement", async () => {
    const child = new ProcessFixture();
    let finished = false;
    const wait = terminateRuntimeProcess(child).then(() => { finished = true; });
    await turn();
    assert.deepEqual(child.signals, ["SIGTERM"]);
    assert.equal(finished, false);
    child.exit();
    await wait;
    assert.equal(finished, true);
});

test("model deletion waits for process exit and rejects inference during deletion", async () => {
    const runtime = new TypeRuntime(tmpdir());
    const child = new ProcessFixture();
    runtime.child = child;
    let removed = false;
    runtime.assets.remove = async () => { removed = true; };
    runtime.assets.valid = async () => false;
    const removing = runtime.remove();
    await turn();
    assert.equal(removed, false);
    assert.equal(await runtime.complete(1, "blocked", "Hello world", "en"), "");
    child.exit();
    await removing;
    assert.equal(removed, true);
});

test("new setup waits for an in-progress removal instead of racing its directory", async () => {
    const runtime = new TypeRuntime(tmpdir());
    let finishRemoval;
    const actions = [];
    runtime.assets.remove = async () => { actions.push("remove-start"); await new Promise(resolve => { finishRemoval = resolve; }); actions.push("remove-done"); };
    runtime.assets.prepare = async () => { actions.push("setup"); };
    runtime.assets.valid = async () => false;
    const removing = runtime.remove();
    await turn();
    const settingUp = runtime.setup(1);
    await turn();
    assert.deepEqual(actions, ["remove-start"]);
    finishRemoval();
    await removing; await settingUp;
    assert.deepEqual(actions, ["remove-start", "remove-done", "setup"]);
    runtime.shutdown();
});

test("fatal startup failure does not repeatedly rehash and spawn on every typing pause", async () => {
    const runtime = new TypeRuntime(tmpdir());
    let starts = 0;
    runtime.start = async () => { starts++; throw new Error("runtime-start-failed"); };
    runtime.assets.prepare = async () => {};
    runtime.assets.valid = async () => true;
    try {
        assert.equal(await runtime.complete(1, "one", "Hello world", "en"), "");
        assert.equal(await runtime.complete(1, "two", "Hello again", "en"), "");
        assert.equal(starts, 1);
        await runtime.setup(1);
        assert.equal(await runtime.complete(1, "retry", "Hello again", "en"), "");
        assert.equal(starts, 2);
    } finally { runtime.shutdown(); }
});
