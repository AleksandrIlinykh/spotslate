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

test('dual subtitles: a translation line is added above the native caption while it shows', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  const sub = page.locator('.spotslate-sub');
  await expect(sub).toContainText('[RU] What you have there is a person');
  await expect(sub).toContainText('of extraordinary talent');
  // The translation is a sibling above the native caption, so the native line below stays put and still reads the original.
  await expect(page.locator('.captions-text')).not.toContainText('[RU]');
  expect(
    await page.evaluate(() => document.querySelector('.captions-text').previousElementSibling?.classList.contains('spotslate-sub')),
  ).toBe(true);
});

test('dual subtitles: a preloader holds the line while the translation is on its way', async ({ page, server, setSettings }) => {
  await setSettings({ apiKey: 'slow' }); // one chunk per second, so the preloader is up long enough to see
  await page.goto(`${server.url}/youtube-captions.html`);
  await expect(page.locator('.spotslate-sub .spotslate-sub-wait')).toBeVisible();
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] What you have there is a person');
  await expect(page.locator('.spotslate-sub .spotslate-sub-wait')).toHaveCount(0); // gone once the text lands
});

test('dual subtitles: the video context is distilled from the metadata, then rides with the captions as notes', async ({ page, server, serviceWorker }) => {
  await page.goto(`${server.url}/youtube-video.html?v=testvideo`);
  // The first cue starts a context build from the page metadata: a non-streamed request carrying the title and metadata.
  await expect.poll(() => server.notesRequests.length).toBeGreaterThan(0);
  const build = server.notesRequests.at(-1);
  expect(build.body.stream).not.toBe(true);
  expect(build.body.messages.at(-1).content).toContain('Intro to Kafka');
  expect(build.body.messages.at(-1).content).toContain('<video>');
  // Once background has stored this video's context, a later caption carries it as the notes of its translation.
  await expect
    .poll(() => serviceWorker.evaluate(() => chrome.storage.session.get('vctx:testvideo').then((o) => o['vctx:testvideo'] ?? '')))
    .not.toBe('');
  await page.evaluate(() => {
    document.querySelector('.captions-text').innerHTML =
      '<span class="caption-visual-line"><span class="ytp-caption-segment">partitions and offsets</span></span>';
  });
  await expect
    .poll(() => server.requests.some((request) => request.body.messages.some((message) => typeof message.content === 'string' && message.content.includes('<notes>'))))
    .toBe(true);
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
