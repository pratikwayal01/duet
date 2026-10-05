// Shared theme toggle: dark default, light via [data-theme] (tokens.css).
// Persists in chrome.storage.local under `duet:theme`.

export async function initTheme(button: HTMLButtonElement): Promise<void> {
  const apply = (t: string | null) => {
    if (t === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    button.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  };
  try {
    const got = (await chrome.storage.local.get('duet:theme'))['duet:theme'];
    apply(typeof got === 'string' ? got : null);
  } catch {
    apply(null);
  }
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? null : 'light';
    void chrome.storage.local.set(next ? { 'duet:theme': next } : {}).catch(() => {});
    if (!next) void chrome.storage.local.remove('duet:theme').catch(() => {});
    apply(next);
  });
}
