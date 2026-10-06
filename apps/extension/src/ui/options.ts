// Duet settings (options page). Everything autosaves — no save button.
// Stored in chrome.storage.local only. Secrets never leave the browser
// except as a Bearer token to your own server.

import { DEFAULT_BASE, getApiKey, getBase, setApiKey, setBase } from './room-link.ts';

const K = {
  name: 'duet:name',
  theme: 'duet:theme',
  control: 'duet:control-default',
  nudge: 'duet:rate-nudge',
};

async function storeGet(key: string): Promise<string | null> {
  try {
    const v = (await chrome.storage.local.get(key))[key];
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await chrome.storage.local.remove(key);
    else await chrome.storage.local.set({ [key]: value });
  } catch {
    /* storage unavailable */
  }
}

function normalizeBase(v: string): string {
  const t = v.trim().replace(/\/+$/, '');
  if (t === '') return DEFAULT_BASE;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

async function testConnection(base: string, key: string): Promise<string> {
  try {
    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${base}/api/health`, { headers });
    if (!res.ok) return `Server answered ${res.status} — check the URL.`;
    const body = (await res.json()) as { ok?: boolean; service?: string };
    return body.ok ? `Connected to ${body.service ?? 'signal server'}.` : 'Server answered oddly — check the URL.';
  } catch {
    return "Can't reach that server. Check the URL and your connection.";
  }
}

async function ensurePermission(base: string): Promise<boolean> {
  try {
    const origin = new URL(base).origin;
    return await chrome.permissions.request({ origins: [`${origin}/*`] });
  } catch {
    return false;
  }
}

function mount(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <h1 id="title">Settings</h1>

    <section class="section" aria-labelledby="h-profile">
      <h2 id="h-profile">Profile</h2>
      <label class="field-label" for="name">Display name</label>
      <input id="name" class="field" type="text" maxlength="64" autocomplete="off" spellcheck="false" />
      <p class="hint">Shown to the other person. Defaults to Guest.</p>
    </section>

    <section class="section" aria-labelledby="h-conn">
      <h2 id="h-conn">Connection</h2>
      <label class="field-label" for="base">Signal server</label>
      <input id="base" class="field" type="url" autocomplete="off" spellcheck="false"
        aria-describedby="base-hint" />
      <p id="base-hint" class="hint">Where rooms live. Use your own server or a friend's. Defaults to the public demo server.</p>
      <label class="field-label" for="key">API key <span class="hint-inline">(only if your server needs one)</span></label>
      <input id="key" class="field" type="password" autocomplete="off" spellcheck="false" />
      <p class="hint">Stays on this device. Sent as a Bearer token to your server only.</p>
      <div class="btn-row">
        <button id="test" class="btn btn-secondary" type="button">Test connection</button>
      </div>
    </section>

    <section class="section" aria-labelledby="h-play">
      <h2 id="h-play">Playback</h2>
      <p class="field-label" id="control-label">Who controls by default</p>
      <div class="seg-group" role="group" aria-labelledby="control-label">
        <button id="ctl-both" class="seg" type="button" aria-pressed="true">Both</button>
        <button id="ctl-host" class="seg" type="button" aria-pressed="false">Just me</button>
      </div>
      <div class="switch-row">
        <div>
          <p class="field-label">Gentle catch-up</p>
          <p class="hint">Nudge speed instead of jumping on small drift. Off on services that dislike it.</p>
        </div>
        <button id="nudge" class="switch" type="button" role="switch" aria-checked="true" aria-label="Gentle catch-up"><span aria-hidden="true"></span></button>
      </div>
      <p class="field-label" id="theme-label">Theme</p>
      <div class="seg-group" role="group" aria-labelledby="theme-label">
        <button id="th-system" class="seg" type="button" aria-pressed="true">System</button>
        <button id="th-dark" class="seg" type="button" aria-pressed="false">Dark</button>
        <button id="th-light" class="seg" type="button" aria-pressed="false">Light</button>
      </div>
    </section>

    <section class="section" aria-labelledby="h-diag">
      <h2 id="h-diag">Diagnostics</h2>
      <p class="hint">Clock sync between you and the server. Big offsets mean choppy sync.</p>
      <div class="btn-row">
        <button id="refresh" class="btn btn-secondary" type="button">Refresh</button>
      </div>
      <dl class="kv">
        <div><dt>Room</dt><dd id="d-room">—</dd></div>
        <div><dt>Connected</dt><dd id="d-conn">—</dd></div>
        <div><dt>Clock offset</dt><dd id="d-offset">—</dd></div>
        <div><dt>Round trip</dt><dd id="d-rtt">—</dd></div>
        <div><dt>Extension</dt><dd id="d-ver">—</dd></div>
      </dl>
    </section>

    <section class="section danger" aria-labelledby="h-danger">
      <h2 id="h-danger">Danger zone</h2>
      <div class="btn-row">
        <button id="leave" class="btn btn-ghost" type="button">Leave all rooms</button>
        <button id="uninstall" class="btn btn-ghost leave" type="button">Uninstall Duet…</button>
      </div>
      <p id="status" class="status" role="status"></p>
    </section>

    <section class="section" aria-labelledby="h-about">
      <h2 id="h-about">About Duet</h2>
      <p class="hint" id="about-ver">Duet — browser extension</p>
      <ul class="link-list">
        <li><a id="about-change" href="https://github.com/pratikwayal01/duet/releases" target="_blank" rel="noreferrer">Changelog</a></li>
        <li><a href="https://github.com/pratikwayal01/duet/tree/main/docs" target="_blank" rel="noreferrer">Documentation</a></li>
        <li><a href="https://github.com/pratikwayal01/duet" target="_blank" rel="noreferrer">GitHub</a></li>
        <li><a href="https://github.com/pratikwayal01/duet/issues/new/choose" target="_blank" rel="noreferrer">Send feedback</a></li>
        <li><a href="https://github.com/pratikwayal01/duet/blob/main/docs/privacy.md" target="_blank" rel="noreferrer">Privacy policy</a></li>
      </ul>
      <h3 class="sub">Permissions used</h3>
      <dl class="kv">
        <div><dt>storage</dt><dd>Settings and room state, on this device only</dd></div>
        <div><dt>sidePanel</dt><dd>Chat and sync controls beside the video</dd></div>
        <div><dt>activeTab</dt><dd>Detect the video on the tab you invoke us from</dd></div>
        <div><dt>management</dt><dd>Self-uninstall from Settings only</dd></div>
        <div><dt>site access</dt><dd>Sync on streaming sites + your signal server (changeable in Connection)</dd></div>
      </dl>
    </section>`;
}

async function boot(): Promise<void> {
  mount();
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const statusEl = $('status');
  const setStatus = (s: string): void => {
    statusEl.textContent = s;
  };

  try {
    const t = await storeGet(K.theme);
    if (t === 'light') document.documentElement.dataset.theme = 'light';
  } catch {
    /* dark default stands */
  }

  // --- profile + connection (autosave, debounced) ---
  const baseEl = $('base') as HTMLInputElement;
  const keyEl = $('key') as HTMLInputElement;
  const nameEl = $('name') as HTMLInputElement;
  baseEl.value = await getBase();
  keyEl.value = await getApiKey();
  nameEl.value = (await storeGet(K.name)) ?? '';

  let timer: number | undefined;
  let savedBase = normalizeBase(baseEl.value);
  const saveNow = async (): Promise<void> => {
    const base = normalizeBase(baseEl.value);
    if (base !== savedBase && base !== DEFAULT_BASE) {
      const granted = await ensurePermission(base);
      if (!granted) {
        setStatus('Browser permission for that server was declined.');
        return;
      }
    }
    savedBase = base;
    await setBase(base);
    await setApiKey(keyEl.value.trim());
    await storeSet(K.name, nameEl.value.trim().slice(0, 64) || null);
    baseEl.value = base;
    setStatus('Saved.');
  };
  const queue = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 600);
  };
  for (const f of [baseEl, keyEl, nameEl]) {
    f.addEventListener('input', queue);
    f.addEventListener('change', () => void saveNow());
  }

  $('test').addEventListener('click', async () => {
    setStatus('Testing…');
    setStatus(await testConnection(normalizeBase(baseEl.value), keyEl.value.trim()));
  });

  // --- playback (immediate) ---
  const ctlBoth = $('ctl-both') as HTMLButtonElement;
  const ctlHost = $('ctl-host') as HTMLButtonElement;
  const pickControl = async (host: boolean): Promise<void> => {
    ctlBoth.setAttribute('aria-pressed', String(!host));
    ctlHost.setAttribute('aria-pressed', String(host));
    await storeSet(K.control, host ? 'host' : 'both');
    setStatus(host ? 'Only you control by default.' : 'You both control by default.');
  };
  ctlBoth.addEventListener('click', () => void pickControl(false));
  ctlHost.addEventListener('click', () => void pickControl(true));
  if ((await storeGet(K.control)) === 'host') {
    ctlBoth.setAttribute('aria-pressed', 'false');
    ctlHost.setAttribute('aria-pressed', 'true');
  }

  const nudge = $('nudge') as HTMLButtonElement;
  const setNudge = async (on: boolean): Promise<void> => {
    nudge.setAttribute('aria-checked', String(on));
    await storeSet(K.nudge, on ? '1' : '0');
  };
  nudge.addEventListener('click', () => void setNudge(nudge.getAttribute('aria-checked') !== 'true'));
  if ((await storeGet(K.nudge)) === '0') nudge.setAttribute('aria-checked', 'false');

  const themeBtns: Record<string, HTMLButtonElement> = {
    system: $('th-system') as HTMLButtonElement,
    dark: $('th-dark') as HTMLButtonElement,
    light: $('th-light') as HTMLButtonElement,
  };
  const applyTheme = async (t: 'system' | 'dark' | 'light'): Promise<void> => {
    for (const [k, b] of Object.entries(themeBtns)) b.setAttribute('aria-pressed', String(k === t));
    if (t === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    await storeSet(K.theme, t === 'system' ? null : t);
    setStatus(t === 'system' ? 'Following the system theme.' : `${t[0]?.toUpperCase()}${t.slice(1)} theme on.`);
  };
  for (const [k, b] of Object.entries(themeBtns)) b.addEventListener('click', () => void applyTheme(k as 'system' | 'dark' | 'light'));
  const savedTheme = await storeGet(K.theme);
  const initial = savedTheme === 'light' ? 'light' : savedTheme === 'dark' ? 'dark' : 'system';
  for (const [k, b] of Object.entries(themeBtns)) b.setAttribute('aria-pressed', String(k === initial));

  // --- diagnostics ---
  $('refresh').addEventListener('click', async () => {
    setStatus('Checking…');
    try {
      const res = (await chrome.runtime.sendMessage({ cmd: 'duet:diag' })) as {
        diag?: { connected?: boolean; serverOffsetMs?: number; rttMs?: number | null };
        room?: { roomId?: string } | null;
      } | null;
      ($('d-room') as HTMLElement).textContent = res?.room?.roomId ?? 'no room';
      ($('d-conn') as HTMLElement).textContent = res?.diag?.connected ? 'yes' : 'no';
      ($('d-offset') as HTMLElement).textContent =
        typeof res?.diag?.serverOffsetMs === 'number' ? `${res.diag.serverOffsetMs} ms` : '—';
      ($('d-rtt') as HTMLElement).textContent =
        typeof res?.diag?.rttMs === 'number' ? `${res.diag.rttMs} ms` : '—';
      try {
        ($('d-ver') as HTMLElement).textContent = chrome.runtime.getManifest().version;
      } catch {
        ($('d-ver') as HTMLElement).textContent = '—';
      }
      setStatus('Updated.');
    } catch {
      setStatus("Couldn't reach the background worker.");
    }
  });

  // --- danger zone ---
  $('leave').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ cmd: 'duet:leave' });
      await chrome.storage.session.remove('duet:room');
    } catch {
      /* ignore */
    }
    setStatus('Left all rooms.');
  });

  const uninstall = $('uninstall') as HTMLButtonElement;
  let armed = false;
  let armTimer: number | undefined;
  uninstall.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      uninstall.textContent = 'Click again to confirm uninstall';
      setStatus('Tell us why first — a feedback form opens, then confirm here.');
      try {
        void chrome.tabs
          .create({
            url: 'https://github.com/pratikwayal01/duet/issues/new?template=uninstall.yml',
          })
          .catch(() => {});
      } catch {
        /* no tabs permission: feedback link lives in About below */
      }
      armTimer = window.setTimeout(() => {
        armed = false;
        uninstall.textContent = 'Uninstall Duet…';
      }, 30000);
      return;
    }
    window.clearTimeout(armTimer);
    void chrome.management.uninstallSelf({ showConfirmDialog: true }).catch(() => {
      setStatus("Couldn't uninstall — remove it from the extensions page.");
    });
  });

  // --- about ---
  try {
    ($('about-ver') as HTMLElement).textContent =
      `Duet v${chrome.runtime.getManifest().version} — watch together, just the two of you.`;
  } catch {
    /* fallback text stands */
  }
}

void boot();
