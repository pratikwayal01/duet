# Architecture

One tiny server (signaling + room ordering), everything else peer-to-peer or
per-person playback. The server never sees media, titles, chat plaintext, or
secrets.

```
┌───────────────────────── Alice ─────────────────────────┐
│ Extension (MV3, WXT)                                     │
│  ├ content script + site adapter → <video> / player API  │
│  ├ background service worker (room client, clock sync)   │
│  └ side panel UI: chat, presence, status                  │
│  -- OR plain web app (Share viewer / guest) --           │
└───────────────┬──────────────────────────────┬──────────┘
                │ WebSocket (signaling + sync) │ WebRTC (media + data channel)
                ▼                              └──────────────────────────────────┐
        Cloudflare Worker ──► Durable Object "Room"                              │
        (or Node `ws` fallback)  (2-conn cap, rev-stamped state, SDP relay) ◄────┘
                                         │
                                         └──► TURN credentials (short-lived,
                                              minted by the Worker, card-free
                                              default = Open Relay / BYO TURN)
Static web app (landing, /r/:id guest page, invite) on any static host
```

## Design decisions

- **Server-hosted virtual browsers rejected.** A central browser per session
  needs GPU/CPU + continuous egress per room (not free-tier viable), gets
  low quality or blocks from DRM/datacenter-IP filtering, and re-streaming
  one account to another person breaks most services' terms. Duet does the
  opposite: Sync mode reuses each person's *own* player and subscription.
- **Server-authoritative ordering, peer-authoritative position.** The room
  object stamps every intent with a monotonic `rev` and broadcasts it
  (total order without races). Each client computes the *expected* position
  from `position + (serverNow - refServerTime) × rate` using its own
  clock-sync offset, then corrects its local player. The server never
  streams or interprets video.
- **One Durable Object per room.** Rooms are naturally single-threaded, so
  a DO removes race conditions; WebSocket Hibernation + SQLite keeps idle
  rooms near-zero cost on the Workers Free plan. The Node `ws` server is a
  runtime-agnostic fallback running the same `RoomCore` class.
- **Pure, platform-free core packages.** `protocol`, `room-core`, and
  `sync-engine` import nothing browser- or platform-specific, so they run
  in Node under Vitest with fake clocks — deterministic tests, no flaky
  browser timing.

## Data flow

| Path | Transport | Encrypted | Server sees |
|---|---|---|---|
| Sync intents/state | WebSocket via room service | TLS only (titles are opaque `titleId`s) | `titleId`, position, play state, rate, display name — no media |
| Chat (P2P up) | WebRTC DataChannel | DTLS-SRTP | Nothing |
| Chat (WS fallback) | WebSocket via room service | AES-GCM (key from URL-fragment secret) + TLS | Ciphertext only |
| Share-mode video/audio | WebRTC peer-to-peer (TURN relay only if needed) | DTLS-SRTP | Nothing (TURN relays ciphertext) |
| Voice/video call | Separate `RTCPeerConnection` | DTLS-SRTP | Nothing |

## Sync mode

The extension keeps two players in lockstep. Message flow for a pause:

1. Alice presses pause → content script emits a local `pause` event.
2. The event is tagged with a sequence number; the resulting DOM echo is
   ignored (echo-loop suppression).
3. Background client sends an `intent` (`pause`, with `lastSeenRev`) over
   the room WebSocket.
4. The room object stamps `rev = N+1`, stores the new `PlaybackState`, and
   broadcasts `state` to both peers.
5. Bob's client receives `state rev N+1`, pauses its player, and its
   ~500 ms control loop converges any residual drift per the drift policy.

**Drift correction** (thresholds live in one config object):

| Drift | Action |
|---|---|
| `< ~0.3 s` | Ignore (below perception) |
| `~0.3–2 s` | Nudge rate to ~0.95×/1.05× (opt-in per site) |
| `> ~2 s` | Hard seek |

Rate nudging is **off by default on Netflix, Prime Video, and JioHotstar**
until tested — rate changes can trigger quality/buffering side effects on
those players — and those adapters fall back to small seeks. Users can
disable nudging per site.

**Wait-for-peer buffering:** if either side stalls, both pause automatically
and resume together after ~1.5 s of continuous health, so nobody watches
ahead while the other buffers.

**Same-title check:** each adapter produces a canonical `titleId` comparable
across both users (e.g. `netflix:81234567`). On mismatch the side panel
shows a one-click *Go to what they're watching* built from
`watchUrl(titleId)`.

## Share mode

Fallback when sync is impossible. Host picks a tab via `getDisplayMedia`
(tab + audio); guest opens the room link in the web app — no extension.

1. Host and guest negotiate over the room WebSocket (offer/answer/ICE)
   using the **perfect negotiation** pattern with trickle ICE.
2. ICE servers: public STUN + short-lived TURN credentials from
   `GET /api/ice`, fetched just before connect, never baked into clients.
3. Host sets sender parameters (bitrate cap, framerate, degradation
   preference, `contentHint`), and a health loop reads `getStats()` and
   lowers the cap when packet loss rises.
4. `control` DataChannel carries playback/remote-control events;
   `chat` DataChannel carries chat.

**Defaults (tune later):** 1080p30 @ ~6–8 Mbps (user-adjustable),
`contentHint = "motion"`, degradation preference favors resolution, prefer
AV1/VP9 with H.264 fallback via `setCodecPreferences`, Opus stereo at high
bitrate with echo cancellation and noise suppression **off** for the tab
track. Connection chip shows bitrate/RTT and relay-vs-direct; relayed
connections get a gentle *Relayed · may look softer* notice.

**Black-frame detector:** DRM'd video commonly captures as black frames when
browser hardware acceleration is on. The guest samples received frames; on
black it shows a calm card — *"This service blocks screen sharing… try Sync
mode"* — and never attempts any bypass.

**Voice/video** runs on a *second* `RTCPeerConnection` (or extra
transceivers) so a call restart never touches the movie stream. Mic: echo
cancellation + noise suppression + auto-gain on; a *headphones recommended*
hint appears in Share mode.

## Signaling services

Two thin adapters around the same platform-agnostic `RoomCore`. Full
reference: [`services/README.md`](../services/README.md).

| | `signal-cf` (primary) | `signal-node` (fallback) |
|---|---|---|
| Runtime | Cloudflare Worker + Durable Object | Bare Node `http` + `ws`, no framework |
| State | One SQLite-backed DO per room, Hibernation API | In-memory rooms |
| Idle cost | Near zero (hibernation) | Process stays up; Render free spins down (slow first join) |
| ICE quota | Singleton DO counter (durable) | In-memory (resets on restart) |
| Deploy | `wrangler deploy` | `render.yaml` free web service, or `make up` via Docker |

**Identical routes on both:**

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/health` | Liveness `{ok:true}` |
| `GET` | `/api/room` | Mint 128-bit base32 room id; room materializes on first WS connect |
| `WS` | `/room/:id` | Join (2-conn cap, else HTTP 409 + `room-full`), signal relay |
| `GET` | `/api/ice` | TURN credentials (daily cap, per-IP limit, `SIGNAL_API_KEY` gate) or `{p2pOnly:true}` + STUN |

**Abuse guardrails:** 16 KB transport cap (stricter than the protocol's
64 KB), per-IP HTTP/upgrade rate limits, per-socket WS frame limits, daily
cap on TURN credential issuance. Fatal errors use WS close codes (protocol
has no error type): `4409` room-full, `4429` rate-limited, `4400`
join-first/wrong-room, `1007` bad JSON/schema/version, `1009` over 16 KB.
Unknown message types are ignored (forward compatibility).

## Budgets

**Quality is priority #1:**

- Sync mode never touches the video pipeline: no re-encoding, capture,
  canvas copies, or overlays over `<video>` that could knock the browser off
  its hardware-decoded fast path. Only play/pause/seek/rate calls.
- Never fight ABR: no quality changes, throttling, or prefetching. Each
  player picks its own quality. Keep hardware acceleration **ON** in Sync
  mode and use each service's best-quality settings.
- Chat/presence UI lives in the extension side panel or a small separate
  shadow-DOM overlay — never wrapping or restyling the player element.
- Share mode is the *convenience* path; its quality is bounded by capture +
  encoder + uplink. The UI says so: *Sync mode gives the best quality* when
  both have access.

**Memory is priority #2** (checked in CI and before each release via Chrome
Task Manager / `chrome://memory-internals`):

| Surface | Budget |
|---|---|
| Content script added heap | < 5 MB |
| Background when suspended | 0 MB resident |
| Side panel while open | < 25 MB |
| 3-hour session | No growth (leak test in E2E) |
| Extension package | < 200 KB gzipped |

Enforced by: event-driven suspendable service worker (`chrome.storage.session`
for state), lazy injection + full detach on leave, control loop only while
active-and-playing, one scoped `MutationObserver` disconnected when idle,
on-demand side panel destroyed on close, chat capped at 200 messages (no
images/GIFs in v1), capture tracks + peer connections closed on stop, no
React/Redux/large UI libs.

**Sync targets:** p95 drift < 250 ms after stabilization (hard cap 1 s
before correction), command latency < 300 ms same-region, Share glass-to-glass
< 400 ms on direct P2P, room join < 3 s click-to-connected.
