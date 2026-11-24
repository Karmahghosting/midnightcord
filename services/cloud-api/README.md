# Midnightcord Cloud API

This service stores client-encrypted Midnightcord settings and QuickCSS, minimal community invitation status, and the separate private GIF teams feature. A Cloud key remains on the user's devices and derives independent authentication and AES-256-GCM encryption keys. Cloud backup endpoints receive an opaque credential and encrypted binary payloads. Community status is associated with that pseudonymous Cloud account and the configured guild, without storing a Discord user ID. GIF teams store readable shared GIF links and display names so invited members can retrieve them; they are not end-to-end encrypted Cloud backups.

## API

- `GET /v1/cloud/health`
- `GET|HEAD /v1/cloud/stats` (public aggregate: `{ "schema": 1, "accountsWithBackups": 12, "updatedAt": "2026-09-30T12:00:00.000Z" }`)
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

Public statistics count Cloud accounts with at least one current settings or QuickCSS entry in a validated manifest. Two items in the same account count once; empty accounts and community-only records do not count. This is not a count of unique people, Discord members, or currently connected devices. No account identifier, invitation state, manifest, or encrypted payload is returned, and counting never reads payload files.

The service shares one in-flight statistics scan, reads at most eight manifests concurrently, and caches each result for 60 seconds. Cache headers reflect the remaining freshness; changes and deletions appear after the next refresh. An unavailable data directory or malformed manifest returns a generic `503` instead of a misleading count, with failed scans also held for 60 seconds. The existing `/v1/cloud/` Nginx location forwards this public route; all private Cloud routes still require their Bearer credential.

Run `npm test` before deploying. Production files belong under `/opt/midnightcord-cloud/releases`, while encrypted runtime data stays in `/var/lib/midnightcord-cloud` across releases.

The included systemd timer creates a daily encrypted-data archive in `/var/backups/midnightcord-cloud` and removes archives after 14 days. Payload generations are written before their manifest is switched, reducing the risk of an incomplete live snapshot.

## Private GIF teams

`/v1/cloud/health` advertises `capabilities: ["gif-teams-v1"]`. All GIF team endpoints require a Bearer credential, use the existing request rate limit and no-store response policy, and reject requests from unapproved browser origins. The plugin derives a separate credential from the user's Cloud key and current Discord account, so changing Discord accounts does not share another account's favorites. The server receives no Discord account token or Discord ID. Display names are user-selected labels, not verified Discord identities.

| Method | Path (under `/v1/cloud/gif-teams`) | Result |
| --- | --- | --- |
| GET | `/` (without the trailing slash) | Own teams, opaque `viewerId`, and limits. Summaries include own `mode` and `sharingRevision`. |
| POST | `/` | Create a team with `{name, displayName}`. The creator is the owner; sharing starts **off**. |
| POST | `/join` | Join with `{code, displayName}`. Sharing starts **off**. |
| GET | `/:id` | Team and member metadata, visible only to members. |
| GET | `/:id/sharing` | Own `{mode, gifs, revision}`. |
| PUT | `/:id/sharing` | Replace own snapshot with `{mode, gifs, displayName, revision}`. A stale revision returns `409 version_conflict`. |
| GET | `/:id/gifs?member=<public-id>&offset=0&limit=60` | Paged shared GIFs with contributor labels. `member` is optional; maximum page size is 100. |
| POST | `/:id/invites` | Owner creates a code valid for 24 hours and one new member; replaces the previous code. No request body needed. |
| DELETE | `/:id/invites` | Owner revokes the current invitation. |
| DELETE | `/:id/members/:memberId` | Owner removes another member and their shared collection. |
| DELETE | `/:id/membership` | A member leaves and removes their shared collection. An owner must delete the team instead. |
| DELETE | `/:id` | Owner deletes the team and all its shared collections. |
| DELETE | `/account` | Remove the caller from every team, delete their owned teams and shared collections. |

The client may choose `auto` (synchronize all supported favorites), `manual` (only the selected favorites), or `off` per team. The server receives only the selected snapshot; it cannot read Discord favorites itself. `off` must provide `gifs: []` and removes the current collection. Snapshots preserve `url`, preview `src`, `width`, `height`, optional `title`, and `format` (`1` image, `2` video). The server adds a stable `id` based on the normalized URL and deduplicates within each contributor's snapshot. The same GIF can still appear under several contributors.

Limits are 10 teams per account, 25 members per team, 1,000 GIFs per member and a 2 MiB JSON request body. The service caps total teams at 1,000 to bound its metadata index within the deployed memory budget; existing teams remain available at capacity. A separate 120 requests/minute/IP limit cannot be evaded by rotating account credentials, and only four JSON writes may be read/queued at once. Transient pressure returns `429` with `Retry-After`. Names are bounded; send URLs must be public HTTPS URLs without credentials, IP literals or local-only hostnames. The API never downloads GIFs or proxies user-supplied URLs. Previews are limited to Tenor's media hosts, Giphy, Discord's CDN/media hosts and `i.imgur.com`; another valid GIF link is retained with an empty preview, for the client to render as a placeholder. Never include an invitation code, GIF URL or credential in logs.

The Nginx GIF route has its own 2 requests/second/IP budget with a burst of 20. Browser preflights do not spend this budget, but still reach the API's origin validation. Edge rejections return JSON with `Retry-After: 1` and CORS only for the API's approved origins; upstream `429` responses retain their own retry duration. `Retry-After` is exposed to approved browser clients at both layers. Install both deployment snippets together and validate with `nginx -t` before reloading. `node --test test/nginx.test.mjs` exercises these rules using an isolated Nginx listener and synthetic upstream; it skips when Nginx is unavailable (`NGINX_BINARY` can select its path).

GIF team data lives under `DATA_DIR/gif-teams/teams`. Metadata and immutable collection generations are written atomically before updating the in-memory membership index. The single service process serializes operations so a removed member cannot write with an outdated permission check. Startup indexes metadata only, and page reads load just the collection generations needed for the requested page. Corrupt metadata returns `503` without replacing it. Invitations are persisted as hashes, not raw codes; the code is returned only when created. Obsolete generations are removed on replacement and during startup recovery. The service directory must be owned by a single running API instance; do not run multiple writers against the same filesystem.

Only the live shared links, labels and membership records remain until a user stops sharing, leaves, is removed, or deletes their GIF teams account. Server backups can retain deleted data for the existing 14-day retention period and now contain these readable shared links alongside encrypted Cloud backup payloads; keep the backup directory private. `DELETE /v1/cloud/account` also erases any GIF teams using that exact credential. The plugin uses a domain-separated GIF credential, so its separate **Delete my GIF teams data** action calls `/v1/cloud/gif-teams/account`; deleting an unrelated Cloud credential does not identify or revoke derived credentials automatically. GIF-only accounts do not inflate the public encrypted-backup statistics.

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
