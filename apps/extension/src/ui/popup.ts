// Popup before joining: Start a room / Join with link / status line (moodboard §5.4).
// Wires to the existing message protocol in background/service-worker.ts:
// sends `duet:join { url, roomId }`. Never touches adapters/content/web.

import { initTheme } from './theme.ts';
import {
  getBase,
  inviteUrl,
  makeRoomId,
  makeSecret,
  makeTicketCode,
  parseInvite,
  setBase,
  signalUrl,
} from './room-link.ts';

function el<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n as T;
}

async function join(url: string, roomId: string): Promise<boolean> {
  try {
    const res = (await chrome.runtime.sendMessage({ cmd: 'duet:join', url, roomId })) as {
      ok?: boolean;
    } | null;
    return !!res?.ok;
  } catch {
    return false;
  }
}

function showTicket(roomId: string, link: string | null, copyLabel: string) {
  const ticket = el<HTMLElement>('ticket');
  ticket.hidden = false;
  el<HTMLElement>('ticket-code').textContent = roomId;
  const copy = el<HTMLButtonElement>('copy');
  copy.textContent = copyLabel;
  copy.onclick = () => {
    const text = link ?? roomId;
    void navigator.clipboard?.writeText(text).catch(() => {});
    el<HTMLElement>('status').textContent = link ? 'Invite link copied.' : 'Code copied.';
  };
  if (link) {
    copy.dataset.link = link;
  } else {
    delete copy.dataset.link;
  }
}

function mount() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="wrap">
      <div class="brand-row">
        <div class="brand" aria-label="Duet">
          <span class="mark" aria-hidden="true"></span>
          <span class="wordmark">Duet</span>
        </div>
        <button id="theme" class="icon-btn" type="button" aria-pressed="false" aria-label="Toggle light theme">☾</button>
      </div>
      <button id="start" class="btn btn-primary" type="button">Start a room</button>
      <div class="divider" aria-hidden="true">or</div>
      <form id="join" class="join field">
        <input id="link" type="text" placeholder="Paste invite link…" aria-label="Invite link"
          autocomplete="off" spellcheck="false" />
        <button class="btn btn-secondary" type="submit">Join</button>
      </form>
      <section id="ticket" class="ticket ticket-stub" hidden>
        <p class="ticket-kicker">ADMIT TWO</p>
        <p id="ticket-code" class="ticket-code" aria-label="Room code"></p>
        <button id="copy" class="btn btn-secondary" type="button">Copy invite link</button>
      </section>
      <p id="status" class="status" role="status"></p>
    </div>`;
  const status = el<HTMLElement>('status');
  void initTheme(el<HTMLButtonElement>('theme'));

  el<HTMLButtonElement>('start').addEventListener('click', async () => {
    const base = await getBase();
    if (!base) {
      // No server known yet: the first paste of any Duet link teaches us the base.
      status.textContent = 'Paste any Duet invite link below first, so we know your server.';
      el<HTMLInputElement>('link').focus();
      return;
    }
    const roomId = makeRoomId();
    const link = inviteUrl(base, roomId, makeSecret());
    status.textContent = 'Starting your room…';
    if (await join(signalUrl(base, roomId), roomId)) {
      showTicket(makeTicketCode(), link, 'Copy invite link');
      status.textContent = 'Waiting for your person…';
    } else {
      status.textContent = "That didn't work. Try again, or check the help page.";
    }
  });

  el<HTMLFormElement>('join').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const raw = el<HTMLInputElement>('link').value;
    const parsed = parseInvite(raw);
    if (!parsed.roomId) {
      status.textContent = "That didn't work. Try again, or check the help page.";
      return;
    }
    if (parsed.base) void setBase(parsed.base);
    const base = parsed.base ?? (await getBase());
    if (!base) {
      status.textContent = 'Paste a full invite link, not just a code.';
      return;
    }
    status.textContent = 'Joining…';
    const url = signalUrl(base, parsed.roomId);
    if (await join(url, parsed.roomId)) {
      const link = parsed.secret ? inviteUrl(base, parsed.roomId, parsed.secret) : null;
      showTicket(parsed.roomId, link, link ? 'Copy invite link' : 'Copy code');
      status.textContent = 'Waiting for your person…';
    } else {
      status.textContent = "That didn't work. Try again, or check the help page.";
    }
  });
}

mount();
