// Bare http + ws server (no framework needed). Routes mirror the CF adapter:
// WS /room/:id, GET /api/room, GET /api/ice, GET /api/health.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import {
  MAX_MSG_BYTES,
  PUBLIC_RELAY,
  ROOM_CAP,
  RoomRegistry,
  SlidingWindow,
  isRoomId,
  mintIceBody,
} from './room.js';

const PORT = Number(process.env.PORT ?? '8787') || 8787;
const HTTP_PER_IP_LIMIT = 60;
const HTTP_WINDOW_MS = 60_000;

const httpLimiter = new SlidingWindow(HTTP_PER_IP_LIMIT, HTTP_WINDOW_MS);
const registry = new RoomRegistry();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TURN_URLS = (process.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function turnConfig() {
  const dailyCap = Number(process.env.ICE_DAILY_CAP ?? '200') || 200;
  const ttlSeconds = Number(process.env.TURN_TTL_SECONDS ?? '86400') || 86400;
  // Explicit "none" keeps strict P2P-only mode.
  if ((process.env.TURN_URLS ?? '').trim().toLowerCase() === 'none') {
    return { urls: [], secret: undefined, username: undefined, password: undefined, ttlSeconds, dailyCap };
  }
  // Self-hosted relay (BYO TURN).
  if (TURN_URLS.length > 0) {
    return {
      urls: TURN_URLS,
      secret: process.env.TURN_SECRET || undefined,
      username: process.env.TURN_USERNAME || undefined,
      password: process.env.TURN_PASSWORD || undefined,
      ttlSeconds,
      dailyCap,
    };
  }
  // Default: Metered's public demo relay (no signup, no keys, best-effort).
  return {
    urls: [...PUBLIC_RELAY.urls],
    secret: undefined,
    username: PUBLIC_RELAY.username,
    password: PUBLIC_RELAY.password,
    ttlSeconds,
    dailyCap,
  };
}

// Money endpoint guard: when SIGNAL_API_KEY is set, only callers bearing it
// get TURN credentials; everyone else gets the P2P-only body (200, no quota
// consumed). Empty key = open (dev default). Never logged.
const API_KEY = process.env.SIGNAL_API_KEY || '';

function authorized(req: IncomingMessage, url: URL): boolean {
  if (API_KEY === '') return true;
  const header = req.headers.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const cand = bearer || url.searchParams.get('key') || '';
  if (cand === '') return false;
  const a = Buffer.from(cand);
  const b = Buffer.from(API_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first ?? req.socket.remoteAddress ?? 'unknown';
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin ?? '';
  res.setHeader('Vary', 'Origin');
  if (ALLOWED_ORIGINS.length === 0) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin !== '' && ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Static landing + room pages (same origin as the socket, so no CORS/VITE
// config needed). Served only when the web app was built alongside —
// WEB_DIST overrides, default is the monorepo apps/web/dist.
const WEB_DIST = process.env.WEB_DIST ?? new URL('../../../apps/web/dist', import.meta.url).pathname;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function serveWeb(pathname: string, res: ServerResponse): Promise<boolean> {
  // SPA routes (/new, /r/:id) fall back to index.html; traversal-safe join.
  const route = pathname === '/' || pathname === '/new' || pathname.startsWith('/r/') ? '/index.html' : pathname;
  const file = normalize(join(WEB_DIST, route));
  if (!file.startsWith(WEB_DIST + sep) && file !== join(WEB_DIST, 'index.html')) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    void serveWeb(url.pathname, res).then((served) => {
      if (!served) json(res, 404, { error: 'not-found' });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true, service: 'duet-signal-node' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/room') {
    if (!httpLimiter.allow(`room:${clientIp(req)}`)) {
      json(res, 429, { error: 'rate-limited' });
      return;
    }
    json(res, 200, registry.mintPending()); // {id, code}; room materializes on first WS hello
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/resolve') {
    const code = url.searchParams.get('code') ?? '';
    const roomId = registry.resolveRoom(code);
    if (!roomId) {
      json(res, 404, { error: 'bad-code' });
      return;
    }
    json(res, 200, { roomId });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/ice') {
    if (!httpLimiter.allow(`ice:${clientIp(req)}`)) {
      json(res, 429, { error: 'rate-limited' });
      return;
    }
    const cfg = turnConfig();
    const authed = authorized(req, url);
    const effective = authed ? cfg : { ...cfg, urls: [] }; // unauthenticated: P2P-only, no quota consumed
    const quota = effective.urls.length === 0 ? { ok: true, count: 0 } : registry.takeIceQuota(cfg.dailyCap);
    const { status, body } = mintIceBody(effective, quota);
    json(res, status, body);
    return;
  }

  json(res, 404, { error: 'not-found' });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const match = /^\/room\/([A-Za-z2-7]+)$/.exec(url.pathname);
  const token = (match?.[1] ?? '').toUpperCase();
  // Full id passes straight through; short invite codes resolve via the map.
  const id = registry.resolveRoom(token);
  if (!match || !id || !isRoomId(id)) {
    socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\n\r\n{"error":"bad-room-id"}');
    socket.destroy();
    return;
  }
  if (!httpLimiter.allow(`ws:${clientIp(req)}`)) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\n\r\n{"error":"rate-limited"}');
    socket.destroy();
    return;
  }
  if (registry.memberCount(id) >= ROOM_CAP) {
    socket.write(
      'HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\n\r\n{"error":"room-full","message":"This room already has 2 people."}',
    );
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Membership is decided by hello/join frames (RoomCore enforces the cap,
    // including rejoin); the pre-check above only rejects the obvious-full case.
    registry.add(id, ws, randomUUID());
    ws.on('message', (data: Buffer | string) => registry.onFrame(ws, data));
    const cleanup = () => registry.remove(ws);
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });
});

server.listen(PORT, () => {
  console.log(`duet-signal-node listening on :${PORT}`);
});
