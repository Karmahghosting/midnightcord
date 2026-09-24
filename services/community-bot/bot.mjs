import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { Client, Events, GatewayIntentBits, Status } from "discord.js";
import { createDisconnectMonitor, fatalGatewayCode, gatewayHealthy } from "./health.mjs";

const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
const token = credentialDirectory
    ? (await readFile(join(credentialDirectory, "discord-token"), "utf8")).trim()
    : process.env.MIDNIGHTCORD_DISCORD_BOT_TOKEN?.trim();
if (!token) {
    console.error("[community-bot] Bot credential is missing.");
    process.exit(78);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    presence: { status: "online", activities: [], afk: false }
});
const monitor = createDisconnectMonitor();
let stopping = false;
let monitorTimer;
let connectedAt = null;
const healthy = () => !stopping && gatewayHealthy(client, Status.Ready);

const server = createServer((request, response) => {
    if (request.url !== "/health" || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(404).end();
        return;
    }
    const online = healthy();
    response.writeHead(online ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({
        connected: online, presence: online ? client.presence.status : "disconnected",
        botId: client.user?.id ?? null, guilds: client.guilds.cache.size,
        pingMs: client.ws.ping >= 0 ? client.ws.ping : null, connectedAt
    }));
});

async function shutdown(code) {
    if (stopping) return;
    stopping = true;
    clearInterval(monitorTimer);
    const deadline = setTimeout(() => process.exit(code), 5_000);
    deadline.unref();
    server.close();
    server.closeAllConnections();
    try { await client.destroy(); } finally { process.exit(code); }
}

client.on(Events.ClientReady, () => {
    connectedAt = new Date().toISOString();
    console.log(`[community-bot] Online as ${client.user.id}; guilds=${client.guilds.cache.size}.`);
});
client.on(Events.ShardReconnecting, id => console.log(`[community-bot] Reconnecting shard ${id}.`));
client.on(Events.ShardResume, id => console.log(`[community-bot] Resumed shard ${id}.`));
client.on(Events.ShardDisconnect, (event, id) => {
    console.error(`[community-bot] Shard ${id} disconnected (code ${event.code}).`);
    if (fatalGatewayCode(event.code)) void shutdown(78);
});
// Discord errors can contain request credentials. Log fixed diagnostics only.
client.on(Events.Error, () => console.error("[community-bot] Discord client error; recovery is supervised."));
client.on(Events.ShardError, () => console.error("[community-bot] Gateway transport error; reconnecting."));
server.on("error", () => {
    console.error("[community-bot] Local health listener failed.");
    void shutdown(1);
});
process.once("SIGTERM", () => void shutdown(0));
process.once("SIGINT", () => void shutdown(0));

server.listen(Number(process.env.PORT || 4176), "127.0.0.1");
monitorTimer = setInterval(() => {
    if (monitor(healthy())) {
        console.error("[community-bot] Gateway unavailable for five minutes; restarting connection.");
        void shutdown(1);
    }
}, 30_000);

try {
    await client.login(token);
} catch (error) {
    const invalidCredential = error?.code === "TokenInvalid" || error?.status === 401;
    console.error(invalidCredential ? "[community-bot] Invalid bot credential." : "[community-bot] Login failed; systemd will retry.");
    await shutdown(invalidCredential ? 78 : 1);
}
