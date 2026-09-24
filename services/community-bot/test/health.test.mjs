import assert from "node:assert/strict";
import test from "node:test";
import { createDisconnectMonitor, fatalGatewayCode, gatewayHealthy } from "../health.mjs";

test("health detects reconnecting shards even when Discord's client reports ready", () => {
    const shard = { status: 0 };
    const client = { isReady: () => true, ws: { shards: new Map([[0, shard]]) } };
    assert.equal(gatewayHealthy(client, 0), true);
    shard.status = 1;
    assert.equal(gatewayHealthy(client, 0), false);
    client.ws.shards.clear();
    assert.equal(gatewayHealthy(client, 0), false);
});

test("watchdog allows normal reconnects and resets the outage window after recovery", () => {
    let time = 0;
    const monitor = createDisconnectMonitor({ now: () => time });
    time = 299_999;
    assert.equal(monitor(false), false);
    time = 300_000;
    assert.equal(monitor(false), true);
    assert.equal(monitor(true), false);
    time = 600_000;
    assert.equal(monitor(false), false);
    time = 899_999;
    assert.equal(monitor(false), false);
    time = 900_000;
    assert.equal(monitor(false), true);
});

test("invalid credentials and configuration stop retry loops while transient closes recover", () => {
    for (const code of [4004, 4010, 4011, 4012, 4013, 4014]) assert.equal(fatalGatewayCode(code), true);
    for (const code of [1000, 1006, 4000, 4007, 4009]) assert.equal(fatalGatewayCode(code), false);
});
