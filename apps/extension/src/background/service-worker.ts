import { RoomClient } from './room-client.ts';
import { setToolbarState } from './toolbar.ts';

// Event-driven MV3 service worker: allowed to suspend, zero resident cost
// when idle (PRD §5.7). No setInterval / long timers here — the control loop
// lives in the content script, periodic clock re-sync in the sidepanel.
let client: RoomClient | null = null;
let joinedRoomId: string | null = null;

// Last broadcast state: powers duet:resync without a round-trip.
// Mirrored to chrome.storage.session because the worker suspends and
// module memory (including this) is wiped — without the mirror, resync
// says "nothing to catch up to" after any idle stretch.
type CachedState = { position: number; playing: boolean; rate: number; refServerTime: number };
async function readLastState(): Promise<CachedState | null> {
  if (lastState) return lastState;
  try {
    const v = (await chrome.storage.session.get('duet:last-state')) as Record<string, unknown>;
    const s = v['duet:last-state'] as CachedState | undefined;
    if (s && typeof s.position === 'number') {
      lastState = s;
      return s;
    }
  } catch {
    /* no stored state */
  }
  return null;
}

// Last broadcast state: powers duet:resync without a round-trip.
// Never persisted — rebuilt from the socket on every join.
let lastState: { position: number; playing: boolean; rate: number; refServerTime: number } | null = null;

// One-shot hook: the next server frame completes a pending join reply so the
// popup knows whether it walked in (state) or is knocking (knocking frame).
let awaitFirstFrame: ((t: string) => void) | null = null;

function getClient(): RoomClient {
  if (!client) {
    client = new RoomClient({
      onState: (msg) => {
        const m = msg as { t?: string; state?: typeof lastState; clientId?: string; name?: string };
        if (awaitFirstFrame && (m?.t === 'state' || m?.t === 'knocking')) {
          const f = awaitFirstFrame;
          awaitFirstFrame = null;
          f(m.t);
        }
        if (m?.t === 'state' && m.state && typeof m.state.position === 'number') {
          lastState = { ...m.state } as typeof lastState;
          void chrome.storage.session.set({ 'duet:last-state': lastState }).catch(() => {});
          // Side panel listens for duet:state; no receiver = rejected promise.
          void chrome.runtime.sendMessage({ cmd: 'duet:state', roomId: joinedRoomId, state: m.state }).catch(() => {});
        } else if (m?.t === 'chat' && typeof (m as { body?: unknown }).body === 'string') {
          const c = m as { from?: string; body: string };
          void chrome.runtime
            .sendMessage({ cmd: 'duet:state', roomId: joinedRoomId, chat: { from: c.from ?? 'them', text: c.body } })
            .catch(() => {});
        } else if (m?.t === 'knock' && typeof m.clientId === 'string') {
          void chrome.runtime
            .sendMessage({ cmd: 'duet:state', roomId: joinedRoomId, knock: { clientId: m.clientId, name: m.name ?? 'Someone' } })
            .catch(() => {});
          setToolbarState('alert');
        } else if (m?.t === 'knocking') {
          void chrome.runtime.sendMessage({ cmd: 'duet:state', roomId: joinedRoomId, waiting: true }).catch(() => {});
        }
      },
      onStatus: (s) => {
        void s;
      },
    });
  }
  return client;
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.set({ 'duet:installed': true });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const m = msg as { cmd?: string; url?: string; roomId?: string; base?: string; secret?: string; tabId?: string };
  if (m.cmd === 'duet:join' && m.url && m.roomId) {
    getClient()
      .connect(m.url, m.roomId)
      .then(async () => {
        // Mark this socket joined server-side (else intents/relay are dropped
        // with join-first). Name is a stub until display-name settings land.
        const clientId = crypto.randomUUID();
        let name = 'Guest';
        try {
          const v = (await chrome.storage.local.get('duet:name'))['duet:name'];
          if (typeof v === 'string' && v !== '') name = v.slice(0, 64);
        } catch {
          /* default stands */
        }
        getClient().send({ v: 1, t: 'hello', id: crypto.randomUUID(), clientId, name });
        joinedRoomId = m.roomId ?? null;
        // Wait for the first server verdict (state = in, knocking = waiting).
        // Timeout falls through as plain ok (host path always answers fast).
        const knocking = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            if (awaitFirstFrame) {
              awaitFirstFrame = null;
              resolve(false);
            }
          }, 5000);
          awaitFirstFrame = (t: string) => {
            clearTimeout(timer);
            resolve(t === 'knocking');
          };
        });
        await chrome.storage.session.set({
          'duet:room': {
            roomId: m.roomId,
            url: m.url,
            clientId,
            base: m.base ?? null,
            secret: m.secret ?? null,
            tabId: m.tabId ?? null,
          },
        });
        setToolbarState('waiting');
        reply({ ok: true, knocking });
      })
      .catch((e) => reply({ ok: false, error: e instanceof Error ? e.message : 'join failed' }));
    return true;
  }
  if (m.cmd === 'duet:leave') {
    lastState = null;
    joinedRoomId = null;
    void chrome.storage.session.remove('duet:last-state').catch(() => {});
    getClient()
      .close()
      .then(() => {
        client = null;
        setToolbarState('idle');
        reply({ ok: true });
      });
    return true;
  }
  // Probe for a listening content script. Never throws: true = present.
  const pingTab = async (tabId: number): Promise<boolean> => {
    try {
      await chrome.tabs.sendMessage(tabId, { cmd: 'duet:ping' });
      return true;
    } catch {
      return false;
    }
  };

  // Ensure the content entry is listening in tabId (declared content
  // scripts don't run in tabs opened before install/reload). Returns a
  // human-readable failure naming the tab when possible — never throws.
  const ensureContent = async (tabId: number): Promise<{ ok: true } | { ok: false; error: string }> => {
    let title = `tab ${tabId}`;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.title) title = `“${tab.title}”`;
    } catch {
      return { ok: false, error: 'Video tab was closed — open the video and resync.' };
    }
    if (await pingTab(tabId)) return { ok: true };
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/content.js'] });
    } catch {
      return { ok: false, error: `Can't reach ${title} — open the video tab and retry.` };
    }
    if (await pingTab(tabId)) return { ok: true };
    return { ok: false, error: `Player not listening in ${title} — reload that tab and retry.` };
  };

  if (m.cmd === 'duet:resync') {
    // Stored video tab first (captured on Start/Join), caller hint as fallback.
    void (async () => {
      const stored = await chrome.storage.session
        .get('duet:room')
        .then((v) => ((v as Record<string, unknown>)['duet:room'] as { tabId?: string } | undefined)?.tabId)
        .catch(() => undefined);
      const tabId = Number(stored ?? m.tabId ?? NaN);
      if (!Number.isFinite(tabId)) {
        reply({ ok: false, error: 'No video tab on record — open the video and rejoin.' });
        return;
      }
      const ensured = await ensureContent(tabId);
      if (!ensured.ok) {
        reply({ ok: false, error: ensured.error });
        return;
      }
      const cached = await readLastState().catch(() => null);
      if (!cached) {
        reply({ ok: false, error: 'Nothing to catch up to yet — play something first.' });
        return;
      }
      const s = cached;
      const position = Math.max(0, s.position + (s.playing ? ((getClient().serverNow() - s.refServerTime) / 1000) * s.rate : 0));
      try {
        await chrome.tabs.sendMessage(tabId, { cmd: 'duet:apply-state', position, playing: s.playing });
        reply({ ok: true });
      } catch {
        reply({ ok: false, error: 'Player went quiet — reload the video tab and retry.' });
      }
    })();
    return true;
  }
  if (m.cmd === 'duet:chat-send' && typeof (msg as { text?: unknown }).text === 'string') {
    const text = ((msg as { text?: string }).text ?? '').trim().slice(0, 2000);
    if (!text) {
      reply({ ok: false, error: 'Empty message.' });
      return true;
    }
    chrome.storage.session
      .get('duet:room')
      .then(async (v) => {
        const room = (v as Record<string, unknown>)['duet:room'] as { roomId?: string } | undefined;
        let name = 'Guest';
        try {
          const n = (await chrome.storage.local.get('duet:name'))['duet:name'];
          if (typeof n === 'string' && n !== '') name = n.slice(0, 64);
        } catch {
          /* default stands */
        }
        if (!room?.roomId) {
          reply({ ok: false, error: 'Not in a room.' });
          return;
        }
        getClient().send({ v: 1, t: 'chat', id: crypto.randomUUID(), roomId: room.roomId, from: name, body: text, ts: Date.now() });
        reply({ ok: true });
      })
      .catch(() => reply({ ok: false, error: 'Not in a room.' }));
    return true;
  }
  if (m.cmd === 'duet:admit' || m.cmd === 'duet:deny') {
    const target = (msg as { target?: string }).target;
    chrome.storage.session
      .get('duet:room')
      .then((v) => {
        const room = (v as Record<string, unknown>)['duet:room'] as { roomId?: string } | undefined;
        if (!room?.roomId || !target) {
          reply({ ok: false, error: 'no room' });
          return;
        }
        getClient().send({
          v: 1, t: m.cmd === 'duet:admit' ? 'admit' : 'deny',
          id: crypto.randomUUID(), roomId: room.roomId, target,
        });
        if (m.cmd === 'duet:admit') setToolbarState('active');
        reply({ ok: true });
      })
      .catch(() => reply({ ok: false, error: 'no room' }));
    return true;
  }
  if (m.cmd === 'duet:diag') {
    const d = client ? getClient().diag() : { connected: false, serverOffsetMs: 0, rttMs: null };
    chrome.storage.session
      .get('duet:room')
      .then((v) => reply({ ok: true, diag: d, room: (v as Record<string, unknown>)['duet:room'] ?? null }))
      .catch(() => reply({ ok: true, diag: d, room: null }));
    return true;
  }
  return false;
});
