import { RoomClient } from './room-client.ts';
import { setToolbarState } from './toolbar.ts';

// Event-driven MV3 service worker: allowed to suspend, zero resident cost
// when idle (PRD §5.7). No setInterval / long timers here — the control loop
// lives in the content script, periodic clock re-sync in the sidepanel.
let client: RoomClient | null = null;
let joinedRoomId: string | null = null;

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
          // Side panel listens for duet:state; no receiver = rejected promise.
          void chrome.runtime.sendMessage({ cmd: 'duet:state', roomId: joinedRoomId, state: m.state }).catch(() => {});
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
          'duet:room': { roomId: m.roomId, url: m.url, clientId, base: m.base ?? null, secret: m.secret ?? null },
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
    getClient()
      .close()
      .then(() => {
        client = null;
        setToolbarState('idle');
        reply({ ok: true });
      });
    return true;
  }
  if (m.cmd === 'duet:resync' && m.tabId) {
    const tabId = Number(m.tabId);
    if (!lastState || !Number.isFinite(tabId)) {
      reply({ ok: false, error: 'Nothing to catch up to yet — play something first.' });
      return true;
    }
    const s = lastState;
    const position = Math.max(0, s.position + (s.playing ? ((getClient().serverNow() - s.refServerTime) / 1000) * s.rate : 0));
    chrome.tabs
      .sendMessage(tabId, { cmd: 'duet:apply-state', position, playing: s.playing })
      .then(() => reply({ ok: true }))
      .catch(() => reply({ ok: false, error: 'Player not listening — open the video tab first.' }));
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
