// Adapter contract per PRD §7.3. Canonical home for drift thresholds until
// packages/sync-engine exists — control-loop imports from here.
// ponytail: local copy of thresholds; sync-engine becomes canonical in M1.

export type PlayerEvent =
  | 'play'
  | 'pause'
  | 'seek'
  | 'rate'
  | 'buffering'
  | 'ended'
  | 'navigated';

export interface PlayerState {
  position: number; // seconds
  playing: boolean;
  rate: number;
  buffering: boolean;
  isAd?: boolean;
}

export interface AdapterContext {
  /** Per-session nonce for the page-world postMessage bridge. */
  nonce: string;
  /** False on Netflix/Prime/JioHotstar until rate changes are proven safe (PRD §5.7). */
  rateNudge: boolean;
}

export interface PlayerHandle {
  getState(): PlayerState;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): Promise<void>;
  setRate(r: number): void;
  on(event: PlayerEvent, cb: () => void): () => void;
  destroy(): void;
}

export interface PlayerAdapter {
  id: string;
  matches(url: URL): boolean;
  /** Canonical, comparable across both users, e.g. "netflix:81234567". */
  titleId(url: URL): string | null;
  /** For the "Go to what they're watching" same-title check (PRD §5.2). */
  watchUrl(titleId: string): string;
  /** Finds player, survives SPA nav. */
  attach(ctx: AdapterContext): Promise<PlayerHandle>;
}

/** Drift policy (PRD §5.2): ignore <0.3s, nudge 0.3–2s, hard-seek >2s. */
export const DRIFT = {
  ignoreSec: 0.3,
  seekSec: 2.0,
  nudgeDown: 0.95,
  nudgeUp: 1.05,
  loopMs: 500,
} as const;

/** Shown when an adapter can't drive the player (PRD §7.3). */
export const MANUAL_SYNC_BANNER =
  "Can't control this player — use the Resync button, or keep playback in step manually.";
