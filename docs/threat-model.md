# Duet threat model (v1, 2026-10-06)

Scope: signaling services (`signal-node` live on Render, `signal-cf`
primary), web static app, extension Sync mode. Share-mode WebRTC and
voice/video land in M3/M4 and get their own review pass then.

## Trust boundaries

```
untrusted internet ──► signal HTTP/WS ──► RoomCore (validated frames only)
                     ──► static web (no secrets baked, except opt-in key)
browser extension ◄──► streaming sites (their DOM/APIs, fully untrusted)
```

1. **Peer messages are attacker-controlled.** Every inbound WS frame is
   `parseMessage()`-validated, 16 KB-capped, per-socket rate-limited
   (100/10 s) + per-client intent limits (20/s in RoomCore). Malformed =
   close code, never a crash. Unknown types ignored (forward compat).
2. **Room URLs are capability URLs.** 128-bit room id + 128-bit fragment
   secret, both base32. The id alone grants WS join — by design, like a
   meeting link. Guessing is infeasible (2^128); enumeration is
   rate-limited at upgrade time. No auth on join is intentional: public
   rooms ARE the product.
3. **Chat secrecy vs. server.** DataChannel chat (primary) never touches
   the server (DTLS-SRTP). WS-fallback chat is AES-GCM with an
   HKDF-derived key from the fragment secret — the server sees ciphertext
   only. Server compromise leaks presence + `titleId`s + positions, never
   chat plaintext or streaming credentials (which never leave the browser
   at all).
4. **TURN credentials are money.** `/api/ice` mints bandwidth-spendable
   creds, so it is the ONLY endpoint gated by `SIGNAL_API_KEY` when set.
   Without a key in the request the server returns the P2P-only body
   (200, STUN + advice) and consumes NO daily quota. `/api/room` stays
   public (minting an id costs nothing; rooms are lazy + 12 h-ephemeral).
5. **Web client holds no secrets.** Anything baked into the static bundle
   (`VITE_SIGNAL_URL`, opt-in `VITE_SIGNAL_KEY`) is public. Therefore the
   API key only raises the bar against casual scraping, not against a
   determined client impersonator — the daily cap + per-IP limits are the
   real backstop. Documented, not hidden.

## Abuse cases & mitigations

| Abuse | Cost to us | Mitigation (status) |
|---|---|---|
| Room-id spam (`/api/room` flood) | ~zero (lazy, ephemeral, 12 h purge) | 60 req/min/IP ✅ |
| WS join scan / room squat | Holds 1 of 2 seats; seats expire (10 min rejoin, 12 h idle) | 2-cap + upgrade rate limit ✅ |
| Frame flood (state churn) | CPU/broadcast fan-out (2 peers max) | 100 frames/10 s/socket + 20 intents/s/client ✅ |
| Oversize frames (memory) | Alloc pressure | 16 KB cap (transport) + 64 KB (protocol) ✅ |
| TURN cred harvesting | Real bandwidth bill | `SIGNAL_API_KEY` gate + daily cap + IP limit ✅ (this pass) |
| CORS misuse from evil site | Browser-side WS to our signal | `ALLOWED_ORIGINS` allowlist (prod must set; empty = `*` dev) ✅ code, ⚠️ operator must set on Render |
| Token/secret in logs | Key leak via log aggregation | Never log `Authorization`, `?key=`, TURN_SECRET ✅ (code never logs headers) |
| Dependency vuln | RCE via ws/esbuild/etc. | `npm audit` (high+) in CI + Dependabot weekly + CodeQL ✅ (this pass) |
| Secret committed | Credential leak | Gitleaks in CI + `.env` ignored + `.env.example` placeholders ✅ (this pass) |
| Extension over-permission | Cookie/DOM theft narrative | `activeTab` + per-site hosts, generic adapter opt-in, no `<all_urls>` ✅ design |
| Malicious peer input to DOM | XSS via chat/name | Chat renders as text only (no HTML), names length-capped at join — ⚠️ enforce in M2 chat UI |

## Deliberately NOT defended (documented)

- Determined TURN-key extraction from the public web bundle (impossible
  while the client must call `/api/ice` directly; caps bound the loss).
- Traffic-analysis / timing (positions + presence visible to server by
  design; chat content still encrypted).
- Malicious browser extensions on the user's own machine (out of scope).
- DRM'd content capture (services block it; we show a hint, never bypass).

## Operator checklist (Render, live)

- [ ] `ALLOWED_ORIGINS=https://<web-app-url>` (currently `*` — open)
- [ ] `SIGNAL_API_KEY=<32+ random bytes>` ( mint: `openssl rand -hex 32`)
- [ ] `ICE_DAILY_CAP=200`, alerts if `/api/ice` 429s spike
- [ ] `TURN_*` empty until a relay is actually needed (P2P-only = $0 risk)
- [ ] Rotate `SIGNAL_API_KEY` + `TURN_SECRET` if ever pasted anywhere
