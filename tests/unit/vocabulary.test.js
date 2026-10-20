import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WORDS, addWord, clearLanguage, removeWord, vocabularyLanguages } from '../../extension/lib/vocabulary.js';

test('addWord keeps a list per language, newest first, with no duplicates', () => {
  let vocab = {};
  vocab = addWord(vocab, 'de', 'Katze', 1);
  vocab = addWord(vocab, 'de', 'Hund', 2);
  vocab = addWord(vocab, 'fr', 'chat', 3);
  assert.deepEqual(vocab, {
    de: [
      { word: 'Hund', date: 2 },
      { word: 'Katze', date: 1 },
    ],
    fr: [{ word: 'chat', date: 3 }],
  });
  const same = addWord(vocab, 'de', 'Katze', 4);
  assert.equal(same, vocab, 'a duplicate returns the vocabulary unchanged, so the caller can skip the write');
});

test('addWord trims and collapses whitespace, and ignores a blank word or a missing language', () => {
  assert.deepEqual(addWord({}, 'de', '  der   Hund \n', 1), { de: [{ word: 'der Hund', date: 1 }] });
  const base = { de: [{ word: 'Katze', date: 1 }] };
  assert.equal(addWord(base, 'de', '  '), base, 'a blank word changes nothing');
  assert.equal(addWord(base, '', 'Hund'), base, 'no language changes nothing');
});

test('addWord caps a language at MAX_WORDS, dropping the oldest', () => {
  let vocab = {};
  for (let i = 0; i < MAX_WORDS + 10; i++) vocab = addWord(vocab, 'de', `w${i}`, i);
  assert.equal(vocab.de.length, MAX_WORDS);
  assert.equal(vocab.de[0].word, `w${MAX_WORDS + 9}`, 'newest first');
  assert.ok(!vocab.de.some((entry) => entry.word === 'w0'), 'the oldest was dropped');
});

test('removeWord drops a word, and the language key when its list is empty', () => {
  const vocab = { de: [{ word: 'Katze', date: 1 }, { word: 'Hund', date: 2 }], fr: [{ word: 'chat', date: 3 }] };
  assert.deepEqual(removeWord(vocab, 'de', 'Katze'), { de: [{ word: 'Hund', date: 2 }], fr: [{ word: 'chat', date: 3 }] });
  assert.deepEqual(removeWord(vocab, 'fr', 'chat'), { de: vocab.de });
  assert.equal(removeWord(vocab, 'de', 'missing'), vocab, 'removing what is not there changes nothing');
});

test('clearLanguage drops a whole language, and leaves the rest and an unknown language alone', () => {
  const vocab = { de: [{ word: 'Katze', date: 1 }], fr: [{ word: 'chat', date: 2 }] };
  assert.deepEqual(clearLanguage(vocab, 'de'), { fr: [{ word: 'chat', date: 2 }] });
  assert.equal(clearLanguage(vocab, 'it'), vocab, 'clearing a language that is not there changes nothing');
});

test('vocabularyLanguages lists only the languages that have words', () => {
  assert.deepEqual(vocabularyLanguages({ de: [{ word: 'Katze', date: 1 }], fr: [], it: [{ word: 'gatto', date: 2 }] }), ['de', 'it']);
  assert.deepEqual(vocabularyLanguages({}), []);
  assert.deepEqual(vocabularyLanguages(null), []);
});
