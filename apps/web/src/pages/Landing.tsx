/* Landing — hero per moodboard §5.1: projector beam, two circles,
   Fraunces headline, Start room + How it works. */
import { useState } from 'preact/hooks';
import { Button, Dialog, ThemeToggle } from '@duet/ui-kit';

export function Landing(props: { announce: (m: string) => void }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [howOpen, setHowOpen] = useState(false);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('duet-theme', next);
    } catch {
      /* ponytail: storage optional */
    }
    setTheme(next);
    props.announce(`${next} theme`);
  };

  return (
    <div class="web-landing">
      <nav class="web-nav" aria-label="Main">
        <span class="web-brand">
          <span class="web-brand__mark" aria-hidden="true"><span class="web-brand__play" aria-hidden="true" /></span> Duet
        </span>
        <span class="web-nav__links">
          <a href="https://github.com" rel="noopener">GitHub</a>
          <a href="#how" onClick={(e) => { e.preventDefault(); setHowOpen(true); }}>Docs</a>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </span>
      </nav>

      <main class="web-hero">
        <div class="web-hero__beam" aria-hidden="true" />
        <div class="web-grain" aria-hidden="true" />
        <div class="web-orbs" aria-hidden="true">
          <span class="web-orb web-orb--you" />
          <span class="web-orb web-orb--them" />
        </div>
        <h1 class="web-hero__title">
          Watch together,<br />even when you&apos;re apart.
        </h1>
        <p class="web-hero__sub">Free. Open source. Just the two of you.</p>
        <div class="web-hero__cta">
          <Button variant="primary" onClick={() => { location.href = '/new'; }}>
            Start a room
          </Button>
          <Button variant="secondary" onClick={() => setHowOpen(true)}>
            How it works
          </Button>
        </div>
        <ul class="web-hero__modes" aria-label="What Duet does">
          <li>Sync</li>
          <li>Share</li>
          <li>Chat</li>
          <li>Voice</li>
        </ul>
        <p class="web-hero__fonts">Private by design. No account, no tracking.</p>
      </main>

      <Dialog open={howOpen} onClose={() => setHowOpen(false)} title="How it works">
        <div class="web-section" style={{ padding: 0 }}>
          <p><strong>Sync mode (best quality).</strong> You both open the title on your own accounts; Duet keeps play, pause and seek in lockstep. Your player, your quality, untouched.</p>
          <p><strong>Share mode.</strong> One person shares a tab peer-to-peer; the other watches right here, no install. Some services block screen capture — that&apos;s their DRM working as intended, and Duet won&apos;t try to get around it.</p>
          <p><strong>Private.</strong> Rooms hold two people, vanish after 12 idle hours, and the invite secret never leaves your link.</p>
          <Button variant="primary" onClick={() => { location.href = '/new'; }}>Start a room</Button>
        </div>
      </Dialog>
    </div>
  );
}
