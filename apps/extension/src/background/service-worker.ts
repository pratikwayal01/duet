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
      .then(() => {
        setToolbarState('waiting');
        reply({ ok: true });
      })
      .catch(() => reply({ ok: false }));
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
  return false;
});
