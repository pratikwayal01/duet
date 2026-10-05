/* Room — guest Share viewer per moodboard §5.3 + edge states §5.6.
   `?demo=` selects a state for screenshots: waiting (default) | live |
   relayed | lost | drm | full. */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Button,
  ChatDock,
  Chip,
  EmptyState,
  PresencePill,
  StatsPanel,
  Toast,
  type ChatMessage,
} from '@duet/ui-kit';
import { parseRoomLink } from '../lib/room';

type Demo = 'waiting' | 'live' | 'relayed' | 'lost' | 'drm' | 'full';

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const DURATION = 1 * 3600 + 12 * 60 + 4; // 1:12:04

export function Room(props: { announce: (m: string) => void }) {
  const { roomId } = parseRoomLink(location.href);
  const demo = (new URLSearchParams(location.search).get('demo') ?? 'waiting') as Demo;
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(true);
  const [camOff, setCamOff] = useState(true);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const code = (roomId ?? '????????').slice(0, 8).toUpperCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLElement).id === 'duet-chat-input') return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') setPos((p) => Math.min(DURATION, p + 10));
      else if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 10));
      else if (e.key === 'c' || e.key === 'C') setChatOpen((o) => !o);
      else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m);
      else if (e.key === 'f' || e.key === 'F') videoRef.current?.requestFullscreen?.().catch(() => {});
      else if (e.key === 'Escape') setChatOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const send = (text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((m) => [...m.slice(-199), { from: 'you', name: 'You', text, time }]);
  };

  if (demo === 'full') {
    return (
      <main class="web-room" style={{ justifyContent: 'center' }}>
        <EmptyState
          title="This room already has two people."
          body="Ask them for a new invite, or start your own."
          actionLabel="Start a room"
          onAction={() => { location.href = '/new'; }}
        />
      </main>
    );
  }

  const live = demo === 'live' || demo === 'relayed';
  const lost = demo === 'lost';

  return (
    <div class="web-room">
      <header class="web-room__bar duet-glass">
        <span class="web-brand" style={{ fontSize: '1rem' }}>
          <span class="web-brand__mark" aria-hidden="true"><span class="web-brand__play" aria-hidden="true" /></span>
          <span class="web-room__title">DUET · {code}</span>
        </span>
        <span class="web-room__spacer" />
        {demo === 'relayed' && <Chip status="warn" label="Relayed · may look softer" />}
        {live && demo !== 'relayed' && <Chip status="ok" label="Direct · 1080p30" />}
        {demo === 'waiting' && <Chip status="muted" label="Waiting for host" />}
        {lost && <Chip status="danger" label="Reconnecting" />}
        <button type="button" aria-pressed={!muted} aria-label={muted ? 'Unmute mic (M)' : 'Mute mic (M)'}
          onClick={() => { setMuted((m) => !m); props.announce(muted ? 'Mic on.' : 'Mic muted.'); }} class="duet-iconbtn duet-focusable">
          {muted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
          )}
        </button>
        <button type="button" aria-pressed={!camOff} aria-label={camOff ? 'Turn camera on' : 'Turn camera off'}
          onClick={() => setCamOff((c) => !c)} class="duet-iconbtn duet-focusable">
          {camOff ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23" /><path d="M21 21 3 3M10.68 5H19a2 2 0 0 1 2 2v7M10.68 5A2 2 0 0 1 12 4h7a2 2 0 0 1 2 2v7l-2.3 2.3M10.68 5 3 5v7l8.5 8.5" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
          )}
        </button>
        <button type="button" aria-label="Room settings" aria-haspopup="dialog"
          onClick={() => props.announce('Settings live in a drawer in the full app.')} class="duet-iconbtn duet-focusable">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </button>
      </header>

      <main class={`web-stage${lost ? ' is-dim' : ''}`}>
        {demo === 'drm' ? (
          <div class="web-drm duet-glass" role="note" aria-label="Screen sharing blocked">
            <h2>That video can&apos;t be shared this way.</h2>
            <p>This service blocks screen sharing, so the picture appears black. You can still watch together if you both open it on your own accounts.</p>
            <Button variant="primary" onClick={() => props.announce('Sync mode is an extension feature in this scaffold.')}>
              Switch to Sync mode
            </Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            aria-label={live ? 'Shared video' : 'Shared video, waiting for host'}
            playsInline
            onClick={() => setPlaying((p) => !p)}
          />
        )}
        {demo === 'waiting' && (
          <div class="web-stage__overlay">
            <Toast message="Waiting for your person to start sharing…" />
          </div>
        )}
        <div class="web-room__dock">
          <ChatDock
            open={chatOpen}
            onToggle={() => { setChatOpen((o) => !o); setUnread(0); }}
            messages={messages}
            unread={unread}
            onSend={send}
          />
        </div>
      </main>

      <footer class="web-room__foot">
        <div class="web-room__presence">
          <PresencePill name="You" person="you" isYou />
          <PresencePill name="Maya" person="them" speaking={live} hasControl={false} />
        </div>
        <div class="web-room__scrub">
          <label class="sr-only" for="scrub">Seek</label>
          <input
            id="scrub" type="range" min={0} max={DURATION} step={1} value={pos}
            disabled={!live}
            onInput={(e) => setPos(Number((e.target as HTMLInputElement).value))}
            aria-valuetext={`${fmt(pos)} of ${fmt(DURATION)}${playing ? ', playing' : ', paused'}`}
          />
          <span class="web-room__time">{fmt(pos)} / {fmt(DURATION)}</span>
        </div>
        <StatsPanel stats={{ bitrate: live ? '6.4 Mbps' : '—', rtt: live ? '38 ms' : '—', path: demo === 'relayed' ? 'relay' : 'direct', codecs: 'VP9 · Opus' }} />
      </footer>

      <div class="web-room__toasts">
        {lost && <Toast kind="warn" message="Reconnecting… your place is saved." />}
      </div>
    </div>
  );
}
