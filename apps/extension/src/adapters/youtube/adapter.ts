import type { AdapterContext, PlayerAdapter, PlayerHandle } from '../types.ts';
import { createGenericAdapter } from '../generic/adapter.ts';

// YouTube: plain <video> seeks are safe here, so generic delegation is the
// real path (not just a stub). P1: detect ad playback and skip pushing
// ad positions to the peer (PRD §5.2).
export const youtubeAdapter: PlayerAdapter = {
  id: 'youtube',
  matches: (url: URL) =>
    (url.hostname.endsWith('youtube.com') || url.hostname === 'youtu.be') &&
    (url.pathname === '/watch' || url.hostname === 'youtu.be'),
  titleId: (url: URL) => {
    const v = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    return v ? `youtube:${v}` : null;
  },
  watchUrl: (titleId: string) => `https://www.youtube.com/watch?v=${titleId.slice('youtube:'.length)}`,
  attach: (ctx: AdapterContext): Promise<PlayerHandle> =>
    createGenericAdapter('youtube').attach(ctx),
};
