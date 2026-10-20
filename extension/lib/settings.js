import { PROVIDERS } from './providers.js';
import { checkedKeys, currentPlatform } from './keys.js';
import { DEFAULT_CORRECTION_PROMPT, DEFAULT_LEARNING_PROMPT } from './prompt.js';

// How long a learning instruction the user may save; it is their own text, so a limit is all it needs.
const MAX_LEARNING_PROMPT = 1000;

export const DEFAULTS = Object.freeze({
  provider: 'chrome',
  companion: 'pup',
  learning: false,
  learningPrompt: DEFAULT_LEARNING_PROMPT,
  correctionPrompt: DEFAULT_CORRECTION_PROMPT,
});

// The companions to choose from (content/pup.js, cat.js, corgi.js, monkey.js); 'none' in the settings means no companion.
export const COMPANIONS = Object.freeze(['pup', 'cat', 'corgi', 'monkey']);

export const LANGUAGES = Object.freeze({
  ru: 'Russian',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  uk: 'Ukrainian',
  tr: 'Turkish',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
});

// What is remembered for each provider; blank model and URL mean the provider's own defaults.
const PROVIDER_FIELDS = ['apiKey', 'model', 'baseUrl'];

// Names DeepSeek has retired; settings saved with them move to the default model.
const RETIRED_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** @returns {SpotSlate.ProviderEntry} */
function providerEntry(id, stored) {
  const entry = /** @type {any} */ (Object.fromEntries(PROVIDER_FIELDS.map((field) => [field, trimmed(stored?.[field])])));
  if (id === 'deepseek' && RETIRED_MODELS.has(entry.model)) entry.model = '';
  return entry;
}

// The browser's own language: Chrome's interface language, the same in every part of the extension (pages may be
// given another navigator.language).
const browserLanguage = () => globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language;

// The language to translate into until the user picks one: the browser's own language when SpotSlate offers it,
// else English.
export function defaultTargetLang(uiLanguage = browserLanguage()) {
  const code = typeof uiLanguage === 'string' ? uiLanguage.split('-')[0].toLowerCase() : '';
  return Object.hasOwn(LANGUAGES, code) ? code : 'en';
}

// Stored settings with every value checked: { provider, targetLang, providers: { [id]: { apiKey, model, baseUrl } },
// keys: { read, write, vocabulary }, companion } (see keys.js; keys refused on `platform` become the defaults).
// Settings saved before providers existed kept apiKey, model and baseUrl at the top: they become the DeepSeek entry,
// and DeepSeek stays in use.
/** @returns {SpotSlate.Settings} */
export function withDefaults(stored, platform = currentPlatform(), uiLanguage = browserLanguage()) {
  const old = !stored?.providers && PROVIDER_FIELDS.some((field) => trimmed(stored?.[field]));
  const provider = old ? 'deepseek' : trimmed(stored?.provider);
  const targetLang = trimmed(stored?.targetLang);
  const entries = old ? { deepseek: stored } : stored?.providers && typeof stored.providers === 'object' ? stored.providers : {};
  /** @type {Record<string, SpotSlate.ProviderEntry>} */
  const providers = {};
  for (const [id, entry] of Object.entries(entries)) {
    if (Object.hasOwn(PROVIDERS, id)) providers[id] = providerEntry(id, entry);
  }
  return {
    provider: Object.hasOwn(PROVIDERS, provider) ? provider : DEFAULTS.provider,
    targetLang: Object.hasOwn(LANGUAGES, targetLang) ? targetLang : defaultTargetLang(uiLanguage),
    providers,
    keys: checkedKeys(stored?.keys, platform),
    companion: COMPANIONS.includes(stored?.companion) || stored?.companion === 'none' ? stored.companion : DEFAULTS.companion,
    learning: typeof stored?.learning === 'boolean' ? stored.learning : DEFAULTS.learning,
    learningPrompt: trimmed(stored?.learningPrompt).slice(0, MAX_LEARNING_PROMPT) || DEFAULTS.learningPrompt,
    correctionPrompt: trimmed(stored?.correctionPrompt).slice(0, MAX_LEARNING_PROMPT) || DEFAULTS.correctionPrompt,
  };
}

// The provider in use, with its key and the model and URL to call.
/**
 * @param {SpotSlate.Settings} settings
 * @returns {SpotSlate.Provider}
 */
export function activeProvider(settings) {
  const id = settings.provider;
  const entry = settings.providers[id] ?? providerEntry(id);
  return {
    id,
    ...PROVIDERS[id],
    apiKey: entry.apiKey,
    model: entry.model || PROVIDERS[id].model,
    baseUrl: (entry.baseUrl || PROVIDERS[id].baseUrl).replace(/\/+$/, ''),
  };
}

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return withDefaults(settings);
}
