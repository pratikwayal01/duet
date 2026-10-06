# Core packages

Pure TypeScript, zero browser/platform globals — all runnable in Node under
Vitest with fake clocks.

## Protocol (`packages/protocol`)

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

## Room state (`packages/room-core`)

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

## Sync engine (`packages/sync-engine`)

Zero-dependency pure functions (fake-clock tested, incl. seeded fuzz tests
for clock and ordering invariants):

- **`clockSync.ts`** — NTP-style ping exchange over the WebSocket (on
  connect + ~every 30 s). Offset = `server − (t0+t1)/2`; keeps the
  lowest-RTT sample of the last 8.
- **`drift.ts`** — the <0.3 s / 0.3–2 s / >2 s policy (see
  [architecture](architecture.md#sync-mode)), with the per-site `rateNudge`
  flag.
- **`echo.ts`** — `EchoGuard`: every programmatic action gets a sequence
  number consumed exactly once, so DOM echoes of our own actions are
  ignored.
- **`waitForPeer.ts`** — stall on either side pauses both; resume after
  1.5 s of continuous health.
- **`position.ts`** — `expectedPosition(state, serverNow) =
  position + (serverNow − refServerTime) × rate`.
