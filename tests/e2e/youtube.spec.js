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

test('dual subtitles: a translation line is added under the native caption while it shows', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  const sub = page.locator('.spotslate-sub');
  await expect(sub).toContainText('[RU] What you have there is a person');
  await expect(sub).toContainText('of extraordinary talent');
  // The translation is a sibling under the native caption, so the native line still reads the original.
  await expect(page.locator('.captions-text')).not.toContainText('[RU]');
});

test('dual subtitles follow the caption: a new cue gets its own translation, with no leftover line', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] What you have there is a person');
  await page.evaluate(() => {
    document.querySelector('.captions-text').innerHTML =
      '<span class="caption-visual-line"><span class="ytp-caption-segment">a brand new line</span></span>';
  });
  await expect(page.locator('.spotslate-sub')).toHaveText('[RU] a brand new line');
  await expect(page.locator('.spotslate-sub')).toHaveCount(1);
});
