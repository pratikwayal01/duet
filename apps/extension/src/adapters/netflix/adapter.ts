import type { AdapterContext, PlayerAdapter, PlayerHandle } from '../types.ts';
import { MANUAL_SYNC_BANNER, matchesDomain } from '../types.ts';
import { createGenericAdapter } from '../generic/adapter.ts';

// Netflix: direct currentTime seeks break the player — drive it via the
// page-world bridge (window.postMessage + per-session nonce, see page-bridge.ts).
// Verify seek approach against the live player API before relying on it.
// Manual-sync fallback: banner below.
export const MANUAL_SYNC = MANUAL_SYNC_BANNER;

function numericId(url: URL): string | null {
  const m = url.pathname.match(/\/watch\/(\d+)/);
  return m ? m[1] : null;
}

export const netflixAdapter: PlayerAdapter = {
  id: 'netflix',
  matches: (url: URL) => matchesDomain(url.hostname, 'netflix.com') && url.pathname.startsWith('/watch/'),
  titleId: (url: URL) => {
    const id = numericId(url);
    return id ? `netflix:${id}` : null;
  },
  watchUrl: (titleId: string) => `https://www.netflix.com/watch/${titleId.slice('netflix:'.length)}`,
  // ponytail: delegates to generic until the page-world seek path is verified.
  // rateNudge=false (PRD §5.7: rate changes can trigger quality/buffering side effects).
  attach: (ctx: AdapterContext): Promise<PlayerHandle> =>
    createGenericAdapter('netflix').attach({ ...ctx, rateNudge: false }),
};
