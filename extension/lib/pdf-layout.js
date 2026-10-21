// The paragraphs of a PDF page, for SpotSlate's PDF reader. pdf.js gives a page as text runs, each with its box. Runs
// side by side on one row make a line, and lines under one another make a paragraph, so the columns of a two-column
// page stay apart. A paragraph's text reads as one: its lines joined, and a word split by a hyphen at a line end
// made whole. Pure, so it is tested without a PDF.

const JOIN_GAP = 1.2; // runs on one row at most this many line heights apart are one line
const SPLIT_GAP = 3; // runs further apart are not; in between, it depends on the text above and below (onOneRow)
const TALL = 2.5; // a run this many times taller than another is not on its line (text set sideways, a drop cap)
const SPACE_GAP = 0.15; // a gap between two runs wider than this many line heights reads as a space
const PARAGRAPH_STEP = 1.45; // a line further below the one above than this many usual line steps starts a paragraph
const INDENT = 0.8; // so does a line this many line heights further in (or out) than the one above, after two lines
const SIZE_RATIO = 1.25; // and a line in another font size (a heading over its text)
const BULLET = /^\s*(?:[\u2022\u25e6\u25aa\u2023\u2219\u00b7*\u2013\u2014-]|\(?\d{1,3}[.)])\s/;
const HYPHEN_END = /\p{L}[-\u2010]$/u;
const SOFT_HYPHEN_END = /\u00ad$/;
const LOWER_START = /^\p{Ll}/u;

/**
 * The paragraphs of a page's runs (boxes in pixels, top down), in the order of their first run: each as the indexes
 * of its runs, row by row and left to right, and its text. Blank runs belong to none.
 * @param {{ left: number, top: number, right: number, bottom: number, text: string }[]} runs
 * @returns {{ runs: number[], text: string }[]}
 */
export function paragraphsOf(runs) {
  const lines = linesOf(runs);
  const step = usualStep(lines);
  const paragraphs = [];
  for (const line of [...lines].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const above = paragraphAbove(paragraphs, line, step);
    if (above && !startsParagraph(above, line)) above.push(line);
    else paragraphs.push([line]);
  }
  return paragraphs
    .map((lines) => ({ runs: lines.flatMap((line) => line.runs.map((run) => run.index)), text: textOf(lines) }))
    .sort((a, b) => Math.min(...a.runs) - Math.min(...b.runs));
}

// Runs on one row and close to each other, as lines: the box around them, the top and height of the tallest (so a
// superscript does not shift the line), the runs left to right and their text.
function linesOf(runs) {
  const lines = [];
  const usable = runs
    .map((run, index) => ({ ...run, index, height: run.bottom - run.top }))
    .filter((run) => run.text.trim() && run.height > 0);
  for (const run of [...usable].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((line) => onOneRow(line, run, usable));
    if (!line) {
      lines.push({ runs: [run], left: run.left, right: run.right, top: run.top, height: run.height, text: '' });
      continue;
    }
    line.runs.push(run);
    line.left = Math.min(line.left, run.left);
    line.right = Math.max(line.right, run.right);
    if (run.height > line.height) Object.assign(line, { top: run.top, height: run.height });
  }
  for (const line of lines) {
    line.runs.sort((a, b) => a.left - b.left);
    line.text = lineText(line.runs);
  }
  return lines;
}

// Whether `run` continues `line`: on its row, about its size, and close beside it. A wider gap is a loose space of a
// justified line when the text just above or below runs across it, and the gap between two columns when it does not.
function onOneRow(line, run, runs) {
  const low = Math.min(line.height, run.height);
  const high = Math.max(line.height, run.height);
  const overlap = Math.min(line.top + line.height, run.bottom) - Math.max(line.top, run.top);
  if (overlap < 0.5 * low || high > TALL * low) return false;
  const [from, to] = run.left >= line.right ? [line.right, run.left] : [run.right, line.left];
  const gap = to - from;
  if (gap <= JOIN_GAP * high) return true;
  if (gap > SPLIT_GAP * high) return false;
  return runs.some((other) => {
    const drop = Math.abs(other.top - line.top);
    return drop > 0.5 * high && drop <= 2 * high && Math.min(other.right, to) - Math.max(other.left, from) >= 0.5 * gap;
  });
}

function lineText(runs) {
  let text = '';
  let previous = null;
  for (const run of runs) {
    const spaced = previous && run.left - previous.right > SPACE_GAP * Math.max(previous.height, run.height);
    if (spaced && !/\s$/.test(text) && !/^\s/.test(run.text)) text += ' ';
    text += run.text;
    previous = run;
  }
  return text.replace(/\s+/g, ' ').trim();
}

// The usual distance from a line's top to the top of the next line under it: the median over the page, so double
// spacing counts as usual on a double-spaced page.
function usualStep(lines) {
  const steps = [];
  for (const line of lines) {
    let nearest = Infinity;
    for (const other of lines) {
      const step = other.top - line.top;
      if (step > 0.5 * line.height && step < nearest && overlapX(line, other) > 0 && similarSize(line, other)) nearest = step;
    }
    if (nearest < Infinity) steps.push(nearest);
  }
  steps.sort((a, b) => a - b);
  return steps.length ? steps[Math.floor(steps.length / 2)] : 1.3 * (lines[0]?.height ?? 0);
}

// The paragraph whose last line is right above `line`, in its column (they overlap across), in the same font size.
function paragraphAbove(paragraphs, line, step) {
  let best = null;
  let bestOverlap = 0;
  for (const paragraph of paragraphs) {
    const last = paragraph.at(-1);
    const drop = line.top - last.top;
    const overlap = overlapX(last, line);
    if (drop <= 0.5 * last.height || drop > PARAGRAPH_STEP * step || overlap <= bestOverlap || !similarSize(last, line)) continue;
    best = paragraph;
    bestOverlap = overlap;
  }
  return best;
}

// Whether `line`, right under the paragraph, still starts a new one: a list item's bullet or number, or a line
// further in or out than the one above once the paragraph has two lines. A first line indented (a book's paragraph)
// or a list item's hanging indent comes after one line, so neither splits its own paragraph. After one line, an
// indented line starts a paragraph only under a short line: the end of a paragraph (carried over from the column
// before), where a list item's first line runs full.
function startsParagraph(paragraph, line) {
  if (BULLET.test(line.text)) return true;
  const last = paragraph.at(-1);
  const shift = line.left - last.left;
  if (paragraph.length >= 2) return Math.abs(shift) > INDENT * line.height;
  return shift > INDENT * line.height && last.right < line.right - 2 * line.height;
}

function textOf(lines) {
  let text = '';
  for (const { text: next } of lines) {
    if (!text) text = next;
    else if (SOFT_HYPHEN_END.test(text)) text = text.slice(0, -1) + next;
    else if (HYPHEN_END.test(text)) text = LOWER_START.test(next) ? text.slice(0, -1) + next : text + next;
    else text += ` ${next}`;
  }
  return text;
}

const overlapX = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left);
const similarSize = (a, b) => Math.max(a.height, b.height) / Math.min(a.height, b.height) <= SIZE_RATIO;
