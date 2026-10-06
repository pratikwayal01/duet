# Operations: testing, configuration, deployment

## Testing

| Layer | Where | How |
|---|---|---|
| Unit (drift, clock, echo) | `packages/sync-engine/tests` | Deterministic fake clock + seeded fuzz (ordering, monotonicity, at-most-once) |
| Protocol/room | `packages/protocol`, `packages/room-core` | 2-cap, reconnect, stale rev, malformed frames, rate limits |
| Adapter | `apps/extension/src/adapters/*` | Fixtures + fake streaming page (controllable `<video>`, SPA nav) |
| E2E (planned) | Playwright, two contexts + extension | Local signaling, network emulation (latency/jitter/loss); drift < 250 ms over 10 min simulated play |
| Share (planned) | Playwright + fake media devices | `--use-fake-device-for-media-stream`, negotiation/reconnect/stats loop; real quality is manual |
| Manual matrix | `docs/compat.md` (per release) | Netflix, YouTube, Prime, Disney+, Max × Chrome/Edge × Win/macOS |
| Security | CI | `npm audit` (high+), Gitleaks, CodeQL weekly, Dependabot weekly |

```sh
npm run test --workspaces --if-present       # unit + adapter tests
npm run typecheck --workspaces --if-present  # strict tsc, no emit
npm run lint --workspaces --if-present       # eslint + prettier
```

**Definition of done (any task):** tests pass, budgets not regressed
(see [architecture](architecture.md#budgets)), no new lint/type errors,
docs updated if behavior changed, no secrets in repo, UI changes
screenshotted at 1280 px and 390 px in both themes.

## Configuration

Copy `.env.example` to `.env` (`cp .env.example .env`). All values have
working dev defaults.

**Signal server env** (`signal-cf` vars / `signal-node` env / compose):

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | signal-node listen port (Render injects its own — do not override there) |
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
| `VITE_SIGNAL_URL` | *(empty = same-origin)* | e.g. `https://signal.example.com`. Empty uses same host (compose nginx proxies `/api` + `/room` to signal) |
| `WEB_PORT` / `SIGNAL_PORT` | `8080` / `8787` | compose host ports |

See [threat-model](threat-model.md) for the operator security checklist.

## Deployment

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

**Render notes:** build `npm ci --include=dev && npm run build --workspace
@duet/signal-node && ls services/signal-node/dist`, start
`npm start --workspace @duet/signal-node`, health `/api/health`,
`NODE_VERSION=20`. Free instances sleep — first join after idle takes
~30–60 s.
