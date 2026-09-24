# Privacy Policy

Midnightcord works without a Midnightcord account. Midnightcord Cloud is optional and disabled by default. The current public policy is available at **https://midnightcord.fr/privacy**.

When Cloud is enabled, the app creates or imports a recovery key on the device. Separate authentication and AES-256-GCM encryption keys are derived from it. Plugin settings and QuickCSS are encrypted before upload to `api.midnightcord.fr`; the recovery and decryption keys never leave the user's devices.

The service stores opaque encrypted payloads and the minimum operational metadata: item type, encrypted size and checksum, version, update time, and a pseudonymous account identifier derived from the authentication secret. It does not receive Discord account identifiers, tokens, passwords, messages, calls, or local files through Cloud sync. Temporary in-memory network and account rate limits protect the service from abuse.

Users can delete individual Cloud data, delete the complete active Cloud account, or unlink only the current device. Encrypted security backups expire within 14 days. A lost recovery key cannot be recovered by Midnightcord.

Cloud users may receive a separate, optional invitation to the Midnightcord community. Joining requires explicit Discord OAuth authorization for `identify` and `guilds.join`. The server temporarily uses the authorized Discord user ID and access token to perform that single join; neither is stored. It records the community server ID, offer/decline/join status, date and an opaque attempt identifier under the pseudonymous Cloud account to avoid repeated prompts across devices. These operational markers are not encrypted with the recovery key and are removed when the Cloud account is deleted. Midnightcord does not automatically rejoin users who leave the community. No OAuth access or refresh token is retained for future additions.

The optional public badge lookup sends only the viewed Discord user ID to `api.midnightcord.fr/v1/badge`. Update checks contact the Midnightcord GitHub repository. Some optional plugins can contact services selected by the user. Discord itself continues to process normal Discord activity under [Discord's Privacy Policy](https://discord.com/privacy/).

Midnightcord does not add advertising trackers and does not sell Cloud data.
