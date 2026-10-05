import type { PlayerAdapter, PlayerHandle } from '../adapters/types.ts';

// Lazy injection: adapters attach only after a room is active, and everything
// is freed on leave (PRD §5.7). Content script stays inert otherwise —
// no polling while idle.
let active: { adapter: PlayerAdapter; handle: PlayerHandle } | null = null;

export function isAttached(): boolean {
  return active !== null;
}

/** Attach the first matching adapter. No-op if already attached or room inactive. */
export async function attachWhenRoomActive(
  adapters: PlayerAdapter[],
  ctx: { nonce: string; rateNudge: boolean },
  roomActive: () => boolean,
): Promise<PlayerHandle | null> {
  if (active || !roomActive()) return active?.handle ?? null;
  const url = new URL(location.href);
  const adapter = adapters.find((a) => a.matches(url)) ?? adapters.find((a) => a.id === 'generic');
  if (!adapter) return null;
  const handle = await adapter.attach(ctx);
  active = { adapter, handle };
  return handle;
}

/** Detach and free everything on room leave / tab close. */
export function detachAll(): void {
  active?.handle.destroy();
  active = null;
}
