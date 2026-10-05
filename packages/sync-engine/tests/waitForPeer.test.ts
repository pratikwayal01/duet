import { describe, expect, it } from "vitest";
import { STALL_GRACE_MS, WaitForPeer } from "../src/index.js";

describe("wait-for-peer", () => {
  it("pauses both when either side stalls, resumes after the grace period", () => {
    let t = 0;
    const w = new WaitForPeer(STALL_GRACE_MS, () => t);
    expect(w.update({ localStalled: false, peerStalled: false })).toBe("play");

    t = 1000;
    expect(w.update({ localStalled: true, peerStalled: false })).toBe("wait");
    expect(w.isWaiting).toBe(true);

    t = 2000; // peer recovered but grace (1.5s since last stall at t=1000) not met
    expect(w.update({ localStalled: false, peerStalled: false })).toBe("wait");

    t = 2500; // 1500ms of continuous health -> resume together
    expect(w.update({ localStalled: false, peerStalled: false })).toBe("play");
    expect(w.isWaiting).toBe(false);
  });

  it("peer stalls also pause, and a restall resets the grace clock", () => {
    let t = 0;
    const w = new WaitForPeer(STALL_GRACE_MS, () => t);
    expect(w.update({ localStalled: false, peerStalled: true })).toBe("wait");
    t = 1400;
    expect(w.update({ localStalled: false, peerStalled: false })).toBe("wait");
    t = 1450;
    expect(w.update({ localStalled: false, peerStalled: true })).toBe("wait"); // restall resets
    t = 2900; // only 1450ms healthy since restall
    expect(w.update({ localStalled: false, peerStalled: false })).toBe("wait");
    t = 2950;
    expect(w.update({ localStalled: false, peerStalled: false })).toBe("play");
  });
});
