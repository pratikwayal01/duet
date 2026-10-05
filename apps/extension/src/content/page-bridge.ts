// Page-world bridge: content script (isolated world) ↔ injected page script.
// Authenticated by per-session nonce; page replies only to our nonce.
// Used by adapters that must call the site's own player API (e.g. Netflix seek).

export interface BridgeMessage {
  nonce: string;
  cmd: 'play' | 'pause' | 'seek' | 'setRate';
  args?: number[];
}

export function createBridge(nonce: string, onCommand: (msg: BridgeMessage) => void) {
  const listener = (ev: MessageEvent) => {
    const msg = ev.data as Partial<BridgeMessage>;
    if (!msg || msg.nonce !== nonce || ev.source !== window) return;
    if (msg.cmd === 'play' || msg.cmd === 'pause' || msg.cmd === 'seek' || msg.cmd === 'setRate') {
      onCommand(msg as BridgeMessage);
    }
  };
  window.addEventListener('message', listener);
  return {
    /** Send a command into page-world (the injected script listens for these). */
    post: (cmd: BridgeMessage['cmd'], args?: number[]) =>
      window.postMessage({ nonce, cmd, args, from: 'duet-content' }, '*'),
    destroy: () => window.removeEventListener('message', listener),
  };
}
