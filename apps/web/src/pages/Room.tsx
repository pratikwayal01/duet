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
          <span class="web-brand__mark" aria-hidden="true">▶</span>
          <span class="web-room__title">DUET · {code}</span>
        </span>
        <span class="web-room__spacer" />
        {demo === 'relayed' && <Chip status="warn" label="Relayed · may look softer" />}
        {live && demo !== 'relayed' && <Chip status="ok" label="Direct · 1080p30" />}
        {demo === 'waiting' && <Chip status="muted" label="Waiting for host" />}
        {lost && <Chip status="danger" label="Reconnecting" />}
        <button type="button" aria-pressed={!muted} aria-label={muted ? 'Unmute mic' : 'Mute mic'}
          onClick={() => setMuted((m) => !m)} class="duet-iconbtn duet-focusable">
          <span aria-hidden="true">{muted ? '🎙️‍🚫' : '🎙️'}</span>
        </button>
        <button type="button" aria-pressed={!camOff} aria-label={camOff ? 'Turn camera on' : 'Turn camera off'}
          onClick={() => setCamOff((c) => !c)} class="duet-iconbtn duet-focusable">
          <span aria-hidden="true">{camOff ? '📷‍🚫' : '📷'}</span>
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
