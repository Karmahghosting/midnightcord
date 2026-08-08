# Privacy Policy

This file is a short summary. The full, always up to date Privacy Policy is published at
**https://nightcord.st/privacy** — that page is the canonical version; if anything here ever
conflicts with it, the website version applies.

## Summary

Midnightcord is a client modification for Discord. Most functionality (plugins, themes, settings,
keybinds) runs entirely on your device and is never sent to us.

A small set of **opt-in** features talk to our backend at `api.nightcord.st`:

- Signing in with Discord (OAuth2, scopes `identify` and `guilds.join`) — stores your Discord
  user ID, username, display name, avatar URL, and OAuth access/refresh tokens so you stay
  signed in. We never see your Discord password.
- Cloud Settings Sync — your full plugin configuration, if you turn this on, linked to your
  Discord user ID so it can be restored on another device.
- Per-plugin sync — individual plugins may store settings server-side, keyed by plugin name and
  your Discord user ID, with a private/public toggle you control.
- Custom profile badges — any badge image you choose to upload, linked to your Discord user ID.
- Community-role cosmetic badges — your Discord user ID plus the roles you hold in the official
  Midnightcord server, used only to grant cosmetic badges.
- Username-history lookups — on demand only, forwards the looked-up Discord user ID to a
  third-party username-history provider.

If you never sign in with Discord inside Midnightcord, none of the above applies to you.

Our servers also process standard technical logs (IP address, user agent, timestamps) for
rate-limiting and abuse prevention, like virtually any web service. We do not use third-party
analytics or advertising trackers, do not read or store your messages/DMs/calls, and do not sell
or share data with advertisers or data brokers.

Since Midnightcord modifies the official Discord client, all messaging, calls, and server activity
still happen through Discord's own infrastructure and is governed by
[Discord's Privacy Policy](https://discord.com/privacy/).

For the full breakdown (data retention, deletion, browser extension permissions, contact
details), see **https://nightcord.st/privacy**.
