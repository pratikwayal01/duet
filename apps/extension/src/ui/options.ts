// Duet settings (options page): signal server + API key. Stored in
// chrome.storage.local only — never leaves the browser except as a Bearer
// token to your own server. Popup stays thin; this page owns the form.

import { DEFAULT_BASE, getApiKey, getBase, setApiKey, setBase } from './room-link.ts';

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
    <form id="form" class="section">
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
      <p id="status" class="status" role="status"></p>
    </form>`;
}

async function boot(): Promise<void> {
  mount();
  const baseEl = document.getElementById('base') as HTMLInputElement;
  const keyEl = document.getElementById('key') as HTMLInputElement;
  const statusEl = document.getElementById('status') as HTMLElement;

  baseEl.value = await getBase();
  keyEl.value = await getApiKey();
  try {
    const got = (await chrome.storage.local.get('duet:theme'))['duet:theme'];
    if (got === 'light') document.documentElement.dataset.theme = 'light';
  } catch {
    /* dark default stands */
  }

  const setStatus = (s: string): void => {
    statusEl.textContent = s;
  };

  (document.getElementById('form') as HTMLFormElement).addEventListener('submit', (ev) => {
    ev.preventDefault();
  });

  // Autosave (debounced): no save button. Permission is requested only when
  // the server value actually changes to a non-default origin.
  let timer: number | undefined;
  let savedBase = normalizeBase(baseEl.value);
  const saveNow = async (): Promise<void> => {
    const base = normalizeBase(baseEl.value);
    const key = keyEl.value.trim();
    if (base !== savedBase && base !== DEFAULT_BASE) {
      const granted = await ensurePermission(base);
      if (!granted) {
        setStatus('Browser permission for that server was declined.');
        return;
      }
    }
    savedBase = base;
    await setBase(base);
    await setApiKey(key);
    baseEl.value = base;
    setStatus('Saved.');
  };
  const queue = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 600);
  };
  baseEl.addEventListener('input', queue);
  keyEl.addEventListener('input', queue);
  baseEl.addEventListener('change', () => void saveNow());
  keyEl.addEventListener('change', () => void saveNow());

  (document.getElementById('test') as HTMLButtonElement).addEventListener('click', async () => {
    setStatus('Testing…');
    setStatus(await testConnection(normalizeBase(baseEl.value), keyEl.value.trim()));
  });
}

void boot();
