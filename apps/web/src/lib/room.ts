/* room.ts — Share-mode room link + WS client + chat encryption.
   Link shape (PRD §5.1): https://<app>/r/<roomId>#<secret>.
   The #secret never leaves the client: only roomId goes over the wire.
   Chat on the WS fallback path is AES-GCM encrypted with a key derived
   from the secret via HKDF-SHA256 (PRD §9). DataChannel chat (primary
   path) is already DTLS-SRTP encrypted by WebRTC. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.toUpperCase().replace(/=+$/, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('bad secret');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type RoomLink = { roomId: string; secret: string; url: string };

/** Create a room: 128-bit roomId (base32) + 128-bit secret, kept in fragment. */
export function createRoomLink(base: string): RoomLink {
  const rnd = (n: number) => {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return base32Encode(b);
  };
  const roomId = rnd(16); // 128-bit
  const secret = rnd(16); // 128-bit, fragment-only
  return { roomId, secret, url: `${base.replace(/\/$/, '')}/r/${roomId}#${secret}` };
}

/** Parse `/r/<roomId>#<secret>` from a URL. Secret may be absent (logged-out view). */
export function parseRoomLink(href: string): { roomId: string | null; secret: string | null } {
  const u = new URL(href, 'https://duet.local');
  const m = u.pathname.match(/^\/r\/([\w-]+)/);
  const frag = u.hash.startsWith('#') ? u.hash.slice(1) : '';
  return { roomId: m ? m[1] : null, secret: frag || null };
}

/** HKDF-SHA256(secret, salt=roomId, info) → AES-GCM-256 key. */
export async function deriveChatKey(secretB32: string, roomId: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', base32Decode(secretB32), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(roomId), info: new TextEncoder().encode('duet-chat-v1') },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export type SealedChat = { iv: string; ct: string };

export async function sealChat(key: CryptoKey, plaintext: string): Promise<SealedChat> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function openChat(key: CryptoKey, sealed: SealedChat): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.ct));
  return new TextDecoder().decode(pt);
}

export type RoomEvent =
  | { t: 'peer-joined'; name: string }
  | { t: 'peer-left'; name: string }
  | { t: 'chat'; sealed: SealedChat; from: string };

function signalUrl(roomId: string): string {
  const override = import.meta.env.VITE_SIGNAL_URL as string | undefined;
  if (override) return `${override.replace(/\/$/, '')}/api/room?id=${encodeURIComponent(roomId)}`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/room?id=${encodeURIComponent(roomId)}`;
}

/** Minimal WS room client. Sends roomId only — secret stays in the fragment. */
export class RoomClient {
  private ws: WebSocket | null = null;
  private key: CryptoKey | null = null;
  onEvent: (e: RoomEvent) => void = () => {};

  /** Connect as `name`. Resolves on open; rejects on error/timeout (no server yet is fine). */
  async connect(roomId: string, secret: string | null, name: string): Promise<void> {
    if (secret) this.key = await deriveChatKey(secret, roomId);
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(signalUrl(roomId));
      const timer = window.setTimeout(() => {
        ws.close();
        reject(new Error('signal timeout'));
      }, 4000);
      ws.onopen = () => {
        window.clearTimeout(timer);
        this.ws = ws;
        ws.send(JSON.stringify({ v: 1, t: 'hello', id: crypto.randomUUID(), name }));
        resolve();
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('signal unreachable'));
      };
      ws.onmessage = (ev) => this.handle(ev.data);
      ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  private handle(raw: unknown) {
    if (typeof raw !== 'string') return;
    try {
      const m = JSON.parse(raw) as { t: string; name?: string };
      if (m.t === 'peer-joined' || m.t === 'peer-left') {
        this.onEvent({ t: m.t, name: String(m.name ?? 'them') });
      } else if (m.t === 'chat') {
        this.onEvent({ t: 'chat', sealed: (m as unknown as { sealed: SealedChat }).sealed, from: String(m.name ?? 'them') });
      }
      // unknown types ignored (forward compat)
    } catch {
      /* ponytail: untrusted peer input, drop */
    }
  }

  /** Encrypted chat over WS fallback path (DataChannel is primary when P2P is up). */
  async sendChat(text: string, name: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.key) return false;
    const sealed = await sealChat(this.key, text);
    this.ws.send(JSON.stringify({ v: 1, t: 'chat', id: crypto.randomUUID(), name, sealed }));
    return true;
  }

  async decrypt(sealed: SealedChat): Promise<string | null> {
    if (!this.key) return null;
    try {
      return await openChat(this.key, sealed);
    } catch {
      return null;
    }
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
