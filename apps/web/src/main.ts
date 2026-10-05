import { h, render } from 'preact';
import './styles.css';
import '@duet/ui-kit/tokens';
import '@duet/ui-kit/components';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/jetbrains-mono';
import { Landing } from './pages/Landing';
import { Room } from './pages/Room';
import { Invite } from './pages/Invite';

function announce(msg: string) {
  document.getElementById('live')?.replaceChildren(msg);
}

function route() {
  const root = document.getElementById('root');
  if (!root) return;
  const path = location.pathname.replace(/\/$/, '') || '/';
  if (path === '/new') {
    render(h(Invite, { announce }), root);
  } else if (path.startsWith('/r/')) {
    render(h(Room, { announce }), root);
  } else {
    render(h(Landing, { announce }), root);
  }
}

window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
route();
