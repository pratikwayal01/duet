# Duet — watch together, just the two of you

Free, open-source watch-together tool for **2 people**. No accounts, no media
servers, no telemetry. Playback never touches our servers.

- **Sync mode (default, best quality).** A Chromium extension keeps each
  person's *own* player in lockstep — play, pause, seek, rate, title.
  Each of you needs access to the title on your own account. Players keep
  their native quality and adaptive bitrate; Duet only sends tiny state
  messages. This is the recommended path.
- **Share mode (fallback).** One person shares a browser tab peer-to-peer
  over WebRTC; the guest watches in a plain web page, no install. For
  content where sync is impossible (no second account, unsupported site,
  local files, free/ad-supported streams).

> Honest framing: in Sync mode each of you needs access to the title on your
> own account. In Share mode one person shares their screen. Some services
> block screen capture of their video, so that content may appear black.
> That is the service's DRM working as intended and Duet won't try to get
> around it. Duet never asks for, stores, or transmits streaming-service
> credentials or cookies, and never attempts DRM circumvention.

---

## Table of contents

1. [Quickstart](#1-quickstart)
2. [Architecture overview](#2-architecture-overview)
3. [Sync mode in detail](#3-sync-mode-in-detail)
4. [Share mode in detail](#4-share-mode-in-detail)
5. [Signaling services](#5-signaling-services)
6. [Protocol (`packages/protocol`)](#6-protocol-packagesprotocol)
7. [Room state (`packages/room-core`)](#7-room-state-packagesroom-core)
8. [Sync engine (`packages/sync-engine`)](#8-sync-engine-packagessync-engine)
9. [Site adapters (`apps/extension/src/adapters`)](#9-site-adapters-appsextensionsrcadapters)
10. [Extension internals (`apps/extension`)](#10-extension-internals-appsextension)
11. [Web app (`apps/web`) and UI kit (`packages/ui-kit`)](#11-web-app-appsweb-and-ui-kit-packagesui-kit)
12. [Security and privacy](#12-security-and-privacy)
13. [Quality and memory budgets](#13-quality-and-memory-budgets)
14. [Repository map](#14-repository-map)
15. [Testing](#15-testing)
16. [Configuration reference](#16-configuration-reference)
17. [Deployment](#17-deployment)
18. [Limitations and non-goals](#18-limitations-and-non-goals)
19. [Roadmap](#19-roadmap)
20. [Contributing](#20-contributing)
21. [License](#21-license)

---

## 1. Quickstart

**Prerequisites:** Node 20+, npm 10+ (canonical lockfile is
`package-lock.json`; a `pnpm-workspace.yaml` is also present for pnpm
users), Docker + Compose for the container path.

**Fastest path — full stack in containers:**

```sh
make up
# web  → http://localhost:8080 (nginx, proxies /api + /room to signal)
# signal → http://localhost:8787 (/api/health, /api/room, WS /room/:id)
make logs   # follow logs
make down   # stop
```

**Local dev (no Docker):**

```sh
npm install
npm run build --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run test --workspaces --if-present
```

Per-piece dev servers (each in its own shell):

| Piece | Command | Notes |
|---|---|---|
| Web app | `npm run dev --workspace @duet/web` | Vite on `:5173` |
| Signal (Node) | `npm run dev --workspace @duet/signal-node` | Builds with esbuild, serves on `:8787` |
| Signal (Cloudflare) | `npm run dev --workspace @duet/signal-cf` | `wrangler dev`, needs `wrangler login` for deploy |
| Extension | Load `apps/extension` unpacked via `wxt` dev / build output | Chromium only (Chrome, Edge, Brave) |

**Try a room:** open the web app → *Start a room* → copy the invite link
(`https://<app>/r/<roomId>#<secret>`) → open it in a second browser
profile. With no TURN configured you get P2P-only mode: fine on the same
machine/LAN, may fail across strict NATs (see §4).

---

## 2. Architecture overview

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

**Design decisions (why it looks like this):**

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

**Data flow summary:**

| Path | Transport | Encrypted | Server sees |
|---|---|---|---|
| Sync intents/state | WebSocket via room service | TLS only (titles are opaque `titleId`s) | `titleId`, position, play state, rate, display name — no media |
| Chat (P2P up) | WebRTC DataChannel | DTLS-SRTP | Nothing |
| Chat (WS fallback) | WebSocket via room service | AES-GCM (key from URL-fragment secret) + TLS | Ciphertext only |
| Share-mode video/audio | WebRTC peer-to-peer (TURN relay only if needed) | DTLS-SRTP | Nothing (TURN relays ciphertext) |
| Voice/video call | Separate `RTCPeerConnection` | DTLS-SRTP | Nothing |

---

## 3. Sync mode in detail

The extension keeps two players in lockstep. Message flow for a pause:

1. Alice presses pause → content script emits a local `pause` event.
2. The event is tagged with a sequence number; the resulting DOM echo is
   ignored (echo-loop suppression, §8).
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
and resume together after a short grace period (~1.5 s of continuous health),
so nobody watches ahead while the other buffers.

**Same-title check:** each adapter produces a canonical `titleId` comparable
across both users (e.g. `netflix:81234567`). On mismatch the side panel
shows a one-click *Go to what they're watching* built from
`watchUrl(titleId)`.

---

## 4. Share mode in detail

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

---

## 5. Signaling services

Two thin adapters around the same platform-agnostic `RoomCore`. Full
reference: [`services/README.md`](services/README.md).

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
| `GET` | `/api/ice` | TURN credentials (daily cap, per-IP limit) or `{p2pOnly:true}` + STUN |

**Abuse guardrails:** 16 KB transport cap (stricter than the protocol's
64 KB), per-IP HTTP/upgrade rate limits, per-socket WS frame limits, daily
cap on TURN credential issuance. Fatal errors use WS close codes (protocol
has no error type): `4409` room-full, `4429` rate-limited, `4400`
join-first/wrong-room, `1007` bad JSON/schema/version, `1009` over 16 KB.
Unknown message types are ignored (forward compatibility).

---

## 6. Protocol (`packages/protocol`)

Zod schemas + TypeScript types + generated JSON Schema. `PROTOCOL_VERSION = 1`;
every message is an envelope `{v, t, id}` plus a typed payload.

**Message types (12):** `hello`, `join`, `leave`, `intent`, `state`, `chat`,
`ping`, `pong`, `ice-offer`, `ice-answer`, `ice-candidate`, `control`.

**Intents** (client → room): `play | pause | seek | rate | navigate`, each
carrying `lastSeenRev`. The room stamps the new `rev` and broadcasts the
resulting `PlaybackState`:

```ts
type PlaybackState = {
  rev: number;            // monotonically increasing, server-assigned
  titleId: string;        // adapter-normalized, e.g. "netflix:81234567"
  playing: boolean;
  position: number;       // seconds at refServerTime
  refServerTime: number;  // ms, server clock
  rate: number;           // 1.0 normally
  controllerId: string;   // who produced this rev
};
```

**Parsing** (`parseMessage`): `ok | bad-version | unknown-type | invalid-payload | too-large`.
Unknown types are ignored, not errors — old clients survive new message
types. Regenerate docs with `npm run schema --workspace @duet/protocol`
(writes `schema/protocol.json`).

---

## 7. Room state (`packages/room-core`)

Zero-dependency, multi-room `RoomCore` with an injectable clock (fully
deterministic tests). Rules:

- **2-participant cap.** A third join is rejected with `room-full` and gets
  the friendly *"This room already has two people"* page.
- **Roles:** first active member holds the `host` seat; the other is
  `guest`. Both control playback by default; host can set the controller
  lock to `host` (*Only I control*) at any time.
- **Ordering:** intents carry `lastSeenRev`; the server applies pure
  last-writer-wins inside a ~150 ms intent window so a simultaneous
  pause-and-seek doesn't flip-flop. Stale revs are accepted, never rejected.
- **Rate limits:** 20 messages/second per client (sliding window).
- **Ephemeral:** rooms self-destruct after 12 h idle; rejoin within 10 min
  restores role and state. No user database, no content titles stored.

---

## 8. Sync engine (`packages/sync-engine`)

Zero-dependency pure functions (fake-clock tested, incl. seeded fuzz tests
for clock and ordering invariants):

- **`clockSync.ts`** — NTP-style ping exchange over the WebSocket (on
  connect + ~every 30 s). Offset = `server − (t0+t1)/2`; keeps the
  lowest-RTT sample of the last 8.
- **`drift.ts`** — the <0.3 s / 0.3–2 s / >2 s policy above, with the
  per-site `rateNudge` flag.
- **`echo.ts`** — `EchoGuard`: every programmatic action gets a sequence
  number consumed exactly once, so DOM echoes of our own actions are
  ignored.
- **`waitForPeer.ts`** — stall on either side pauses both; resume after
  1.5 s of continuous health.
- **`position.ts`** — `expectedPosition(state, serverNow) =
  position + (serverNow − refServerTime) × rate`.

---

## 9. Site adapters (`apps/extension/src/adapters`)

Self-contained folder per service implementing:

```ts
interface PlayerAdapter {
  id: string;
  matches(url: URL): boolean;
  titleId(url: URL): string | null;   // canonical, comparable across users
  watchUrl(titleId: string): string;  // "go to what they're watching"
  attach(ctx: AdapterContext): Promise<PlayerHandle>; // survives SPA nav
}
```

**Adapter order** (owner's daily services first): Netflix → Prime Video →
JioHotstar → generic HTML5 `<video>` → YouTube. Then Disney+, Max, Hulu,
Crunchyroll, Peacock, Paramount+, Apple TV+, SonyLIV, Zee5 (P1).

- **Generic** is fully implemented: wraps the page `<video>`, finds it via
  `MutationObserver` (including shadow DOM + same-origin iframes), survives
  SPA navigation via history hooks, degrades to a *manual sync* banner
  (*Can't control this player — use Resync*) when control fails.
- **Netflix / Prime / JioHotstar / YouTube** ship `matches`/`titleId`/
  `watchUrl` today and delegate `attach` to the generic implementation.
  Some services ignore direct `video.currentTime` writes (Netflix is a
  known case) — those need a **page-world injected script** calling the
  site's own player API via a `window.postMessage` bridge with a per-session
  nonce. That bridge is stubbed (`content/page-bridge.ts`) and must be
  **verified per live site** before relying on it; until then these adapters
  stay seek-degraded. JioHotstar domains also need live-site confirmation
  (see the `TODO [verify domains]` in its adapter).
- Each adapter ships **recorded HTML fixtures + a fake-player test page** —
  live services can't run in CI. YouTube/Prime ad playback must be detected
  so ad positions are never pushed to the peer (P1).

---

## 10. Extension internals (`apps/extension`)

WXT + TypeScript + MV3, Chromium only (Share-mode tab audio capture and the
adapter surface need it; Firefox/Safari work is explicitly out of scope).

| Area | File | Notes |
|---|---|---|
| Adapter attach | `src/content/attach.ts` | Lazy: injects only on supported hosts **after a room is active**; detaches + frees everything on leave |
| Control loop | `src/content/control-loop.ts` | ~500 ms, only while room active **and** video playing; paused when tab hidden (`visibilitychange`); drift policy + seq-tag echo guard |
| Page bridge | `src/content/page-bridge.ts` | Nonce `postMessage` bridge for page-world player APIs |
| Room client | `src/background/room-client.ts` | WS signaling, lowest-RTT clock sync, state in `chrome.storage.session` |
| Service worker | `src/background/service-worker.ts` | Event-driven, suspendable; no persistent offscreen document, no long-lived timers |
| Side panel | `src/ui/sidepanel.*` | Status chips (Synced / Catching up… / Waiting / Reconnecting / No player), presence, title + same-title warning, control toggle (Both / Just me), chat |
| Popup | `src/ui/popup.*` | Pre-join: *Start a room*, *Join with link*, status line |
| Tokens | `src/ui/styles/tokens.css` | Moodboard tokens verbatim (see §11) |

**Permissions:** minimum viable — `activeTab` + explicit `host_permissions`
per supported service. The generic adapter is **opt-in per site** via
`optional_host_permissions`; no `<all_urls>` by default.

---

## 11. Web app (`apps/web`) and UI kit (`packages/ui-kit`)

**Web** is a static Vite app (no SSR): landing (`/`), invite (`/r/:id` ticket
view), and the Share-mode guest room page (`/r/:id` viewer). Guest needs no
extension. Router is a tiny path router in `src/main.ts`; room links look
like `https://<app>/r/<roomId>#<secret>` and the secret never leaves the URL
fragment — only the room id goes over the wire (`src/lib/room.ts`).

**UI kit** implements the moodboard (`tokens.css` is the source of truth —
components use `var()` only, never raw hex): theatre-warm dark default +
*daytime blanket* light theme, projector-amber accent, amber/teal identity
colors for the two people, Fraunces display + Inter body + JetBrains Mono
timecodes/codes (self-hosted via Fontsource, no third-party font requests).
Components: Button (4 variants), Chip, Avatar, PresencePill, TicketCard,
ChatDock/Bubble, Toast, Switch, Segmented, Dialog, ControlBanner,
StatsPanel, EmptyState, ThemeToggle — all keyboard-operable with visible
focus rings, `aria-label`s, 44 px touch targets, and
`prefers-reduced-motion` support. Microcopy follows the warm/short tone
(*Waiting for your person…*, *Maya's here.*, *Catching up with Maya…*).

---

## 12. Security and privacy

- All peer messages are untrusted input: Zod-validated, size-capped
  (16 KB transport), rate-limited.
- Room id is 128-bit random (base32). The `#secret` stays client-side and
  derives an HKDF-SHA256 → AES-GCM-256 key for chat/nicknames/titles on the
  WebSocket path — the Worker **cannot read them**.
- No service credentials, cookies, or page contents ever leave the browser.
  Sync messages carry only `titleId`, position, state, rate, display name.
- Remote pointer/keyboard control (P1) is off by default, granted per
  session via a prominent control bar, scoped strictly to the shared tab,
  with an always-works kill switch (`Ctrl+Shift+.` + button) and a
  *Bob is controlling* badge. `chrome.debugger` trusted-input mode is P2
  and opt-in only.
- Strict CSP, no remote code, no `eval`. Pinned lockfile, `npm audit` in CI.
- Privacy page + a *what data leaves my browser* table (in `docs/`, to be
  published with the site).

---

## 13. Quality and memory budgets

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
images/GIFs in v1), capture tracks + peer connections closed on stop, Svelte
or Preact only (no React/Redux/large UI libs).

**Sync targets:** p95 drift < 250 ms after stabilization (hard cap 1 s
before correction), command latency < 300 ms same-region, Share glass-to-glass
< 400 ms on direct P2P, room join < 3 s click-to-connected.

---

## 14. Repository map

```
duet/
├─ apps/
│  ├─ extension/            # WXT MV3 extension (adapters, background, content, UI)
│  │  ├─ entrypoints/       # WXT content/background entry shims
│  │  └─ src/
│  │     ├─ adapters/<service>/  # adapter.ts (+ fixtures/, *.test.ts)
│  │     ├─ background/     # room client, clock sync, service worker
│  │     ├─ content/        # attach, 500 ms control loop, page-world bridge
│  │     └─ ui/             # side panel, popup, tokens.css
│  └─ web/                  # Vite static app: landing, /r/:id, invite; nginx.conf; Dockerfile
├─ packages/
│  ├─ protocol/             # Zod schemas, parse, JSON-schema gen, tests
│  ├─ room-core/            # RoomCore: 2-cap, roles, rev ordering, rate limits, tests
│  ├─ sync-engine/          # clock sync, drift policy, echo guard, wait-for-peer, tests
│  └─ ui-kit/               # tokens.css + shared Preact components
├─ services/
│  ├─ signal-cf/            # Worker + DO (wrangler.toml, src/index.ts, src/room-do.ts)
│  └─ signal-node/          # Node ws fallback (src/index.ts, src/room.ts, render.yaml, Dockerfile)
├─ docs/decisions/          # ADRs (incl. every [verify] outcome)
├─ .github/workflows/ci.yml # lint → typecheck → test
├─ docker-compose.yml       # signal (:8787) + web (:8080) stack
├─ Makefile                 # install/build/test/typecheck/docker-build/up/down/logs/clean
├─ vitest.workspace.ts      # packages/* + apps/* + services/*
└─ LICENSE (MIT)
```

`packages/rtc` (perfect negotiation, quality tuning, stats, black-frame
detector) is planned and not yet scaffolded — Share-mode WebRTC helpers
currently live as stubs near their call sites.

---

## 15. Testing

| Layer | Where | How |
|---|---|---|
| Unit (drift, clock, echo) | `packages/sync-engine/tests` | Deterministic fake clock + seeded fuzz (ordering, monotonicity, at-most-once) |
| Protocol/room | `packages/protocol`, `packages/room-core` | 2-cap, reconnect, stale rev, malformed frames, rate limits |
| Adapter | `apps/extension/src/adapters/*` | Fixtures + fake streaming page (controllable `<video>`, SPA nav) |
| E2E (planned) | Playwright, two contexts + extension | Local signaling, network emulation (latency/jitter/loss); drift < 250 ms over 10 min simulated play |
| Share (planned) | Playwright + fake media devices | `--use-fake-device-for-media-stream`, negotiation/reconnect/stats loop; real quality is manual |
| Manual matrix | `docs/compat.md` (per release) | Netflix, YouTube, Prime, Disney+, Max × Chrome/Edge × Win/macOS |

```sh
npm run test --workspaces --if-present       # unit + adapter tests
npm run typecheck --workspaces --if-present  # strict tsc, no emit
npm run lint --workspaces --if-present       # eslint + prettier
```

**Definition of done (any task):** tests pass, §13 budgets not regressed,
§13 quality rules respected, no new lint/type errors, docs updated if
behavior changed, no secrets in repo, UI changes screenshotted at 1280 px
and 390 px in both themes.

---

## 16. Configuration reference

**Signal server env** (`signal-cf` vars / `signal-node` env / compose):

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | signal-node listen port |
| `ALLOWED_ORIGINS` | *(empty = `*`)* | CORS allowlist, e.g. `https://your-app.vercel.app`. Set in prod |
| `TURN_URLS` | *(empty)* | e.g. `turn:openrelay.example:3478`. Empty = P2P-only mode |
| `TURN_SECRET` | *(empty)* | Time-limited REST credential secret (prefer secret store) |
| `TURN_USERNAME` / `TURN_PASSWORD` | *(empty)* | Static TURN auth alternative |
| `TURN_TTL_SECONDS` | `86400` | Credential lifetime |
| `ICE_DAILY_CAP` | `200` | Max TURN credentials minted per day (hard cap) |
| `SIGNAL_API_KEY` | *(empty = open)* | Gates `/api/ice`; keyless callers get P2P-only. Generate: `openssl rand -hex 32`. Secret — never commit |

**Web build args:**

| Var | Default | Meaning |
|---|---|---|
| `VITE_SIGNAL_URL` | *(empty = same-origin)* | e.g. `wss://signal.example.com`. Empty uses same host (compose nginx proxies `/api` + `/room` to signal) |
| `WEB_PORT` / `SIGNAL_PORT` | `8080` / `8787` | compose host ports |

---

## 17. Deployment

All paths are card-free (no payment method anywhere — build *and* hosting):

| Piece | Primary | Fallback |
|---|---|---|
| Web (static) | Cloudflare Pages / Vercel Hobby (`*.pages.dev` / `*.vercel.app`) | `make up` (nginx) or any static host |
| Signaling | `signal-cf` (`wrangler deploy`) — DO hibernation, near-zero idle | `signal-node` on Render free (`render.yaml`) or `docker-compose` |
| TURN | Open Relay free tier (~20 GB/mo ≈ 5–6 relayed hours; verify no-card signup) + BYO TURN field | P2P-only mode (clean failure + advice) |
| Extension | GitHub Releases (zip/unpacked sideload) | Edge Add-ons (believed free registration — verify); Chrome Web Store only if the one-time fee is later accepted |

**Relay math:** 1080p share ≈ 3–4 GB/hour *only when relayed* (~8% of pairs
per one estimate — verify). Guarded by the daily credential cap + per-IP
limits; relayed sessions show the *Relayed* chip.

**Self-host (Docker):** `make up` runs signal + web with same-origin
signaling through nginx. Set `ALLOWED_ORIGINS`, `TURN_URLS`/`TURN_SECRET`
in the environment for anything beyond LAN use.

---

## 18. Limitations and non-goals

1. **No DRM circumvention** — no Widevine/PlayReady bypass, no decrypting,
   recording, or downloading protected streams. Black frames stay black.
2. **No server-side re-streaming** of third-party content. Media is P2P or
   per-account playback only.
3. **No credential sharing features.** Never handles streaming logins.
4. No accounts, no user DB, no analytics beyond optional anonymous crash
   counts (off by default).
5. **2 people max in v1** — the cap is a feature (simpler protocol, UI, cost).
6. Chromium desktop only (D2). No Firefox/Safari work, no phone/TV *sync*
   (Share viewer works on mobile browsers).
7. Top service quality tiers may need a specific browser/OS — up to the
   service, outside Duet's control.

---

## 19. Roadmap

| Milestone | Goal | Exit criteria |
|---|---|---|
| M0 | Spike: sync on fake page + YouTube via throwaway DO | < 500 ms drift for 10 min, two browsers |
| M1 | Sync MVP: rooms, 2-cap, drift loop, Netflix + Prime + JioHotstar + generic + YouTube adapters | S1/S3 end-to-end on the three daily services, budgets met |
| M2 | Chat, reactions, presence, reconnect, wait-for-buffer | Kill/restore network without desync |
| M3 | Share mode: capture, quality tuning, stats, black-frame hint, TURN creds | S2 at 1080p30 on home connection |
| M4 | Voice/video, ducking, chat timestamps | Call survives movie-stream restart |
| M5 | Shared control, pointer/keyboard remote with consent + kill switch | Security review passes |
| M6 | More adapters, i18n, store listings, docs, first public release | `docs/compat.md` complete, privacy page live |

Current state: M0–M1 foundations (pure packages tested, adapters
skeleton-complete, signaling smoke-tested). `packages/rtc`, E2E suite, and
per-site page-world bridge verification are the next gaps.

---

## 20. Contributing

- Read the PRD (`.opencode/duet-prd.md`) and moodboard
  (`.opencode/moodboard.md`) — tokens there are the UI source of truth.
- Work in milestone order, one PR-sized task at a time. Logic tasks start
  with a failing test; then implement; then
  `npm run lint`, `npm run typecheck`, `npm run test`.
- Keep `sync-engine`, `room-core`, `protocol` free of browser/platform
  globals (Node-testable).
- Confirm every `[verify]` claim against current official docs and record
  the outcome as a short ADR in `docs/decisions/`.
- Small dependencies only; justify each new one in the PR description.
- Conventional commits; CI runs lint → typecheck → test.

---

## 21. License

MIT — see [LICENSE](LICENSE). Free to build, free to host, free to fork.
