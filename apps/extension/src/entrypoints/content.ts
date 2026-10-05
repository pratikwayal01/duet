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
  // Mirrors host_permissions in wxt.config.ts (Chromium only, PRD D2).
  matches: [
    '*://*.netflix.com/*',
    '*://*.amazon.com/*',
    '*://*.amazon.in/*',
    '*://*.primevideo.com/*',
    '*://*.hotstar.com/*',
    '*://*.jiohotstar.com/*',
    '*://*.youtube.com/*',
  ],
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
    });
  },
});
