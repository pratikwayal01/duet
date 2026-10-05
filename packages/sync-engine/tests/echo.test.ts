import { describe, expect, it } from "vitest";
import { EchoGuard } from "../src/index.js";

describe("echo suppression", () => {
  it("consumes each seq exactly once; unknown seqs are not echoes", () => {
    const g = new EchoGuard();
    const a = g.issue();
    const b = g.issue();
    expect(g.pendingCount).toBe(2);
    expect(g.isEcho(a)).toBe(true);
    expect(g.isEcho(a)).toBe(false); // second arrival is not our echo anymore
    expect(g.isEcho(999)).toBe(false);
    expect(g.isEcho(b)).toBe(true);
    expect(g.pendingCount).toBe(0);
  });

  it("property-ish: random issue/consume interleavings keep at-most-once semantics", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 20; trial++) {
      const g = new EchoGuard();
      const issued: number[] = [];
      const consumed = new Set<number>();
      let trueCount = 0;
      for (let i = 0; i < 200; i++) {
        if (rand() < 0.5 || issued.length === 0) {
          issued.push(g.issue());
        } else {
          const seq = rand() < 0.8 ? issued[Math.floor(rand() * issued.length)] : 1_000_000 + i;
          const echo = g.isEcho(seq);
          if (echo) {
            expect(consumed.has(seq)).toBe(false); // never consumed twice
            consumed.add(seq);
            trueCount++;
          } else {
            // false means: never issued, or already consumed
            expect(!issued.includes(seq) || consumed.has(seq)).toBe(true);
          }
        }
      }
      expect(g.pendingCount).toBe(issued.length - trueCount);
    }
  });
});
