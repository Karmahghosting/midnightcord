export function gatewayHealthy(client, readyStatus) {
    return client.isReady() && client.ws.shards.size > 0
        && [...client.ws.shards.values()].every(shard => shard.status === readyStatus);
}

export function createDisconnectMonitor({ now = Date.now, limitMs = 300_000 } = {}) {
    let disconnectedAt = now();
    return healthy => {
        if (healthy) {
            disconnectedAt = null;
            return false;
        }
        disconnectedAt ??= now();
        return now() - disconnectedAt >= limitMs;
    };
}

export function fatalGatewayCode(code) {
    return [4004, 4010, 4011, 4012, 4013, 4014].includes(code);
}
