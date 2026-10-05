# Duet icon pack

Original artwork, MIT licensed (same as the project). Colors and stroke come from `moodboard.md` §4 and §7.

## Contents
```
brand/        mark, mark-small (no play triangle, for ≤32 px), mark-mono (currentColor),
              app-icon (+small, +light, +maskable)
extension/    toolbar state icons: idle, waiting, in-room (active), alert   (SVG masters)
png/extension icon-16/32/48/128.png and action-<state>-16/32/48.png
png/web       favicon.ico (16/32/48), favicon-32.png, apple-touch-icon.png (180),
              icon-192.png, icon-512.png, icon-512-maskable.png
icons/        55 UI icons, one SVG each (24 px grid, 1.75 stroke, round caps, currentColor)
sprite.svg    all UI icons as <symbol id="duet-NAME"> (one request, tiny memory cost)
icons.ts      typed path map + iconSvg() helper for Svelte/Preact (tree-shakeable)
preview.html  open in a browser to browse everything, light/dark toggle
```

## Extension (`manifest.json`)
```json
{
  "icons": { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
  "action": { "default_icon": { "16": "icons/action-idle-16.png", "32": "icons/action-idle-32.png" } }
}
```
Switch state at runtime:
```ts
chrome.action.setIcon({ path: { 16: "icons/action-active-16.png", 32: "icons/action-active-32.png" } });
```
States: `idle` (no room), `waiting` (room open, partner not here), `active` (both connected), `alert` (desync or error).
In WXT, put the PNGs in `public/icons/`.

## Web app `<head>`
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/brand/mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```
PWA manifest: `icon-192.png`, `icon-512.png` (purpose "any") and `icon-512-maskable.png` (purpose "maskable").

## UI icons
Inline with the sprite (best for memory: one shared definition):
```html
<svg width="20" height="20" aria-hidden="true"><use href="/sprite.svg#duet-play"/></svg>
```
Note: `<use>` with an external file works on same-origin pages. Inside extension content scripts and shadow DOM, inline the sprite or use `iconSvg()` from `icons.ts` instead.

Svelte/TS:
```ts
import { iconSvg } from "./icons";
el.innerHTML = iconSvg("mic-off", 20);
```
Style with CSS: `color: var(--text-1)`; hover `color: var(--accent)`. Sizes: 16, 20, 24 (default), 32.
Always add `aria-label` on the button, not the icon, and never rely on an icon alone for status (pair with text).

## Design rules
- Stroke 1.75 on a 24 px grid. Don't scale strokes; change `width/height` only.
- Brand mark: amber (you) and teal (them) circles, the overlap is the shared screen with a play triangle. Use `mark-small` below 33 px.
- Keep clear space around the mark of at least one quarter of its width.
- Don't recolor the two circles, rotate or add effects. Use `mark-mono` where one color is needed.

## Adding an icon
Add an entry to `icons-data.js` (name → [category, inner markup]) using the same grid and stroke, then re-run `src/build.js` (Node + a Chromium for PNG export; edit the `OUT` and Chromium paths at the top of the script for your machine).
