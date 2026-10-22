import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../extension/content/markdown.js';

const { parseMarkdown } = globalThis.spotslate;

const FRENCH_VERB = [
  '**appréhendé** · past participle of appréhender, m. sg.',
  '',
  '### Forms',
  '- f. sg.: appréhendée',
  '- m. pl.: appréhendés',
  '',
  '### Présent',
  '| | appréhender |',
  '|---|---|',
  '| je | appréhende |',
  '| tu | appréhendes |',
  '',
  '### Synonyms',
  'arrêter · capturer',
  '',
  '### Examples',
  '- Il a été **appréhendé**. (He was detained.)',
].join('\n');

test('parseMarkdown reads headings, lists, tables and text', () => {
  assert.deepEqual(parseMarkdown(FRENCH_VERB, true), [
    { type: 'text', text: '**appréhendé** · past participle of appréhender, m. sg.' },
    { type: 'heading', text: 'Forms' },
    { type: 'list', items: ['f. sg.: appréhendée', 'm. pl.: appréhendés'] },
    { type: 'heading', text: 'Présent' },
    { type: 'table', columns: ['', 'appréhender'], rows: [['je', 'appréhende'], ['tu', 'appréhendes']] },
    { type: 'heading', text: 'Synonyms' },
    { type: 'text', text: 'arrêter · capturer' },
    { type: 'heading', text: 'Examples' },
    { type: 'list', items: ['Il a été **appréhendé**. (He was detained.)'] },
  ]);
});

test('parseMarkdown takes a line that is only bold as a heading, as a model that skips ### writes it', () => {
  assert.deepEqual(parseMarkdown('**Forms:**\n- a', true), [{ type: 'heading', text: 'Forms' }, { type: 'list', items: ['a'] }]);
  assert.deepEqual(parseMarkdown('**Forms**\n- a', true)[0], { type: 'heading', text: 'Forms' });
  assert.deepEqual(parseMarkdown('**word** noun', true), [{ type: 'text', text: '**word** noun' }]); // bold in a line of text stays
});

test('parseMarkdown takes every heading level and the bullets of every kind', () => {
  const blocks = parseMarkdown('# A\n## B ##\n#### C\n* x\n+ y\n1. z\n2) w\n   - nested', true);
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'heading', 'heading', 'list']);
  assert.deepEqual(blocks.slice(0, 3).map((block) => block.text), ['A', 'B', 'C']);
  assert.deepEqual(blocks[3].items, ['x', 'y', 'z', 'w', 'nested']);
});

test('parseMarkdown reads a table without outer pipes in the rows, with alignment marks and loose spacing', () => {
  const [table] = parseMarkdown('|a|b|\n|:--|--:|\n|1|2|\n| 3 | 4 ', true);
  assert.deepEqual(table, { type: 'table', columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']] });
});

test('parseMarkdown holds a table until its separator row has come, so no pipes flash while it streams', () => {
  assert.deepEqual(parseMarkdown('### Présent\n| | appréhender |', false), [{ type: 'heading', text: 'Présent' }]);
  assert.deepEqual(parseMarkdown('### Présent\n| | appréhender |\n|--', false), [
    { type: 'heading', text: 'Présent' },
    { type: 'table', columns: ['', 'appréhender'], rows: [] },
  ]);
  const growing = parseMarkdown('| | x |\n|---|---|\n| je | appr', false)[0];
  assert.deepEqual(growing.rows, [['je', 'appr']]);
});

test('parseMarkdown shows pipes that never became a table as text once the answer is whole', () => {
  assert.deepEqual(parseMarkdown('| a | b |', true), [{ type: 'text', text: '| a | b |' }]);
  assert.deepEqual(parseMarkdown('| a | b |\n| c | d |', true), [{ type: 'text', text: '| a | b |\n| c | d |' }]);
});

test('parseMarkdown drops rules, code fences and the other markup it does not draw', () => {
  assert.deepEqual(parseMarkdown('a\n\n---\n\n***\nb', true), [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]);
  assert.deepEqual(parseMarkdown('```text\nfoo\n```', true), [{ type: 'text', text: 'foo' }]);
  assert.deepEqual(parseMarkdown('see [the docs](https://x.test/a) and `code` and ![pic](https://x.test/i.png)', true), [
    { type: 'text', text: 'see the docs and code and pic' },
  ]);
  assert.deepEqual(parseMarkdown('> quoted', true), [{ type: 'text', text: 'quoted' }]);
});

test('parseMarkdown keeps the lines of a paragraph and splits paragraphs at a blank line', () => {
  assert.deepEqual(parseMarkdown('one\ntwo\n\nthree', true), [{ type: 'text', text: 'one\ntwo' }, { type: 'text', text: 'three' }]);
});

test('parseMarkdown gives nothing for nothing', () => {
  assert.deepEqual(parseMarkdown('', true), []);
  assert.deepEqual(parseMarkdown('  \n\n ', false), []);
});

test('parseMarkdown copes with the answer cut at every position', () => {
  for (let end = 0; end <= FRENCH_VERB.length; end++) {
    const blocks = parseMarkdown(FRENCH_VERB.slice(0, end), end === FRENCH_VERB.length);
    for (const block of blocks) assert.ok(['heading', 'list', 'table', 'text'].includes(block.type), `at ${end}`);
  }
});

test('parseMarkdown limits a runaway answer', () => {
  const many = Array.from({ length: 200 }, (_, i) => `- item ${i}`).join('\n');
  assert.ok(parseMarkdown(many, true)[0].items.length <= 30);
  const wide = `|${' c |'.repeat(20)}\n|${'---|'.repeat(20)}\n${Array.from({ length: 100 }, () => `|${' v |'.repeat(20)}`).join('\n')}`;
  const [table] = parseMarkdown(wide, true);
  assert.ok(table.rows.length <= 30);
  assert.ok(table.columns.length <= 8);
  assert.ok(table.rows[0].length <= 8);
  const blocks = parseMarkdown(Array.from({ length: 200 }, (_, i) => `### h${i}`).join('\n'), true);
  assert.ok(blocks.length <= 40);
});
