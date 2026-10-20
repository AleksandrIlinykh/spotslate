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

test('dual subtitles: the translation shows above the caption, in our own overlay outside the caption DOM', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  const sub = page.locator('.spotslate-sub');
  await expect(sub).toContainText('[RU] What you have there is a person');
  await expect(sub).toContainText('of extraordinary talent');
  // The native caption is untouched (our line is a separate overlay in the player, not inside YouTube's caption box),
  // so the line being read never moves because of us.
  await expect(page.locator('.captions-text')).not.toContainText('[RU]');
  expect(await page.evaluate(() => !!document.querySelector('#movie_player > .spotslate-sub'))).toBe(true);
  expect(await page.evaluate(() => !!document.querySelector('.caption-window .spotslate-sub'))).toBe(false);
  const above = await page.evaluate(() => {
    const s = document.querySelector('.spotslate-sub').getBoundingClientRect();
    const n = document.querySelector('.captions-text').getBoundingClientRect();
    return s.bottom <= n.top + 1;
  });
  expect(above, 'the translation sits above the native caption').toBe(true);
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

test('dual subtitles: an ad caption is not translated while the ad shows', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`);
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] What you have there is a person');
  // An ad starts: YouTube marks the player `ad-showing` and the ad shows its own caption.
  await page.evaluate(() => {
    document.querySelector('#movie_player').classList.add('ad-showing');
    const cue = document.querySelector('.captions-text');
    const visual = document.createElement('span');
    visual.className = 'caption-visual-line';
    const seg = document.createElement('span');
    seg.className = 'ytp-caption-segment';
    seg.textContent = 'buy now from our sponsor';
    visual.append(seg);
    cue.replaceChildren(visual);
  });
  // The overlay clears and the ad caption is never sent to translate.
  await expect(page.locator('.spotslate-sub')).toBeHidden();
  await expect(page.locator('.spotslate-sub')).not.toContainText('buy now');
  expect(server.requests.some((request) => JSON.stringify(request.body).includes('buy now from our sponsor'))).toBe(false);
});

test('dual subtitles: while the next line is translating, the previous one dims rather than vanishing', async ({ page, server, setSettings }) => {
  await setSettings({ apiKey: 'slow' }); // slow, so the next translation stays pending long enough to observe the dim
  await page.goto(`${server.url}/youtube-captions.html`);
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] What you have there is a person', { timeout: 15000 });
  await page.evaluate(() => {
    document.querySelector('.captions-text').innerHTML =
      '<span class="caption-visual-line"><span class="ytp-caption-segment">a brand new line</span></span>';
  });
  // The old translation stays, dimmed, while the new one is on its way (no gap, but it reads as catching up).
  await expect(page.locator('.spotslate-sub.spotslate-sub-stale')).toHaveCount(1);
  await expect(page.locator('.spotslate-sub')).toContainText('What you have there is a person');
  // When the new translation lands, the dim clears and the text updates.
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] a brand new line', { timeout: 15000 });
  await expect(page.locator('.spotslate-sub.spotslate-sub-stale')).toHaveCount(0);
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
