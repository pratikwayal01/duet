// Structural subset of the protocol PlaybackState (kept local: no cross-package
// dep, no platform imports). Expected position for a playing state (PRD §7.2):
//   position + (serverNow - refServerTime) * rate

export interface PlaybackStateLike {
  playing: boolean;
  position: number;
  refServerTime: number;
  rate: number;
}

export function expectedPosition(state: PlaybackStateLike, serverNowMs: number): number {
  if (!state.playing) return state.position;
  return state.position + ((serverNowMs - state.refServerTime) / 1000) * state.rate;
}
