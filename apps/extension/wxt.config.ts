import { defineConfig } from 'wxt';

// MV3, Chromium only (PRD D2). WXT generates the manifest from this.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Duet — watch together',
    permissions: ['activeTab', 'storage', 'sidePanel', 'management', 'scripting'],
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    // Per-service hosts. Generic <video> is opt-in per site (PRD §9),
    // requested at runtime via chrome.permissions.request().
    host_permissions: [
      '*://*.netflix.com/*',
      '*://*.amazon.com/*',
      '*://*.amazon.in/*',
      '*://*.primevideo.com/*',
      '*://*.hotstar.com/*',
      '*://*.jiohotstar.com/*',
      '*://*.youtube.com/*',
      // Default signal server: popup fetch (/api/room) + worker WebSocket.
      'https://duet-jhwt.onrender.com/*',
    ],
    optional_host_permissions: ['*://*/*'],
    side_panel: { default_path: 'sidepanel.html' },
    action: {
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/action-idle-16.png', 32: 'icons/action-idle-32.png' },
    },
  },
});
