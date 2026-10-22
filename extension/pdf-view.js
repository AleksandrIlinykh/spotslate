// SpotSlate's own PDF reader: a PDF rendered with pdf.js, each page with a selectable text layer, so the page's
// gestures (select text and hold Alt) translate it like any other page. The PDF is a file the user picks or drops
// here, or the one a tab shows (?src=, from the toolbar popup), downloaded again without cookies once the user allows
// SpotSlate on its host. Nothing is uploaded. Pages render as they come near the view and are dropped once far from
// it, so a long PDF opens at once and stays light.
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { paragraphsOf } from './lib/pdf-layout.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const SCALE = 1.5;
const NEAR = '150% 0px'; // pages up to one and a half screens above or below the view are rendered, the rest dropped
const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('file'));
const pagesEl = document.getElementById('pages');
const nameEl = document.getElementById('name');

/** @typedef {{ number: number, el: HTMLElement, token: object | null, pdfPage: any, task: any, textLayer: any }} PageView */
/** @type {{ pdf: any, pages: PageView[], observer: IntersectionObserver } | null} */
let open = null;
let opening = 0; // counts the documents asked for, so one that a newer one replaced while loading is dropped

document.getElementById('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
});

// A PDF dropped anywhere on the reader opens. Whatever is dropped is kept from the browser, which would leave the page.
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (file) openFile(file);
});

const src = new URLSearchParams(location.search).get('src');
if (src) openAddress(src);

async function openFile(file) {
  openDocument({ data: new Uint8Array(await file.arrayBuffer()) }, file.name);
}

// The PDF at `src`, the address of a tab that shows it. A web address needs SpotSlate's permission on its host (asked
// on a click, as Chrome requires); a file needs the "Allow access to file URLs" switch on the extensions page.
async function openAddress(src) {
  let url;
  try {
    url = new URL(src);
  } catch {
    return notice('SpotSlate cannot open a PDF from this address.');
  }
  const name = fileNameOf(url);
  showName(name);
  if (url.protocol === 'file:') {
    if (await chrome.extension.isAllowedFileSchemeAccess()) return openDocument({ url: url.href }, name);
    const extensions = button('Open the extensions page', () =>
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }),
    );
    return notice(
      'To open a PDF from your computer by its address, turn on "Allow access to file URLs" for SpotSlate on the ' +
        'extensions page, then reload this page. Or pick the file with Open PDF.',
      extensions,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return notice('SpotSlate cannot open a PDF from this address.');
  const origins = [`${url.protocol}//${url.hostname}/*`];
  if (await chrome.permissions.contains({ origins })) return openDocument({ url: url.href }, name);
  const allow = button('Allow', async () => {
    if (await chrome.permissions.request({ origins }).catch(() => false)) openDocument({ url: url.href }, name);
  });
  allow.classList.add('allow');
  notice(
    `To open this PDF here, SpotSlate needs your permission to read files on ${url.hostname}. It downloads the PDF ` +
      'again, without your cookies. Or download it and pick the file with Open PDF.',
    allow,
  );
}

// Opens a PDF (pdf.js's source: its bytes or its address): a place for every page, sized like the first, so the
// scrollbar is right at once; each page draws when it comes near the view.
async function openDocument(source, name) {
  const ticket = ++opening;
  closeDocument();
  showName(name);
  notice('Opening the PDF...');
  let pdf;
  let first;
  try {
    pdf = await pdfjs.getDocument(source).promise;
    first = await pdf.getPage(1);
  } catch (error) {
    if (ticket === opening) {
      notice(`Could not open this PDF: ${error?.message ?? error} If it needs a sign-in, download it and pick the file with Open PDF.`);
    }
    return;
  }
  if (ticket !== opening) return void pdf.destroy();
  const { width, height } = first.getViewport({ scale: SCALE });
  /** @type {PageView[]} */
  const pages = [];
  pagesEl.replaceChildren();
  for (let number = 1; number <= pdf.numPages; number++) {
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.page = String(number);
    setSize(el, width, height);
    pagesEl.append(el);
    pages.push({ number, el, token: null, pdfPage: null, task: null, textLayer: null });
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const page = pages[Number(/** @type {HTMLElement} */ (entry.target).dataset.page) - 1];
        if (entry.isIntersecting) renderPage(pdf, page);
        else dropPage(page);
      }
    },
    { rootMargin: NEAR },
  );
  open = { pdf, pages, observer };
  for (const page of pages) observer.observe(page.el);
}

function closeDocument() {
  if (!open) return;
  open.observer.disconnect();
  for (const page of open.pages) dropPage(page);
  open.pdf.destroy();
  open = null;
}

// Draws a page and lays its text layer over it, the text grouped into paragraphs. A page dropped meanwhile stops.
async function renderPage(pdf, page) {
  if (page.token) return; // drawn or drawing
  const token = (page.token = {});
  const current = () => page.token === token;
  try {
    const pdfPage = (page.pdfPage = await pdf.getPage(page.number));
    if (!current()) return;
    const viewport = pdfPage.getViewport({ scale: SCALE });
    setSize(page.el, viewport.width, viewport.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const textLayerEl = document.createElement('div');
    textLayerEl.className = 'textLayer';
    textLayerEl.style.setProperty('--total-scale-factor', String(SCALE));
    page.el.append(canvas, textLayerEl);
    page.task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
    await page.task.promise;
    const textContentSource = await pdfPage.getTextContent();
    if (!current()) return;
    page.textLayer = new pdfjs.TextLayer(/** @type {any} */ ({ textContentSource, container: textLayerEl, viewport }));
    await page.textLayer.render();
    if (!current()) return;
    groupParagraphs(textLayerEl);
    page.el.dataset.rendered = '';
  } catch (error) {
    if (current()) console.error(error); // a page dropped while drawing throws its cancel: nothing went wrong
  }
}

// Frees a page far from the view: its canvas and text layer go, its place stays.
function dropPage(page) {
  if (!page.token) return;
  page.token = null;
  page.task?.cancel();
  page.textLayer?.cancel();
  page.pdfPage?.cleanup();
  Object.assign(page, { task: null, textLayer: null, pdfPage: null });
  page.el.replaceChildren();
  delete page.el.dataset.rendered;
}

// pdf.js makes every run of text its own absolutely positioned span, so SpotSlate's Alt over one would translate a
// piece of a line. This groups the runs into paragraphs (lib/pdf-layout.js: lines from runs on a row, paragraphs from
// lines under one another, the columns of a page apart) and wraps each paragraph in a `data-spotslate-block` element
// that carries its text read as one in `data-spotslate-text` (content/block.js translates that on Alt). The runs keep
// their place over the canvas exactly: still absolutely positioned, now relative to the wrapper.
function groupParagraphs(textLayerEl) {
  const spans = [...textLayerEl.children].filter((el) => el instanceof HTMLElement && el.tagName === 'SPAN');
  const origin = textLayerEl.getBoundingClientRect();
  const runs = spans.map((el) => {
    const box = el.getBoundingClientRect();
    const left = box.left - origin.left;
    const top = box.top - origin.top;
    return { left, top, right: left + box.width, bottom: top + box.height, text: el.textContent };
  });
  // Where each span is placed, read before any moves (a moved span measures from its wrapper).
  const placed = spans.map((el) => {
    const style = getComputedStyle(el);
    return { left: parseFloat(style.left), top: parseFloat(style.top) };
  });
  for (const paragraph of paragraphsOf(runs)) {
    const boxes = paragraph.runs.map((i) => runs[i]);
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    const wrapper = document.createElement('div');
    wrapper.dataset.spotslateBlock = '';
    wrapper.dataset.spotslateText = paragraph.text;
    wrapper.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;`;
    textLayerEl.insertBefore(wrapper, spans[Math.min(...paragraph.runs)]);
    for (const i of paragraph.runs) {
      spans[i].style.left = `${placed[i].left - left}px`;
      spans[i].style.top = `${placed[i].top - top}px`;
      wrapper.append(spans[i]);
    }
  }
}

function showName(name) {
  nameEl.textContent = name;
  document.title = `${name} - SpotSlate`;
}

function fileNameOf(url) {
  const last = url.pathname.split('/').pop() || url.hostname;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function setSize(el, width, height) {
  el.style.width = `${Math.floor(width)}px`;
  el.style.height = `${Math.floor(height)}px`;
}

// A message in place of the pages, with the buttons that act on it.
function notice(text, ...actions) {
  const box = document.createElement('div');
  box.className = 'notice';
  const message = document.createElement('p');
  message.textContent = text;
  box.append(message, ...actions);
  pagesEl.replaceChildren(box);
}

function button(label, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
