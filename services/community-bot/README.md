# Midnightcord community bot

Persistent Discord Gateway connection for the community application's online presence. Discord.js manages heartbeats and reconnection; systemd restarts crashes and starts the service at boot. A five-minute disconnected-shard watchdog recovers stalled connections. Invalid credentials or Gateway configuration stop the service with exit 78 until corrected.

Only the Guilds intent is requested. No messages, member lists or presence updates are requested, and this process never sends messages or joins users. Community OAuth remains in the separate Cloud API.

Use Node 22.12+ and the pinned pnpm 10.30.3 lockfile:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

Production lives in `/opt/midnightcord-community-bot/releases/<revision>`, selected by `current`. Install `deploy/midnightcord-community-bot.service`, create the `midnightcord-bot` system user, and enable the service. Store only the bot token in `/etc/midnightcord-cloud/community-bot.token` (root:root, mode 0600). systemd passes it using `LoadCredential`; the bot does not receive the OAuth client secret. When rotating the Discord token, update both this credential and the Cloud API's `MIDNIGHTCORD_DISCORD_BOT_TOKEN` before restarting both services.

`GET http://127.0.0.1:4176/health` reports Gateway readiness and heartbeat latency, returning 503 during disconnection. This listener is deliberately not proxied to the internet. After deployment verify the bot ID, `presence: online`, acknowledged heartbeat, systemd enablement, and a controlled restart. Discord or VPS outages can still temporarily interrupt presence.
