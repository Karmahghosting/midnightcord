# Midnightcord Cloud API

This service stores only client-encrypted Midnightcord settings and QuickCSS. A Cloud key remains on the user's devices and derives independent authentication and AES-256-GCM encryption keys. The server receives an opaque credential and encrypted binary payloads.

## API

- `GET /v1/cloud/health`
- `GET /v1/community/status`
- `GET /v1/community/join` (starts an explicit Discord OAuth2 authorization)
- `GET /v1/community/callback` (uses the temporary authorization to join that user to the configured guild)
- `GET /v1/cloud/manifest`
- `GET|PUT|DELETE /v1/cloud/data/settings`
- `GET|PUT|DELETE /v1/cloud/data/quickCss`
- `GET /v1/cloud/history/settings` and `/v1/cloud/history/quickCss` (encrypted revision metadata)
- `GET /v1/cloud/history/<item>/<version>` (encrypted revision payload)
- `DELETE /v1/cloud/account`

Writes use `If-Match` to prevent silent overwrites when another device has a newer version. Each item is limited to 2 MiB and active items to 6 MiB per account. The service retains the five most recent previous encrypted versions per item; deleting an item or account deletes its retained versions too.

Run `npm test` before deploying. Production files belong under `/opt/midnightcord-cloud/releases`, while encrypted runtime data stays in `/var/lib/midnightcord-cloud` across releases.

The included systemd timer creates a daily encrypted-data archive in `/var/backups/midnightcord-cloud` and removes archives after 14 days. Payload generations are written before their manifest is switched, reducing the risk of an incomplete live snapshot.

## Optional community join

The community join flow is disabled unless all of these systemd environment variables are set in `/etc/midnightcord-cloud/community-oauth.env`:

```text
MIDNIGHTCORD_DISCORD_CLIENT_ID=<Discord application ID>
MIDNIGHTCORD_DISCORD_CLIENT_SECRET=<Discord OAuth client secret>
MIDNIGHTCORD_DISCORD_BOT_TOKEN=<bot token for the same application>
MIDNIGHTCORD_COMMUNITY_GUILD_ID=<Midnightcord community server ID>
```

Register `https://api.midnightcord.fr/v1/community/callback` as the OAuth2 redirect URI. The bot must already be a member of that guild. Keep the environment file outside releases and readable only by root and the `midnightcord-cloud` service group. The flow uses the authorization code grant and `identify guilds.join`, validates one-time `state`, and never stores OAuth access or refresh tokens. The callback access log is disabled because Discord returns its short-lived authorization code in the URL. Each user must start this flow and approve it in Discord; enabling Cloud alone does not add a member. The guild must already exist, so no future join requests or OAuth tokens are queued.
