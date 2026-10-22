import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphsOf } from '../../extension/lib/pdf-layout.js';

// A text run as pdf.js lays it out on a page: its box in pixels and its text. Lines are 20 px high, 26 px apart.
const run = (left, top, text, { width = text.length * 9, height = 20 } = {}) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  text,
});
const texts = (runs) => paragraphsOf(runs).map((p) => p.text);

test('lines close together are one paragraph, a wider gap starts the next', () => {
  const runs = [
    run(40, 100, 'Der Schritt nach vorne.'),
    run(40, 126, 'Ein kleiner Schritt.'),
    run(40, 190, 'Zweiter Absatz Delta.'),
    run(40, 216, 'Noch eine Zeile Delta.'),
  ];
  assert.deepEqual(paragraphsOf(runs), [
    { runs: [0, 1], text: 'Der Schritt nach vorne. Ein kleiner Schritt.' },
    { runs: [2, 3], text: 'Zweiter Absatz Delta. Noch eine Zeile Delta.' },
  ]);
});

test('two columns side by side are read apart, each column its own paragraph', () => {
  // pdf.js gives the runs row by row across both columns, as some PDFs store them.
  const runs = [
    run(40, 100, 'Links eins', { width: 160 }),
    run(240, 100, 'Rechts eins', { width: 160 }),
    run(40, 126, 'links zwei', { width: 160 }),
    run(240, 126, 'rechts zwei', { width: 160 }),
    run(40, 152, 'links drei.', { width: 100 }),
    run(240, 152, 'rechts drei.', { width: 100 }),
  ];
  assert.deepEqual(paragraphsOf(runs), [
    { runs: [0, 2, 4], text: 'Links eins links zwei links drei.' },
    { runs: [1, 3, 5], text: 'Rechts eins rechts zwei rechts drei.' },
  ]);
});

test('runs on one row join into one line, with a space only where the gap shows one', () => {
  const runs = [
    run(40, 100, 'Der ', { width: 36 }),
    run(76, 100, 'fette', { width: 45 }), // a bold word: a run of its own, touching
    run(125, 100, 'Text', { width: 36 }), // a gap of 4 px with no space in either run
    run(161, 100, 'chen.', { width: 45 }), // touching, no gap: the same word
  ];
  assert.deepEqual(texts(runs), ['Der fette Textchen.']);
});

test('a run a little higher on the same row (a superscript) stays on its line', () => {
  const runs = [run(40, 100, 'Wort', { width: 36 }), run(76, 96, '1', { width: 6, height: 12 }), run(86, 100, 'weiter', { width: 54 })];
  assert.deepEqual(texts(runs), ['Wort1 weiter']);
});

test('a word split by a hyphen at a line end is made whole; a compound keeps its hyphen', () => {
  const runs = [
    run(40, 100, 'Die Verbin-'),
    run(40, 126, 'dung steht, die Ost-'),
    run(40, 152, 'West Achse auch -'),
    run(40, 178, 'fertig.'),
  ];
  assert.deepEqual(texts(runs), ['Die Verbindung steht, die Ost-West Achse auch - fertig.']);
});

test('a soft hyphen at a line end always joins the word', () => {
  assert.deepEqual(texts([run(40, 100, 'Ueber\u00ad'), run(40, 126, 'Setzung')]), ['UeberSetzung']);
});

test('an indented line after two or more lines starts a new paragraph, as in books and papers', () => {
  const runs = [
    run(40, 100, 'Erster Absatz Zeile eins'),
    run(40, 126, 'Erster Absatz Zeile zwei.'),
    run(60, 152, 'Zweiter Absatz eingerueckt'),
    run(40, 178, 'Zweiter Absatz weiter.'),
  ];
  assert.deepEqual(texts(runs), [
    'Erster Absatz Zeile eins Erster Absatz Zeile zwei.',
    'Zweiter Absatz eingerueckt Zweiter Absatz weiter.',
  ]);
});

test('a list item with a hanging indent stays whole, and the next bullet starts the next item', () => {
  const runs = [
    run(40, 100, '\u2022 Punkt eins beginnt'),
    run(60, 126, 'und geht weiter.'),
    run(40, 152, '\u2022 Punkt zwei.'),
    run(40, 178, '2) Punkt drei.'),
  ];
  assert.deepEqual(texts(runs), ['\u2022 Punkt eins beginnt und geht weiter.', '\u2022 Punkt zwei.', '2) Punkt drei.']);
});

test('a heading in a larger font is apart from the text right under it', () => {
  const runs = [run(40, 100, 'Kapitel Eins', { height: 30 }), run(40, 134, 'Der Text beginnt.'), run(40, 160, 'Und geht weiter.')];
  assert.deepEqual(texts(runs), ['Kapitel Eins', 'Der Text beginnt. Und geht weiter.']);
});

test('double-spaced text is still one paragraph: the gap is measured against the usual line step', () => {
  const runs = [
    run(40, 100, 'Zeile eins'),
    run(40, 150, 'Zeile zwei'),
    run(40, 200, 'Zeile drei.'),
    run(40, 300, 'Neuer Absatz.'),
  ];
  assert.deepEqual(texts(runs), ['Zeile eins Zeile zwei Zeile drei.', 'Neuer Absatz.']);
});

test('blank runs belong to no paragraph, and paragraphs come in the order of their first run', () => {
  const runs = [
    run(240, 100, 'Rechts oben', { width: 160 }),
    run(40, 100, ' ', { width: 5 }),
    run(40, 100, 'Links oben', { width: 160 }),
  ];
  assert.deepEqual(paragraphsOf(runs), [
    { runs: [0], text: 'Rechts oben' },
    { runs: [2], text: 'Links oben' },
  ]);
});

test('a loose space in a justified line stays in the line when the lines above and below run across it', () => {
  // As in a real paper: the words are runs of their own, and the last word of the line sits 1.4 line heights away.
  const runs = [
    run(40, 100, 'the lines above run across', { width: 300 }),
    run(40, 126, 'a residual framework.', { width: 220 }),
    run(288, 126, 'In-', { width: 52 }),
    run(40, 152, 'stead of hoping the text', { width: 300 }),
  ];
  assert.deepEqual(texts(runs), ['the lines above run across a residual framework. Instead of hoping the text']);
});

test('a narrow gap between columns still parts them: nothing above or below runs across it', () => {
  // A column gap of 1.8 line heights, as in IEEE papers, wider than a space but no wider than some justified ones.
  const runs = [
    run(40, 100, 'left one', { width: 200 }),
    run(276, 100, 'right one', { width: 200 }),
    run(40, 126, 'left two', { width: 200 }),
    run(276, 126, 'right two', { width: 200 }),
  ];
  assert.deepEqual(texts(runs), ['left one left two', 'right one right two']);
});

test('text set sideways in the margin (a stamp along the page) is apart from the lines beside it', () => {
  const runs = [
    run(4, 90, 'arXiv:1512.03385v1', { width: 20, height: 300 }), // its box is tall and narrow
    run(40, 100, 'Erste Zeile hier'),
    run(40, 126, 'zweite Zeile hier.'),
  ];
  assert.deepEqual(texts(runs), ['arXiv:1512.03385v1', 'Erste Zeile hier zweite Zeile hier.']);
});

test('an indented line under a single short one starts a new paragraph (the end of one carried over from the column before)', () => {
  const runs = [
    run(40, 100, 'greatly benefited.', { width: 150 }),
    run(60, 126, 'Driven by the significance', { width: 280 }),
    run(40, 152, 'of depth, a question arises.', { width: 300 }),
  ];
  assert.deepEqual(texts(runs), ['greatly benefited.', 'Driven by the significance of depth, a question arises.']);
});
