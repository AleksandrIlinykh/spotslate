import { test, expect, popupRoot, popupText, say } from './fixtures.js';

// A page whose content lives in a frame of another site, as a Claude artifact does. The keyboard stays with the
// page around the frame until the user clicks into it.
async function openFramed(page, server) {
  await page.goto(`${server.url}/framed.html`); // the frame is on frame.test
  const frame = page.frameLocator('#frame');
  await expect(frame.locator('#p1')).toBeVisible();
  return frame;
}

async function pointAt(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5, { steps: 3 });
}

const translated = (text) => `[RU] ${text}`;
const P1 = 'The quick brown fox jumps over the lazy dog. Read more';
const P2 = 'Second paragraph with an inline span inside.';

test.beforeEach(async ({ setSettings }) => {
  await setSettings();
});

test('Alt over a paragraph in a frame of another site translates it in the frame, the keyboard still on the page', { tag: '@smoke' }, async ({ page, server }) => {
  const frame = await openFramed(page, server);
  await pointAt(page, frame.locator('#p1'));
  await page.keyboard.down('Alt');
  await expect(popupText(frame)).toHaveText(translated(P1));
  await expect(popupRoot(page)).toHaveCount(0);
  await expect(page.locator('#spotslate-highlight')).toBeHidden();
  await page.keyboard.up('Alt');
  expect(server.requests).toHaveLength(1);
  expect(server.requests[0].body.messages.at(-1).content).toContain('The quick brown fox');

  // Clicked into, the frame has the keyboard and hears Alt itself.
  await frame.locator('#p2').click();
  await pointAt(page, frame.locator('#p2'));
  await page.keyboard.down('Alt');
  await expect(popupText(frame)).toHaveText(translated(P2));
  await page.keyboard.up('Alt');
});

test('Alt held on the page around a frame, then the mouse moved into it, translates there', async ({ page, server }) => {
  const frame = await openFramed(page, server);
  await pointAt(page, page.locator('#outside'));
  await page.keyboard.down('Alt');
  await pointAt(page, frame.locator('#p2'));
  await expect(popupText(frame)).toHaveText(translated(P2));
  await page.keyboard.up('Alt');
});

test('switched off for the site of the tab, a frame of another site in it gets nothing either', async ({ page, context, serviceWorker, extensionId, server }) => {
  const frame = await openFramed(page, server);
  const tabId = await serviceWorker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, page.url());
  const toolbar = await context.newPage();
  await toolbar.goto(`chrome-extension://${extensionId}/compose.html?tab=${tabId}`);
  await expect(toolbar.locator('.site-name')).toHaveText(say('siteSwitch', { site: new URL(page.url()).host }));
  await toolbar.locator('.site-switch').uncheck();
  await expect(toolbar.locator('.site-off')).toHaveText(say('siteOff'));
  await page.bringToFront();
  await frame.locator('#p2').click(); // the frame's own Alt, too
  await pointAt(page, frame.locator('#p1'));
  await page.keyboard.down('Alt');
  await page.waitForTimeout(600);
  await expect(popupRoot(frame)).toHaveCount(0);
  await page.keyboard.up('Alt');
  expect(server.requests).toHaveLength(0);
});
