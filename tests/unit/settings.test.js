import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, LANGUAGES, activeProvider, defaultTargetLang, withDefaults } from '../../extension/lib/settings.js';
import { PROVIDERS } from '../../extension/lib/providers.js';
import { DEFAULT_KEYS } from '../../extension/lib/keys.js';
import { DEFAULT_CORRECTION_PROMPT, DEFAULT_LEARNING_PROMPT } from '../../extension/lib/prompt.js';

test('withDefaults returns the free built-in translator, the browser language, no provider entries, the default keys and Spot when nothing is stored', () => {
  assert.deepEqual(withDefaults(undefined, 'win', 'ru-RU'), {
    provider: 'chrome',
    targetLang: 'ru',
    providers: {},
    keys: DEFAULT_KEYS,
    companion: 'pup',
    learning: false,
    learningPrompt: DEFAULT_LEARNING_PROMPT,
    learningPretty: true,
    correctionPrompt: DEFAULT_CORRECTION_PROMPT,
  });
  assert.equal(withDefaults(undefined, 'win', 'de-AT').targetLang, 'de');
  assert.deepEqual(DEFAULTS, { provider: 'chrome', companion: 'pup', learning: false, learningPrompt: DEFAULT_LEARNING_PROMPT, learningPretty: true, correctionPrompt: DEFAULT_CORRECTION_PROMPT });
});

test('withDefaults keeps the companion chosen, or none, and brings Spot back for anything else', () => {
  for (const companion of ['pup', 'cat', 'corgi', 'monkey', 'chimp', 'none']) assert.equal(withDefaults({ companion }, 'win', 'en').companion, companion);
  for (const companion of ['dragon', '', 7, null, ' cat']) assert.equal(withDefaults({ companion }, 'win', 'en').companion, 'pup');
});

test('withDefaults keeps the learning toggle as a boolean and starts it off', () => {
  assert.equal(withDefaults(undefined, 'win', 'en').learning, false);
  assert.equal(withDefaults({ learning: true }, 'win', 'en').learning, true);
  for (const bad of ['yes', 1, null, {}]) assert.equal(withDefaults({ learning: bad }, 'win', 'en').learning, false);
});

test('withDefaults fills the learning instruction with the default and trims a custom one', () => {
  assert.equal(withDefaults(undefined, 'win', 'en').learningPrompt, DEFAULT_LEARNING_PROMPT);
  assert.equal(withDefaults({ learningPrompt: '  show the gender\n' }, 'win', 'en').learningPrompt, 'show the gender');
  assert.equal(withDefaults({ learningPrompt: '   ' }, 'win', 'en').learningPrompt, DEFAULT_LEARNING_PROMPT);
  assert.equal(withDefaults({ learningPrompt: 42 }, 'win', 'en').learningPrompt, DEFAULT_LEARNING_PROMPT);
});

test('withDefaults caps a very long learning instruction', () => {
  assert.equal(withDefaults({ learningPrompt: 'x'.repeat(2000) }).learningPrompt.length, 1000);
  assert.equal(withDefaults({ learningPretty: false }).learningPretty, false);
  assert.equal(withDefaults({ learningPretty: 'no' }).learningPretty, true); // anything but a boolean is the default
});

test('withDefaults fills the correction instruction with the default and trims a custom one', () => {
  assert.equal(withDefaults(undefined, 'win', 'en').correctionPrompt, DEFAULT_CORRECTION_PROMPT);
  assert.equal(withDefaults({ correctionPrompt: '  only the rule\n' }, 'win', 'en').correctionPrompt, 'only the rule');
  assert.equal(withDefaults({ correctionPrompt: '   ' }, 'win', 'en').correctionPrompt, DEFAULT_CORRECTION_PROMPT);
  assert.equal(withDefaults({ correctionPrompt: 'y'.repeat(2000) }).correctionPrompt.length, 1000);
});

test('withDefaults drops the agreement field of older settings', () => {
  assert.equal('consent' in withDefaults({ consent: 1 }, 'win', 'en'), false);
});

test('the language to translate into starts as the browser language, or English when SpotSlate does not offer it', () => {
  assert.equal(defaultTargetLang('ja'), 'ja');
  assert.equal(defaultTargetLang('pt-BR'), 'pt');
  assert.equal(defaultTargetLang('zh-CN'), 'zh');
  assert.equal(defaultTargetLang('nl-NL'), 'en');
  assert.equal(defaultTargetLang(undefined), 'en');
});

test('withDefaults keeps the chosen provider and every provider entry, trimmed', () => {
  const stored = {
    provider: 'openai',
    targetLang: 'de',
    providers: {
      openai: { apiKey: ' sk-o\n', model: ' gpt-x ', baseUrl: '' },
      deepseek: { apiKey: 'sk-d', model: '', baseUrl: 'https://example.com/v1' },
    },
  };
  assert.deepEqual(withDefaults(stored), {
    provider: 'openai',
    targetLang: 'de',
    providers: {
      openai: { apiKey: 'sk-o', model: 'gpt-x', baseUrl: '' },
      deepseek: { apiKey: 'sk-d', model: '', baseUrl: 'https://example.com/v1' },
    },
    keys: DEFAULT_KEYS,
    companion: 'pup',
    learning: false,
    learningPrompt: DEFAULT_LEARNING_PROMPT,
    learningPretty: true,
    correctionPrompt: DEFAULT_CORRECTION_PROMPT,
  });
});

test('withDefaults drops unknown providers, unknown fields and non-string values', () => {
  const stored = { provider: 'nope', providers: { nope: { apiKey: 'x' }, openai: { apiKey: 42, extra: 'y' } } };
  assert.deepEqual(withDefaults(stored, 'win', 'ru'), {
    provider: 'chrome',
    targetLang: 'ru',
    providers: { openai: { apiKey: '', model: '', baseUrl: '' } },
    keys: DEFAULT_KEYS,
    companion: 'pup',
    learning: false,
    learningPrompt: DEFAULT_LEARNING_PROMPT,
    learningPretty: true,
    correctionPrompt: DEFAULT_CORRECTION_PROMPT,
  });
});

test('withDefaults falls back to the default language for unknown codes', () => {
  assert.equal(withDefaults({ targetLang: 'xx' }, 'win', 'ru-RU').targetLang, 'ru');
});

test('settings saved before providers existed become the DeepSeek entry', () => {
  const old = { apiKey: ' sk-1 ', targetLang: 'de', model: 'deepseek-v4-pro', baseUrl: 'https://example.com' };
  assert.deepEqual(withDefaults(old), {
    provider: 'deepseek',
    targetLang: 'de',
    providers: { deepseek: { apiKey: 'sk-1', model: 'deepseek-v4-pro', baseUrl: 'https://example.com' } },
    keys: DEFAULT_KEYS,
    companion: 'pup',
    learning: false,
    learningPrompt: DEFAULT_LEARNING_PROMPT,
    learningPretty: true,
    correctionPrompt: DEFAULT_CORRECTION_PROMPT,
  });
});

test('withDefaults keeps keys allowed on the platform and replaces the rest with the defaults', () => {
  const write = { ctrl: true, alt: false, shift: true, meta: false, code: 'KeyK' };
  const vocab = DEFAULT_KEYS.vocabulary;
  assert.deepEqual(withDefaults({ keys: { read: 'Control', write } }, 'win').keys, { read: 'Control', write, vocabulary: vocab });
  const refused = { ctrl: false, alt: true, shift: false, meta: false, code: 'KeyF' };
  assert.deepEqual(withDefaults({ keys: { read: 'Control', write: refused } }, 'win').keys, { read: 'Control', write: DEFAULT_KEYS.write, vocabulary: vocab });
  assert.deepEqual(withDefaults({ keys: { read: 'Control', write: refused } }, 'mac').keys, { read: 'Control', write: refused, vocabulary: vocab });
});

test('retired DeepSeek model names fall back to the default model', () => {
  assert.equal(withDefaults({ apiKey: 'sk', model: 'deepseek-chat' }).providers.deepseek.model, '');
  const stored = { providers: { deepseek: { model: ' deepseek-reasoner ' } } };
  assert.equal(withDefaults(stored).providers.deepseek.model, '');
});

test('activeProvider gives the free translator without a key, model or URL', () => {
  const active = activeProvider(withDefaults(undefined));
  assert.equal(active.id, 'chrome');
  assert.equal(active.api, 'browser');
  assert.equal(active.baseUrl, '');
});

test('activeProvider fills a blank model and URL with the provider defaults', () => {
  const active = activeProvider(withDefaults({ provider: 'deepseek', providers: { deepseek: { apiKey: 'sk' } } }));
  assert.equal(active.id, 'deepseek');
  assert.equal(active.name, 'DeepSeek');
  assert.equal(active.apiKey, 'sk');
  assert.equal(active.model, PROVIDERS.deepseek.model);
  assert.equal(active.baseUrl, PROVIDERS.deepseek.baseUrl);
});

test('activeProvider keeps a chosen model and URL, without trailing slashes', () => {
  const stored = { provider: 'openai', providers: { openai: { model: 'gpt-x', baseUrl: 'https://proxy.example/v1//' } } };
  const active = activeProvider(withDefaults(stored));
  assert.equal(active.model, 'gpt-x');
  assert.equal(active.baseUrl, 'https://proxy.example/v1');
  assert.equal(active.apiKey, '');
});

test('every language has a two-letter code and an English name', () => {
  assert.equal(Object.keys(LANGUAGES).length, 13);
  for (const [code, name] of Object.entries(LANGUAGES)) {
    assert.match(code, /^[a-z]{2}$/);
    assert.match(name, /^[A-Z][A-Za-z ()]+$/, code);
  }
  assert.equal(LANGUAGES.en, 'English'); // the default when the browser language is not offered
});
