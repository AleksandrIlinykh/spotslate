import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../extension/content/popup.js';

const { splitLesson } = globalThis.spotslate;

test('splitLesson cuts the answer at the first "---" line into the translation and the breakdown', () => {
  assert.deepEqual(splitLesson('declenched\n---\nForms: a, b\nExample: c'), { head: 'declenched', rest: 'Forms: a, b\nExample: c' });
});

test('splitLesson takes the whole text as the translation until the separator has come', () => {
  assert.deepEqual(splitLesson('declen'), { head: 'declen', rest: '' });
  assert.deepEqual(splitLesson('declenched\n'), { head: 'declenched', rest: '' });
  assert.deepEqual(splitLesson('declenched\n---'), { head: 'declenched', rest: '' });
  assert.deepEqual(splitLesson('declenched\n---\n'), { head: 'declenched', rest: '' });
});

test('splitLesson keeps a half-streamed separator out of the translation', () => {
  assert.deepEqual(splitLesson('declenched\n-'), { head: 'declenched', rest: '' });
  assert.deepEqual(splitLesson('declenched\n--'), { head: 'declenched', rest: '' });
});

test('splitLesson only cuts at a line that is nothing but dashes, and only the first one', () => {
  assert.deepEqual(splitLesson('well-known --- word\n---\none\n---\ntwo'), { head: 'well-known --- word', rest: 'one\n---\ntwo' });
  assert.deepEqual(splitLesson('a\n  ----  \nb'), { head: 'a', rest: 'b' });
});

test('splitLesson trims the blank lines around the separator', () => {
  assert.deepEqual(splitLesson('word\n\n---\n\nForms: x\n'), { head: 'word', rest: 'Forms: x' });
});
