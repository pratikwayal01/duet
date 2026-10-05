import type { AdapterContext, PlayerAdapter, PlayerHandle } from '../types.ts';
import { MANUAL_SYNC_BANNER } from '../types.ts';
import { createGenericAdapter } from '../generic/adapter.ts';

// TODO [verify domains]: confirm exact JioHotstar (JioStar) watch domains and
// player behavior on the live site before relying on this (PRD §5.2).
// Candidates: hotstar.com, jiohotstar.com. ID extraction below assumes the
// last path segment is the title id — verify.
export const MANUAL_SYNC = MANUAL_SYNC_BANNER;

export const jiohotstarAdapter: PlayerAdapter = {
  id: 'jiohotstar',
  matches: (url: URL) =>
    url.hostname.endsWith('hotstar.com') || url.hostname.endsWith('jiohotstar.com'),
  titleId: (url: URL) => {
    const segs = url.pathname.split('/').filter(Boolean);
    const id = segs[segs.length - 1];
    return id ? `jiohotstar:${id}` : null;
  },
  // TODO [verify]: rebuild full locale/type path once URL scheme is confirmed.
  watchUrl: (titleId: string) => `https://www.hotstar.com/in/movies/${titleId.slice('jiohotstar:'.length)}`,
  // ponytail: delegates to generic until page-world path verified. rateNudge=false (§5.7).
  attach: (ctx: AdapterContext): Promise<PlayerHandle> =>
    createGenericAdapter('jiohotstar').attach({ ...ctx, rateNudge: false }),
};
