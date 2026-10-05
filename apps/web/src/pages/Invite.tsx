/* Invite — ticket stub card + copy link + waiting status (moodboard §5.2). */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Button, TicketCard } from '@duet/ui-kit';
import { RoomClient, createRoomLink } from '../lib/room';

export function Invite(props: { announce: (m: string) => void }) {
  const link = useMemo(() => createRoomLink(location.origin), []);
  const [copied, setCopied] = useState(false);
  const [peer, setPeer] = useState<string | null>(null);

  useEffect(() => {
    const client = new RoomClient();
    client.onEvent = (e) => {
      if (e.t === 'peer-joined') {
        setPeer(e.name);
        props.announce(`${e.name}'s here.`);
      } else if (e.t === 'peer-left') {
        setPeer(null);
      }
    };
    // No signal server in this scaffold: connect fails fast, status stays waiting.
    client.connect(link.roomId, link.secret, 'host').catch(() => {});
    return () => client.close();
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      /* ponytail: clipboard may be unavailable; selection fallback below */
      const ta = document.createElement('textarea');
      ta.value = link.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <nav class="web-nav" aria-label="Main">
        <a class="web-brand" href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span class="web-brand__mark" aria-hidden="true"><span class="web-brand__play" aria-hidden="true" /></span> Duet
        </a>
      </nav>
      <main class="web-section web-invite">
        <h1 class="web-invite__title">Your ticket for two.</h1>
        <p class="web-invite__sub">Share the link. Your person joins straight in — no account.</p>
        <TicketCard
          code={link.roomId}
          status={peer ? 'joined' : 'waiting'}
          peerName={peer ?? undefined}
          onCopy={copy}
          copied={copied}
        />
        <p style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
          <Button variant="ghost" onClick={() => { location.href = `/r/${link.roomId}#${link.secret}` }}>
            Enter room as host →
          </Button>
        </p>
        <p class="web-hero__fonts" style={{ textAlign: 'center' }}>
          Secret stays in the link fragment — never sent to the server.
        </p>
      </main>
    </div>
  );
}
