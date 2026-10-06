import { z } from "zod";

// Protocol version. Every message carries `v`; mismatches are rejected (see parse.ts).
export const PROTOCOL_VERSION = 1 as const;

// Max JSON-encoded message size (PRD §9: cap message size). Enforced in parseMessage.
export const MAX_MESSAGE_BYTES = 64 * 1024;

const envelope = {
  v: z.literal(PROTOCOL_VERSION),
  id: z.string().min(1).max(128),
};

const roomId = z.string().min(1).max(128);

export const helloMessage = z.object({
  ...envelope,
  t: z.literal("hello"),
  clientId: z.string().min(1).max(128),
  name: z.string().max(64).optional(),
});

export const joinMessage = z.object({
  ...envelope,
  t: z.literal("join"),
  roomId,
  name: z.string().max(64).optional(),
});

export const leaveMessage = z.object({
  ...envelope,
  t: z.literal("leave"),
  roomId,
});

export const intentOp = z.enum(["play", "pause", "seek", "rate", "navigate"]);

export const intentMessage = z.object({
  ...envelope,
  t: z.literal("intent"),
  roomId,
  op: intentOp,
  lastSeenRev: z.number().int().min(0),
  position: z.number().min(0).optional(),
  rate: z.number().positive().max(8).optional(),
  titleId: z.string().max(256).optional(),
});

export const playbackState = z.object({
  rev: z.number().int().min(0),
  titleId: z.string().max(256),
  playing: z.boolean(),
  position: z.number().min(0),
  refServerTime: z.number().min(0),
  rate: z.number().positive().max(8),
  controllerId: z.string().min(1).max(128),
});
export type PlaybackState = z.infer<typeof playbackState>;

export const stateMessage = z.object({
  ...envelope,
  t: z.literal("state"),
  roomId,
  state: playbackState,
});

export const chatMessage = z.object({
  ...envelope,
  t: z.literal("chat"),
  roomId,
  from: z.string().min(1).max(64),
  body: z.string().min(1).max(2000),
  ts: z.number().min(0),
});

export const pingMessage = z.object({
  ...envelope,
  t: z.literal("ping"),
  clientTime: z.number().min(0),
});

export const pongMessage = z.object({
  ...envelope,
  t: z.literal("pong"),
  clientTime: z.number().min(0),
  serverTime: z.number().min(0),
});

const sdpPayload = {
  roomId,
  from: z.string().min(1).max(128),
  sdp: z.string().min(1).max(65536),
};

export const iceOfferMessage = z.object({ ...envelope, t: z.literal("ice-offer"), ...sdpPayload });
export const iceAnswerMessage = z.object({ ...envelope, t: z.literal("ice-answer"), ...sdpPayload });

export const iceCandidateMessage = z.object({
  ...envelope,
  t: z.literal("ice-candidate"),
  roomId,
  from: z.string().min(1).max(128),
  candidate: z.string().max(65536),
  sdpMid: z.string().max(64).optional(),
  sdpMLineIndex: z.number().int().min(0).optional(),
});

export const controlMessage = z.object({
  ...envelope,
  t: z.literal("control"),
  roomId,
  command: z.string().min(1).max(64),
  args: z.unknown().optional(),
});

// Knock-to-join (host approval). Second hello in an occupied room makes the
// joiner "knocking": server broadcasts `knock` to approved members, sends
// `knocking` to the waiter. Host replies `admit`/`deny` with the target.
// On admit the waiter gets `state`; on deny the socket closes (4403).
export const knockMessage = z.object({
  ...envelope,
  t: z.literal("knock"),
  roomId,
  clientId: z.string().min(1).max(128),
  name: z.string().max(64).optional(),
});

export const knockingMessage = z.object({
  ...envelope,
  t: z.literal("knocking"),
  roomId,
});

export const admitMessage = z.object({
  ...envelope,
  t: z.literal("admit"),
  roomId,
  target: z.string().min(1).max(128),
});

export const denyMessage = z.object({
  ...envelope,
  t: z.literal("deny"),
  roomId,
  target: z.string().min(1).max(128),
});

export const messageSchema = z.discriminatedUnion("t", [
  helloMessage,
  joinMessage,
  leaveMessage,
  intentMessage,
  stateMessage,
  chatMessage,
  pingMessage,
  pongMessage,
  iceOfferMessage,
  iceAnswerMessage,
  iceCandidateMessage,
  controlMessage,
  knockMessage,
  knockingMessage,
  admitMessage,
  denyMessage,
]);

export type Message = z.infer<typeof messageSchema>;
export type MessageType = Message["t"];

export const MESSAGE_TYPES = [
  "hello",
  "join",
  "leave",
  "intent",
  "state",
  "chat",
  "ping",
  "pong",
  "ice-offer",
  "ice-answer",
  "ice-candidate",
  "control",
  "knock",
  "knocking",
  "admit",
  "deny",
] as const satisfies readonly MessageType[];
