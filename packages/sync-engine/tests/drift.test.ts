import { describe, expect, it } from "vitest";
import {
  DRIFT_IGNORE_S,
  DRIFT_SEEK_S,
  decideCorrection,
  defaultDriftConfig,
  expectedPosition,
  isRateNudgeDisabledByDefault,
} from "../src/index.js";

describe("drift policy", () => {
  it("ignores drift under 0.3s", () => {
    expect(decideCorrection(0)).toEqual({ kind: "ignore" });
    expect(decideCorrection(0.29)).toEqual({ kind: "ignore" });
    expect(decideCorrection(-0.29)).toEqual({ kind: "ignore" });
    expect(decideCorrection(NaN)).toEqual({ kind: "ignore" });
  });

  it("rate-nudges for 0.3–2s: speed up when behind, slow down when ahead", () => {
    expect(decideCorrection(-0.3)).toEqual({ kind: "rate", rate: 1.05 });
    expect(decideCorrection(1.0)).toEqual({ kind: "rate", rate: 0.95 });
    expect(decideCorrection(-2.0)).toEqual({ kind: "rate", rate: 1.05 });
    expect(decideCorrection(2.0)).toEqual({ kind: "rate", rate: 0.95 });
  });

  it("hard-seeks above 2s", () => {
    expect(decideCorrection(2.01)).toEqual({ kind: "seek" });
    expect(decideCorrection(-30)).toEqual({ kind: "seek" });
  });

  it("falls back to small seeks when rate nudging is disabled", () => {
    const off = { rateNudgeDisabled: true };
    expect(decideCorrection(1.0, off)).toEqual({ kind: "seek" });
    expect(decideCorrection(-1.0, off)).toEqual({ kind: "seek" });
    expect(decideCorrection(0.1, off)).toEqual({ kind: "ignore" });
    expect(decideCorrection(5, off)).toEqual({ kind: "seek" });
  });

  it("disables rate nudging by default on netflix/prime/jiohotstar", () => {
    for (const s of ["netflix", "prime", "jiohotstar", "Netflix"]) {
      expect(isRateNudgeDisabledByDefault(s)).toBe(true);
      expect(defaultDriftConfig(s)).toEqual({ rateNudgeDisabled: true });
    }
    expect(isRateNudgeDisabledByDefault("youtube")).toBe(false);
    expect(defaultDriftConfig("youtube")).toEqual({ rateNudgeDisabled: false });
    expect(defaultDriftConfig()).toEqual({ rateNudgeDisabled: false });
    expect(DRIFT_IGNORE_S).toBe(0.3);
    expect(DRIFT_SEEK_S).toBe(2.0);
  });
});

describe("expected position", () => {
  it("advances playing state by rate, freezes paused", () => {
    expect(expectedPosition({ playing: true, position: 10, refServerTime: 1000, rate: 1 }, 6000)).toBe(15);
    expect(expectedPosition({ playing: true, position: 10, refServerTime: 1000, rate: 2 }, 6000)).toBe(20);
    expect(expectedPosition({ playing: false, position: 10, refServerTime: 1000, rate: 1 }, 999999)).toBe(10);
  });
});
