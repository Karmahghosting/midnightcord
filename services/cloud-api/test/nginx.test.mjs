import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const binary = process.env.NGINX_BINARY || "nginx";
const nginxAvailable = spawnSync(binary, ["-v"], { stdio: "ignore" }).status === 0;

test("Nginx GIF limits preserve browser-readable JSON, upstream retries and unmetered preflights", { skip: !nginxAvailable && "Nginx is not installed" }, async t => {
    const directory = await mkdtemp(join(tmpdir(), "midnightcord-nginx-test-"));
    const calls = [];
    const upstream = createServer((request, response) => {
        calls.push({ method: request.method, address: request.headers["x-forwarded-for"] });
        const origin = request.headers.origin;
        const allowed = origin === "https://discord.com";
        response.setHeader("Cache-Control", "no-store");
        if (allowed) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Access-Control-Expose-Headers", "Retry-After");
        }
        if (request.method === "OPTIONS") {
            response.writeHead(allowed ? 204 : 403, { "X-Test-Upstream": "preflight" });
            return response.end();
        }
        response.setHeader("Content-Type", "application/json");
        if (request.url.endsWith("/upstream-limit")) {
            response.writeHead(429, { "Retry-After": "37" });
            return response.end(JSON.stringify({ error: "upstream_limit_fixture" }));
        }
        response.end(JSON.stringify({ ok: true }));
    });
    let worker;
    let workerExit;
    t.after(async () => {
        if (worker && worker.exitCode === null && worker.signalCode === null) worker.kill("SIGTERM");
        if (workerExit) await workerExit;
        upstream.closeAllConnections();
        await new Promise(resolve => upstream.close(resolve));
        await rm(directory, { recursive: true, force: true });
    });
    await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));

    const rates = await readFile(new URL("../deploy/nginx-rate.conf", import.meta.url), "utf8");
    const routes = (await readFile(new URL("../deploy/nginx-cloud.conf", import.meta.url), "utf8"))
        .replaceAll("http://127.0.0.1:4175", `http://127.0.0.1:${upstream.address().port}`);
    await mkdir(join(directory, "logs"));
    await writeFile(join(directory, "nginx.conf"), `
daemon off;
master_process off;
pid logs/nginx.pid;
error_log logs/error.log warn;
events { worker_connections 128; }
http {
    access_log off;
    ${rates}
    server {
        listen 127.0.0.1:${port};
        server_name localhost;
        ${routes}
    }
}
`);
    const args = ["-p", directory + "/", "-c", "nginx.conf"];
    const validation = spawnSync(binary, ["-t", ...args], { encoding: "utf8" });
    assert.equal(validation.status, 0, validation.stderr);
    worker = spawn(binary, args, { stdio: "ignore" });
    workerExit = once(worker, "exit");
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            await fetch(`${base}/v1/cloud/health`, { signal: AbortSignal.timeout(200) });
            ready = true;
            break;
        } catch { await delay(20); }
    }
    assert(ready, `Nginx did not start: ${await readFile(join(directory, "logs", "error.log"), "utf8")}`);
    const request = (origin, address, method = "GET", suffix = "") => fetch(`${base}/v1/cloud/gif-teams${suffix}`, {
        method, headers: { Origin: origin, "CF-Connecting-IP": address }, signal: AbortSignal.timeout(3000)
    });

    const origins = ["https://discord.com", "https://canary.discord.com", "https://midnightcord.fr", "https://discord.com.evil.example", "null"];
    for (const [index, origin] of origins.entries()) {
        const address = `192.0.2.${index + 1}`;
        const responses = await Promise.all(Array.from({ length: 28 }, () => request(origin, address)));
        const rejected = responses.filter(response => response.status === 429);
        assert(rejected.length > 0, `The per-IP burst limit must reject excess requests for origin ${origin}`);
        for (const response of rejected) {
            assert.equal(response.headers.get("content-type"), "application/json");
            assert.equal(response.headers.get("cache-control"), "no-store");
            assert.equal(response.headers.get("retry-after"), "1");
            assert.equal(response.headers.get("vary"), "Origin");
            assert.equal(response.headers.get("access-control-allow-credentials"), null);
            assert.equal(response.headers.get("access-control-allow-origin"), index < 3 ? origin : null);
            assert.equal(response.headers.get("access-control-expose-headers"), index < 3 ? "Retry-After" : null);
            assert.equal((await response.json()).error, "rate_limited");
        }
        const preflight = await request(origin, address, "OPTIONS");
        assert.equal(preflight.status, origin === "https://discord.com" ? 204 : 403);
        assert.equal(preflight.headers.get("x-test-upstream"), "preflight", "Preflight reaches origin validation even after a burst");
    }

    const address = "192.0.2.99";
    const preflights = await Promise.all(Array.from({ length: 50 }, () => request("https://discord.com", address, "OPTIONS")));
    assert(preflights.every(response => response.status === 204));
    assert.equal(calls.filter(call => call.method === "OPTIONS" && call.address === address).length, 50);
    assert.equal((await request("https://discord.com", address)).status, 200, "Preflights must not spend the actual request budget");
    const upstreamLimit = await request("https://discord.com", "192.0.2.100", "GET", "/upstream-limit");
    assert.equal(upstreamLimit.status, 429);
    assert.equal(upstreamLimit.headers.get("retry-after"), "37", "Nginx must retain the backend's actual retry duration");
    assert.equal(upstreamLimit.headers.get("access-control-allow-origin"), "https://discord.com");
    assert.deepEqual(await upstreamLimit.json(), { error: "upstream_limit_fixture" });
});
