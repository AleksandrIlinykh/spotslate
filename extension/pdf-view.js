// SpotSlate's own PDF reader: a local PDF rendered with pdf.js, each page with a selectable text layer, so the page's
// gestures (select text and hold Alt) translate it like any other page. Only a file the user picks is read; nothing
// is fetched or uploaded.
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const SCALE = 1.5;
const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('file'));
const pagesEl = document.getElementById('pages');
const nameEl = document.getElementById('name');

document.getElementById('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) openPdf(file);
});

// Renders every page of `file` into `#pages`, one page element each: a canvas with its text layer over it.
async function openPdf(file) {
  nameEl.textContent = file.name;
  pagesEl.replaceChildren();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: SCALE });
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.style.width = `${Math.floor(viewport.width)}px`;
    pageEl.style.height = `${Math.floor(viewport.height)}px`;
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const textLayerEl = document.createElement('div');
    textLayerEl.className = 'textLayer';
    textLayerEl.style.setProperty('--total-scale-factor', String(SCALE));
    pageEl.append(canvas, textLayerEl);
    pagesEl.append(pageEl);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const textLayer = new pdfjs.TextLayer(
      /** @type {any} */ ({ textContentSource: await page.getTextContent(), container: textLayerEl, viewport }),
    );
    await textLayer.render();
    groupParagraphs(textLayerEl);
  }
  document.dispatchEvent(new CustomEvent('spotslate-pdf-rendered', { detail: { pages: pdf.numPages } }));
}

// pdf.js makes every line its own absolutely positioned block, so SpotSlate's Alt over a line would translate one
// line. This groups the lines into paragraphs by the vertical gap between them and wraps each paragraph in a
// `data-spotslate-block` element (content/block.js then translates the whole paragraph on Alt). The lines stay
// absolutely positioned, now relative to the wrapper, so pdf.js's placement over the canvas is kept exactly.
function groupParagraphs(textLayerEl) {
  const lines = [...textLayerEl.children].filter((el) => el.tagName === 'SPAN' && el.textContent.trim());
  if (lines.length < 2) return;
  const geom = lines.map((el) => ({
    el,
    left: el.offsetLeft,
    top: el.offsetTop,
    right: el.offsetLeft + el.offsetWidth,
    bottom: el.offsetTop + el.offsetHeight,
  }));
  geom.sort((a, b) => a.top - b.top || a.left - b.left);
  const steps = geom.slice(1).map((g, i) => g.top - geom[i].top).filter((d) => d > 1).sort((a, b) => a - b);
  const lineStep = steps.length ? steps[Math.floor(steps.length / 2)] : geom[0].bottom - geom[0].top;

  const groups = [];
  let current = null;
  let prevTop = null;
  for (const g of geom) {
    if (prevTop === null || g.top - prevTop > lineStep * 1.6) groups.push((current = []));
    current.push(g);
    prevTop = g.top;
  }

  for (const group of groups) {
    const left = Math.min(...group.map((g) => g.left));
    const top = Math.min(...group.map((g) => g.top));
    const right = Math.max(...group.map((g) => g.right));
    const bottom = Math.max(...group.map((g) => g.bottom));
    const para = document.createElement('div');
    para.dataset.spotslateBlock = '';
    para.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;`;
    textLayerEl.insertBefore(para, group[0].el);
    for (const g of group) {
      g.el.style.left = `${g.left - left}px`;
      g.el.style.top = `${g.top - top}px`;
      para.append(g.el);
    }
  }
}
