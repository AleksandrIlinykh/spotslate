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
    pageEl.append(canvas, textLayerEl);
    pagesEl.append(pageEl);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const textLayer = new pdfjs.TextLayer(
      /** @type {any} */ ({ textContentSource: await page.getTextContent(), container: textLayerEl, viewport }),
    );
    await textLayer.render();
  }
  document.dispatchEvent(new CustomEvent('spotslate-pdf-rendered', { detail: { pages: pdf.numPages } }));
}
