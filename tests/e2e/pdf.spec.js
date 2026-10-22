import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, expect, popupText, say } from './fixtures.js';
import { makePdf } from './pdf-maker.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.resolve(dir, '../fixtures/sample.pdf');
const PARAGRAPHS = path.resolve(dir, '../fixtures/paragraphs.pdf');
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

// Hovers over the span that holds `word` and presses Alt, with no selection.
async function altOverSpan(page, word) {
  const box = await page.locator('.textLayer span', { hasText: word }).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await page.keyboard.down('Alt');
}

async function openParagraphs(page, extensionId) {
  await page.goto(pdfUrl(extensionId));
  await page.locator('#file').setInputFiles(PARAGRAPHS);
  await expect(page.locator('.textLayer span').first()).toBeVisible();
}

test('Alt over a paragraph in the PDF translates the whole paragraph, both its lines', { tag: '@smoke' }, async ({ page, extensionId }) => {
  await openParagraphs(page, extensionId);
  await altOverSpan(page, 'vorne'); // the first paragraph: "...nach vorne." and "Ein kleiner Schritt."
  await expect(popupText(page)).toContainText('vorne');
  await expect(popupText(page)).toContainText('kleiner');
  await expect(popupText(page)).not.toContainText('Delta'); // not the neighbour, not the whole page
});

test('Alt over the other paragraph translates that one, not the first', async ({ page, extensionId }) => {
  await openParagraphs(page, extensionId);
  await altOverSpan(page, 'Zweiter'); // the second paragraph: "Zweiter Absatz Delta." and "Noch eine Zeile Delta."
  await expect(popupText(page)).toContainText('Zweiter');
  await expect(popupText(page)).toContainText('Noch');
  await expect(popupText(page)).not.toContainText('vorne');
});

// Opens a PDF built by the test in the reader, as if picked from the computer, and waits for its first text.
async function openBuilt(page, extensionId, pdf, name = 'built.pdf') {
  await page.goto(pdfUrl(extensionId));
  await page.locator('#file').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('.textLayer span').first()).toBeVisible();
}

const readerAt = (extensionId, src) => `${pdfUrl(extensionId)}?src=${encodeURIComponent(src)}`;

test('on a two-column page, Alt over the left column translates the left column, not the right', async ({ page, extensionId }) => {
  // Each row holds a line of both columns, the order many PDFs store them in.
  const rows = [
    ['Linke Spalte oben eins', 'Rechte Spalte oben eins'],
    ['linke Spalte Zeile zwei', 'rechte Spalte Zeile zwei'],
    ['links Ende.', 'rechts Ende.'],
  ];
  const lines = rows.flatMap(([left, right], i) => [
    [30, 300 - 18 * i, left],
    [230, 300 - 18 * i, right],
  ]);
  await openBuilt(page, extensionId, makePdf([lines]));
  await altOverSpan(page, 'Linke Spalte');
  await expect(popupText(page)).toContainText('Linke Spalte oben eins linke Spalte Zeile zwei links Ende.');
  await expect(popupText(page)).not.toContainText('Rechte');
  await expect(popupText(page)).not.toContainText('rechts');
});

test('a word split by a hyphen at a line end reaches the translation whole', async ({ page, extensionId }) => {
  await openBuilt(page, extensionId, makePdf([[[40, 300, 'Die Verbin-'], [40, 282, 'dung steht fest.']]]));
  await altOverSpan(page, 'Verbin');
  await expect(popupText(page)).toContainText('Die Verbindung steht fest.');
});

test('a long PDF renders only the pages near the view, the others once scrolled to, and drops pages left far behind', async ({ page, extensionId }) => {
  const pages = Array.from({ length: 40 }, (_, i) => [[40, 300, `Seite ${i + 1} hier.`]]);
  await openBuilt(page, extensionId, makePdf(pages), 'long.pdf');
  await expect(page.locator('.page')).toHaveCount(40); // every page has its place, so the scrollbar is right
  expect(await page.locator('.page[data-rendered]').count()).toBeLessThan(12);
  const last = page.locator('.page').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator('.textLayer')).toContainText('Seite 40');
  await expect(page.locator('.page').first().locator('canvas')).toHaveCount(0);
});

test('a PDF dropped on the reader opens', async ({ page, extensionId }) => {
  await page.goto(pdfUrl(extensionId));
  const bytes = [...fs.readFileSync(SAMPLE)];
  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.pdf', { type: 'application/pdf' }));
    return transfer;
  }, bytes);
  await page.dispatchEvent('#pages', 'drop', { dataTransfer });
  await expect(page.locator('#name')).toHaveText('dropped.pdf');
  await expect(page.locator('.textLayer')).toContainText('Schritt');
});

test('the reader opens the PDF at the address it is given, from a host it may read', async ({ page, extensionId, server }) => {
  await page.goto(readerAt(extensionId, `${server.url}/sample.pdf`));
  await expect(page.locator('#name')).toHaveText('sample.pdf');
  await expect(page.locator('.textLayer')).toContainText('Schritt');
});

test('from a host it may not read yet, the reader asks first, and opens the PDF once allowed', async ({ page, extensionId, server }) => {
  const { port } = new URL(server.url);
  await page.goto(readerAt(extensionId, `http://docs.test:${port}/pdf/sample`));
  await expect(page.locator('.notice')).toContainText('docs.test');
  await expect(page.locator('.textLayer')).toHaveCount(0);
  // Chrome's permission prompt cannot be answered in a test: it is replaced by one that records the ask and allows.
  await page.evaluate(() => {
    window.asked = [];
    chrome.permissions.request = async (permissions) => {
      window.asked.push(permissions);
      return true;
    };
  });
  await page.locator('.allow').click();
  await expect(page.locator('.textLayer')).toContainText('Schritt');
  expect(await page.evaluate(() => window.asked)).toEqual([{ origins: ['http://docs.test/*'] }]);
  await expect(page.locator('#name')).toHaveText('sample');
});

test('a file address opens when SpotSlate may read files', async ({ page, extensionId }) => {
  // The test browser loads the extension with file access on, as a user turns it on on the extensions page.
  await page.goto(readerAt(extensionId, pathToFileURL(SAMPLE).href));
  await expect(page.locator('#name')).toHaveText('sample.pdf');
  await expect(page.locator('.textLayer')).toContainText('Schritt');
});

test('a file address without file access: the reader says how to allow it', async ({ page, extensionId }) => {
  // File access is off by default for a user; the test browser has it on, so the reader is told it is off.
  await page.addInitScript(() => {
    chrome.extension.isAllowedFileSchemeAccess = async () => false;
  });
  await page.goto(readerAt(extensionId, 'file:///C:/books/manual.pdf'));
  await expect(page.locator('#name')).toHaveText('manual.pdf');
  await expect(page.locator('.notice')).toContainText('Allow access to file URLs');
});

test('an address that is not a PDF: the reader says it could not open it', async ({ page, extensionId, server }) => {
  await page.goto(readerAt(extensionId, `${server.url}/page.html`));
  await expect(page.locator('.notice')).toContainText('Could not open this PDF');
});

// The toolbar popup for the tab of `page`, opened as a page of its own (the real one is a popup on the active tab).
async function toolbarFor(page, context, serviceWorker, extensionId) {
  const tabId = await serviceWorker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, page.url());
  const toolbar = await context.newPage();
  await toolbar.goto(`chrome-extension://${extensionId}/compose.html?tab=${tabId}`);
  await expect(toolbar.locator('.draft')).toBeVisible();
  return toolbar;
}

test('on a tab showing a PDF, the toolbar popup offers to read it in SpotSlate and opens it in the reader', { tag: '@smoke' }, async ({ page, context, serviceWorker, extensionId, server }) => {
  await page.goto(`${server.url}/pdf/sample`); // an address without .pdf, the way arXiv serves its papers
  const toolbar = await toolbarFor(page, context, serviceWorker, extensionId);
  await expect(toolbar.locator('.pdf-here')).toHaveText(say('readThisPdf'));
  const [reader] = await Promise.all([context.waitForEvent('page'), toolbar.locator('.pdf-here').click()]);
  await expect(reader.locator('.textLayer')).toContainText('Schritt');
  expect(new URL(reader.url()).searchParams.get('src')).toBe(`${server.url}/pdf/sample`);
});

test('on a page that is not a PDF, the toolbar popup offers no PDF to read', async ({ page, context, serviceWorker, extensionId, server }) => {
  await page.goto(`${server.url}/page.html`);
  const toolbar = await toolbarFor(page, context, serviceWorker, extensionId);
  await expect(toolbar.locator('.site-switch')).toBeVisible();
  await expect(toolbar.locator('.pdf-here')).toHaveCount(0);
});
