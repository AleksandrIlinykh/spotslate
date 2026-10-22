import { test, expect, altHover, moveTo, popupText, inContentScript, EXTENSION_PATH } from './fixtures.js';

test.beforeEach(async ({ setSettings }) => {
  await setSettings();
});

test('a page cannot fake Alt and the mouse to get a translation with the user key', { tag: '@smoke' }, async ({ page, server }) => {
  await page.goto(`${server.url}/long.html`);
  await page.evaluate(() => {
    const box = document.getElementById('long').getBoundingClientRect();
    const x = box.left + 20;
    const y = box.top + 10;
    dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true }));
    dispatchEvent(new MouseEvent('mousemove', { clientX: x + 1, clientY: y, altKey: true, bubbles: true }));
  });
  await page.waitForTimeout(1000);
  await expect(page.locator('#spotslate-root')).toHaveCount(0);
  await expect(page.locator('#spotslate-hero')).toHaveCount(0);
  expect(server.requests).toHaveLength(0);
});

test('a fake mouse move cannot redirect a real Alt to another paragraph', async ({ page, server }) => {
  await page.goto(`${server.url}/long.html`);
  await moveTo(page, '#long');
  await page.evaluate(() => {
    const box = document.getElementById('long2').getBoundingClientRect();
    dispatchEvent(new MouseEvent('mousemove', { clientX: box.left + 20, clientY: box.top + 10, altKey: true, bubbles: true }));
  });
  await page.keyboard.down('Alt');
  await expect(popupText(page)).toContainText('[RU] Our team');
});

test('a fake mousedown does not close the popup', async ({ page, server }) => {
  await page.goto(`${server.url}/long.html`);
  await altHover(page, '#long');
  await expect(popupText(page)).toContainText('[RU]');
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 })));
  await page.waitForTimeout(300);
  await expect(page.locator('#spotslate-root')).toHaveCount(1);
});

test('dual subtitles do not run off YouTube: a page on another site with a player and captions sends nothing', async ({ page, server }) => {
  // The test copy of the extension allows 127.0.0.1 next to YouTube; localhost is the same server at another name.
  await page.goto(`${server.url.replace('127.0.0.1', 'localhost')}/youtube-captions.html`);
  await page.waitForTimeout(1500);
  await expect(page.locator('.spotslate-sub')).toHaveCount(0);
  expect(server.requests).toHaveLength(0);
});

test('a content script cannot read the vocabulary; only the extension pages can', async ({ page, server, serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.set({ vocabulary: { de: [{ word: 'Katze', date: 1 }] } }));
  await page.goto(`${server.url}/long.html`);
  const answer = await inContentScript(page, "chrome.runtime.sendMessage({ type: 'vocabulary' })");
  expect(answer).toBeUndefined();
});

test.describe('the extension as shipped', () => {
  test.use({ extensionPath: EXTENSION_PATH });

  test('keeps the popup, the companion and the compose window closed to the page', { tag: '@smoke' }, async ({ page, server }) => {
    await page.goto(`${server.url}/long.html`);
    await altHover(page, '#long');
    await expect(page.locator('#spotslate-root')).toHaveCount(1);
    await expect.poll(() => server.requests.length).toBe(1);
    expect(await page.evaluate(() => document.getElementById('spotslate-root').shadowRoot)).toBeNull();
    expect(await page.evaluate(() => document.getElementById('spotslate-hero')?.shadowRoot ?? null)).toBeNull();
    await page.keyboard.up('Alt');
    await page.keyboard.press('Escape');
    await page.mouse.move(5, 5);
    await page.keyboard.press('Alt+KeyT');
    await expect(page.locator('#spotslate-compose')).toHaveCount(1);
    expect(await page.evaluate(() => document.getElementById('spotslate-compose').shadowRoot)).toBeNull();
  });

  test('runs the dual subtitles only on YouTube', async ({ page, server }) => {
    await page.goto(`${server.url}/youtube-captions.html`); // 127.0.0.1: allowed in the test copy, not in the extension
    await page.waitForTimeout(1500);
    await expect(page.locator('.spotslate-sub')).toHaveCount(0);
    expect(server.requests).toHaveLength(0);
  });
});
