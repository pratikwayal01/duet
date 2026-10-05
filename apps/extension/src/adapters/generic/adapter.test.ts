import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenericAdapter } from './adapter.ts';
import { netflixAdapter } from '../netflix/adapter.ts';
import { primeAdapter } from '../prime/adapter.ts';
import { jiohotstarAdapter } from '../jiohotstar/adapter.ts';
import { youtubeAdapter } from '../youtube/adapter.ts';

// ponytail: hand-rolled fake DOM (zero deps) instead of jsdom/happy-dom.
// Upgrade to happy-dom when fixtures need layout/shadow APIs.

// --- fakes -----------------------------------------------------------------

interface FakeVideo {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  playbackRate: number;
  readyState: number;
  played: boolean;
  listeners: Map<string, Array<() => void>>;
  addEventListener(name: string, cb: () => void): void;
  removeEventListener(name: string, cb: () => void): void;
  play(): Promise<void>;
  pause(): void;
  emit(name: string): void;
}

function fakeVideo(): FakeVideo {
  return {
    currentTime: 0,
    paused: true,
    ended: false,
    playbackRate: 1,
    readyState: 4,
    played: false,
    listeners: new Map(),
    addEventListener(name, cb) {
      const l = this.listeners.get(name) ?? [];
      l.push(cb);
      this.listeners.set(name, l);
    },
    removeEventListener(name, cb) {
      this.listeners.set(name, (this.listeners.get(name) ?? []).filter((f) => f !== cb));
    },
    async play() {
      this.played = true;
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    emit(name) {
      (this.listeners.get(name) ?? []).forEach((cb) => cb());
    },
  };
}

function fakeDoc(videos: FakeVideo[]) {
  const all: unknown[] = [];
  return {
    querySelectorAll(sel: string): unknown[] {
      if (sel === 'video') return videos as unknown[];
      if (sel === 'iframe') return [];
      if (sel === '*') return all;
      return [];
    },
  };
}

// --- generic ----------------------------------------------------------------

test('generic titleId is canonical host+path', () => {
  const a = createGenericAdapter();
  assert.equal(a.titleId(new URL('https://example.com/watch/ep2?x=1')), 'generic:example.com/watch/ep2');
});

test('generic watchUrl passes through', () => {
  const a = createGenericAdapter();
  assert.equal(a.watchUrl('generic:example.com/watch/ep2'), 'https://example.com/watch/ep2');
});

test('generic attach wraps video: state, play, pause, seek, rate', async () => {
  const v = fakeVideo();
  v.currentTime = 42;
  const a = createGenericAdapter('generic', { doc: fakeDoc([v]) as never });
  const h = await a.attach({ nonce: 'n', rateNudge: true });
  assert.equal(h.getState().position, 42);
  assert.equal(h.getState().playing, false);
  await h.play();
  assert.equal(v.played, true);
  h.pause();
  assert.equal(v.paused, true);
  await h.seek(10);
  assert.equal(v.currentTime, 10);
  h.setRate(1.5);
  assert.equal(v.playbackRate, 1.5);
  h.destroy();
});

test('generic attach emits play events and cleans up on destroy', async () => {
  const v = fakeVideo();
  const a = createGenericAdapter('generic', { doc: fakeDoc([v]) as never });
  const h = await a.attach({ nonce: 'n', rateNudge: true });
  let calls = 0;
  const off = h.on('play', () => calls++);
  v.emit('play');
  assert.equal(calls, 1);
  off();
  v.emit('play');
  assert.equal(calls, 1);
  h.destroy();
});

test('generic matches everything (fallback)', () => {
  const a = createGenericAdapter();
  assert.ok(a.matches(new URL('https://anything.example/foo')));
});

// --- site adapters -----------------------------------------------------------

test('netflix matches /watch/* and extracts numeric id', () => {
  assert.ok(netflixAdapter.matches(new URL('https://www.netflix.com/watch/81234567')));
  assert.ok(!netflixAdapter.matches(new URL('https://www.netflix.com/browse')));
  assert.equal(netflixAdapter.titleId(new URL('https://www.netflix.com/watch/81234567?t=10')), 'netflix:81234567');
  assert.equal(netflixAdapter.watchUrl('netflix:81234567'), 'https://www.netflix.com/watch/81234567');
});

test('prime matches detail/dp and extracts ASIN', () => {
  assert.ok(primeAdapter.matches(new URL('https://www.amazon.com/gp/video/detail/B0CX123456')));
  assert.ok(primeAdapter.matches(new URL('https://www.amazon.in/dp/B0CX123456')));
  assert.ok(!primeAdapter.matches(new URL('https://www.amazon.com/s?k=comedy')));
  assert.equal(primeAdapter.titleId(new URL('https://www.amazon.in/gp/video/detail/B0CX123456/')), 'prime:B0CX123456');
  assert.equal(primeAdapter.watchUrl('prime:B0CX123456'), 'https://www.amazon.com/gp/video/detail/B0CX123456');
});

test('jiohotstar matches host and extracts id', () => {
  assert.ok(jiohotstarAdapter.matches(new URL('https://www.hotstar.com/in/movies/abc123')));
  assert.ok(jiohotstarAdapter.matches(new URL('https://www.jiohotstar.com/tv/xyz789')));
  assert.ok(!jiohotstarAdapter.matches(new URL('https://www.youtube.com/watch?v=abc')));
  assert.ok((jiohotstarAdapter.titleId(new URL('https://www.hotstar.com/in/movies/abc123')) ?? '').startsWith('jiohotstar:'));
});

test('youtube matches watch and extracts v', () => {
  assert.ok(youtubeAdapter.matches(new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ')));
  assert.ok(!youtubeAdapter.matches(new URL('https://www.youtube.com/feed/trending')));
  assert.equal(
    youtubeAdapter.titleId(new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')),
    'youtube:dQw4w9WgXcQ',
  );
  assert.equal(youtubeAdapter.watchUrl('youtube:dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});
