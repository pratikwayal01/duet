// Room client: WebSocket signaling + NTP-style clock sync.
// Runs in the MV3 service worker. State persists in chrome.storage.session
// so a suspend/resume loses nothing. No long timers here (PRD §5.7) —
// periodic re-sync is owned by the sidepanel while open; the SW re-syncs
// on connect/reconnect, which is sufficient for correctness.

export interface ClockEstimate {
  serverOffsetMs: number;
  rttMs: number;
}

export interface RoomSnapshot {
  roomId: string;
  role: 'host' | 'guest';
  rev: number;
  serverOffsetMs: number;
}

const SESSION_KEY = 'duet:room';

export class RoomClient {
  private ws: WebSocket | null = null;
  private clock: ClockEstimate = { serverOffsetMs: 0, rttMs: 0 };
  private backoffMs = 1000;
  private closed = false;

  constructor(
    private events: {
      onState: (msg: unknown) => void;
      onStatus: (s: 'connected' | 'reconnecting' | 'closed') => void;
    },
  ) {}

  serverNow(): number {
    return Date.now() + this.clock.serverOffsetMs;
  }

  /** Diagnostics snapshot for the settings page (offset/RTT/connection). */
  diag(): { connected: boolean; serverOffsetMs: number; rttMs: number | null } {
    return {
      connected: this.ws !== null,
      serverOffsetMs: Math.round(this.clock.serverOffsetMs),
      rttMs: this.clock.rttMs === Infinity ? null : Math.round(this.clock.rttMs),
    };
  }

  async connect(url: string, roomId: string): Promise<void> {
    this.closed = false;
    this.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('signaling connect failed'));
    });
    this.ws.onmessage = (ev) => this.handle(ev.data as string);
    this.ws.onclose = () => void this.reconnect(url, roomId);
    await this.syncClock();
    await chrome.storage.session.set({ [SESSION_KEY]: { roomId, rev: 0 } satisfies Partial<RoomSnapshot> });
    this.events.onStatus('connected');
  }

  send(msg: unknown): void {
    this.ws?.send(JSON.stringify(msg));
  }

  async close(): Promise<void> {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    await chrome.storage.session.remove(SESSION_KEY);
    this.events.onStatus('closed');
  }

  /** NTP-style ping: keep lowest-RTT sample of 5 (PRD §7.2). */
  private async syncClock(): Promise<void> {
    let best: ClockEstimate = { serverOffsetMs: 0, rttMs: Infinity };
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const serverTime = await this.ping();
      const rtt = Date.now() - t0;
      const candidate = { serverOffsetMs: serverTime - (t0 + rtt / 2), rttMs: rtt };
      if (rtt < best.rttMs) best = candidate;
    }
    this.clock = best;
  }

  private ping(): Promise<number> {
    return new Promise((resolve) => {
      const t = Date.now();
      const onMsg = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data as string) as { t?: string; serverTime?: number };
          if (m.t === 'pong') {
            this.ws?.removeEventListener('message', onMsg);
            resolve(m.serverTime ?? t);
          }
        } catch {
          /* ignore non-protocol frames */
        }
      };
      this.ws?.addEventListener('message', onMsg);
      this.ws?.send(JSON.stringify({ v: 1, t: 'ping', id: `c${t}` }));
      // ponytail: no timeout — close/reconnect bounds it.
    });
  }

  private handle(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // untrusted input: drop malformed
    }
    this.events.onState(msg);
  }

  private async reconnect(url: string, roomId: string): Promise<void> {
    if (this.closed) return;
    this.events.onStatus('reconnecting');
    // Exponential backoff with jitter; re-syncs clock on success.
    await new Promise((r) => setTimeout(r, this.backoffMs + Math.random() * 500));
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
    try {
      await this.connect(url, roomId);
      this.backoffMs = 1000;
    } catch {
      await this.reconnect(url, roomId);
    }
  }
}
