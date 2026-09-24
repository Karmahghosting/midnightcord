# Midnightcord Cloud API

This service stores only client-encrypted Midnightcord settings and QuickCSS. A Cloud key remains on the user's devices and derives independent authentication and AES-256-GCM encryption keys. The server receives an opaque credential and encrypted binary payloads.

## API

- `GET /v1/cloud/health`
- `GET /v1/cloud/manifest`
- `GET|PUT|DELETE /v1/cloud/data/settings`
- `GET|PUT|DELETE /v1/cloud/data/quickCss`
- `DELETE /v1/cloud/account`

Writes use `If-Match` to prevent silent overwrites when another device has a newer version. Each item is limited to 2 MiB and an account to 6 MiB.

Run `npm test` before deploying. Production files belong under `/opt/midnightcord-cloud/releases`, while encrypted runtime data stays in `/var/lib/midnightcord-cloud` across releases.

The included systemd timer creates a daily encrypted-data archive in `/var/backups/midnightcord-cloud` and removes archives after 14 days. Payload generations are written before their manifest is switched, reducing the risk of an incomplete live snapshot.
