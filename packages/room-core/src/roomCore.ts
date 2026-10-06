import type { IntentInput, LockMode, PlaybackState, Result, Role } from "./types.js";

export const MAX_PARTICIPANTS = 2;
export const INTENT_WINDOW_MS = 150; // concurrent intents inside this window resolve by last-writer-wins
export const MAX_MESSAGES_PER_SECOND = 20;
export const IDLE_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12h, PRD §5.1
export const REJOIN_WINDOW_MS = 10 * 60 * 1000; // 10min, PRD §5.1
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous, no 0/O/1/I
export const CODE_LENGTH = 6;

// Short invite codes live in the signal adapters (pending map for lazy
// rooms), not here: this class only tracks admitted state.

export interface RoomCoreOptions {
  now?: () => number;
  idleExpiryMs?: number;
  rejoinWindowMs?: number;
  intentWindowMs?: number;
  maxMessagesPerSecond?: number;
}

interface Member {
  clientId: string;
  role: Role;
  approved: boolean; // false = knocking, waiting for host admit
  displayName?: string;
}

interface Room {
  id: string;
  members: Map<string, Member>;
  departed: Map<string, { role: Role; approved: boolean; leftAt: number; displayName?: string }>;
  state: PlaybackState;
  lock: LockMode;
  createdAt: number;
  lastActivityAt: number;
  lastIntentAt: number;
}

// Platform-agnostic room server state machine (no I/O, no timers).
// One instance holds many rooms; clock is injectable for tests.
export class RoomCore {
  private rooms = new Map<string, Room>();
  private sendTimes = new Map<string, number[]>(); // clientId -> intent timestamps (sliding 1s window)
  private readonly clock: () => number;
  private readonly idleExpiryMs: number;
  private readonly rejoinWindowMs: number;
  readonly intentWindowMs: number;
  private readonly maxPerSecond: number;

  constructor(opts: RoomCoreOptions = {}) {
    this.clock = opts.now ?? (() => Date.now());
    this.idleExpiryMs = opts.idleExpiryMs ?? IDLE_EXPIRY_MS;
    this.rejoinWindowMs = opts.rejoinWindowMs ?? REJOIN_WINDOW_MS;
    this.intentWindowMs = opts.intentWindowMs ?? INTENT_WINDOW_MS;
    this.maxPerSecond = opts.maxMessagesPerSecond ?? MAX_MESSAGES_PER_SECOND;
  }

  createRoom(roomId: string, hostId: string, displayName?: string): Result<{ role: Role; state: PlaybackState }> {
    const now = this.clock();
    const existing = this.rooms.get(roomId);
    if (existing && !this.isExpired(existing, now)) return { ok: false, error: "exists" };
    const room: Room = {
      id: roomId,
      members: new Map([[hostId, { clientId: hostId, role: "host", approved: true, displayName }]]),
      departed: new Map(),
      state: { rev: 0, titleId: "", playing: false, position: 0, refServerTime: now, rate: 1, controllerId: hostId },
      lock: "both",
      createdAt: now,
      lastActivityAt: now,
      lastIntentAt: 0,
    };
    this.rooms.set(roomId, room);
    return { ok: true, role: "host", state: { ...room.state } };
  }

  joinRoom(
    roomId: string,
    clientId: string,
    displayName?: string,
  ): Result<{ role: Role; state?: PlaybackState; knocking?: boolean }> {
    const now = this.clock();
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, now)) {
      if (room) this.rooms.delete(roomId);
      return { ok: false, error: "not-found" };
    }
    const active = room.members.get(clientId);
    if (active) {
      if (displayName !== undefined) active.displayName = displayName;
      room.lastActivityAt = now;
      if (!active.approved) return { ok: true, role: active.role, knocking: true };
      return { ok: true, role: active.role, state: { ...room.state } };
    }
    // Rejoin inside the window restores role and approval (PRD §5.1). A
    // denied guest knocks again instead of walking back in.
    const prev = room.departed.get(clientId);
    if (prev && now - prev.leftAt <= this.rejoinWindowMs) {
      if (room.members.size >= MAX_PARTICIPANTS && !this.freesSeat(room, prev.role)) {
        return { ok: false, error: "room-full" };
      }
      room.departed.delete(clientId);
      room.members.set(clientId, { clientId, role: prev.role, approved: prev.approved, displayName: displayName ?? prev.displayName });
      room.lastActivityAt = now;
      if (!prev.approved) return { ok: true, role: prev.role, knocking: true };
      return { ok: true, role: prev.role, state: { ...room.state } };
    }
    if (prev) room.departed.delete(clientId); // window lapsed: treat as new
    if (room.members.size >= MAX_PARTICIPANTS) return { ok: false, error: "room-full" };
    // Someone approved is already here: knock, don't walk in. The host
    // admits or denies; the waiter gets no state until then.
    const hasApproved = [...room.members.values()].some((m) => m.approved);
    if (hasApproved) {
      room.members.set(clientId, { clientId, role: "guest", approved: false, displayName });
      room.lastActivityAt = now;
      return { ok: true, role: "guest", knocking: true };
    }
    // Empty room (host gone): first active member holds the host seat.
    const role: Role = [...room.members.values()].some((m) => m.role === "host") ? "guest" : "host";
    room.members.set(clientId, { clientId, role, approved: true, displayName });
    room.lastActivityAt = now;
    return { ok: true, role, state: { ...room.state } };
  }

  // Host admits a knocking guest. Returns fresh state for both sides.
  admit(roomId: string, approverId: string, targetId: string): Result<{ state: PlaybackState }> {
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, this.clock())) return { ok: false, error: "not-found" };
    const approver = room.members.get(approverId);
    if (!approver || !approver.approved) return { ok: false, error: "not-in-room" };
    if (approver.role !== "host") return { ok: false, error: "not-host" };
    const target = room.members.get(targetId);
    if (!target || target.approved) return { ok: false, error: "not-knocking" };
    target.approved = true;
    target.role = "guest";
    room.lastActivityAt = this.clock();
    return { ok: true, state: { ...room.state } };
  }

  // Host denies a knocking guest. They leave no approved seat behind; a
  // rejoin knocks again instead of restoring.
  deny(roomId: string, approverId: string, targetId: string): Result<{ state: PlaybackState }> {
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, this.clock())) return { ok: false, error: "not-found" };
    const approver = room.members.get(approverId);
    if (!approver || !approver.approved) return { ok: false, error: "not-in-room" };
    if (approver.role !== "host") return { ok: false, error: "not-host" };
    const target = room.members.get(targetId);
    if (!target || target.approved) return { ok: false, error: "not-knocking" };
    room.members.delete(targetId);
    room.departed.set(targetId, { role: "guest", approved: false, leftAt: this.clock(), displayName: target.displayName });
    room.lastActivityAt = this.clock();
    return { ok: true, state: { ...room.state } };
  }

  // Short invite codes for lazy (not-yet-created) rooms live in the signal
  // adapters' pending maps; once a room exists, its full id is the key.
  // CODE_ALPHABET/CODE_LENGTH are shared here so both adapters agree.

  leaveRoom(roomId: string, clientId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const member = room.members.get(clientId);
    if (!member) return;
    room.members.delete(clientId);
    room.departed.set(clientId, { role: member.role, approved: member.approved, leftAt: this.clock(), displayName: member.displayName });
    room.lastActivityAt = this.clock();
  }

  setControllerLock(roomId: string, clientId: string, lock: LockMode): Result<{ locked: LockMode }> {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: "not-found" };
    const member = room.members.get(clientId);
    if (!member || !member.approved) return { ok: false, error: "not-in-room" };
    if (member.role !== "host") return { ok: false, error: "not-host" };
    room.lock = lock;
    room.lastActivityAt = this.clock();
    return { ok: true, locked: lock };
  }

  // Apply a playback intent. Concurrent intents inside the intent window resolve by
  // last-writer-wins: no stale-rev rejection, each accepted intent stamps rev+1.
  sendIntent(roomId: string, clientId: string, input: IntentInput): Result<{ state: PlaybackState }> {
    const now = this.clock();
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, now)) {
      if (room) this.rooms.delete(roomId);
      return { ok: false, error: "not-found" };
    }
    const member = room.members.get(clientId);
    if (!member || !member.approved) return { ok: false, error: "not-in-room" };
    if (!this.consumeRate(clientId, now)) return { ok: false, error: "rate-limited" };
    if (room.lock === "host" && member.role !== "host") return { ok: false, error: "not-controller" };
    if (!this.validateIntent(input)) return { ok: false, error: "bad-intent" };
    room.state = this.applyOp(room.state, input, clientId, now);
    room.lastIntentAt = now;
    room.lastActivityAt = now;
    return { ok: true, state: { ...room.state } };
  }

  getState(roomId: string): PlaybackState | undefined {
    const room = this.rooms.get(roomId);
    if (!room || this.isExpired(room, this.clock())) return undefined;
    return { ...room.state };
  }

  getLock(roomId: string): LockMode | undefined {
    return this.rooms.get(roomId)?.lock;
  }

  memberCount(roomId: string): number {
    return this.rooms.get(roomId)?.members.size ?? 0;
  }

  approvedCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    let n = 0;
    for (const m of room.members.values()) if (m.approved) n++;
    return n;
  }

  // Remove rooms idle past the expiry. Returns purged room ids.
  purgeExpired(): string[] {
    const now = this.clock();
    const purged: string[] = [];
    for (const [id, room] of this.rooms) {
      if (this.isExpired(room, now)) {
        this.rooms.delete(id);
        purged.push(id);
      } else {
        // Housekeeping: drop lapsed rejoin seats and old rate windows.
        for (const [cid, d] of room.departed) {
          if (now - d.leftAt > this.rejoinWindowMs) room.departed.delete(cid);
        }
      }
    }
    for (const [cid, times] of this.sendTimes) {
      const kept = times.filter((t) => now - t < 1000);
      if (kept.length === 0) this.sendTimes.delete(cid);
      else this.sendTimes.set(cid, kept);
    }
    return purged;
  }

  private isExpired(room: Room, now: number): boolean {
    return now - room.lastActivityAt > this.idleExpiryMs;
  }

  // A rejoiner with a prior seat takes it back even at cap (kicks nobody: only
  // possible when their own seat is what fills the room, else room-full).
  private freesSeat(room: Room, role: Role): boolean {
    if (room.members.size < MAX_PARTICIPANTS) return true;
    if (role === "host" && ![...room.members.values()].some((m) => m.role === "host")) return true;
    return false;
  }

  private consumeRate(clientId: string, now: number): boolean {
    const times = (this.sendTimes.get(clientId) ?? []).filter((t) => now - t < 1000);
    if (times.length >= this.maxPerSecond) {
      this.sendTimes.set(clientId, times);
      return false;
    }
    times.push(now);
    this.sendTimes.set(clientId, times);
    return true;
  }

  private validateIntent(input: IntentInput): boolean {
    if (!input || typeof input.lastSeenRev !== "number" || input.lastSeenRev < 0) return false;
    switch (input.op) {
      case "play":
      case "pause":
        return (input.position === undefined || input.position >= 0) && (input.rate === undefined || input.rate > 0);
      case "seek":
        return typeof input.position === "number" && input.position >= 0;
      case "rate":
        return typeof input.rate === "number" && input.rate > 0;
      case "navigate":
        return typeof input.titleId === "string" && input.titleId.length > 0;
      default:
        return false;
    }
  }

  private applyOp(prev: PlaybackState, input: IntentInput, clientId: string, now: number): PlaybackState {
    // Advance the current position to `now` so a play/pause toggle doesn't lose time.
    const current = prev.position + (prev.playing ? ((now - prev.refServerTime) / 1000) * prev.rate : 0);
    const base = { rev: prev.rev + 1, refServerTime: now, controllerId: clientId };
    switch (input.op) {
      case "play":
        return { ...prev, ...base, playing: true, position: input.position ?? current, rate: input.rate ?? prev.rate };
      case "pause":
        return { ...prev, ...base, playing: false, position: input.position ?? current };
      case "seek":
        return { ...prev, ...base, position: input.position as number };
      case "rate":
        return { ...prev, ...base, playing: prev.playing, position: current, rate: input.rate as number };
      case "navigate":
        return {
          ...base,
          titleId: input.titleId as string,
          playing: false,
          position: input.position ?? 0,
          rate: prev.rate,
        };
    }
  }
}
