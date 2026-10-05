import { describe, expect, it } from "vitest";
import { ClockSync } from "../src/index.js";

describe("clock sync", () => {
  it("estimates offset assuming symmetric delay", () => {
    const c = new ClockSync();
    c.addSample(1000, 1050, 1100); // server exactly midway -> offset 0
    expect(c.getOffsetMs()).toBe(0);
    expect(c.getRttMs()).toBe(100);
  });

  it("detects clock skew", () => {
    const c = new ClockSync();
    c.addSample(1000, 2000, 1100); // server 950ms ahead
    expect(c.getOffsetMs()).toBe(950);
    expect(c.serverNow(1200)).toBe(2150);
  });

  it("trusts the lowest-RTT sample of the last 8", () => {
    const c = new ClockSync();
    c.addSample(0, 500, 1000); // rtt 1000, offset 0
    c.addSample(0, 60, 100); // rtt 100, offset 10
    c.addSample(0, 1000, 400); // rtt 400, offset 800
    expect(c.getOffsetMs()).toBe(10);
    expect(c.getRttMs()).toBe(100);
    expect(c.sampleCount).toBe(3);
  });

  it("keeps only the last 8 samples", () => {
    const c = new ClockSync();
    for (let i = 0; i < 10; i++) c.addSample(i * 1000, i * 1000 + 5, i * 1000 + 10);
    expect(c.sampleCount).toBe(8);
    expect(c.getOffsetMs()).toBe(0); // offset = 5 - (0+10)/2
  });

  it("ignores invalid samples and starts at zero offset", () => {
    const c = new ClockSync();
    expect(c.getOffsetMs()).toBe(0);
    expect(c.getRttMs()).toBeUndefined();
    c.addSample(2000, 1000, 1000); // t1 < t0
    c.addSample(NaN, 1, 2);
    expect(c.sampleCount).toBe(0);
  });
});
