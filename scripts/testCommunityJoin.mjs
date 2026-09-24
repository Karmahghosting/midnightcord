import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

const bundled = await build({
    entryPoints: ["src/api/SettingsSync/communityFlow.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    write: false
});
const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
const { createCommunityFlow } = await import(`data:text/javascript;base64,${source}`);
const ticketUrl = `https://api.midnightcord.fr/v1/community/join?ticket=${"a".repeat(43)}`;
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
    const state = {
        enabled: true,
        authorization: "fixture-cloud-a",
        status: "unseen",
        requests: [],
        prompts: [],
        opened: [],
        errors: [],
        handler: null
    };
    const payload = () => ({ enabled: true, name: "Midnightcord", guildId: "1552687558478008331", status: state.status });
    const deps = {
        baseUrl: "https://api.midnightcord.fr/",
        isEnabled: () => state.enabled,
        getAuthorization: async () => state.authorization,
        fetch: async (url, options) => {
            state.requests.push({ url, ...options });
            if (state.handler) return state.handler(url, options);
            let result = payload();
            if (url.pathname.endsWith("/prompt")) {
                const showPrompt = state.status === "unseen";
                if (showPrompt) state.status = "offered";
                result = { ...payload(), showPrompt };
            } else if (url.pathname.endsWith("/decline")) {
                state.status = "declined";
                result = payload();
            } else if (url.pathname.endsWith("/join")) {
                result = state.status === "joined" ? { joined: true } : { url: ticketUrl };
            }
            return Response.json(result);
        },
        showPrompt: (confirm, decline) => state.prompts.push({ confirm, decline }),
        openExternal: url => { state.opened.push(url); },
        onChange: () => {},
        onError: manual => state.errors.push({ manual })
    };
    return { state, deps, create: () => createCommunityFlow(deps) };
}

test("disabled and unlinked Cloud identities never request or open an invitation", async () => {
    const { state, create } = harness();
    const flow = create();
    state.enabled = false;
    await flow.offer();
    await flow.join();
    assert.equal(await flow.getStatus(), null);
    state.enabled = true;
    state.authorization = null;
    await flow.offer();
    await flow.join();
    assert.equal(await flow.getStatus(), null);
    assert.equal(state.requests.length, 0);
    assert.equal(state.prompts.length, 0);
});

test("startup claims a prompt once across devices and never opens Discord before consent", async () => {
    const { state, create } = harness();
    const first = create();
    await Promise.all([first.offer(), first.offer(), create().offer()]);
    assert.equal(state.prompts.length, 1);
    assert.equal(state.opened.length, 0);
    state.prompts[0].confirm();
    await flush();
    assert.deepEqual(state.opened, [ticketUrl]);
    for (const request of state.requests) {
        assert.equal(request.headers.Authorization, "Bearer fixture-cloud-a");
        assert.equal(request.headers["X-Midnightcord-Client"], "desktop-v1");
        assert.equal(request.url.search, "");
    }
});

test("declining persists the choice while keeping a manual join available", async () => {
    const { state, create } = harness();
    const flow = create();
    await flow.offer();
    state.prompts[0].decline();
    await flush();
    assert.equal(state.status, "declined");
    await create().offer();
    assert.equal(state.prompts.length, 1);
    await flow.join();
    assert.deepEqual(state.opened, [ticketUrl]);
});

test("already-joined identities are never prompted or added again", async () => {
    const { state, create } = harness();
    state.status = "joined";
    const flow = create();
    await flow.offer();
    await flow.join();
    assert.equal((await flow.getStatus()).status, "joined");
    assert.equal(state.prompts.length, 0);
    assert.equal(state.opened.length, 0);
});

test("stale authorization responses and modal callbacks cannot act on another Cloud identity", async () => {
    const { state, create } = harness();
    const flow = create();
    await flow.offer();
    state.authorization = "fixture-cloud-b";
    state.prompts[0].confirm();
    state.prompts[0].decline();
    await flush();
    assert.equal(state.requests.length, 1);
    assert.equal(state.opened.length, 0);

    let release;
    state.handler = () => new Promise(resolve => { release = resolve; });
    const pending = flow.join();
    await flush();
    state.authorization = "fixture-cloud-c";
    release(Response.json({ url: ticketUrl }));
    await pending;
    assert.equal(state.opened.length, 0);
});

test("turning Cloud off during an in-flight offer prevents its prompt", async () => {
    const { state, create } = harness();
    let release;
    state.handler = () => new Promise(resolve => { release = resolve; });
    const pending = create().offer();
    await flush();
    state.enabled = false;
    release(Response.json({ enabled: true, name: "Midnightcord", guildId: "1552687558478008331", status: "offered", showPrompt: true }));
    await pending;
    assert.equal(state.prompts.length, 0);
});

test("errors and timeouts do not cause repeated startup prompts or unhandled rejections", async () => {
    const { state, deps, create } = harness();
    deps.timeoutMs = 5;
    state.handler = (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("Timed out")), { once: true });
    });
    const flow = create();
    await flow.offer();
    await flow.offer();
    assert.equal(state.requests.length, 1);
    assert.deepEqual(state.errors, [{ manual: false }]);
    assert.equal(state.prompts.length, 0);
    await flow.join();
    assert.deepEqual(state.errors, [{ manual: false }, { manual: true }]);
});

test("manual joins reject unexpected origins and credential-bearing URLs", async () => {
    const { state, create } = harness();
    for (const url of [ticketUrl.replace("api.midnightcord.fr", "example.com"), `${ticketUrl}&authorization=secret`, "https://api.midnightcord.fr/v1/community/join?ticket=short"]) {
        state.handler = async () => Response.json({ url });
        await create().join();
    }
    assert.equal(state.opened.length, 0);
    assert.equal(state.errors.length, 3);
});

test("simultaneous manual clicks create only one browser flow", async () => {
    const { state, create } = harness();
    const flow = create();
    await Promise.all([flow.join(), flow.join(), flow.join()]);
    assert.equal(state.requests.length, 1);
    assert.deepEqual(state.opened, [ticketUrl]);
});

test("web authorization reserves its tab synchronously and closes unused tabs", async () => {
    const { state, deps, create } = harness();
    const tabs = [];
    deps.prepareExternal = () => {
        const tab = { opened: null, closed: false };
        tabs.push(tab);
        return {
            open: url => { tab.opened = url; },
            close: () => { if (!tab.opened) tab.closed = true; }
        };
    };
    const flow = create();
    await flow.offer();
    state.prompts[0].confirm();
    assert.equal(tabs.length, 1, "tab must be reserved before the confirmation callback returns");
    await flush();
    assert.deepEqual(tabs[0], { opened: ticketUrl, closed: false });
    assert.equal(state.opened.length, 0, "reserved web tab replaces delayed window.open");

    state.status = "joined";
    const pending = flow.join();
    assert.equal(tabs.length, 2, "manual click reserves before awaiting Cloud identity");
    await pending;
    assert.deepEqual(tabs[1], { opened: null, closed: true });

    state.handler = async () => new Response(null, { status: 503 });
    await flow.join();
    assert.deepEqual(tabs[2], { opened: null, closed: true });

    state.authorization = "fixture-cloud-b";
    state.prompts[0].confirm();
    await flush();
    assert.deepEqual(tabs[3], { opened: null, closed: true });
});
