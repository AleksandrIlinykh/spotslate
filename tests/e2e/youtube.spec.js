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

const popupHost = (page) => page.locator('#spotslate-root');

test('in fullscreen the caption popup shows in the top layer, over the video', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  await page.locator('#go-fs').click();
  const inFullscreen = await page.evaluate(() => document.fullscreenElement?.id ?? null);
  expect(inFullscreen, 'the test browser must enter fullscreen for this check').toBe('movie_player');
  await altHover(page, '#seg1');
  await expect(popupText(page)).toContainText('of extraordinary talent');
  expect(await popupHost(page).evaluate((h) => h.matches(':popover-open'))).toBe(true);
});
