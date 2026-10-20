import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../extension/content/youtube.js';

const { parseTimedText } = globalThis.spotslate;

test('parseTimedText turns json3 events into time-ordered cues, dropping the empty ones', () => {
  const json = JSON.stringify({
    wireMagic: 'pb3',
    events: [
      { tStartMs: 2000, dDurationMs: 1500, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'First' }] },
      { tStartMs: 3000, segs: [{ utf8: '\n' }] }, // only a line break: dropped
      { tStartMs: 4000, dDurationMs: 500 }, // no segs: dropped
    ],
  });
  assert.deepEqual(parseTimedText(json), [
    { start: 0, end: 1, text: 'First' },
    { start: 2, end: 3.5, text: 'Hello world' },
  ]);
});

test('parseTimedText is safe on junk and missing fields', () => {
  assert.deepEqual(parseTimedText('not json'), []);
  assert.deepEqual(parseTimedText('{}'), []);
  assert.deepEqual(parseTimedText(JSON.stringify({ events: 'x' })), []);
  assert.deepEqual(parseTimedText(JSON.stringify({ events: [{ segs: [{ utf8: 'no start' }] }] })), []);
});
