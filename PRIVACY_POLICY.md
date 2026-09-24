# Privacy Policy

Midnightcord works without a Midnightcord account. Midnightcord Cloud is optional and disabled by default. The current public policy is available at **https://midnightcord.fr/privacy**.

When Cloud is enabled, the app creates or imports a recovery key on the device. Separate authentication and AES-256-GCM encryption keys are derived from it. Plugin settings and QuickCSS are encrypted before upload to `api.midnightcord.fr`; the recovery and decryption keys never leave the user's devices.

The service stores opaque encrypted payloads and the minimum operational metadata: item type, encrypted size and checksum, version, update time, and a pseudonymous account identifier derived from the authentication secret. It does not receive Discord account identifiers, tokens, passwords, messages, calls, or local files through Cloud sync. Temporary in-memory network and account rate limits protect the service from abuse.

Users can delete individual Cloud data, delete the complete active Cloud account, or unlink only the current device. Encrypted security backups expire within 14 days. A lost recovery key cannot be recovered by Midnightcord.

The optional public badge lookup sends only the viewed Discord user ID to `api.midnightcord.fr/v1/badge`. Update checks contact the Midnightcord GitHub repository. Some optional plugins can contact services selected by the user. Discord itself continues to process normal Discord activity under [Discord's Privacy Policy](https://discord.com/privacy/).

Midnightcord does not add advertising trackers and does not sell Cloud data.
