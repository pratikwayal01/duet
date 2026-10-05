/* @duet/ui-kit — shared components. All color/spacing via var() tokens
   (tokens.css). No raw hex here. Keyboard operable, 44px touch targets. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

type Person = 'you' | 'them';

/* ---------- Button ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button(props: {
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type={props.type ?? 'button'}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
      class={`duet-btn duet-btn--${props.variant ?? 'primary'} duet-focusable`}
    >
      {props.children}
    </button>
  );
}

/* ---------- Chip (status; never color-alone: always has label text) ---------- */

export function Chip(props: { status: 'ok' | 'warn' | 'danger' | 'muted'; label: string }) {
  const glyph = props.status === 'ok' ? '●' : props.status === 'muted' ? '○' : props.status === 'warn' ? '◐' : '!';
  return (
    <span role="status" class={`duet-chip duet-chip--${props.status}`}>
      <span aria-hidden="true">{glyph}</span> {props.label}
    </span>
  );
}

/* ---------- Avatar (ring in person color, pulse when speaking) ---------- */

export function Avatar(props: { name: string; person: Person; speaking?: boolean; size?: number }) {
  const initial = (props.name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      role="img"
      aria-label={`${props.name}${props.speaking ? ', speaking' : ''}`}
      style={{ width: props.size ?? 32, height: props.size ?? 32 }}
      class={`duet-avatar duet-avatar--${props.person}${props.speaking ? ' is-speaking' : ''}`}
    >
      {initial}
    </span>
  );
}

/* ---------- PresencePill ---------- */

export function PresencePill(props: {
  name: string;
  person: Person;
  speaking?: boolean;
  hasControl?: boolean;
  isYou?: boolean;
}) {
  return (
    <span class="duet-presence">
      <Avatar name={props.name} person={props.person} speaking={props.speaking} />
      <span class="duet-presence__name">
        {props.isYou ? 'You' : props.name}
        {props.hasControl && (
          <span class="duet-presence__control" title="Has control">
            <span aria-hidden="true">♛</span>
            <span class="sr-only">has control</span>
          </span>
        )}
      </span>
    </span>
  );
}

/* ---------- TicketCard (room invite stub) ---------- */

export function TicketCard(props: {
  code: string;
  status: 'waiting' | 'joined';
  peerName?: string;
  onCopy: () => void;
  copied?: boolean;
}) {
  return (
    <section aria-label="Room invite ticket" class="duet-ticket duet-glass">
      <p class="duet-ticket__admit">Admit two</p>
      <p class="duet-ticket__code" aria-label={`Room code ${props.code}`}>
        {props.code}
      </p>
      <Button variant="primary" onClick={props.onCopy} ariaLabel="Copy invite link">
        {props.copied ? 'Copied' : 'Copy invite link'}
      </Button>
      <p role="status" class="duet-ticket__status">
        <span aria-hidden="true" class={`duet-dot${props.status === 'waiting' ? ' is-pulsing' : ''}`} />
        {props.status === 'waiting' ? 'Waiting for your person…' : `${props.peerName ?? 'They'}'re here.`}
      </p>
    </section>
  );
}

/* ---------- ChatBubble ---------- */

export type ChatMessage = { from: Person; name: string; text: string; time: string };

export function ChatBubble(props: { msg: ChatMessage }) {
  const own = props.msg.from === 'you';
  return (
    <div class={`duet-msg${own ? ' is-own' : ''}`}>
      <p class="duet-msg__meta">
        {own ? 'You' : props.msg.name} · <time>{props.msg.time}</time>
      </p>
      <p class="duet-msg__bubble">{props.msg.text}</p>
    </div>
  );
}

/* ---------- ChatDock (collapsed by default, overlays video) ---------- */

export function ChatDock(props: {
  open: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  unread: number;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [props.messages.length, props.open]);

  if (!props.open) {
    return (
      <button
        type="button"
        onClick={props.onToggle}
        aria-label={`Open chat${props.unread ? `, ${props.unread} unread` : ''}`}
        aria-expanded="false"
        class="duet-chatfab duet-glass duet-focusable"
      >
        <span aria-hidden="true">💬</span>
        {props.unread > 0 && (
          <span class="duet-chatfab__dot" aria-hidden="true" />
        )}
      </button>
    );
  }
  return (
    <section aria-label="Chat" class="duet-chat duet-glass">
      <div class="duet-chat__head">
        <strong>Chat</strong>
        <button
          type="button"
          onClick={props.onToggle}
          aria-label="Close chat"
          aria-expanded="true"
          class="duet-iconbtn duet-focusable"
        >
          ✕
        </button>
      </div>
      <div ref={listRef} class="duet-chat__list" role="log" aria-label="Chat messages" tabIndex={0}>
        {props.messages.length === 0 && <p class="duet-chat__empty">Quiet for now.</p>}
        {props.messages.map((m, i) => (
          <ChatBubble key={i} msg={m} />
        ))}
      </div>
      <form
        class="duet-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft.trim();
          if (t) {
            props.onSend(t);
            setDraft('');
          }
        }}
      >
        <label class="sr-only" for="duet-chat-input">Type a message</label>
        <input
          id="duet-chat-input"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          placeholder="Type a message…"
          autoComplete="off"
          class="duet-chat__input duet-focusable"
        />
        <Button type="submit" variant="primary" ariaLabel="Send message">↩</Button>
      </form>
    </section>
  );
}

/* ---------- Toast ---------- */

export function Toast(props: { message: string; kind?: 'info' | 'warn'; onClose?: () => void }) {
  return (
    <div role="status" class={`duet-toast duet-glass duet-toast--${props.kind ?? 'info'}`}>
      <span>{props.message}</span>
      {props.onClose && (
        <button type="button" onClick={props.onClose} aria-label="Dismiss" class="duet-iconbtn duet-focusable">
          ✕
        </button>
      )}
    </div>
  );
}

/* ---------- Switch (role=switch button) ---------- */

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      class="duet-switchrow duet-focusable"
    >
      <span>{props.label}</span>
      <span aria-hidden="true" class={`duet-switch${props.checked ? ' is-on' : ''}`}>
        <span class="duet-switch__knob" />
      </span>
    </button>
  );
}

/* ---------- Segmented (radiogroup) ---------- */

export function Segmented<T extends string>(props: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} class="duet-seg">
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === props.value}
          onClick={() => props.onChange(o)}
          class={`duet-seg__opt duet-focusable${o === props.value ? ' is-selected' : ''}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/* ---------- Dialog (Esc + overlay close, focus into title) ---------- */

export function Dialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!props.open) return;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.open]);
  if (!props.open) return null;
  return (
    <div
      class="duet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={props.title} class="duet-dialog duet-glass">
        <h2 ref={titleRef} tabIndex={-1} class="duet-dialog__title">
          {props.title}
        </h2>
        <div>{props.children}</div>
      </div>
    </div>
  );
}

/* ---------- ControlBanner (remote-control consent, always-visible kill) ---------- */

export function ControlBanner(props: { controllerName: string; onStop: () => void }) {
  return (
    <div role="alert" class="duet-controlbanner">
      <span>
        {props.controllerName} is controlling your tab · Stop ({' '}
        <kbd>Ctrl+Shift+.</kbd> )
      </span>
      <Button variant="secondary" onClick={props.onStop} ariaLabel="Stop remote control">
        Stop
      </Button>
    </div>
  );
}

/* ---------- StatsPanel (collapsible, mono tabular) ---------- */

export function StatsPanel(props: { stats: Record<string, string>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <div class="duet-stats">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        class="duet-stats__toggle duet-focusable"
      >
        {open ? '▾' : '▸'} Connection stats
      </button>
      {open && (
        <dl class="duet-stats__list">
          {Object.entries(props.stats).map(([k, v]) => (
            <div key={k} class="duet-stats__row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/* ---------- EmptyState (serif headline ≥24px) ---------- */

export function EmptyState(props: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div class="duet-empty">
      <h2 class="duet-empty__title">{props.title}</h2>
      <p class="duet-empty__body">{props.body}</p>
      {props.actionLabel && props.onAction && (
        <Button variant="primary" onClick={props.onAction}>{props.actionLabel}</Button>
      )}
    </div>
  );
}

/* ---------- ThemeToggle ---------- */

export function ThemeToggle(props: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const next = props.theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-label={`Switch to ${next} theme`}
      aria-pressed={props.theme === 'light'}
      class="duet-iconbtn duet-focusable"
    >
      <span aria-hidden="true">{props.theme === 'dark' ? '☾' : '☀'}</span>
    </button>
  );
}
