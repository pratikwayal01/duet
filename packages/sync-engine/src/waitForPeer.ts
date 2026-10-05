// Wait-for-peer buffering (PRD §5.2): if either side stalls, both pause;
// resume together only after both are healthy for a grace period (default 1.5s).

export const STALL_GRACE_MS = 1500;

export interface StallInput {
  localStalled: boolean;
  peerStalled: boolean;
}

export class WaitForPeer {
  private waiting = false;
  private healthySince = 0;

  constructor(
    private graceMs: number = STALL_GRACE_MS,
    private now: () => number = () => Date.now(),
  ) {}

  // Call each control-loop tick. Returns the desired joint playback state.
  update(input: StallInput): "play" | "wait" {
    const t = this.now();
    if (input.localStalled || input.peerStalled) {
      this.waiting = true;
      this.healthySince = t;
      return "wait";
    }
    if (!this.waiting) return "play";
    if (t - this.healthySince >= this.graceMs) {
      this.waiting = false;
      return "play";
    }
    return "wait";
  }

  get isWaiting(): boolean {
    return this.waiting;
  }

  reset(): void {
    this.waiting = false;
    this.healthySince = 0;
  }
}
