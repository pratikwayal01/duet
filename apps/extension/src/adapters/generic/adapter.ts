import type { AdapterContext, PlayerAdapter, PlayerEvent, PlayerHandle, PlayerState } from '../types.ts';

// ponytail: first usable <video> wins (no size/duration ranking) — rank later if ads bite.

type Listener = () => void;

/** Collect <video> from root, recursing into shadow DOM and same-origin iframes. */
export function findVideos(root: ParentNode): HTMLVideoElement[] {
  const out: HTMLVideoElement[] = [];
  const els = root.querySelectorAll('video');
  els.forEach((v) => out.push(v as HTMLVideoElement));
  // Shadow DOM.
  const all = root.querySelectorAll('*');
  all.forEach((el) => {
    const shadow = (el as HTMLElement).shadowRoot;
    if (shadow) out.push(...findVideos(shadow));
  });
  // Same-origin iframes only; cross-origin throws on access — skip silently.
  if (typeof root.querySelectorAll === 'function') {
    root.querySelectorAll('iframe').forEach((frame) => {
      try {
        const doc = (frame as HTMLIFrameElement).contentDocument;
        if (doc) out.push(...findVideos(doc));
      } catch {
        /* cross-origin: ignore */
      }
    });
  }
  return out;
}

class GenericHandle implements PlayerHandle {
  private unsubs: Array<() => void> = [];
  private destroyed = false;
  private video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  getState(): PlayerState {
    const v = this.video;
    return {
      position: v.currentTime,
      playing: !v.paused && !v.ended,
      rate: v.playbackRate,
      buffering: v.readyState < 3 && !v.paused,
    };
  }

  async play(): Promise<void> {
    await this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  async seek(seconds: number): Promise<void> {
    this.video.currentTime = seconds;
  }

  setRate(r: number): void {
    this.video.playbackRate = r;
  }

  on(event: PlayerEvent, cb: Listener): () => void {
    const domEvent =
      event === 'seek'
        ? 'seeked'
        : event === 'buffering'
          ? 'waiting'
          : event === 'navigated'
            ? null
            : event; // play/pause/rate(→ratechange)/ended map below
    const name =
      event === 'rate' ? 'ratechange' : event === 'buffering' ? 'waiting' : (domEvent as string);
    if (event === 'navigated') return () => {};
    const handler = () => {
      if (!this.destroyed) cb();
    };
    this.video.addEventListener(name, handler);
    const off = () => this.video.removeEventListener(name, handler);
    this.unsubs.push(off);
    return off;
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubs.splice(0).forEach((off) => off());
  }
}

/** Patch history so SPA nav fires 'navigated'. Returns restore fn. */
function hookHistory(onNav: () => void): () => void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return () => {};
  const { pushState, replaceState } = history;
  history.pushState = function (...args) {
    const r = pushState.apply(this, args as never);
    onNav();
    return r;
  };
  history.replaceState = function (...args) {
    const r = replaceState.apply(this, args as never);
    onNav();
    return r;
  };
  window.addEventListener('popstate', onNav);
  return () => {
    history.pushState = pushState;
    history.replaceState = replaceState;
    window.removeEventListener('popstate', onNav);
  };
}

export interface GenericOptions {
  /** Test seam: defaults to document. */
  doc?: ParentNode & Document;
}

/** Fallback adapter: wraps the page's own <video>, never touches the pipeline (PRD §5.7). */
export function createGenericAdapter(
  id = 'generic',
  opts: GenericOptions = {},
): PlayerAdapter & { _findForTest: () => HTMLVideoElement | null } {
  return {
    id,
    // Fallback: matches everything, checked last.
    matches: () => true,
    titleId: (url: URL) => `generic:${url.host}${url.pathname}`,
    // Passthrough: titleId already encodes host+path.
    // ponytail: query/hash not preserved — add when a site needs it.
    watchUrl: (titleId: string) => `https://${titleId.slice('generic:'.length)}`,
    async attach(_ctx: AdapterContext): Promise<PlayerHandle> {
      const doc: ParentNode & Partial<Document> = opts.doc ?? document;
      const found = findVideos(doc as ParentNode)[0];
      if (!found) {
        // Single observer, scoped to the doc root, resolves on first video.
        // Caller disconnects via handle.destroy() semantics — see below.
        const video = await new Promise<HTMLVideoElement>((resolve) => {
          if (typeof MutationObserver === 'undefined') {
            throw new Error('No <video> found and no MutationObserver available');
          }
          const mo = new MutationObserver(() => {
            const v = findVideos(doc as ParentNode)[0];
            if (v) {
              mo.disconnect();
              resolve(v);
            }
          });
          mo.observe(doc as Node, { childList: true, subtree: true });
        });
        return wire(video);
      }
      return wire(found);
    },
    _findForTest: () => findVideos((opts.doc ?? document) as ParentNode)[0] ?? null,
  };
}

function wire(video: HTMLVideoElement): PlayerHandle {
  const handle = new GenericHandle(video);
  const navCbs = new Set<Listener>();
  const restore = hookHistory(() => navCbs.forEach((cb) => cb()));
  const origOn = handle.on.bind(handle);
  handle.on = (event: PlayerEvent, cb: Listener) => {
    if (event === 'navigated') {
      navCbs.add(cb);
      return () => {
        navCbs.delete(cb);
      };
    }
    return origOn(event, cb);
  };
  const origDestroy = handle.destroy.bind(handle);
  handle.destroy = () => {
    restore();
    navCbs.clear();
    origDestroy();
  };
  return handle;
}
