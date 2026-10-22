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

test('dual subtitles: a two-line caption is sent as one collapsed line, so a look-ahead cue matches its cache key', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-captions.html`); // its caption is two visual lines
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] What you have there is a person');
  // The newline between the two visual lines is collapsed to a space before translating (as parseTimedText does for a
  // cue), so the DOM line and the same timeline cue make the same cache key and look-ahead is a hit, not a miss.
  expect(
    server.requests.some((request) => JSON.stringify(request.body).includes('What you have there is a person of extraordinary talent')),
  ).toBe(true);
});

test('dual subtitles: a timedtext timeline warms the upcoming lines, so the shown line is ready without lag', async ({ page, server }) => {
  await page.goto(`${server.url}/youtube-timeline.html`);
  // Hand over a cue timeline, as content/youtube-timedtext.js would from the player's /api/timedtext response.
  await page.evaluate(() => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: 'the first spoken line' }] },
        { tStartMs: 3000, dDurationMs: 3000, segs: [{ utf8: 'the second spoken line' }] },
      ],
    });
    window.postMessage({ spotslate: 'spotslate-timedtext', body }, '*');
  });
  // The shown line (driven by the native caption, so it stays aligned) is translated.
  await expect(page.locator('.spotslate-sub')).toContainText('[RU] the first spoken line');
  // The upcoming line, not on screen yet, is translated ahead of time (warmed), so it will be a cache hit when it shows.
  await expect
    .poll(() => server.requests.some((request) => JSON.stringify(request.body).includes('the second spoken line')))
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

// The player fixture plays a video and reacts to the mouse as YouTube does, counting it: a press on the caption drags
// it, a click toggles play, a double click fullscreen, a right click opens the player's menu.
async function openPlayer(page, server) {
  await page.goto(`${server.url}/youtube-player.html`);
  await expect.poll(() => page.evaluate(() => document.querySelector('video').paused)).toBe(false);
}
const playerSaw = (page) => page.evaluate(() => ({ ...window.seen, paused: document.querySelector('video').paused }));
const selected = (page) => page.evaluate(() => getSelection().toString().trim());

// The middle of `word` in the text of `selector`, to point the mouse at it.
const wordAt = (page, selector, word) =>
  page.locator(selector).evaluate((element, text) => {
    const node = element.firstChild;
    const range = document.createRange();
    range.setStart(node, node.textContent.indexOf(text));
    range.setEnd(node, node.textContent.indexOf(text) + text.length);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, word);

const dblclickWord = async (page, selector, word) => {
  const { x, y } = await wordAt(page, selector, word);
  await page.mouse.dblclick(x, y);
};

test('a word in a YouTube caption can be selected: the press pauses the video, and the player neither drags the caption nor toggles play or fullscreen', async ({ page, server }) => {
  await openPlayer(page, server);
  await dblclickWord(page, '#seg2', 'extraordinary');
  expect(await selected(page)).toBe('extraordinary');
  expect(await playerSaw(page)).toEqual({ drags: 0, toggles: 0, fullscreens: 0, menus: 0, paused: true });
});

test('a press that starts on a caption and is let go over the video does not toggle play, and a later click on the video still does', async ({ page, server }) => {
  await openPlayer(page, server);
  const start = await wordAt(page, '#seg1', 'What');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 100, start.y - 150, { steps: 5 }); // up over the video
  await page.mouse.up(); // the click lands on the player, around both
  expect(await playerSaw(page)).toEqual({ drags: 0, toggles: 0, fullscreens: 0, menus: 0, paused: true });
  await page.mouse.click(start.x + 100, start.y - 150); // a plain click on the video is the player's again
  expect(await playerSaw(page)).toEqual({ drags: 0, toggles: 1, fullscreens: 0, menus: 0, paused: false });
});

test('a word selected in a YouTube caption goes to the vocabulary with Alt+A', async ({ page, server, serviceWorker }) => {
  await openPlayer(page, server);
  await dblclickWord(page, '#seg2', 'extraordinary');
  await page.keyboard.press('Alt+a');
  await expect(page.locator('#spotslate-toast')).toContainText('extraordinary');
  await expect
    .poll(() => serviceWorker.evaluate(() => chrome.storage.local.get('vocabulary').then((o) => (o.vocabulary?.en ?? []).map((e) => e.word))))
    .toContain('extraordinary');
});

test('Alt over a word selected in a YouTube caption translates the word, not the line', async ({ page, server }) => {
  await openPlayer(page, server);
  await dblclickWord(page, '#seg2', 'extraordinary');
  await page.keyboard.down('Alt');
  await expect(popupText(page)).toContainText('[RU] extraordinary');
  await expect(popupText(page)).not.toContainText('talent');
  await page.keyboard.up('Alt');
});

test('the translation line over a YouTube caption can be selected too, without toggling play', async ({ page, server }) => {
  await openPlayer(page, server);
  const line = page.locator('.spotslate-sub span');
  await expect(line).toContainText('[RU] What you have there is a person');
  await dblclickWord(page, '.spotslate-sub span', 'person');
  expect(await selected(page)).toBe('person');
  expect(await page.evaluate(() => Boolean(getSelection().anchorNode?.parentElement?.closest('.spotslate-sub')))).toBe(true);
  expect(await playerSaw(page)).toEqual({ drags: 0, toggles: 0, fullscreens: 0, menus: 0, paused: true });
});

test('a right click on a YouTube caption opens the browser menu (to copy), not the player menu, and does not pause', async ({ page, server }) => {
  await openPlayer(page, server);
  await page.locator('#seg2').click({ button: 'right' });
  expect(await playerSaw(page)).toEqual({ drags: 0, toggles: 0, fullscreens: 0, menus: 0, paused: false });
});
