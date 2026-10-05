import type { PlayerHandle } from '../adapters/types.ts';
import { DRIFT } from '../adapters/types.ts';

export interface ExpectedState {
  position: number; // peer-authoritative expectation, seconds
  playing: boolean;
  rate: number;
}

export interface LoopHooks {
  /** Current expectation from room state. */
  getExpected: () => ExpectedState;
  /** Send local intent (play/pause/seek/rate) with lastSeenRev. */
  send: (msg: { type: 'play' | 'pause' | 'seek' | 'rate'; position: number; seq: number }) => void;
  rateNudge: boolean;
}

// ponytail: single setInterval owned here; service worker stays event-driven.
// Control loop runs only while room active + video playing; paused on hidden tab.

export function createControlLoop(handle: PlayerHandle, hooks: LoopHooks) {
  let timer: number | undefined;
  let seq = 0;
  // Echo suppression: programmatic actions are seq-tagged; DOM events fired
  // within the guard window after our own action are ignored (PRD §5.2).
  let echoUntil = 0;
  const ECHO_GUARD_MS = 400;

  const markEcho = () => {
    echoUntil = Date.now() + ECHO_GUARD_MS;
  };
  const isEcho = () => Date.now() < echoUntil;

  const tick = () => {
    if (document.hidden) return; // visibility pause; resume handled by listener
    const s = handle.getState();
    const exp = hooks.getExpected();
    if (s.buffering || !exp.playing) return; // wait-for-peer handled by room state
    const drift = s.position - exp.position;
    const abs = Math.abs(drift);
    if (abs < DRIFT.ignoreSec) {
      if (s.rate !== exp.rate) {
        markEcho();
        handle.setRate(exp.rate);
      }
      return;
    }
    if (abs < DRIFT.seekSec && hooks.rateNudge) {
      markEcho();
      handle.setRate(exp.rate * (drift > 0 ? DRIFT.nudgeDown : DRIFT.nudgeUp));
      return;
    }
    markEcho();
    void handle.seek(exp.position);
  };

  const onVis = () => {
    if (document.hidden) stop();
    else start();
  };

  function start() {
    if (timer !== undefined || typeof window === 'undefined') return;
    timer = window.setInterval(tick, DRIFT.loopMs);
    document.addEventListener('visibilitychange', onVis);
  }

  function stop() {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
  }

  // Local user actions → tagged intents; our own echo back is suppressed.
  const unsubs = [
    handle.on('play', () => {
      if (isEcho()) return;
      hooks.send({ type: 'play', position: handle.getState().position, seq: ++seq });
    }),
    handle.on('pause', () => {
      if (isEcho()) return;
      hooks.send({ type: 'pause', position: handle.getState().position, seq: ++seq });
    }),
    handle.on('seek', () => {
      if (isEcho()) return;
      hooks.send({ type: 'seek', position: handle.getState().position, seq: ++seq });
    }),
  ];

  return {
    start,
    stop,
    /** Apply a remote intent; suppresses the resulting DOM echo. */
    applyRemote: (type: 'play' | 'pause' | 'seek' | 'rate', position: number, rate = 1) => {
      markEcho();
      if (type === 'play') void handle.play();
      else if (type === 'pause') handle.pause();
      else if (type === 'seek') void handle.seek(position);
      else handle.setRate(rate);
    },
    destroy: () => {
      stop();
      unsubs.forEach((off) => off());
    },
  };
}
