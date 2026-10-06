import { RoomClient } from './room-client.ts';
import { setToolbarState } from './toolbar.ts';

// Event-driven MV3 service worker: allowed to suspend, zero resident cost
// when idle (PRD §5.7). No setInterval / long timers here — the control loop
// lives in the content script, periodic clock re-sync in the sidepanel.
let client: RoomClient | null = null;

function getClient(): RoomClient {
  if (!client) {
    client = new RoomClient({
      onState: (msg) => {
        // ponytail: broadcast stub — sidepanel subscription arrives in M2.
        void msg;
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
  const m = msg as { cmd?: string; url?: string; roomId?: string };
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
        await chrome.storage.session.set({ 'duet:room': { roomId: m.roomId, url: m.url, clientId } });
        setToolbarState('waiting');
        reply({ ok: true });
      })
      .catch((e) => reply({ ok: false, error: e instanceof Error ? e.message : 'join failed' }));
    return true;
  }
  if (m.cmd === 'duet:leave') {
    getClient()
      .close()
      .then(() => {
        client = null;
        setToolbarState('idle');
        reply({ ok: true });
      });
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
