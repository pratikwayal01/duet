// In-memory room registry: same RoomCore wrapper as the CF adapter, no platform
// imports inside RoomCore. One shared RoomCore (multi-room) per process. Rooms
// live only in this process (Render free spins down when idle — documented
// fallback, not primary).
//
// Wire protocol (@duet/protocol): every inbound frame is validated with
// parseMessage(). Servers only ever emit `state` and `pong` frames plus relay
// validated client frames; fatals use WS close codes (no error type in the
// protocol): 4409 room-full, 4429 rate-limited, 1007 bad payload/version,
// 1009 over 16KB. Unknown `t` is ignored (forward compat).
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { CODE_ALPHABET, CODE_LENGTH, MAX_PARTICIPANTS, RoomCore } from '@duet/room-core';
import type { PlaybackState, Result } from '@duet/room-core';
import { PROTOCOL_VERSION, parseMessage } from '@duet/protocol';
import type { Message } from '@duet/protocol';

export const MAX_MSG_BYTES = 16 * 1024; // also enforced natively via ws maxPayload
export { MAX_PARTICIPANTS as ROOM_CAP };
const WS_MSGS_PER_WINDOW = 100;
const WS_WINDOW_MS = 10_000;

type MemberResult = Result<{ role: 'host' | 'guest'; state?: PlaybackState; knocking?: boolean }>;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newRoomId(): string {
  const bytes = randomBytes(16);
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      const c = BASE32[(acc >>> (bits - 5)) & 31];
      out += c ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(acc << (5 - bits)) & 31] ?? '';
  return out;
}

export function isRoomId(id: string): boolean {
  return /^[A-Z2-7]{26}$/.test(id);
}

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

export interface TurnConfig {
  urls: string[];
  secret?: string;
  username?: string;
  password?: string;
  ttlSeconds: number;
  dailyCap: number;
}

// Metered's published public demo relay (no signup, no keys). Best-effort
// shared capacity for a hobby project — set TURN_URLS/TURN_SECRET for
// anything serious. STUN needs no credentials at all.
export const PUBLIC_RELAY = {
  urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
  username: 'openrelayproject',
  password: 'openrelayproject',
};

export function mintIceBody(cfg: TurnConfig, quota: { ok: boolean; count: number }): { status: number; body: unknown } {
  if (cfg.urls.length === 0) {
    return {
      status: 200,
      body: {
        p2pOnly: true,
        reason: 'no-turn-configured',
        stun: ['stun:stun.l.google.com:19302'],
        advice: 'Direct connection only. If this fails, try Sync mode or a different network.',
      },
    };
  }
  if (!quota.ok) {
    return { status: 429, body: { error: 'ice-cap-exceeded', message: 'Daily TURN credential cap reached.' } };
  }
  if (cfg.secret) {
    const expiry = Math.floor(Date.now() / 1000) + cfg.ttlSeconds;
    const username = `${expiry}:${randomBytes(6).toString('hex')}`;
    const password = createHmac('sha1', cfg.secret).update(username).digest('base64');
    return { status: 200, body: { urls: cfg.urls, username, credential: password, ttl: cfg.ttlSeconds } };
  }
  return {
    status: 200,
    body: {
      urls: cfg.urls,
      ...(cfg.username ? { username: cfg.username } : {}),
      ...(cfg.password ? { credential: cfg.password } : {}),
      ttl: cfg.ttlSeconds,
    },
  };
}

function ensureMember(core: RoomCore, roomId: string, clientId: string, name?: string): MemberResult {
  const join = core.joinRoom(roomId, clientId, name);
  if (join.ok || join.error !== 'not-found') return join;
  const created = core.createRoom(roomId, clientId, name);
  if (created.ok || created.error !== 'exists') return created;
  return core.joinRoom(roomId, clientId, name); // lost a race: room now exists
}

function stateFrame(roomId: string, state: PlaybackState): Message {
  return { v: PROTOCOL_VERSION, t: 'state', id: randomUUID(), roomId, state };
}

function knockFrame(roomId: string, clientId: string, name?: string): Message {
  return {
    v: PROTOCOL_VERSION, t: 'knock', id: randomUUID(), roomId, clientId,
    ...(name ? { name } : {}),
  };
}

function knockingFrame(roomId: string): Message {
  return { v: PROTOCOL_VERSION, t: 'knocking', id: randomUUID(), roomId };
}

interface Peer {
  clientId: string;
  joined: boolean;
  approved: boolean;
  ws: WebSocket;
  stamps: number[];
}

function open(ws: WebSocket): boolean {
  return ws.readyState === ws.OPEN;
}

export class RoomRegistry {
  private core = new RoomCore();
  private peersByRoom = new Map<string, Set<WebSocket>>();
  private peers = new Map<WebSocket, { roomId: string; peer: Peer }>();
  // day -> issued count (resets on deploy/restart; CF adapter is the durable one)
  private iceCount = { day: '', count: 0 };
  // Pending short invite codes for lazy rooms (created on first hello).
  // Entries die after 10 min or when consumed; the room itself stays lazy.
  private pendingCodes = new Map<string, { roomId: string; createdAt: number }>();
  private static readonly CODE_TTL_MS = 10 * 60 * 1000;

  constructor() {
    // Housekeeping for departed seats / rate windows (RoomCore has no timers).
    const timer = setInterval(() => this.core.purgeExpired(), 60_000);
    timer.unref();
  }

  memberCount(roomId: string): number {
    return this.core.memberCount(roomId);
  }

  /** Mint a lazy room id + short invite code (room materializes on first hello). */
  mintPending(): { id: string; code: string } {
    this.sweepCodes();
    const id = newRoomId();
    let code = '';
    for (let i = 0; i < 50; i++) {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
      if (!this.pendingCodes.has(code)) break;
    }
    this.pendingCodes.set(code, { roomId: id, createdAt: Date.now() });
    return { id, code };
  }

  /** Resolve a short code (or pass a full id straight through). */
  resolveRoom(idOrCode: string): string | null {
    const upper = idOrCode.toUpperCase();
    if (isRoomId(upper)) return upper;
    this.sweepCodes();
    return this.pendingCodes.get(upper)?.roomId ?? null;
  }

  private sweepCodes(): void {
    const now = Date.now();
    for (const [code, p] of this.pendingCodes) {
      if (now - p.createdAt > RoomRegistry.CODE_TTL_MS) this.pendingCodes.delete(code);
    }
  }

  add(roomId: string, ws: WebSocket, clientId: string): void {
    this.core.purgeExpired();
    let set = this.peersByRoom.get(roomId);
    if (!set) {
      set = new Set();
      this.peersByRoom.set(roomId, set);
    }
    set.add(ws);
    this.peers.set(ws, { roomId, peer: { clientId, joined: false, approved: false, ws, stamps: [] } });
  }

  remove(ws: WebSocket): void {
    const entry = this.peers.get(ws);
    if (!entry) return;
    this.peers.delete(ws);
    const set = this.peersByRoom.get(entry.roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.peersByRoom.delete(entry.roomId);
    }
    this.core.leaveRoom(entry.roomId, entry.peer.clientId);
    this.core.purgeExpired();
  }

  onFrame(ws: WebSocket, data: Buffer | string): void {
    const entry = this.peers.get(ws);
    if (!entry) {
      ws.close(1011, 'unknown-session');
      return;
    }
    const { roomId, peer } = entry;
    const text = typeof data === 'string' ? data : data.toString('utf8');
    // (ws maxPayload already caps at MAX_MSG_BYTES; re-check for the string path)
    if (Buffer.byteLength(text) > MAX_MSG_BYTES) {
      ws.close(1009, 'message-too-large');
      return;
    }
    const now = Date.now();
    peer.stamps = peer.stamps.filter((t) => now - t < WS_WINDOW_MS);
    if (peer.stamps.length >= WS_MSGS_PER_WINDOW) {
      ws.close(4429, 'rate-limited');
      return;
    }
    peer.stamps.push(now);

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      ws.close(1007, 'bad-json');
      return;
    }
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      if (parsed.reason === 'unknown-type') return; // forward compat: ignore
      ws.close(1007, parsed.reason);
      return;
    }
    const msg = parsed.message;

    switch (msg.t) {
      case 'hello':
      case 'join': {
        if (msg.t === 'join' && msg.roomId !== roomId) {
          ws.close(4400, 'wrong-room');
          return;
        }
        const newId = msg.t === 'hello' ? msg.clientId : peer.clientId;
        if (peer.joined && peer.clientId !== newId) this.core.leaveRoom(roomId, peer.clientId);
        const res = ensureMember(this.core, roomId, newId, msg.name);
        if (!res.ok) {
          ws.close(res.error === 'room-full' ? 4409 : 4400, res.error);
          return;
        }
        peer.clientId = newId;
        peer.joined = true;
        // Second hello in an occupied room knocks: waiter gets `knocking`,
        // approved members get `knock`, no state leaks to the waiter.
        if (res.knocking || !res.state) {
          peer.approved = false;
          this.sendTo(ws, knockingFrame(roomId));
          this.sendRoom(roomId, knockFrame(roomId, newId, msg.name), ws);
          return;
        }
        peer.approved = true;
        this.sendTo(ws, stateFrame(roomId, res.state));
        this.sendRoom(roomId, stateFrame(roomId, res.state), ws); // resync peer
        return;
      }
      case 'leave': {
        this.core.leaveRoom(roomId, peer.clientId);
        peer.joined = false;
        ws.close(1000, 'bye');
        return;
      }
      case 'intent': {
        if (!peer.joined || !peer.approved) {
          ws.close(4400, 'join-first');
          return;
        }
        const res = this.core.sendIntent(roomId, peer.clientId, {
          op: msg.op,
          lastSeenRev: msg.lastSeenRev,
          position: msg.position,
          rate: msg.rate,
          titleId: msg.titleId,
        });
        if (!res.ok) return; // rate-limited / not-controller / bad-intent: drop, client resyncs from state
        this.sendRoom(roomId, stateFrame(roomId, res.state));
        return;
      }
      case 'ping': {
        this.sendTo(ws, {
          v: PROTOCOL_VERSION,
          t: 'pong',
          id: randomUUID(),
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        });
        return;
      }
      case 'pong':
        return; // client echoing; nothing to do
      case 'admit': {
        if (!peer.joined || !peer.approved) {
          ws.close(4400, 'join-first');
          return;
        }
        const res = this.core.admit(roomId, peer.clientId, msg.target);
        if (!res.ok) return; // not-host / not-knocking: ignore
        const targetWs = this.findWs(roomId, msg.target);
        if (targetWs) {
          const entry = this.peers.get(targetWs);
          if (entry) entry.peer.approved = true;
          this.sendTo(targetWs, stateFrame(roomId, res.state));
        }
        this.sendRoom(roomId, stateFrame(roomId, res.state));
        return;
      }
      case 'deny': {
        if (!peer.joined || !peer.approved) {
          ws.close(4400, 'join-first');
          return;
        }
        const res = this.core.deny(roomId, peer.clientId, msg.target);
        if (!res.ok) return;
        const targetWs = this.findWs(roomId, msg.target);
        if (targetWs) targetWs.close(4403, 'join-denied');
        this.sendRoom(roomId, stateFrame(roomId, res.state));
        return;
      }
      default: {
        // Relay (chat, ice-offer/answer/candidate, control, client state): validated, forward to peer.
        // Knocking waiters can't relay until admitted.
        if (!peer.joined || !peer.approved) {
          ws.close(4400, 'join-first');
          return;
        }
        this.sendRoom(roomId, msg, ws);
        return;
      }
    }
  }

  takeIceQuota(cap: number): { ok: boolean; count: number } {    const day = new Date().toISOString().slice(0, 10);
    if (this.iceCount.day !== day) this.iceCount = { day, count: 0 };
    if (this.iceCount.count >= cap) return { ok: false, count: this.iceCount.count };
    this.iceCount.count += 1;
    return { ok: true, count: this.iceCount.count };
  }

  private sendTo(ws: WebSocket, frame: Message): void {
    if (open(ws)) ws.send(JSON.stringify(frame));
  }

  private findWs(roomId: string, clientId: string): WebSocket | null {
    for (const ws of this.peersByRoom.get(roomId) ?? []) {
      if (this.peers.get(ws)?.peer.clientId === clientId) return ws;
    }
    return null;
  }

  private sendRoom(roomId: string, frame: Message, except?: WebSocket): void {
    const data = JSON.stringify(frame);
    for (const ws of this.peersByRoom.get(roomId) ?? []) {
      if (ws !== except && open(ws)) ws.send(data);
    }
  }
}
