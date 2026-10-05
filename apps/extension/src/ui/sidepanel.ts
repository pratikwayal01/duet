// Side panel (Sync mode), wireframe per moodboard §5.4.
// ponytail: vanilla DOM skeleton — Svelte components land in the M1 UI pass.
// Destroyed on close; chat capped at 200 (PRD §5.7 memory rules).

export type SyncStatus = 'synced' | 'catching' | 'waiting' | 'reconnecting' | 'noplayer';

const CHIPS: Record<SyncStatus, { dot: string; copy: string; token: string }> = {
  synced: { dot: '●', copy: 'Synced', token: 'var(--ok)' },
  catching: { dot: '◐', copy: 'Catching up…', token: 'var(--warn)' },
  waiting: { dot: '⏸', copy: 'Waiting to buffer', token: 'var(--warn)' },
  reconnecting: { dot: '○', copy: 'Reconnecting…', token: 'var(--danger)' },
  noplayer: { dot: '!', copy: 'Open a video to begin', token: 'var(--text-2)' },
};

const CHAT_CAP = 200;

export function renderChip(status: SyncStatus): string {
  const c = CHIPS[status];
  return `<span class="chip" style="color:${c.token}"><span aria-hidden="true">${c.dot}</span> ${c.copy}</span>`;
}

function mount() {
  const app = document.getElementById('app');
  if (!app) return;
  const chat: string[] = []; // ponytail: capped ring buffer; drop oldest past CHAT_CAP
  void chat;
  void CHAT_CAP;
  app.innerHTML = `
    <header><span id="room">Room —</span> <span id="chip">${renderChip('noplayer')}</span></header>
    <section id="presence"></section>
    <section id="title"><h2>Watching</h2><p id="watching">Nothing yet</p></section>
    <section id="chat" aria-label="Chat"></section>
    <form id="composer"><input type="text" placeholder="Type a message…" aria-label="Type a message" />
    <button type="submit">↩</button></form>`;
  // ponytail: room wiring (join, chat send, resync) arrives in M2.
  window.addEventListener('beforeunload', () => {
    app.innerHTML = ''; // destroy on close
  });
}

mount();
