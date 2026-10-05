// Room Durable Object: thin Cloudflare adapter around platform-agnostic RoomCore.
// Uses the WebSocket Hibernation API (idle rooms cost ~nothing) + SQLite storage
// (tiny room meta + ICE daily counter). No platform imports inside RoomCore.
//
// Wire protocol (@duet/protocol): every inbound frame is validated with
// parseMessage(). Servers only ever emit `state` and `pong` frames plus relay
// validated client frames; fatals are signaled with WS close codes (the
// protocol has no error type): 4409 room-full, 4429 rate-limited,
// 1007 bad payload/version, 1009 over 16KB. Unknown `t` is ignored (forward
// compat). NOTE: role/presence has no protocol type yet — clients assume
// both-can-control until one ships.
import { MAX_PARTICIPANTS, RoomCore } from '@duet/room-core';
import type { PlaybackState, Result } from '@duet/room-core';
import { PROTOCOL_VERSION, parseMessage } from '@duet/protocol';
import type { Message } from '@duet/protocol';

export const MAX_MSG_BYTES = 16 * 1024; // transport cap, stricter than protocol's 64KB (PRD §9)
const WS_MSGS_PER_WINDOW = 100; // per-socket frame rate limit (RoomCore adds 20/s per client on intents)
const WS_WINDOW_MS = 10_000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // rooms self-destruct after 12h idle (PRD §5.1)
const ICE_INTERNAL_PATH = '/__internal__/ice';
const ICE_SINGLETON_NAME = '__ice__'; // public /room/:id regex rejects '_' so only the worker can reach this

export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string; // comma-separated; empty = '*'
  ICE_DAILY_CAP?: string; // default 200
  TURN_URLS?: string; // comma-separated, e.g. Open Relay or BYO-TURN
  TURN_SECRET?: string; // if set: mint time-limited REST credentials
  TURN_USERNAME?: string; // else static credentials
  TURN_PASSWORD?: string;
  TURN_TTL_SECONDS?: string; // default 86400
}

interface Attachment {
  clientId: string;
  ip: string;
  joined: boolean;
  stamps: number[]; // inbound frame timestamps for the sliding window
}

type MemberResult = Result<{ role: 'host' | 'guest'; state: PlaybackState }>;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 128-bit random room id, base32, no padding (26 chars). */
export function newRoomId(random16: Uint8Array): string {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const byte of random16) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(acc << (5 - bits)) & 31];
  return out;
}

export function isRoomId(id: string): boolean {
  return /^[A-Z2-7]{26}$/.test(id);
}

/** Per-isolate sliding-window limiter (best-effort; the edge may have many isolates). */
export class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/** Lazy create-or-join. Single-threaded DO: no race between the two calls. */
function ensureMember(core: RoomCore, roomId: string, clientId: string, name?: string): MemberResult {
  const join = core.joinRoom(roomId, clientId, name);
  if (join.ok || join.error !== 'not-found') return join;
  const created = core.createRoom(roomId, clientId, name);
  if (created.ok || created.error !== 'exists') return created;
  return core.joinRoom(roomId, clientId, name); // lost a race: room now exists
}

function stateFrame(roomId: string, state: PlaybackState): Message {
  return { v: PROTOCOL_VERSION, t: 'state', id: crypto.randomUUID(), roomId, state };
}

async function mintIce(env: Env): Promise<Response> {
  const urls = (env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) {
    // P2P-only mode: no TURN configured. Client fails cleanly with advice
    // (try Sync mode, change network). Does NOT consume daily quota.
    return Response.json({
      p2pOnly: true,
      reason: 'no-turn-configured',
      stun: ['stun:stun.l.google.com:19302'],
      advice: 'Direct connection only. If this fails, try Sync mode or a different network.',
    });
  }
  const ttl = Number(env.TURN_TTL_SECONDS ?? '86400') || 86400;
  if (env.TURN_SECRET) {
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const username = `${expiry}:${rand}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.TURN_SECRET),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username));
    const password = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return Response.json({ urls, username, credential: password, ttl });
  }
  return Response.json({
    urls,
    ...(env.TURN_USERNAME ? { username: env.TURN_USERNAME } : {}),
    ...(env.TURN_PASSWORD ? { credential: env.TURN_PASSWORD } : {}),
    ttl,
  });
}

/** Daily issuance counter in the singleton's SQLite. DO is single-threaded, so read-check-write is atomic. */
function takeIceQuota(sql: SqlStorage, cap: number): { ok: boolean; count: number } {
  sql.exec(`CREATE TABLE IF NOT EXISTS ice_issuance (day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)`);
  const day = new Date().toISOString().slice(0, 10);
  const rows = sql.exec(`SELECT count FROM ice_issuance WHERE day = ?`, day).toArray() as Array<{ count: number }>;
  const count = rows.length > 0 ? Number(rows[0]?.count ?? 0) : 0;
  if (count >= cap) return { ok: false, count };
  sql.exec(
    `INSERT INTO ice_issuance (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1`,
    day,
  );
  return { ok: true, count: count + 1 };
}

// Intentionally no `implements DurableObject`: structural shape only, so this
// file does not depend on one specific @cloudflare/workers-types major.
export class Room {
  private core = new RoomCore();
  private roomId = '';
  private alarmSet = false;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private send(ws: WebSocket, frame: Message): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // Peer gone; webSocketClose cleans up.
    }
  }

  private broadcast(frame: Message, except?: WebSocket): void {
    const data = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        // Peer gone; webSocketClose cleans up.
      }
    }
  }

  private close(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal route: only reachable via worker-internal stub.fetch() —
    // the public router rejects '_' in room ids, so externals can't hit this.
    if (url.pathname === ICE_INTERNAL_PATH) {
      const noTurn = !(this.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean).length;
      if (noTurn) return mintIce(this.env); // p2pOnly, no quota consumed
      const cap = Number(this.env.ICE_DAILY_CAP ?? '200') || 200;
      const quota = takeIceQuota(this.ctx.storage.sql, cap);
      if (!quota.ok) {
        return Response.json({ error: 'ice-cap-exceeded', message: 'Daily TURN credential cap reached.' }, { status: 429 });
      }
      return mintIce(this.env);
    }

    const match = /^\/room\/([A-Za-z2-7]+)$/.exec(url.pathname);
    if (!match || !isRoomId((match[1] ?? '').toUpperCase())) {
      return Response.json({ error: 'bad-room-id' }, { status: 400 });
    }
    const roomId = (match[1] ?? '').toUpperCase();
    this.roomId = roomId;
    this.core.purgeExpired();

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ error: 'websocket-required' }, { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= MAX_PARTICIPANTS) {
      return Response.json({ error: 'room-full', message: 'This room already has 2 people.' }, { status: 409 });
    }

    const clientId = crypto.randomUUID();
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ clientId, ip, joined: false, stamps: [] } satisfies Attachment);

    if (!this.alarmSet) {
      this.alarmSet = true;
      void this.ctx.blockConcurrencyWhile(async () => {
        this.ctx.storage.sql.exec(
          `CREATE TABLE IF NOT EXISTS room_meta (key TEXT PRIMARY KEY, value TEXT)`,
        );
        this.ctx.storage.sql.exec(
          `INSERT INTO room_meta (key, value) VALUES ('createdAt', ?) ON CONFLICT(key) DO NOTHING`,
          new Date().toISOString(),
        );
        await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      });
    }

    // Membership happens on hello/join (client picks name); socket is accepted first.
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || this.roomId === '') {
      this.close(ws, 1011, 'unknown-session');
      return;
    }
    const size = typeof message === 'string' ? new TextEncoder().encode(message).length : message.byteLength;
    if (size > MAX_MSG_BYTES) {
      this.close(ws, 1009, 'message-too-large');
      return;
    }
    const now = Date.now();
    att.stamps = att.stamps.filter((t) => now - t < WS_WINDOW_MS);
    if (att.stamps.length >= WS_MSGS_PER_WINDOW) {
      ws.serializeAttachment(att);
      this.close(ws, 4429, 'rate-limited');
      return;
    }
    att.stamps.push(now);

    let raw: unknown;
    try {
      raw = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      this.close(ws, 1007, 'bad-json');
      return;
    }
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      if (parsed.reason === 'unknown-type') return; // forward compat: ignore
      this.close(ws, 1007, parsed.reason);
      return;
    }
    const msg = parsed.message;

    switch (msg.t) {
      case 'hello':
      case 'join': {
        if (msg.t === 'join' && msg.roomId !== this.roomId) {
          this.close(ws, 4400, 'wrong-room');
          return;
        }
        const newId = msg.t === 'hello' ? msg.clientId : att.clientId;
        if (att.joined && att.clientId !== newId) this.core.leaveRoom(this.roomId, att.clientId);
        const res = ensureMember(this.core, this.roomId, newId, msg.name);
        if (!res.ok) {
          this.close(ws, res.error === 'room-full' ? 4409 : 4400, res.error);
          return;
        }
        att.clientId = newId;
        att.joined = true;
        ws.serializeAttachment(att);
        this.send(ws, stateFrame(this.roomId, res.state));
        this.broadcast(stateFrame(this.roomId, res.state), ws); // resync peer
        return;
      }
      case 'leave': {
        this.core.leaveRoom(this.roomId, att.clientId);
        ws.serializeAttachment({ ...att, joined: false });
        this.close(ws, 1000, 'bye');
        return;
      }
      case 'intent': {
        if (!att.joined) {
          this.close(ws, 4400, 'join-first');
          return;
        }
        const res = this.core.sendIntent(this.roomId, att.clientId, {
          op: msg.op,
          lastSeenRev: msg.lastSeenRev,
          position: msg.position,
          rate: msg.rate,
          titleId: msg.titleId,
        });
        if (!res.ok) return; // rate-limited / not-controller / bad-intent: drop, client resyncs from state
        ws.serializeAttachment(att);
        this.broadcast(stateFrame(this.roomId, res.state));
        return;
      }
      case 'ping': {
        this.send(ws, {
          v: PROTOCOL_VERSION,
          t: 'pong',
          id: crypto.randomUUID(),
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        });
        ws.serializeAttachment(att);
        return;
      }
      case 'pong':
        ws.serializeAttachment(att);
        return; // client echoing; nothing to do
      default: {
        // Relay (chat, ice-offer/answer/candidate, control, client state): validated, forward to peer.
        if (!att.joined) {
          this.close(ws, 4400, 'join-first');
          return;
        }
        ws.serializeAttachment(att);
        this.broadcast(msg, ws);
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.onGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.onGone(ws);
  }

  private onGone(ws: WebSocket): void {
    if (this.roomId === '') return;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    this.core.leaveRoom(this.roomId, att.clientId);
    this.core.purgeExpired();
  }

  async alarm(): Promise<void> {
    // 12h self-destruct: drop sockets, wipe storage. (The ICE singleton never
    // sets an alarm, so its counter is unaffected.)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1001, 'room-expired');
      } catch {
        // ignore
      }
    }
    await this.ctx.storage.deleteAll();
  }
}

export { ICE_SINGLETON_NAME, ICE_INTERNAL_PATH };
