// Room link helpers. Link shape (web/src/lib/room.ts): https://<app>/r/<roomId>#<secret>.
// Signal WS convention (services/): ws(s)://<host>/room/<roomId> (128-bit base32).

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE_KEY = 'duet:base';

/** Live default so a fresh install can start a room with no prior link. */
export const DEFAULT_BASE = 'https://duet-jhwt.onrender.com';

function rndB32(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let out = '';
  let bits = 0;
  let value = 0;
  for (const x of b) {
    value = (value << 8) | x;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Short ticket-stub code: K7M2·9QXA (unambiguous chars, no 0/O/1/I). */
export function makeTicketCode(): string {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const s = Array.from(b, (x) => alpha[x % alpha.length]).join('');
  return `${s.slice(0, 4)}·${s.slice(4)}`;
}

export function makeRoomId(): string {
  return rndB32(10); // 50-bit, URL-safe
}

export function makeSecret(): string {
  return rndB32(16); // 128-bit, fragment-only
}

export function inviteUrl(base: string, roomId: string, secret: string): string {
  return `${base.replace(/\/$/, '')}/r/${roomId}#${secret}`;
}

export function signalUrl(base: string, roomId: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/room/${roomId}`;
  u.hash = '';
  u.search = '';
  return u.toString();
}

/** Mint a server-side room id (128-bit base32; local ids are rejected). */
export async function mintRoom(base: string): Promise<string> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/room`);
  if (!res.ok) throw new Error(`room mint failed: ${res.status}`);
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error('room mint failed: bad response');
  return body.id;
}

export interface ParsedInvite {
  roomId: string | null;
  secret: string | null;
  base: string | null;
}

/** Parse `/r/<roomId>#<secret>` from a full URL, or a bare room/ticket code. */
export function parseInvite(input: string): ParsedInvite {
  const v = input.trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const m = u.pathname.match(/^\/r\/([\w-]+)/);
      const frag = u.hash.startsWith('#') ? u.hash.slice(1) : '';
      return { roomId: m ? m[1] : null, secret: frag || null, base: m ? u.origin : null };
    } catch {
      return { roomId: null, secret: null, base: null };
    }
  }
  const code = v.replace(/[·\s-]/g, '').toUpperCase();
  return { roomId: /^[A-Z2-9]{4,64}$/.test(code) ? v.trim() : null, secret: null, base: null };
}

export async function getBase(): Promise<string> {
  try {
    const v = (await chrome.storage.local.get(BASE_KEY))[BASE_KEY];
    if (typeof v === 'string' && v !== '') return v;
  } catch {
    /* storage unavailable: fall through to default */
  }
  return DEFAULT_BASE;
}

export async function setBase(base: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [BASE_KEY]: base });
  } catch {
    /* storage unavailable: base stays session-only */
  }
}
