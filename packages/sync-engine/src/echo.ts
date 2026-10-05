// Echo-loop suppression (PRD §5.2): every programmatic action is tagged with a
// sequence number; when the resulting DOM event arrives carrying that seq, it is
// consumed once and ignored instead of being rebroadcast.

export class EchoGuard {
  private nextSeq = 1;
  private pending = new Set<number>();

  // Tag a programmatic action; returns its seq.
  issue(): number {
    const seq = this.nextSeq++;
    this.pending.add(seq);
    return seq;
  }

  // True exactly once per issued seq: the event is our own echo, ignore it.
  isEcho(seq: number): boolean {
    if (this.pending.has(seq)) {
      this.pending.delete(seq);
      return true;
    }
    return false;
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
