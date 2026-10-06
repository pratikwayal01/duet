# Clients: extension, adapters, web, UI kit

## Site adapters (`apps/extension/src/adapters`)

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

Domain matching uses `matchesDomain()` (exact or real subdomain boundary —
`evilnetflix.com` does not match). Content script runs on all `http(s)`
sites; known services get their adapter, everything else falls back to the
generic `<video>` adapter.

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

## Extension (`apps/extension`)

WXT + TypeScript + MV3, Chromium only.

| Area | File | Notes |
|---|---|---|
| Adapter attach | `src/content/attach.ts` | Lazy: content script matches all sites but attaches **after a room is active**; detaches + frees everything on leave |
| Control loop | `src/content/control-loop.ts` | ~500 ms, only while room active **and** video playing; paused when tab hidden (`visibilitychange`); drift policy + seq-tag echo guard |
| Page bridge | `src/content/page-bridge.ts` | Nonce `postMessage` bridge for page-world player APIs |
| Room client | `src/background/room-client.ts` | WS signaling, lowest-RTT clock sync, state in `chrome.storage.session` |
| Service worker | `src/background/service-worker.ts` | Event-driven, suspendable; no persistent offscreen document, no long-lived timers |
| Toolbar | `src/background/toolbar.ts` | `chrome.action.setIcon` states: idle/waiting/active/alert |
| Side panel | `src/ui/sidepanel.*` | Status chips (Synced / Catching up… / Waiting / Reconnecting / No player), presence, title + same-title warning, control toggle (Both / Just me), chat |
| Popup | `src/ui/popup.*` | Four states (Home / Watching / In-room / Connection lost); see PRD §17. Server URL + API key in Settings (options page, autosaves) |
| Tokens | `src/ui/styles/tokens.css` | Moodboard tokens verbatim |
| Icons | `src/ui/icons/` | Vendored pack: sprite + `icons.ts` helper, brand marks (see `docs/design/icons.md`) |

**Permissions:** `activeTab` + streaming-site `host_permissions` + default
signal-server origin (user-changeable in Settings via `optional_host_permissions`).
No `<all_urls>` in permissions; broad content-script matching injects lazily
and detaches on leave.

Load unpacked from `apps/extension/.output/chrome-mv3` after
`npm run build --workspace @duet/extension`.

## Web app (`apps/web`) and UI kit (`packages/ui-kit`)

**Web** is a static Vite app (no SSR): landing (`/`), invite (`/r/:id` ticket
view), and the Share-mode guest room page (`/r/:id` viewer). Guest needs no
extension. Router is a tiny path router in `src/main.ts`; room links look
like `https://<app>/r/<roomId>#<secret>` and the secret never leaves the URL
fragment — only the room id goes over the wire (`src/lib/room.ts`).
Served with `nginx.conf` (SPA fallback + same-origin `/api` + `/room` proxy).

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
