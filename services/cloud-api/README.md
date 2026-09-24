# Midnightcord Cloud API

This service stores client-encrypted Midnightcord settings and QuickCSS, plus minimal community invitation status. A Cloud key remains on the user's devices and derives independent authentication and AES-256-GCM encryption keys. The server receives an opaque credential and encrypted binary payloads. Community status is associated with that pseudonymous Cloud account and the configured guild, without storing a Discord user ID.

## API

- `GET /v1/cloud/health`
- `GET /v1/community/status`
- `GET /v1/community/join` (starts an explicit Discord OAuth2 authorization)
- `GET /v1/community/callback` (uses the temporary authorization to join that user to the configured guild)
- `GET /v1/cloud/community` (authenticated invitation status: `unseen`, `offered`, `declined`, or `joined`)
- `POST /v1/cloud/community/prompt` (atomically claims the account's one-time invitation; returns `showPrompt`)
- `PUT /v1/cloud/community/decline` (declines and cancels pending authorizations, preserving an existing `joined` status)
- `POST /v1/cloud/community/join` (creates a single-use browser ticket, or returns `{ "joined": true }`)
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

Register `https://api.midnightcord.fr/v1/community/callback` as the OAuth2 redirect URI. The bot must already be a member of that guild with `CREATE_INSTANT_INVITE` (Create Invite), as required by [Discord's Add Guild Member endpoint](https://discord.com/developers/docs/resources/guild#add-guild-member). Administrator and privileged gateway intents are not needed for this REST flow. Keep the environment file outside releases and readable only by root and the `midnightcord-cloud` service group.

The client claims the invitation once per Cloud account and guild. The API persists `offered` before returning `showPrompt: true`, so multiple devices or server restarts do not repeat the prompt. Declining suppresses automatic prompts but leaves the manual join action available in settings. Existing Cloud accounts follow the same invitation flow on their next client startup. Enabling the feature does not add existing users without Discord authorization.

The authenticated join endpoint returns an opaque, single-use ticket for `https://api.midnightcord.fr/v1/community/join?ticket=...`. This ticket contains no Cloud credential and expires after ten minutes. The browser consumes it to start the authorization code grant with `identify guilds.join` and a single-use `state` bound to an HttpOnly, Secure, SameSite cookie. Both ticket and browser state are bound to the requesting Cloud account, application and guild. Creating a replacement attempt, declining, or deleting the account invalidates pending attempts. Server restarts discard outstanding tickets and OAuth states; the settings action can create another.

A successful Discord `201` (joined) or `204` (already a member) persists `joined` and prevents further membership requests for that Cloud account and guild, including after a server restart. Discord `access_denied` persists `declined`; failures remain manually retryable without repeating the automatic prompt. The service never polls membership or re-adds a user who later leaves. Only the status, timestamp and opaque attempt generation are stored alongside the encrypted-data manifest. OAuth access/refresh tokens and Discord user IDs are never persisted. Account deletion removes this metadata and aborts active requests; a membership request already accepted by Discord cannot be undone by deleting Cloud data.

Disable access logging for both `/v1/community/join` and `/v1/community/callback`, because their URLs can contain short-lived tickets or authorization codes. Use a callback proxy timeout greater than the three sequential ten-second Discord API timeouts. The legacy public `/v1/community/join` without a ticket remains an explicit, independent browser authorization for older clients; it cannot update a Cloud account's status. The guild must already exist: there is no deferred bulk-join queue and no retained authorization for future membership changes.
