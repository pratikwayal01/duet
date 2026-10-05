// Bare http + ws server (no framework needed). Routes mirror the CF adapter:
// WS /room/:id, GET /api/room, GET /api/ice, GET /api/health.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  MAX_MSG_BYTES,
  ROOM_CAP,
  RoomRegistry,
  SlidingWindow,
  isRoomId,
  mintIceBody,
  newRoomId,
} from './room.js';

const PORT = Number(process.env.PORT ?? '8787') || 8787;
const HTTP_PER_IP_LIMIT = 60;
const HTTP_WINDOW_MS = 60_000;

const httpLimiter = new SlidingWindow(HTTP_PER_IP_LIMIT, HTTP_WINDOW_MS);
const registry = new RoomRegistry();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TURN_URLS = (process.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function turnConfig() {
  return {
    urls: TURN_URLS,
    secret: process.env.TURN_SECRET || undefined,
    username: process.env.TURN_USERNAME || undefined,
    password: process.env.TURN_PASSWORD || undefined,
    ttlSeconds: Number(process.env.TURN_TTL_SECONDS ?? '86400') || 86400,
    dailyCap: Number(process.env.ICE_DAILY_CAP ?? '200') || 200,
  };
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

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
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
    json(res, 200, { id: newRoomId() }); // lazy: room materializes on first WS connect
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/ice') {
    if (!httpLimiter.allow(`ice:${clientIp(req)}`)) {
      json(res, 429, { error: 'rate-limited' });
      return;
    }
    const cfg = turnConfig();
    const quota = cfg.urls.length === 0 ? { ok: true, count: 0 } : registry.takeIceQuota(cfg.dailyCap);
    const { status, body } = mintIceBody(cfg, quota);
    json(res, status, body);
    return;
  }

  json(res, 404, { error: 'not-found' });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const match = /^\/room\/([A-Za-z2-7]+)$/.exec(url.pathname);
  const id = (match?.[1] ?? '').toUpperCase();
  if (!match || !isRoomId(id)) {
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
