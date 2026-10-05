# Duet signaling services

Two thin adapters around the platform-agnostic `RoomCore` (`packages/room-core`).
All inbound frames are validated with `parseMessage` (`packages/protocol`),
capped at 16KB transport (stricter than the protocol's 64KB), and rate-limited
per IP (HTTP + upgrade) / per socket (WS frames). Servers only ever emit
`state` and `pong` frames (plus verbatim relay of validated client frames);
fatals use WS close codes since the protocol has no error type:

| Code | Meaning                                  |
| ---- | ---------------------------------------- |
| 4409 | room-full (HTTP upgrade also gets 409)   |
| 4429 | rate-limited                             |
| 4400 | join-first / wrong-room / other protocol |
| 1007 | bad JSON / schema / version              |
| 1009 | over 16KB                                |

Unknown message types are ignored for forward compatibility. NOTE: role/presence
has no protocol type yet — clients assume both-can-control until one ships.

## Routes (identical on both)

| Method | Path      | Behavior                                                                 |
| ------ | --------- | ------------------------------------------------------------------------ |
| GET    | /api/room | Mint a 128-bit base32 room id (26 chars). Room materializes on first WS. |
| WS     | /room/:id | Join (2-conn cap, else 409 + `room-full`), signal relay via `RoomCore`.  |
| GET    | /api/ice  | TURN credentials (daily cap, per-IP limit) or P2P-only fallback.         |
| GET    | /api/health | Liveness (`{ok:true}`; also Render health check).                      |

## signal-cf (primary)

Cloudflare Worker + Durable Object (`wrangler.toml`: `duet-signal`,
`compatibility_date 2026-01-01`, `ROOM` binding). One SQLite-backed DO per
room, WebSocket Hibernation API for near-zero idle cost, 12h self-destruct via
alarm. `/api/ice` quota is a global daily counter in a singleton DO
(`__ice__`, same `ROOM` binding); TURN creds come from `TURN_*` env
(time-limited REST via `TURN_SECRET`, else static, else Open Relay/BYO URL),
defaulting to P2P-only when unconfigured.

Local dev: `npm install && npm run dev` (`wrangler dev`).

## signal-node (fallback)

Bare `http` + `ws` (no framework), in-memory rooms, same `RoomCore` wrapper.
Deploy: `render.yaml` (free web service, Node 20). Render free instances spin
down when idle and take a while to wake **[verify]**, so the first join after
idleness is slow — this is the documented fallback, not the default. Its ICE
counter also resets on restart; the CF adapter is the durable one.

Build note: the workspace packages export TS source, so plain `tsc` output
cannot run on Node — `npm run build` bundles with esbuild (`ws` stays
external). `npm run typecheck` (`tsc --noEmit`) still checks the real sources.

## Why this split (PRD §7.1)

- **Vercel**: static front-end only. Serverless functions are request/response
  and cannot hold persistent WebSocket connections **[verify]**.
- **Cloudflare DO**: primary signaling (hibernation + SQLite on free plan).
- **Render Node**: for people who do not want Cloudflare, with the cold-start
  caveat above.
- **P2P-only mode**: when no TURN is configured (card-free default), `/api/ice`
  returns `{p2pOnly:true}` plus STUN. Media stays peer-to-peer; if NAT blocks
  a direct path the client fails cleanly with advice (try Sync mode, change
  network). Bring-your-own TURN via `TURN_URLS` + `TURN_SECRET`.
