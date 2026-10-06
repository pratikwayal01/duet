// Popup contract test: loads .output/chrome-mv3 unpacked, opens popup.html,
// clicks EVERY button and asserts a visible effect. Fails on any console
// error or unhandled rejection. Run: npm run e2e --workspace @duet/extension
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const EXT = join(ROOT, '.output', 'chrome-mv3');
const CHROME = join(
  process.env.HOME ?? '/home/pratik',
  '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
);

let context: BrowserContext;
let extId: string;
const failures: string[] = [];

function watch(page: Page): void {
  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => failures.push(`pageerror: ${String(e)}`));
}

test.beforeAll(async ({ playwright }) => {
  context = await playwright.chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'duet-e2e-')), {
    executablePath: CHROME,
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  const worker =
    context.serviceWorkers().length > 0
      ? context.serviceWorkers()[0]!
      : await context.waitForEvent('serviceworker');
  const url = worker.url(); // chrome-extension://<id>/background.js
  extId = new URL(url).hostname;
  expect(extId).toMatch(/^[a-z]{32}$/);
});

test.afterAll(async () => {
  expect(failures, failures.join('\n')).toEqual([]);
  await context.close();
});

async function popup(): Promise<Page> {
  const page = await context.newPage();
  watch(page);
  await page.goto(`chrome-extension://${extId}/popup.html`);
  return page;
}

async function seedRoom(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { chrome: typeof chrome }).chrome.storage.session.set({
      'duet:room': {
        roomId: 'AAAAAAAAAAAAAAAAAAAAAAAAAA',
        url: 'wss://example.invalid/room/x',
        base: 'https://example.invalid',
        secret: 'BBBBBBBBBBBBBBBBBBBBBBBBBB',
        code: 'AB12CD',
      },
    }),
  );
  await page.reload();
}

test('home renders: chip, start, join, version stamp', async () => {
  const page = await popup();
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#join')).toBeVisible();
  await expect(page.locator('#buildstamp')).toContainText('Duet v');
  await page.close();
});

test('room view: every button has a visible effect', async () => {
  const page = await popup();
  await seedRoom(page);

  // Room code shown (short code preferred over raw id).
  await expect(page.locator('#roomcode')).toHaveText('AB12CD');
  // Honest chip: no peer here, never "Synced".
  await expect(page.locator('.room-head .chip')).toContainText('Waiting for your person');

  // Copy invite captures the full link + confirms.
  await page.evaluate(() => {
    (window as unknown as { __copied?: string }).__copied = undefined;
    (navigator.clipboard.writeText as unknown) = (t: string) => {
      (window as unknown as { __copied?: string }).__copied = t;
      return Promise.resolve();
    };
  });
  await page.click('#copyinvite');
  expect(await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)).toContain(
    '/r/AAAAAAAAAAAAAAAAAAAAAAAAAA#',
  );
  await expect(page.locator('#statusline')).toContainText('copied');

  // Both / Just me flips aria + persists.
  await page.click('#seg-me');
  await expect(page.locator('#seg-me')).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { chrome: typeof chrome }).chrome.storage.local.get('duet:control-default'),
    ),
  ).toMatchObject({ 'duet:control-default': 'host' });
  await page.click('#seg-both');
  await expect(page.locator('#seg-both')).toHaveAttribute('aria-pressed', 'true');

  // Mic / Camera: honest M4 message, no fake toggle.
  await page.click('#c-mic');
  await expect(page.locator('#statusline')).toContainText('M4');
  await page.click('#c-cam');
  await expect(page.locator('#statusline')).toContainText('M4');

  // Resync with no state: clear feedback, no hang.
  await page.click('#c-resync');
  await expect(page.locator('#statusline')).not.toBeEmpty({ timeout: 15000 });

  // Chat send: own bubble appears immediately.
  await page.fill('#chatmsg', 'hello there');
  await page.click('#chatform button[type="submit"]');
  await expect(page.locator('#chatlist')).toContainText('hello there');

  // Chat button: side panel opens (page closes) or honest fallback text.
  await page.click('#c-chat');
  await page
    .waitForEvent('close', { timeout: 5000 })
    .then(() => undefined)
    .catch(() => undefined);
  if (!page.isClosed()) {
    await expect(page.locator('#statusline')).toContainText('Side panel');
  }
  await page.close().catch(() => {});
});

test('leave returns home; settings + theme work', async () => {
  const page = await popup();
  await seedRoom(page);
  await page.click('#leave');
  await expect(page.locator('#start')).toBeVisible();

  const [options] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#settings'),
  ]);
  watch(options);
  await expect(options).toHaveURL(/options\.html$/);
  // Opening settings closes the popup by design; theme gets a fresh popup.
  await options.close();

  const page2 = await popup();
  await page2.click('#theme');
  await expect(page2.locator('html')).toHaveAttribute('data-theme', 'light');
  await page2.close();
});

test('popup scrolls: bottom content reachable, screenshot', async () => {
  const page = await popup();
  await seedRoom(page);
  const wrap = page.locator('.popup-wrap');
  const max = await wrap.evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight);
  expect(max, 'popup body must overflow so scrolling exists').toBeGreaterThan(0);
  await wrap.evaluate((el: HTMLElement, top: number) => el.scrollTo(0, top), max);
  expect(await wrap.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(0);
  // Empty <ol> has zero height (invisible); a message makes it real.
  await page.fill('#chatmsg', 'scroll check');
  await page.click('#chatform button[type="submit"]');
  await expect(page.locator('#chatlist')).toBeVisible();
  await page.screenshot({ path: join(ROOT, 'e2e', 'popup-scrolled.png'), fullPage: false });
  await page.close();
});
