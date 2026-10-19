import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComposeMessages,
  buildCorrectMessages,
  buildRephraseMessages,
  chooseComposeSource,
  chooseComposeTarget,
  countLanguage,
} from '../../extension/lib/compose.js';
import { notesBlock } from '../../extension/lib/notes.js';

test('buildRephraseMessages rewrites the text in the target language with the given instruction', () => {
  const [system, user] = buildRephraseMessages('Could you send it?', 'German', 'make it shorter');
  assert.match(system.content, /Rewrite the user's text in German/);
  assert.match(system.content, /make it shorter/);
  assert.match(system.content, /Output only the rewritten text/);
  assert.deepEqual(user, { role: 'user', content: 'Could you send it?' });
});

test('buildRephraseMessages without an instruction asks for a different wording', () => {
  const [plain] = buildRephraseMessages('x', 'German', '');
  assert.match(plain.content, /reword it differently/i);
  const [blank] = buildRephraseMessages('x', 'German', '   ');
  assert.match(blank.content, /reword it differently/i);
});

test('buildRephraseMessages puts the site notes in a reference turn, not the system prompt', () => {
  const messages = buildRephraseMessages('x', 'German', 'shorter', { notes: 'A site about CI.' });
  assert.equal(messages.length, 4);
  assert.doesNotMatch(messages[0].content, /CI/);
  assert.ok(messages[1].content.includes(notesBlock('A site about CI.', 'the site the user is writing on')));
});

// The user writes in German here; the project's files keep to the Latin script.

test('the compose prompt asks for natural work writing from one language into the other', () => {
  const messages = buildComposeMessages('Der Build schlägt fehl', 'German', 'English');
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /^You help a professional write in English at work\./);
  assert.match(messages[0].content, /Translate the user's text from German into English/);
  assert.match(messages[0].content, /Output only the translation/);
  assert.doesNotMatch(messages[0].content, /topic|Earlier|<notes>/i);
  assert.deepEqual(messages[1], { role: 'user', content: 'Der Build schlägt fehl' });
});

test('the compose prompt gives the site notes as reference, never in the system prompt; the last message is the draft', () => {
  const [system, reference, reply, user] = buildComposeMessages('Der Build schl\u00e4gt wieder fehl', 'German', 'English', { notes: 'A site about CI.' });
  assert.doesNotMatch(system.content, /<notes>/);
  assert.ok(reference.content.endsWith(`\n\n${notesBlock('A site about CI.', 'the site the user is writing on')}`));
  assert.equal(reply.role, 'assistant');
  assert.deepEqual(user, { role: 'user', content: 'Der Build schl\u00e4gt wieder fehl' });
});

test("the correction prompt asks for the mistakes of a learner's text only, in a set form, explained in the user's language", () => {
  const messages = buildCorrectMessages('Gestern ich habe nach Hause gegangen.', 'German', 'Russian');
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /^The user is learning German and wrote the text in it\./);
  assert.match(messages[0].content, /Correct only its mistakes/);
  assert.match(messages[0].content, /Do not rewrite it for style/);
  assert.match(messages[0].content, /<corrected>\n[^<]+\n<\/corrected>\n<notes>\n- one short line in Russian for each correction/);
  assert.match(messages[0].content, /With no mistakes, give the text unchanged and leave the notes empty\./);
  assert.deepEqual(messages[1], { role: 'user', content: 'Gestern ich habe nach Hause gegangen.' });
});

test('the correction prompt in learning mode asks for a rule and an example per correction', () => {
  const [system] = buildCorrectMessages('x', 'German', 'Russian', { learning: true });
  assert.match(system.content, /for each correction: the change, then a short rule for it and one example/);
});

test('the correction prompt uses a custom learning instruction when given', () => {
  const [system] = buildCorrectMessages('x', 'German', 'Russian', { learning: true, correctionPrompt: 'only the grammar rule' });
  assert.match(system.content, /for each correction: only the grammar rule/);
  assert.doesNotMatch(system.content, /a short rule for it and one example/);
});

test('the correction prompt without learning keeps the plain notes', () => {
  assert.deepEqual(buildCorrectMessages('x', 'German', 'Russian'), buildCorrectMessages('x', 'German', 'Russian', { learning: false }));
  assert.match(buildCorrectMessages('x', 'German', 'Russian')[0].content, /for each correction: the change and why/);
});

test('the correction prompt gives the site notes as reference, never in the system prompt', () => {
  const [system, reference, reply, user] = buildCorrectMessages('Der Build ist rot.', 'German', 'Russian', { notes: 'A site about CI.' });
  assert.doesNotMatch(system.content, /A site about CI/);
  assert.ok(reference.content.endsWith(`\n\n${notesBlock('A site about CI.', 'the site the user is writing on')}`));
  assert.equal(reply.role, 'assistant');
  assert.deepEqual(user, { role: 'user', content: 'Der Build ist rot.' });
});

test("chooseComposeSource takes the language saved for the site, else the user's own", () => {
  assert.equal(chooseComposeSource({ own: 'ru', saved: 'de' }), 'de');
  assert.equal(chooseComposeSource({ own: 'ru', saved: null }), 'ru');
  assert.equal(chooseComposeSource({ own: 'ru', saved: 'xx' }), 'ru');
});

test('countLanguage counts the languages read on a site, ignoring unknown ones', () => {
  let counts = {};
  counts = countLanguage(counts, 'fr');
  counts = countLanguage(counts, 'fr');
  counts = countLanguage(counts, 'en');
  counts = countLanguage(counts, null);
  counts = countLanguage(counts, 'xx');
  assert.deepEqual(counts, { fr: 2, en: 1 });
});

test('chooseComposeTarget prefers the saved choice, then the language read on the site, the page, the last one', () => {
  const base = { from: 'de', saved: null, readCounts: {}, pageLang: null, last: null };
  assert.equal(chooseComposeTarget({ ...base, saved: 'es', readCounts: { fr: 1 }, pageLang: 'en' }), 'es');
  assert.equal(chooseComposeTarget({ ...base, readCounts: { fr: 2, en: 1 }, pageLang: 'en' }), 'fr');
  assert.equal(chooseComposeTarget({ ...base, pageLang: 'es', last: 'it' }), 'es');
  assert.equal(chooseComposeTarget({ ...base, last: 'it' }), 'it');
  assert.equal(chooseComposeTarget(base), 'en');
});

test("chooseComposeTarget keeps a saved choice of the user's own language, the one checked then", () => {
  assert.equal(chooseComposeTarget({ from: 'de', saved: 'de', readCounts: { fr: 1 }, pageLang: 'en', last: null }), 'de');
});

test("chooseComposeTarget never picks the user's own language by itself, or one it does not know", () => {
  assert.equal(chooseComposeTarget({ from: 'de', saved: null, readCounts: { de: 3 }, pageLang: 'de', last: null }), 'en');
  assert.equal(chooseComposeTarget({ from: 'de', saved: 'xx', readCounts: {}, pageLang: 'zh-Hant', last: null }), 'en');
  assert.equal(chooseComposeTarget({ from: 'en', saved: null, readCounts: {}, pageLang: 'en', last: null }), 'ru');
});
