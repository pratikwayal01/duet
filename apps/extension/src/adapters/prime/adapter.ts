import type { AdapterContext, PlayerAdapter, PlayerHandle } from '../types.ts';
import { MANUAL_SYNC_BANNER } from '../types.ts';
import { createGenericAdapter } from '../generic/adapter.ts';

// Prime Video: drive via page-world bridge (postMessage + nonce) once the
// player API is confirmed on the live site. Manual-sync fallback: banner below.
// TODO: confirm exact watch-URL shapes across locales (amazon.*/detail, /dp/, primevideo.com).
export const MANUAL_SYNC = MANUAL_SYNC_BANNER;

function asin(url: URL): string | null {
  const m = url.pathname.match(/\/(?:gp\/video\/detail|dp)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

export const primeAdapter: PlayerAdapter = {
  id: 'prime',
  matches: (url: URL) =>
    (/(^|\.)amazon\./.test(url.hostname) || url.hostname.endsWith('primevideo.com')) &&
    /\/(?:gp\/video\/detail|dp)\/[A-Z0-9]{10}/i.test(url.pathname),
  titleId: (url: URL) => {
    const id = asin(url);
    // gtv/detail pages without an ASIN in path: fall back to full path.
    return id ? `prime:${id}` : null;
  },
  watchUrl: (titleId: string) =>
    `https://www.amazon.com/gp/video/detail/${titleId.slice('prime:'.length)}`,
  // ponytail: delegates to generic until page-world path verified. rateNudge=false (§5.7).
  attach: (ctx: AdapterContext): Promise<PlayerHandle> =>
    createGenericAdapter('prime').attach({ ...ctx, rateNudge: false }),
};
