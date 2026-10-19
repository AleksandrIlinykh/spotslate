import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, popupText } from './fixtures.js';

const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/sample.pdf');
const pdfUrl = (extensionId) => `chrome-extension://${extensionId}/pdf.html`;

// Opens the sample PDF in SpotSlate's reader and waits for its text layer.
async function openSample(page, extensionId) {
  await page.goto(pdfUrl(extensionId));
  await page.locator('#file').setInputFiles(SAMPLE);
  await expect(page.locator('.textLayer span').first()).toBeVisible();
}

// Selects the span that holds `word` and returns the selection's viewport rect.
function selectWord(page, word) {
  return page.locator('.textLayer span', { hasText: word }).first().evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
}

test.beforeEach(async ({ setSettings }) => {
  await setSettings();
});

test('the PDF reader renders a picked file as a selectable text layer', async ({ page, extensionId }) => {
  await openSample(page, extensionId);
  await expect(page.locator('#name')).toHaveText('sample.pdf');
  await expect(page.locator('.textLayer')).toContainText('Schritt');
});

test('selecting text in the PDF and holding Alt translates it', { tag: '@smoke' }, async ({ page, extensionId, server }) => {
  await openSample(page, extensionId);
  const rect = await selectWord(page, 'Schritt');
  await page.mouse.move(rect.x + Math.min(5, rect.width / 2), rect.y + rect.height / 2, { steps: 3 });
  await page.keyboard.down('Alt');
  await expect(popupText(page)).toContainText('[RU]');
  await expect(popupText(page)).toContainText('Schritt');
  expect(server.requests.length).toBeGreaterThan(0);
});
