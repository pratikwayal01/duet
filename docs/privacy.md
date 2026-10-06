# Privacy

Plain language, short version of [threat-model](threat-model.md).

## What leaves your browser

| Data | Where it goes | Why |
|---|---|---|
| Room id, play/pause/seek position, playback rate, display name | Your signal server (default: our demo; or your own) | To keep both players in sync |
| Encrypted chat (ciphertext only) | Your signal server, only as a fallback when P2P is down | The server cannot read it — the key stays in your invite link |
| Video/audio/voice | Directly to the other person (WebRTC), never our servers | That's the whole point |
| TURN credentials request | Your signal server mints short-lived credentials | Only when a direct connection fails |

## What never leaves

Streaming-service credentials, cookies, page contents, video bytes. Sync
messages carry only an opaque title id (`netflix:81234567`), never titles.

## What's stored, and where

- Extension settings (server URL, display name, theme): `chrome.storage`
  on your device only.
- Rooms: live server memory only, gone after 12 h idle. No accounts, no
  user database.

## Analytics

None. No telemetry, no crash reporting (an opt-in anonymous crash count
is reserved but not implemented). If it ever ships, it will be off by
default and announced in the changelog.
