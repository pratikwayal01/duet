// Worker entry: routes + CORS + per-IP rate limits. Room state lives in the Room DO.
import { ICE_INTERNAL_PATH, ICE_SINGLETON_NAME, SlidingWindow, isRoomId, newRoomId } from './room-do';
import type { Env } from './room-do';

export { Room } from './room-do';

const HTTP_PER_IP_LIMIT = 60; // requests per minute per IP (room create + ICE)
const HTTP_WINDOW_MS = 60_000;

const httpLimiter = new SlidingWindow(HTTP_PER_IP_LIMIT, HTTP_WINDOW_MS);

function clientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

// Money-endpoint guard (see docs/threat-model.md §4): when SIGNAL_API_KEY is
// set, only bearers get TURN creds; others downgrade to P2P-only downstream.
// Plain comparison is fine here — 256-bit key over a network round-trip.
function iceAuthorized(req: Request, url: URL, env: Env): boolean {
  if ((env.SIGNAL_API_KEY ?? '') === '') return true;
  const header = req.headers.get('Authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const cand = bearer || url.searchParams.get('key') || '';
  return cand !== '' && cand === env.SIGNAL_API_KEY;
}

/** Static CORS: echo allowlisted origin, else '*' when no allowlist configured. */
function corsHeaders(req: Request, env: Env): Headers {
  const allow = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const h = new Headers({
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (allow.length === 0) h.set('Access-Control-Allow-Origin', '*');
  else if (origin !== '' && allow.includes(origin)) h.set('Access-Control-Allow-Origin', origin);
  return h;
}

function withCors(res: Response, cors: Headers): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of cors) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return withCors(Response.json({ ok: true, service: 'duet-signal' }), cors);
    }

    if (request.method === 'GET' && url.pathname === '/api/room') {
      if (!httpLimiter.allow(`room:${clientIp(request)}`)) {
        return withCors(Response.json({ error: 'rate-limited' }, { status: 429 }), cors);
      }
      // Lazy room: id minted here, DO materializes on first WS connect.
      const id = newRoomId(crypto.getRandomValues(new Uint8Array(16)));
      return withCors(Response.json({ id }), cors);
    }

    if (request.method === 'GET' && url.pathname === '/api/ice') {
      const ip = clientIp(request);
      if (!httpLimiter.allow(`ice:${ip}`)) {
        return withCors(Response.json({ error: 'rate-limited' }, { status: 429 }), cors);
      }
      // Singleton DO holds the SQLite daily counter (global hard cap).
      const stub = env.ROOM.get(env.ROOM.idFromName(ICE_SINGLETON_NAME));
      const inner = await stub.fetch(
        new Request(`http://ice${ICE_INTERNAL_PATH}`, {
          method: 'POST',
          headers: {
            'x-client-ip': ip,
            'x-ice-authorized': iceAuthorized(request, url, env) ? '1' : '0',
          },
        }),
      );
      return withCors(inner, cors);
    }

    if (url.pathname.startsWith('/room/')) {
      const id = (url.pathname.split('/')[2] ?? '').toUpperCase();
      if (!isRoomId(id)) {
        return withCors(Response.json({ error: 'bad-room-id' }, { status: 400 }), cors);
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return withCors(Response.json({ error: 'websocket-required' }, { status: 426 }), cors);
      }
      if (!httpLimiter.allow(`ws:${clientIp(request)}`)) {
        return withCors(Response.json({ error: 'rate-limited' }, { status: 429 }), cors);
      }
      const stub = env.ROOM.get(env.ROOM.idFromName(id));
      return stub.fetch(request);
    }

    return withCors(Response.json({ error: 'not-found' }, { status: 404 }), cors);
  },
};
