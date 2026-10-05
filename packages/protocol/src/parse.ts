import { MESSAGE_TYPES, MAX_MESSAGE_BYTES, PROTOCOL_VERSION, messageSchema, type Message } from "./messages.js";

export type ParseFailureReason =
  | "not-object"
  | "bad-envelope"
  | "bad-version"
  | "unknown-type" // forward compat: caller should ignore these
  | "too-large"
  | "invalid-payload";

export type ParseResult = { ok: true; message: Message } | { ok: false; reason: ParseFailureReason; issues?: unknown };

// Validate an unknown value as a protocol message.
// Unknown `t` values are reported (not thrown) so callers can ignore them for forward compat.
export function parseMessage(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not-object" };
  const rec = raw as Record<string, unknown>;
  if (typeof rec["t"] !== "string" || typeof rec["id"] !== "string" || rec["v"] === undefined) {
    return { ok: false, reason: "bad-envelope" };
  }
  if (rec["v"] !== PROTOCOL_VERSION) return { ok: false, reason: "bad-version" };
  if (!(MESSAGE_TYPES as readonly string[]).includes(rec["t"])) return { ok: false, reason: "unknown-type" };
  try {
    if (JSON.stringify(raw).length > MAX_MESSAGE_BYTES) return { ok: false, reason: "too-large" };
  } catch {
    return { ok: false, reason: "invalid-payload" };
  }
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid-payload", issues: parsed.error.issues };
  return { ok: true, message: parsed.data };
}

// True for message types this build understands.
export function isKnownType(t: unknown): t is Message["t"] {
  return typeof t === "string" && (MESSAGE_TYPES as readonly string[]).includes(t);
}
