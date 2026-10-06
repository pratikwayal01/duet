// Side panel (Sync mode), wireframe per moodboard §5.4.
// Reads the existing session room (`duet:room`, written by background/room-client.ts)
// and sends the existing `duet:leave`. Listens for `duet:state` broadcasts
// (peer/title/drift/chat) when the background starts emitting them; until then
// those sections show calm placeholders. Chat capped at 200 (PRD §5.7).
// Destroyed on close. Never touches adapters/content/web.

import { initTheme } from './theme.ts';

export type SyncStatus = 'synced' | 'catching' | 'waiting' | 'reconnecting' | 'noplayer';

export const CHAT_CAP = 200;

const CHIPS: Record<SyncStatus, { dot: string; tone: 'ok' | 'warn' | 'danger' | 'muted'; copy: string }> = {
  synced: { dot: '●', tone: 'ok', copy: 'Synced' },
  catching: { dot: '◐', tone: 'warn', copy: 'Catching up…' },
  waiting: { dot: '⏸', tone: 'warn', copy: 'Waiting to buffer' },
  reconnecting: { dot: '○', tone: 'danger', copy: 'Reconnecting…' },
  noplayer: { dot: '!', tone: 'muted', copy: 'Open a video to begin' },
};

export function renderChip(status: SyncStatus, peer?: string): string {
  const c = CHIPS[status];
  const copy = status === 'waiting' && peer ? `Waiting for ${peer} to buffer` : c.copy;
  const pulse = status === 'catching' || status === 'reconnecting' ? ' pulse' : '';
  return `<span class="chip" data-tone="${c.tone}"><span class="chip-dot${pulse}" aria-hidden="true">${c.dot}</span> ${copy}</span>`;
}

interface ChatMsg {
  from: 'you' | 'them';
  text: string;
  ts: number;
}

interface PanelState {
  roomId: string | null;
  peer: string | null;
  status: SyncStatus;
  mineTitle: string | null;
  peerTitle: string | null;
  driftMs: number | null;
  control: 'both' | 'me';
  chat: ChatMsg[];
  knock: { clientId: string; name: string } | null;
  waiting: boolean;
}

const state: PanelState = {
  roomId: null,
  peer: null,
  status: 'noplayer',
  mineTitle: null,
  peerTitle: null,
  driftMs: null,
  control: 'both',
  chat: [],
  knock: null,
  waiting: false,
};

function el<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n as T;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function paintChip() {
  el<HTMLElement>('chip').innerHTML = renderChip(state.status, state.peer ?? undefined);
}

function paintPresence() {
  const peer = state.peer ?? 'Waiting for your person…';
  const initial = (n: string) => (n.trim().charAt(0) || '?').toUpperCase();
  el<HTMLElement>('presence').innerHTML = `
    <span class="pill"><span class="avatar avatar-you" aria-hidden="true">Y</span> You</span>
    <span class="pill"><span class="avatar avatar-them" aria-hidden="true">${esc(initial(state.peer ?? '?'))}</span> ${esc(peer)}</span>`;
}

function paintWatching() {
  const mine = state.mineTitle ?? 'Nothing yet';
  el<HTMLElement>('watching').textContent = mine;
  const warn = el<HTMLElement>('title-warn');
  const mismatch = !!state.peerTitle && !!state.mineTitle && state.peerTitle !== state.mineTitle;
  warn.hidden = !mismatch;
  if (mismatch) el<HTMLElement>('peer-title').textContent = state.peerTitle!;
}

function paintDrift() {
  el<HTMLElement>('drift').textContent =
    state.driftMs == null ? '—' : `${state.driftMs >= 0 ? '+' : ''}${(state.driftMs / 1000).toFixed(2)} s`;
}

function paintChat() {
  const list = el<HTMLElement>('chat-list');
  list.innerHTML = state.chat
    .map((m) =>
      m.from === 'you'
        ? `<li class="chat-row chat-row-own"><div class="bubble bubble-own">${esc(m.text)}<time>${new Date(m.ts).toLocaleTimeString()}</time></div></li>`
        : `<li class="chat-row"><div class="bubble bubble-peer">${esc(m.text)}<time>${new Date(m.ts).toLocaleTimeString()}</time></div></li>`,
    )
    .join('');
  list.scrollTop = list.scrollHeight;
}

function paintAll() {
  el<HTMLElement>('room').textContent = state.roomId ? `Room ${state.roomId}` : 'Room —';
  paintChip();
  paintPresence();
  paintWatching();
  paintDrift();
  paintChat();
  paintKnock();
}

function paintKnock() {
  const banner = document.getElementById('knockbanner');
  const text = document.getElementById('knocktext');
  if (!banner || !text) return;
  if (!state.knock) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  text.textContent = `${state.knock.name} wants to join.`;
}

function pushChat(from: 'you' | 'them', text: string) {
  state.chat.push({ from, text, ts: Date.now() });
  if (state.chat.length > CHAT_CAP) state.chat.splice(0, state.chat.length - CHAT_CAP);
  paintChat();
}

function mount() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="wrap side-wrap duet-side">
      <div class="brand-row">
        <div class="brand" aria-label="Duet">
          <span class="mark" aria-hidden="true"></span>
          <span class="wordmark">Duet</span>
        </div>
        <button id="theme" class="icon-btn" type="button" aria-pressed="false" aria-label="Toggle light theme">☾</button>
      </div>
      <div class="room-head">
        <span id="room" class="room-id">Room —</span>
        <span id="chip">${renderChip('noplayer')}</span>
      </div>
      <div class="knock-banner" id="knockbanner" hidden>
        <span id="knocktext"></span>
        <span class="knock-actions">
          <button id="knock-yes" class="btn btn-primary btn-inline" type="button">Let in</button>
          <button id="knock-no" class="btn btn-ghost btn-inline" type="button">Decline</button>
        </span>
      </div>
      <div class="invite-row" id="inviterow" hidden>
        <span class="invite-link" id="invitelink"></span>
        <button id="copyinvite" class="btn btn-ghost btn-inline" type="button">Copy invite</button>
      </div>
      <div id="presence" class="pills" aria-label="Who's here"></div>
      <section class="section" aria-label="Now watching">
        <h2>Watching</h2>
        <p id="watching" class="watch-title">Nothing yet</p>
        <div id="title-warn" class="warn-row" hidden>
          <span aria-hidden="true">⚠</span>
          <span><span id="peer-title"></span> is on something else.</span>
          <button id="gothere" class="btn btn-secondary" type="button">Go there</button>
        </div>
        <details class="kv">
          <summary>Sync drift&nbsp;&nbsp;<span id="drift" class="drift">—</span></summary>
          <div class="seg-group" role="group" aria-label="Who controls playback">
            <button id="ctl-both" class="seg" type="button" aria-pressed="true">Both</button>
            <button id="ctl-me" class="seg" type="button" aria-pressed="false">Just me</button>
          </div>
        </details>
      </section>
      <section class="chat" aria-label="Chat">
        <ol id="chat-list" class="chat-list" aria-label="Messages"></ol>
        <form id="composer" class="composer field">
          <input id="msg" type="text" placeholder="Type a message…" aria-label="Type a message"
            autocomplete="off" maxlength="2000" />
          <button class="btn btn-secondary" type="submit" aria-label="Send message">↩</button>
        </form>
      </section>
      <button id="leave" class="btn btn-ghost" type="button">Leave room</button>
      <p id="toast" class="status" role="status"></p>
    </div>`;
  void initTheme(el<HTMLButtonElement>('theme'));

  const setControl = (c: 'both' | 'me') => {
    state.control = c;
    el<HTMLButtonElement>('ctl-both').setAttribute('aria-pressed', c === 'both' ? 'true' : 'false');
    el<HTMLButtonElement>('ctl-me').setAttribute('aria-pressed', c === 'me' ? 'true' : 'false');
    el<HTMLElement>('toast').textContent = c === 'both' ? 'Both of you control playback.' : 'Only you control playback.';
  };
  el<HTMLButtonElement>('ctl-both').addEventListener('click', () => setControl('both'));
  el<HTMLButtonElement>('ctl-me').addEventListener('click', () => setControl('me'));

  el<HTMLButtonElement>('gothere').addEventListener('click', () => {
    // ponytail: seeks the local player to the peer title once tabs messaging lands.
    el<HTMLElement>('toast').textContent = state.peerTitle ? `Catching up with ${state.peer ?? 'them'}…` : '';
  });

  el<HTMLFormElement>('composer').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = el<HTMLInputElement>('msg');
    const text = input.value.trim();
    if (!text) return;
    // ponytail: local echo; signaling send rides `duet:state` chat broadcast (M2).
    pushChat('you', text);
    input.value = '';
  });

  el<HTMLButtonElement>('leave').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ cmd: 'duet:leave' });
    } catch {
      /* already gone */
    }
    state.roomId = null;
    state.peer = null;
    state.status = 'noplayer';
    state.knock = null;
    paintAll();
    el<HTMLElement>('toast').textContent = 'You left the room.';
  });

  const decide = (admit: boolean) => async () => {
    const target = state.knock?.clientId;
    if (!target) return;
    try {
      await chrome.runtime.sendMessage({ cmd: admit ? 'duet:admit' : 'duet:deny', target });
      el<HTMLElement>('toast').textContent = admit
        ? `${state.knock?.name ?? 'They'}'s in.`
        : 'Declined.';
    } catch {
      el<HTMLElement>('toast').textContent = "Couldn't reach the room. Try again.";
      return;
    }
    state.knock = null;
    paintKnock();
  };
  el<HTMLButtonElement>('knock-yes').addEventListener('click', decide(true));
  el<HTMLButtonElement>('knock-no').addEventListener('click', decide(false));

  // Forward-compatible: apply background broadcasts if/when they arrive.
  chrome.runtime.onMessage.addListener((msg) => {
    const m = msg as {
      cmd?: string;
      status?: SyncStatus;
      peer?: string;
      mineTitle?: string;
      peerTitle?: string;
      driftMs?: number;
      waiting?: boolean;
      knock?: { clientId?: string; name?: string };
      state?: { rev?: number };
      roomId?: string;
      chat?: { from: 'you' | 'them'; text: string };
    };
    if (m.cmd !== 'duet:state') return;
    if (m.knock && typeof m.knock.clientId === 'string') {
      state.knock = { clientId: m.knock.clientId, name: m.knock.name ?? 'Someone' };
      paintKnock();
      el<HTMLElement>('toast').textContent = `${state.knock.name} wants to join.`;
      return;
    }
    if (m.waiting) {
      state.waiting = true;
      el<HTMLElement>('toast').textContent = 'Knocking… the host lets you in.';
      return;
    }
    if (m.state && typeof m.roomId === 'string') {
      state.roomId = m.roomId;
      state.status = 'synced';
      state.waiting = false;
      state.peer = state.peer ?? 'Guest';
      paintAll();
      el<HTMLElement>('toast').textContent = "You're in.";
      return;
    }
    if (m.status && m.status in CHIPS) {
      state.status = m.status;
      paintChip();
    }
    if (typeof m.peer === 'string') {
      const joined = !state.peer && m.peer;
      state.peer = m.peer || null;
      paintPresence();
      paintChip();
      if (joined) el<HTMLElement>('toast').textContent = `${m.peer}’s here.`;
    }
    if (typeof m.mineTitle === 'string' || typeof m.peerTitle === 'string') {
      if (typeof m.mineTitle === 'string') state.mineTitle = m.mineTitle || null;
      if (typeof m.peerTitle === 'string') state.peerTitle = m.peerTitle || null;
      paintWatching();
    }
    if (typeof m.driftMs === 'number') {
      state.driftMs = m.driftMs;
      paintDrift();
    }
    if (m.chat && typeof m.chat.text === 'string') pushChat(m.chat.from === 'you' ? 'you' : 'them', m.chat.text);
  });

  void chrome.storage.session.get('duet:room').then((got) => {
    const room = got['duet:room'] as { roomId?: string; base?: string | null; secret?: string | null } | undefined;
    if (room?.roomId) {
      state.roomId = room.roomId;
      state.status = 'waiting';
      paintAll();
      if (room.base && room.secret) {
        const link = `${room.base.replace(/\/$/, '')}/r/${room.roomId}#${room.secret}`;
        const row = document.getElementById('inviterow');
        const span = document.getElementById('invitelink');
        if (row && span) {
          row.hidden = false;
          span.textContent = link.replace(/^https?:\/\//, '');
          span.setAttribute('title', link);
          document.getElementById('copyinvite')?.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(link);
              el<HTMLElement>('toast').textContent = 'Invite link copied — send it to them.';
            } catch {
              el<HTMLElement>('toast').textContent = link;
            }
          });
        }
      }
    }
  });

  paintAll();
  window.addEventListener('beforeunload', () => {
    app.innerHTML = ''; // destroy on close
  });
}

mount();
