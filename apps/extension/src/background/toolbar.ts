// Toolbar icon states: idle (no room), waiting (room open, partner away),
// active (both connected), alert (desync/error). PNGs live in public/icons/.
export type ToolbarState = 'idle' | 'waiting' | 'active' | 'alert';

export function setToolbarState(state: ToolbarState): void {
  void chrome.action
    .setIcon({
      path: {
        16: `icons/action-${state}-16.png`,
        32: `icons/action-${state}-32.png`,
      },
    })
    .catch(() => {
      /* ponytail: icon missing on some builds; toolbar still works */
    });
}
