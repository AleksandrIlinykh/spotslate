import { test, expect } from './fixtures.js';

test.beforeEach(async ({ setSettings }) => {
  await setSettings({ targetLang: 'ru' });
});

test('Alt+A saves the selected word to the vocabulary, under the page language, and a toast confirms it', async ({ page, server, serviceWorker }) => {
  await page.goto(`${server.url}/vocabulary.html`);
  await page.locator('#word').dblclick(); // selects "Katze"
  await page.keyboard.press('Alt+a');

  // A toast names the word (in the language the user translates into).
  await expect(page.locator('#spotslate-toast')).toContainText('Katze');

  // It is stored under the page's declared language (de), with no translation.
  await expect
    .poll(() => serviceWorker.evaluate(() => chrome.storage.local.get('vocabulary').then((o) => (o.vocabulary?.de ?? []).map((e) => e.word))))
    .toContain('Katze');
});

test('Alt+A does not save the same word twice', async ({ page, server, serviceWorker }) => {
  await page.goto(`${server.url}/vocabulary.html`);
  await page.locator('#word').dblclick();
  await page.keyboard.press('Alt+a');
  await expect.poll(() => serviceWorker.evaluate(() => chrome.storage.local.get('vocabulary').then((o) => o.vocabulary?.de?.length ?? 0))).toBe(1);
  await page.locator('#word').dblclick();
  await page.keyboard.press('Alt+a');
  // Still one: a duplicate is ignored.
  await expect.poll(() => serviceWorker.evaluate(() => chrome.storage.local.get('vocabulary').then((o) => o.vocabulary?.de?.length ?? 0))).toBe(1);
});
