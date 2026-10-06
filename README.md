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

**Docs:** [architecture](docs/architecture.md) (how it works, budgets) ·
[packages](docs/packages.md) (protocol, room-core, sync-engine) ·
[clients](docs/clients.md) (extension, adapters, web, UI kit) ·
[operations](docs/operations.md) (testing, config, deployment) ·
[threat model](docs/threat-model.md) · [services](services/README.md)

## Quickstart

Prerequisites: Node 20+, npm 10+, Docker + Compose for the container path.

```sh
make up
# web  → http://localhost:8080 (nginx, proxies /api + /room to signal)
# signal → http://localhost:8787 (/api/health, /api/room, WS /room/:id)
```

Local dev: `npm install`, then `npm run build|typecheck|test --workspaces
--if-present`. Per-piece servers: `npm run dev --workspace @duet/web`
(`:5173`), `--workspace @duet/signal-node` (`:8787`), `--workspace
@duet/signal-cf` (`wrangler dev`). Extension: build
`@duet/extension`, load `apps/extension/.output/chrome-mv3` unpacked
(Chromium only). Copy `.env.example` to `.env` for local config.

**Try a room:** web app → *Start a room* → open the invite link
(`https://<app>/r/<roomId>#<secret>`) in a second browser profile. No TURN
configured means P2P-only: fine on LAN, may fail across strict NATs.

## Repo map

```
apps/extension/   # WXT MV3 extension (adapters, background, content, UI)
apps/web/         # Vite static app (landing, /r/:id, invite) + nginx + Dockerfile
packages/         # protocol, room-core, sync-engine (pure, tested), ui-kit
services/         # signal-cf (Worker+DO, primary), signal-node (Node ws, fallback)
docs/             # architecture, packages, clients, operations, threat-model, design
```

## Status

M0–M1 foundations done (pure packages tested, adapters working, signaling
live). Next gaps: `packages/rtc`, Playwright E2E, per-site page-world bridge
verification. Full milestone table in the PRD (`.opencode/duet-prd.md`).

## Non-goals

No DRM circumvention, no server-side re-streaming, no credential handling,
no accounts/analytics, 2 people max in v1, Chromium desktop only.

## Contributing

PR-sized tasks in milestone order; logic first with a failing test; then
`lint`, `typecheck`, `test`. Keep `protocol`/`room-core`/`sync-engine`
platform-free. Conventional commits. No secrets in the repo.

## License

MIT — see [LICENSE](LICENSE). Free to build, free to host, free to fork.
