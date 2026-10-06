export type Role = "host" | "guest";

// Who may drive playback. "both" (default) or host-only ("Only I control").
export type LockMode = "both" | "host";

export type IntentOp = "play" | "pause" | "seek" | "rate" | "navigate";

// Server-held room state (PRD §7.2). rev is monotonic, server-assigned.
export interface PlaybackState {
  rev: number;
  titleId: string;
  playing: boolean;
  position: number; // seconds at refServerTime
  refServerTime: number; // ms, server clock
  rate: number;
  controllerId: string; // who produced this rev
}

export interface IntentInput {
  op: IntentOp;
  lastSeenRev: number;
  position?: number;
  rate?: number;
  titleId?: string;
}

export type RoomError =
  | "not-found"
  | "exists"
  | "room-full"
  | "not-in-room"
  | "not-host"
  | "not-controller"
  | "not-approved"
  | "not-knocking"
  | "rate-limited"
  | "bad-intent";

export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; error: RoomError };
export type Result<T> = Ok<T> | Err;
