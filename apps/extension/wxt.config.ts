import { defineConfig } from 'wxt';

// MV3, Chromium only (PRD D2). WXT generates the manifest from this.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Duet — watch together',
    permissions: ['activeTab', 'storage', 'sidePanel'],
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
    ],
    optional_host_permissions: ['*://*/*'],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_popup: 'popup.html' },
  },
});
