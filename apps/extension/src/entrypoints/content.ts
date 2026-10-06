import { attachWhenRoomActive, detachAll } from '../content/attach.ts';
import { createGenericAdapter } from '../adapters/generic/adapter.ts';
import { netflixAdapter } from '../adapters/netflix/adapter.ts';
import { primeAdapter } from '../adapters/prime/adapter.ts';
import { jiohotstarAdapter } from '../adapters/jiohotstar/adapter.ts';
import { youtubeAdapter } from '../adapters/youtube/adapter.ts';

const ADAPTERS = [
  netflixAdapter,
  primeAdapter,
  jiohotstarAdapter,
  youtubeAdapter,
  createGenericAdapter(),
];

export default defineContentScript({
  // Every http(s) site: known services get their adapter, everything else
  // falls back to the generic <video> adapter. Attach stays lazy (only after
  // a room is active), so idle cost on unrelated pages is ~zero.
  matches: ['*://*/*'],
  main() {
    let roomActive = false;

    chrome.runtime.onMessage.addListener((msg) => {
      const m = msg as { cmd?: string; nonce?: string };
      if (m.cmd === 'duet:room-on') {
        roomActive = true;
        void attachWhenRoomActive(ADAPTERS, { nonce: m.nonce ?? '', rateNudge: true }, () => roomActive);
      }
      if (m.cmd === 'duet:room-off') {
        roomActive = false;
        detachAll();
      }
      // Resync: jump the local player to the room's expected position.
      // Attaches on demand — this is also the first real attach path (M2
      // will keep the loop attached for the whole room instead).
      if (m.cmd === 'duet:apply-state') {
        const s = msg as { position?: number; playing?: boolean };
        if (typeof s.position !== 'number') return;
        void (async () => {
          const handle = await attachWhenRoomActive(ADAPTERS, { nonce: '', rateNudge: true }, () => true);
          if (!handle) return;
          try {
            await handle.seek(Math.max(0, s.position ?? 0));
            if (s.playing) await handle.play();
            else handle.pause();
          } catch {
            /* player refused: manual-sync banner path (adapter handles it) */
          }
        })();
      }
    });
  },
});
