import { describe, expect, it } from "vitest";
import { IDLE_EXPIRY_MS, REJOIN_WINDOW_MS, RoomCore } from "../src/index.js";

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("2-participant cap", () => {
  it("lets host + guest in, rejects a third with room-full", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    expect(rooms.createRoom("r", "alice")).toMatchObject({ ok: true, role: "host" });
    expect(rooms.joinRoom("r", "bob")).toMatchObject({ ok: true, role: "guest" });
    expect(rooms.joinRoom("r", "mallory")).toEqual({ ok: false, error: "room-full" });
    expect(rooms.memberCount("r")).toBe(2);
  });

  it("frees the seat on leave", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.joinRoom("r", "bob");
    rooms.leaveRoom("r", "bob");
    expect(rooms.joinRoom("r", "mallory")).toMatchObject({ ok: true, role: "guest" });
  });

  it("returns not-found for unknown rooms and duplicate creates fail", () => {
    const rooms = new RoomCore({ now: clock().now });
    expect(rooms.joinRoom("nope", "x")).toEqual({ ok: false, error: "not-found" });
    expect(rooms.createRoom("r", "a").ok).toBe(true);
    expect(rooms.createRoom("r", "b")).toEqual({ ok: false, error: "exists" });
  });
});

describe("roles and controller lock", () => {
  it("defaults to both-can-control; host lock blocks guests but not host", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.joinRoom("r", "bob");
    expect(rooms.sendIntent("r", "bob", { op: "play", lastSeenRev: 0 }).ok).toBe(true);
    expect(rooms.setControllerLock("r", "bob", "host")).toEqual({ ok: false, error: "not-host" });
    expect(rooms.setControllerLock("r", "alice", "host").ok).toBe(true);
    expect(rooms.sendIntent("r", "bob", { op: "pause", lastSeenRev: 1 })).toEqual({ ok: false, error: "not-controller" });
    expect(rooms.sendIntent("r", "alice", { op: "pause", lastSeenRev: 1 }).ok).toBe(true);
    expect(rooms.setControllerLock("r", "alice", "both").ok).toBe(true);
    expect(rooms.sendIntent("r", "bob", { op: "play", lastSeenRev: 2 }).ok).toBe(true);
  });
});

describe("intent handling", () => {
  it("stamps monotonic revs with controllerId and advances position by clock", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    const play = rooms.sendIntent("r", "alice", { op: "play", lastSeenRev: 0, position: 10 });
    expect(play).toMatchObject({ ok: true, state: { rev: 1, playing: true, position: 10, controllerId: "alice" } });
    c.advance(5000);
    const pause = rooms.sendIntent("r", "alice", { op: "pause", lastSeenRev: 1 });
    expect(pause).toMatchObject({ ok: true, state: { rev: 2, playing: false, position: 15 } });
  });

  it("last-writer-wins inside the intent window: pause then seek ends on seek", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.joinRoom("r", "bob");
    c.advance(10); // well inside the 150ms window
    expect(rooms.sendIntent("r", "alice", { op: "pause", lastSeenRev: 0 }).ok).toBe(true);
    c.advance(10);
    const s = rooms.sendIntent("r", "bob", { op: "seek", lastSeenRev: 0, position: 120 });
    expect(s).toMatchObject({ ok: true, state: { rev: 2, position: 120 } });
    expect(rooms.getState("r")).toMatchObject({ rev: 2, position: 120 });
  });

  it("accepts stale lastSeenRev (no flip-flop rejection) and validates ops", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.sendIntent("r", "alice", { op: "play", lastSeenRev: 0, position: 5 });
    const stale = rooms.sendIntent("r", "alice", { op: "seek", lastSeenRev: 0, position: 50 });
    expect(stale).toMatchObject({ ok: true, state: { rev: 2, position: 50 } });
    expect(rooms.sendIntent("r", "alice", { op: "seek", lastSeenRev: 2 })).toEqual({ ok: false, error: "bad-intent" });
    expect(rooms.sendIntent("r", "alice", { op: "rate", lastSeenRev: 2, rate: -1 })).toEqual({
      ok: false,
      error: "bad-intent",
    });
    expect(rooms.sendIntent("r", "alice", { op: "navigate", lastSeenRev: 2, titleId: "nf:123" })).toMatchObject({
      ok: true,
      state: { titleId: "nf:123", playing: false, position: 0 },
    });
  });
});

describe("rate limits", () => {
  it("allows 20 intents/s per client, rejects the 21st, recovers after 1s", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    for (let i = 0; i < 20; i++) {
      const r = rooms.sendIntent("r", "alice", { op: "seek", lastSeenRev: i, position: i });
      expect(r.ok).toBe(true);
    }
    expect(rooms.sendIntent("r", "alice", { op: "seek", lastSeenRev: 20, position: 20 })).toEqual({
      ok: false,
      error: "rate-limited",
    });
    c.advance(1000);
    expect(rooms.sendIntent("r", "alice", { op: "seek", lastSeenRev: 20, position: 20 }).ok).toBe(true);
  });

  it("limits are per-client", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.joinRoom("r", "bob");
    for (let i = 0; i < 20; i++) rooms.sendIntent("r", "alice", { op: "seek", lastSeenRev: i, position: i });
    expect(rooms.sendIntent("r", "bob", { op: "play", lastSeenRev: 20 }).ok).toBe(true);
  });
});

describe("idle expiry and rejoin", () => {
  it("purges rooms idle past 12h", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    c.advance(IDLE_EXPIRY_MS + 1);
    expect(rooms.purgeExpired()).toEqual(["r"]);
    expect(rooms.getState("r")).toBeUndefined();
    expect(rooms.joinRoom("r", "alice")).toEqual({ ok: false, error: "not-found" });
  });

  it("restores role and state on rejoin inside 10min", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.joinRoom("r", "bob");
    rooms.sendIntent("r", "alice", { op: "play", lastSeenRev: 0, position: 42 });
    rooms.leaveRoom("r", "bob");
    c.advance(REJOIN_WINDOW_MS - 1000);
    expect(rooms.joinRoom("r", "bob")).toMatchObject({ ok: true, role: "guest", state: { rev: 1, position: 42 } });
  });

  it("treats a rejoin past 10min as new (seat may be taken)", () => {
    const c = clock();
    const rooms = new RoomCore({ now: c.now });
    rooms.createRoom("r", "alice");
    rooms.joinRoom("r", "bob");
    rooms.leaveRoom("r", "bob");
    c.advance(REJOIN_WINDOW_MS + 1);
    rooms.joinRoom("r", "mallory"); // takes the free guest seat
    expect(rooms.joinRoom("r", "bob")).toEqual({ ok: false, error: "room-full" });
  });
});
