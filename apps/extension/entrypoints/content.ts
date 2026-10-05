import { attachWhenRoomActive, detachAll } from '../src/content/attach.ts';
import { createGenericAdapter } from '../src/adapters/generic/adapter.ts';
import { netflixAdapter } from '../src/adapters/netflix/adapter.ts';
import { primeAdapter } from '../src/adapters/prime/adapter.ts';
import { jiohotstarAdapter } from '../src/adapters/jiohotstar/adapter.ts';
import { youtubeAdapter } from '../src/adapters/youtube/adapter.ts';

const ADAPTERS = [
  netflixAdapter,
  primeAdapter,
  jiohotstarAdapter,
  youtubeAdapter,
  createGenericAdapter(),
];

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
