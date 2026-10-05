// Popup before joining: Start a room / Join with link / status line (moodboard §5.4).
// ponytail: vanilla DOM skeleton — Svelte components land in the M1 UI pass.

function mount() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <button id="start" type="button">Start a room</button>
    <form id="join"><input type="text" placeholder="Paste invite link…" aria-label="Invite link" />
    <button type="submit">Join</button></form>
    <p id="status" role="status"></p>`;
  // ponytail: create-room + join wiring arrives in M1/M2.
}

mount();
