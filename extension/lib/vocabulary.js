// The vocabulary: words the user saves while reading (Alt+A on a selection), kept by language so each language a person
// is learning has its own list. No translation is stored, just the word and when it was saved. It lives in
// chrome.storage.local (TRUSTED_CONTEXTS) under `vocabulary`, as `{ [lang]: [{ word, date }] }`, newest first.

export const MAX_WORDS = 5000; // per language, so the store cannot grow without bound
const WORD = /\S/; // a word must have at least one non-space character

// Adds `word` to `lang`'s list (newest first), deduped; returns the vocabulary unchanged when there is nothing to add
// or the word is already there, so the caller can skip the write.
export function addWord(vocabulary, lang, word, date = Date.now()) {
  const text = String(word ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lang || !WORD.test(text)) return vocabulary;
  const list = Array.isArray(vocabulary?.[lang]) ? vocabulary[lang] : [];
  if (list.some((entry) => entry.word === text)) return vocabulary; // already saved: no duplicate
  return { ...vocabulary, [lang]: [{ word: text, date }, ...list].slice(0, MAX_WORDS) };
}

// Removes `word` from `lang`'s list; drops the language key when its list becomes empty.
export function removeWord(vocabulary, lang, word) {
  const list = Array.isArray(vocabulary?.[lang]) ? vocabulary[lang] : [];
  const next = list.filter((entry) => entry.word !== word);
  if (next.length === list.length) return vocabulary; // nothing removed
  const copy = { ...vocabulary };
  if (next.length) copy[lang] = next;
  else delete copy[lang];
  return copy;
}

// The language codes that have at least one word, so the view can show a tab per language.
export function vocabularyLanguages(vocabulary) {
  return Object.keys(vocabulary ?? {}).filter((lang) => (vocabulary[lang]?.length ?? 0) > 0);
}
