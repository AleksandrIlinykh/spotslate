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

test('the toolbar popup shows the vocabulary by language, copies the current one, and removes a word', async ({ page, extensionId, serviceWorker, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      vocabulary: { de: [{ word: 'Hund', date: 2 }, { word: 'Katze', date: 1 }], fr: [{ word: 'chat', date: 3 }] },
    }),
  );
  await page.goto(`chrome-extension://${extensionId}/compose.html`);
  const vocab = page.locator('.vocab');
  await expect(vocab.locator('.vocab-lang')).toHaveCount(2); // a tab per language
  await expect(vocab.locator('.vocab-list')).toContainText('Hund');
  await expect(vocab.locator('.vocab-list')).toContainText('Katze');

  // Copy copies the current (first) language's words, newest first, one per line, with no translation.
  await vocab.locator('.vocab-copy').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split(/\r?\n/)).toEqual(['Hund', 'Katze']); // the OS clipboard may use CRLF line breaks

  // Remove a word: gone from the list and from storage.
  await vocab.locator('.vocab-list li', { hasText: 'Hund' }).locator('.vocab-del').click();
  await expect(vocab.locator('.vocab-list')).not.toContainText('Hund');
  await expect
    .poll(() => serviceWorker.evaluate(() => chrome.storage.local.get('vocabulary').then((o) => o.vocabulary.de.map((e) => e.word))))
    .toEqual(['Katze']);

  // Switch to the other language.
  await vocab.locator('.vocab-lang').nth(1).click();
  await expect(vocab.locator('.vocab-list')).toContainText('chat');
  await expect(vocab.locator('.vocab-list')).not.toContainText('Katze');
});
