// NTP-style clock sync over the room WebSocket (PRD §7.2).
// Client sends ping {clientTime: t0}; server replies pong {clientTime: t0, serverTime: ts};
// client records t1 on receipt. Offset assumes symmetric delay:
//   offset = ts - (t0 + t1) / 2, rtt = t1 - t0.
// Keeps the last N samples and trusts the lowest-RTT one (least queuing noise).

export const MAX_SAMPLES = 8;

export class ClockSync {
  private samples: { offset: number; rtt: number }[] = [];

  constructor(private maxSamples: number = MAX_SAMPLES) {}

  addSample(t0: number, serverTime: number, t1: number): void {
    if (![t0, serverTime, t1].every(Number.isFinite) || t1 < t0) return;
    this.samples.push({ offset: serverTime - (t0 + t1) / 2, rtt: t1 - t0 });
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  // Lowest-RTT sample; undefined until the first sample.
  best(): { offset: number; rtt: number } | undefined {
    let best: { offset: number; rtt: number } | undefined;
    for (const s of this.samples) {
      if (!best || s.rtt < best.rtt) best = s;
    }
    return best ? { ...best } : undefined;
  }

  getOffsetMs(): number {
    return this.best()?.offset ?? 0;
  }

  getRttMs(): number | undefined {
    return this.best()?.rtt;
  }

  serverNow(clientNowMs: number): number {
    return clientNowMs + this.getOffsetMs();
  }
}
