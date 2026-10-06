import { describe, expect, it } from "vitest";
import { MESSAGE_TYPES, PROTOCOL_VERSION, parseMessage, isKnownType } from "../src/index.js";

const base = { v: PROTOCOL_VERSION, id: "m1" } as const;

describe("valid messages", () => {
  it("accepts one of every known type", () => {
    const samples = [
      { ...base, t: "hello", clientId: "c1" },
      { ...base, t: "join", roomId: "r1" },
      { ...base, t: "leave", roomId: "r1" },
      { ...base, t: "intent", roomId: "r1", op: "play", lastSeenRev: 0 },
      {
        ...base,
        t: "state",
        roomId: "r1",
        state: { rev: 1, titleId: "yt:abc", playing: true, position: 12.5, refServerTime: 1000, rate: 1, controllerId: "c1" },
      },
      { ...base, t: "chat", roomId: "r1", from: "alice", body: "hi", ts: 1000 },
      { ...base, t: "ping", clientTime: 1000 },
      { ...base, t: "pong", clientTime: 1000, serverTime: 1001 },
      { ...base, t: "ice-offer", roomId: "r1", from: "c1", sdp: "v=0" },
      { ...base, t: "ice-answer", roomId: "r1", from: "c1", sdp: "v=0" },
      { ...base, t: "ice-candidate", roomId: "r1", from: "c1", candidate: "cand" },
      { ...base, t: "control", roomId: "r1", command: "duck", args: { level: 0.3 } },
      { ...base, t: "knock", roomId: "r1", clientId: "c2", name: "Bob" },
      { ...base, t: "knocking", roomId: "r1" },
      { ...base, t: "admit", roomId: "r1", target: "c2" },
      { ...base, t: "deny", roomId: "r1", target: "c2" },
    ];
    expect(samples).toHaveLength(MESSAGE_TYPES.length);
    for (const s of samples) {
      const r = parseMessage(s);
      expect(r.ok, JSON.stringify(s)).toBe(true);
    }
  });
});

describe("invalid messages", () => {
  it("rejects non-objects and envelopes missing v/t/id", () => {
    expect(parseMessage(null).ok).toBe(false);
    expect(parseMessage("x")).toEqual({ ok: false, reason: "not-object" });
    expect(parseMessage({ t: "ping", id: "m1" })).toEqual({ ok: false, reason: "bad-envelope" });
    expect(parseMessage({ v: 1, t: "ping" })).toEqual({ ok: false, reason: "bad-envelope" });
  });

  it("rejects wrong versions", () => {
    expect(parseMessage({ v: 2, t: "ping", id: "m1", clientTime: 1 })).toEqual({ ok: false, reason: "bad-version" });
    expect(parseMessage({ v: 0, t: "ping", id: "m1", clientTime: 1 })).toEqual({ ok: false, reason: "bad-version" });
  });

  it("rejects bad payloads with issues", () => {
    const r = parseMessage({ ...base, t: "intent", roomId: "r1", op: "dance", lastSeenRev: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid-payload");
    expect(parseMessage({ ...base, t: "seek", position: 1 }).ok).toBe(false); // unknown type, not a message
    expect(parseMessage({ ...base, t: "chat", roomId: "r1", from: "a", body: "", ts: 1 }).ok).toBe(false);
  });

  it("rejects oversized messages", () => {
    const r = parseMessage({ ...base, t: "chat", roomId: "r1", from: "a", body: "x".repeat(100_000), ts: 1 });
    expect(r).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("forward compatibility", () => {
  it("flags unknown types instead of throwing so callers can ignore them", () => {
    const r = parseMessage({ v: PROTOCOL_VERSION, t: "hologram", id: "m9", whatever: true });
    expect(r).toEqual({ ok: false, reason: "unknown-type" });
    expect(isKnownType("hologram")).toBe(false);
    expect(isKnownType("ping")).toBe(true);
  });
});
