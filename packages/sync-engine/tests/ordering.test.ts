import { describe, expect, it } from "vitest";
import { ClockSync, EchoGuard, decideCorrection, expectedPosition } from "../src/index.js";

// Property-ish: seeded fuzz over a simulated session. Invariants:
// 1. clock offset always equals the min-RTT sample's offset (recomputed independently)
// 2. expected position is monotonic in server time for a playing state
// 3. echo seqs are consumed at most once across reorderings
describe("session ordering invariants", () => {
  it("holds under randomized ping jitter, drift walk, and event reorder", () => {
    let seed = 1234;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    const clock = new ClockSync();
    const guard = new EchoGuard();
    const seen = new Set<number>();
    const samples: { offset: number; rtt: number }[] = [];

    let serverTime = 1_000_000;
    let lastPos = -Infinity;
    const state = { playing: true, position: 0, refServerTime: serverTime, rate: 1 };

    for (let i = 0; i < 300; i++) {
      // ping with random asymmetric jitter
      const t0 = serverTime - 500 + rand() * 50;
      const ts = serverTime + (rand() - 0.5) * 20;
      const t1 = t0 + 20 + rand() * 300;
      clock.addSample(t0, ts, t1);
      samples.push({ offset: ts - (t0 + t1) / 2, rtt: t1 - t0 });
      if (samples.length > 8) samples.shift();
      const min = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      expect(clock.getOffsetMs()).toBeCloseTo(min.offset, 9);

      // drift walk: position must stay monotonic in server time
      serverTime += Math.floor(rand() * 1000);
      const pos = expectedPosition(state, serverTime);
      expect(pos).toBeGreaterThanOrEqual(lastPos);
      lastPos = pos;
      const c = decideCorrection(pos - (state.position + (serverTime - state.refServerTime) / 1000) + (rand() - 0.5));
      expect(["ignore", "rate", "seek"]).toContain(c.kind);

      // echo tags under reorder: shuffle delivery, each consumed at most once
      if (i % 3 === 0) {
        const seqs = [guard.issue(), guard.issue(), guard.issue()];
        for (const s of [...seqs].reverse()) {
          if (seen.has(s)) {
            expect(guard.isEcho(s)).toBe(false);
          } else {
            expect(guard.isEcho(s)).toBe(true);
            seen.add(s);
          }
        }
      }
    }
    expect(clock.sampleCount).toBe(8);
  });
});
