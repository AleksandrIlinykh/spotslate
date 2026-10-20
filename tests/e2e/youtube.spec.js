import { test, expect, altHover, popupText } from './fixtures.js';

test.beforeEach(async ({ setSettings }) => {
  await setSettings();
});

test('Alt over a YouTube caption translates the whole current line, not just the visual row under the pointer', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  await altHover(page, '#seg1');
  await expect(popupText(page)).toContainText('What you have there is a person');
  await expect(popupText(page)).toContainText('of extraordinary talent');
});
