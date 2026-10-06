// Popup launcher/remote: 360px wide, no scrolling. Chat/voice/video live in the
// side panel, not here. State is owned by the background worker
// (chrome.storage.session + `duet:join` / `duet:leave`); this file only reads it,
// builds UI on open, and dies on close. Closing the popup never ends a room.

import { initTheme } from './theme.ts';
import { iconSvg } from './icons/icons.ts';
import {
  getApiKey,
  getBase,
  inviteUrl,
  makeSecret,
  mintRoom,
  parseInvite,
  setBase,
  signalUrl,
} from './room-link.ts';

type SyncTone = 'ok' | 'warn' | 'danger' | 'muted';

interface RoomSession {
  roomId: string;
  url?: string;
  // ponytail: signaling (M2) will add peer/sync fields here; until then room
  // presence alone drives the UI and sync details render honest stubs.
  status?: 'connected' | 'reconnecting';
  peerName?: string;
  title?: string;
  episode?: string;
  peerEpisode?: string;
  sync?: 'synced' | 'catching' | 'waiting';
}

const SESSION_KEY = 'duet:room';

// ponytail: lightweight URL matchers duplicated from adapters/* so the popup
// bundle stays small (importing adapters would pull player code in here).
const SERVICES: { label: string; test: (u: URL) => boolean }[] = [
  { label: 'Netflix', test: (u) => u.hostname.endsWith('netflix.com') && u.pathname.startsWith('/watch/') },
  { label: 'YouTube', test: (u) => u.hostname.endsWith('youtube.com') && u.pathname === '/watch' },
  {
    label: 'Prime Video',
    test: (u) =>
      /(^|\.)amazon\./.test(u.hostname) || u.hostname.endsWith('primevideo.com'),
  },
  {
    label: 'JioHotstar',
    test: (u) => u.hostname.endsWith('hotstar.com') || u.hostname.endsWith('jiohotstar.com'),
  },
];

function detectService(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return SERVICES.find((s) => s.test(u))?.label ?? null;
  } catch {
    return null;
  }
}

function el<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n as T;
}

async function send(cmd: string, extra: Record<string, string> = {}): Promise<{ ok?: boolean } | null> {
  try {
    return (await chrome.runtime.sendMessage({ cmd, ...extra })) as { ok?: boolean } | null;
  } catch {
    return null;
  }
}

async function readRoom(): Promise<RoomSession | null> {
  try {
    const v = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as RoomSession | undefined;
    return v && typeof v.roomId === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function activeTabUrl(): Promise<string | null> {
  try {
    const tabs = (chrome as unknown as {
      tabs?: { query: (q: object) => Promise<{ url?: string }[]> };
    }).tabs;
    const [tab] = (await tabs?.query({ active: true, currentWindow: true })) ?? [];
    return tab?.url ?? null;
  } catch {
    return null;
  }
}

function wireShell(): void {
  document.getElementById('settings')?.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage().catch(() => {
      setStatus('Open settings from the extension menu.');
    });
  });
}

function setStatus(msg: string): void {
  el<HTMLElement>('statusline').textContent = msg;
}

function shell(inner: string): string {
  return `
    <div class="wrap popup-wrap">
      <div class="brand-row">
        <div class="brand" aria-label="Duet">
          <span class="mark" aria-hidden="true"></span>
          <span class="wordmark">Duet</span>
        </div>
        <span class="brand-actions">
          <button id="settings" class="icon-btn icon-sm" type="button" aria-label="Open settings">${iconSvg('settings', 18)}</button>
          <button id="theme" class="icon-btn icon-sm" type="button" aria-pressed="false" aria-label="Toggle light theme">${iconSvg('moon', 18)}</button>
        </span>
      </div>
      ${inner}
      <p id="statusline" class="status" role="status"></p>
    </div>`;
}

function serviceChip(service: string | null, href: string | null): string {
  if (href && !/^https?:\/\//i.test(href)) {
    return `<p class="chip" data-tone="muted"><i class="chip-dot" aria-hidden="true">○</i>Open a video site to begin</p>`;
  }
  if (service) {
    return `<p class="chip" data-tone="ok"><i class="chip-dot" aria-hidden="true">●</i>${service} · supported</p>`;
  }
  return `<p class="chip" data-tone="warn"><i class="chip-dot" aria-hidden="true">◐</i>Generic sync — most video players work</p>`;
}

function syncChip(sync: NonNullable<RoomSession['sync']>): { text: string; tone: SyncTone; dot: string } {
  // Text + color together; never color alone.
  if (sync === 'catching') return { text: 'Catching up…', tone: 'warn', dot: '◐' };
  if (sync === 'waiting') return { text: 'Waiting to buffer', tone: 'warn', dot: '⏸' };
  return { text: 'Synced', tone: 'ok', dot: '●' };
}

// --- state 1: home -----------------------------------------------------------

function homeView(service: string | null, href: string | null): string {
  return shell(`
    ${serviceChip(service, href)}
    <button id="start" class="btn btn-primary" type="button">Start a room</button>
    <form id="join" class="join field">
      <input id="link" type="text" placeholder="Paste invite link…" aria-label="Invite link"
        autocomplete="off" spellcheck="false" />
      <button class="btn btn-secondary" type="submit">Join</button>
    </form>`);
}

function wireHome(service: string | null): void {
  void service;
  void initTheme(el<HTMLButtonElement>('theme'));
  wireShell();

  el<HTMLButtonElement>('start').addEventListener('click', async () => {
    setStatus('Starting your room…');
    try {
      const base = await getBase();
      const roomId = await mintRoom(base, await getApiKey());
      const secret = makeSecret();
      const res = await send('duet:join', { url: signalUrl(base, roomId), roomId });
      if (res?.ok) {
        const link = inviteUrl(base, roomId, secret);
        try {
          await navigator.clipboard.writeText(link);
          setStatus('Room started — invite link copied, send it to them.');
        } catch {
          setStatus('Room started.');
        }
        await boot();
      } else {
        await boot('lost');
      }
    } catch (e) {
      await boot('lost', (e as Error)?.message === 'waking'
        ? 'The free server sleeps when idle — it should be awake now, try again.'
        : undefined);
    }
  });

  el<HTMLFormElement>('join').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const parsed = parseInvite(el<HTMLInputElement>('link').value);
    if (!parsed.roomId) {
      setStatus("That didn't work. Try again, or check the help page.");
      return;
    }
    if (parsed.base) void setBase(parsed.base);
    const base = parsed.base ?? (await getBase());
    setStatus('Joining…');
    const res = await send('duet:join', { url: signalUrl(base, parsed.roomId), roomId: parsed.roomId });
    if (res?.ok) {
      await boot();
    } else {
      await boot('lost');
    }
  });
}

// --- states 2 + 3: watching + in-room controls (one compact screen) -----------

function roomView(room: RoomSession): string {
  const chip = syncChip(room.sync ?? 'synced');
  const mismatch = room.peerEpisode && room.episode && room.peerEpisode !== room.episode;
  const peer = room.peerName ?? null;
  return shell(`
    <div class="room-head">
      <span class="room-id" id="roomcode"></span>
      <span class="chip" data-tone="${chip.tone}"><i class="chip-dot" aria-hidden="true">${chip.dot}</i>${chip.text}</span>
    </div>
    <section class="section" aria-label="Now watching">
      <h2>Watching</h2>
      <p class="watch-title" id="watchtitle">${room.title ?? 'Open a video to begin'}</p>
      ${room.episode ? `<p class="watch-sub" id="watchep"></p>` : ''}
      ${
        mismatch
          ? `<p class="warn-row"><span id="mismatch"></span><button id="gothere" class="btn btn-ghost btn-inline" type="button">Go there</button></p>`
          : ''
      }
    </section>
    <section class="section" aria-label="Room controls">
      <h2>Control</h2>
      <div class="seg-group" role="group" aria-label="Who can control playback">
        <button id="seg-both" class="seg" type="button" aria-pressed="true">Both</button>
        <button id="seg-me" class="seg" type="button" aria-pressed="false">Just me</button>
      </div>
      <div class="ctrl-grid">
        <span class="ctrl"><button id="c-mic" class="icon-btn" type="button" aria-label="Mute microphone" aria-pressed="false">${iconSvg('mic', 20)}</button><small>Mic</small></span>
        <span class="ctrl"><button id="c-cam" class="icon-btn" type="button" aria-label="Turn camera off" aria-pressed="false">${iconSvg('video', 20)}</button><small>Camera</small></span>
        <span class="ctrl"><button id="c-chat" class="icon-btn" type="button" aria-label="Open chat in side panel" aria-pressed="false">${iconSvg('chat', 20)}</button><small>Chat</small></span>
        <span class="ctrl"><button id="c-resync" class="icon-btn" type="button" aria-label="Resync playback">${iconSvg('sync', 20)}</button><small>Resync</small></span>
      </div>
      <button id="leave" class="btn btn-ghost leave" type="button">Leave room</button>
    </section>
    ${peer ? `<p class="chip" data-tone="ok"><i class="chip-dot" aria-hidden="true">●</i><span id="peerline"></span></p>` : ''}`);
}

function wireRoom(room: RoomSession): void {
  void initTheme(el<HTMLButtonElement>('theme'));
  wireShell();
  el<HTMLElement>('roomcode').textContent = room.roomId;
  if (room.episode) el<HTMLElement>('watchep').textContent = room.episode;
  if (room.peerName) {
    const peerLine = document.getElementById('peerline');
    if (peerLine) peerLine.textContent = `${room.peerName}'s here.`;
  }
  const mismatch = document.getElementById('mismatch');
  if (mismatch && room.peerEpisode) {
    mismatch.textContent = `${room.peerName ?? 'They'} is on ${room.peerEpisode}`;
  }

  const goThere = document.getElementById('gothere') as HTMLButtonElement | null;
  goThere?.addEventListener('click', () => {
    // ponytail: same-title navigation lands with M2 peer state; stub confirms.
    setStatus('Opening what they’re watching…');
  });

  // ponytail: control mode + mic/cam/chat/resync are local-only stubs until M2
  // signaling wires them; pressed states stay honest UI feedback.
  const both = el<HTMLButtonElement>('seg-both');
  const me = el<HTMLButtonElement>('seg-me');
  const pick = (justMe: boolean) => {
    both.setAttribute('aria-pressed', String(!justMe));
    me.setAttribute('aria-pressed', String(justMe));
    setStatus(justMe ? 'Only you control playback.' : 'You both control playback.');
  };
  both.addEventListener('click', () => pick(false));
  me.addEventListener('click', () => pick(true));

  const toggle = (id: string, on: string, off: string) => {
    const b = el<HTMLButtonElement>(id);
    b.addEventListener('click', () => {
      const pressed = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(pressed));
      b.setAttribute('aria-label', pressed ? on : off);
      if (id === 'c-resync') setStatus('Catching up…');
    });
  };
  toggle('c-mic', 'Unmute microphone', 'Mute microphone');
  toggle('c-cam', 'Turn camera on', 'Turn camera off');
  el<HTMLButtonElement>('c-chat').addEventListener('click', async () => {
    try {
      // ponytail: side panel entry point differs per manifest; guard + hint.
      await chrome.sidePanel.open({});
      window.close();
    } catch {
      setStatus('Open the side panel to keep chatting.');
    }
  });

  el<HTMLButtonElement>('leave').addEventListener('click', async () => {
    await send('duet:leave');
    await boot();
  });

  if (room.peerName && !room.title) setStatus(`${room.peerName}'s here.`);
}

// --- state 4: connection lost -------------------------------------------------

function lostView(hint?: string): string {
  return shell(`
    <section class="section lost" aria-label="Connection lost">
      <p class="lost-title">Reconnecting… your place is saved</p>
      <button id="retry" class="btn btn-primary" type="button">Try again</button>
      <p class="hint">${hint ?? 'Check your connection, then try again. Nothing is lost.'}</p>
    </section>`);
}

function wireLost(): void {
  void initTheme(el<HTMLButtonElement>('theme'));
  wireShell();
  setStatus('Reconnecting… your place is saved.');
  el<HTMLButtonElement>('retry').addEventListener('click', async () => {
    setStatus('Trying again…');
    const room = await readRoom();
    if (room?.url) {
      const res = await send('duet:join', { url: room.url, roomId: room.roomId });
      await boot(res?.ok ? undefined : 'lost');
    } else {
      await boot();
    }
  });
}

// --- boot ---------------------------------------------------------------------

async function boot(force?: 'lost', hint?: string): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;
  if (force === 'lost') {
    app.innerHTML = lostView(hint);
    wireLost();
    return;
  }
  const room = await readRoom();
  if (!room) {
    const tabUrl = await activeTabUrl();
    const service = detectService(tabUrl);
    app.innerHTML = homeView(service, tabUrl);
    wireHome(service);
    return;
  }
  if (room.status === 'reconnecting') {
    app.innerHTML = lostView();
    wireLost();
    return;
  }
  app.innerHTML = roomView(room);
  wireRoom(room);
}

void boot();
