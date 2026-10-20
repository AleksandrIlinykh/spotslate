// The toolbar popup (and its keyboard shortcut): first the switch for the active tab's site, then the compose window
// on its own, for writing that goes anywhere. The site's context and the language read there come from background,
// its declared language from the tab. Tests open it as a page with ?tab= naming the tab it is for.

function siteOf(url) {
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? host : null;
  } catch {
    return null;
  }
}

async function tabOf() {
  const asked = Number(new URLSearchParams(location.search).get('tab'));
  if (asked) return chrome.tabs.get(asked).catch(() => null);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const tab = await tabOf();
const site = siteOf(tab?.url);
let page = null;
if (site) {
  try {
    page = await chrome.tabs.sendMessage(tab.id, { type: 'compose-context' });
  } catch {
    // no content script there (a page opened before the extension was loaded): no declared language then
  }
}
const state = await chrome.runtime.sendMessage({ type: 'compose-open', site, pageLang: page?.pageLang ?? null });
const send = (message) => chrome.runtime.sendMessage(message).catch(() => {});
const { t, languageName } = globalThis.spotslate;

// The site's switch, the first thing in the window: SpotSlate on or off there; under it, with an AI provider, two small
// switches, on unless the user turns them off there: translate with the AI (off: Chrome's translator, nothing sent),
// and, while the AI works there, learn the site's context. Pages where SpotSlate cannot run have no site, no switch.
function siteRow() {
  const say = (key, params) => t(state.from, key, params);
  const row = document.createElement('div');
  row.className = 'site';
  row.innerHTML = `
    <label class="site-main"><input type="checkbox" class="switch site-switch" role="switch"><span class="site-name"></span></label>
    <p class="site-off"></p>
    <label class="site-option"><input type="checkbox" class="switch small site-ai" role="switch"><span class="ai-label"></span></label>
    <label class="site-option"><input type="checkbox" class="switch small site-context" role="switch"><span class="context-label"></span></label>`;
  // The switches are inputs; the other parts only get a text or are hidden.
  /** @type {(name: string) => HTMLInputElement} */
  const part = (name) => row.querySelector(`.${name}`);
  part('site-name').textContent = say('siteSwitch', { site });
  part('site-off').textContent = say('siteOff');
  part('ai-label').textContent = say('siteAi', { provider: state.providerName });
  part('context-label').textContent = say('siteContext');
  const show = (mode) => {
    part('site-switch').checked = !mode.off;
    part('site-ai').checked = !mode.local;
    part('site-context').checked = !mode.noContext;
    part('site-off').hidden = !mode.off;
    // The switches under it matter only with an AI provider, and the context only while the AI works on the site.
    part('site-ai').closest('label').hidden = mode.off || !state.aiProvider;
    part('site-context').closest('label').hidden = mode.off || !state.aiProvider || mode.local;
  };
  const save = async () => {
    const mode = {
      off: !part('site-switch').checked,
      local: !part('site-ai').checked,
      noContext: !part('site-context').checked,
    };
    show(await chrome.runtime.sendMessage({ type: 'set-site-mode', site, mode }));
  };
  for (const input of row.querySelectorAll('input')) input.addEventListener('change', save);
  show(state.siteMode);
  return row;
}

if (site) document.body.prepend(siteRow());

globalThis.spotslate
  .createComposer({
    ...state,
    container: document.body,
    styleRoot: document,
    site,
    showSettings: true,
    showPdf: true,
    onOpenSettings: () => chrome.runtime.openOptionsPage(),
    onOpenPdf: () => chrome.tabs.create({ url: chrome.runtime.getURL('pdf.html') }),
    onReport: ({ comment, mode }) => send({ type: 'report', mode, comment }),
    onSourceChange: (lang) => send({ type: 'compose-source', site, lang }),
    onTargetChange: (lang) => send({ type: 'compose-target', site, lang }),
    onDraftChange: (draft) => send({ type: 'compose-draft', draft }),
    onCopied: () => window.close(),
    onClose: () => window.close(),
  })
  .focus();

// The vocabulary at the bottom: the words saved with Alt+A, a tab per language, newest first, each removable, and a
// Copy button that copies the current language's words one per line (no translation is kept).
async function vocabularyPanel() {
  const say = (key, params) => t(state.from, key, params);
  const section = document.createElement('section');
  section.className = 'vocab';
  const head = document.createElement('div');
  head.className = 'vocab-head';
  const title = document.createElement('span');
  title.className = 'vocab-title';
  title.textContent = say('vocabulary');
  const tabs = document.createElement('div');
  tabs.className = 'vocab-langs';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'vocab-copy';
  copy.textContent = say('copy');
  head.append(title, tabs, copy);
  const list = document.createElement('ul');
  list.className = 'vocab-list';
  const empty = document.createElement('p');
  empty.className = 'vocab-empty';
  empty.textContent = say('vocabularyEmpty');
  section.append(head, list, empty);

  let data = (await chrome.runtime.sendMessage({ type: 'vocabulary' }).catch(() => ({}))) ?? {};
  let current = '';
  const languages = () => Object.keys(data).filter((lang) => data[lang]?.length);

  function render() {
    const langs = languages();
    if (!langs.includes(current)) current = langs[0] ?? '';
    const words = current ? (data[current] ?? []) : [];
    empty.hidden = langs.length > 0;
    tabs.hidden = copy.hidden = list.hidden = langs.length === 0;
    tabs.replaceChildren(
      ...langs.map((lang) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = lang === current ? 'vocab-lang current' : 'vocab-lang';
        button.textContent = languageName(lang, state.from, { capitalized: true });
        button.addEventListener('click', () => {
          current = lang;
          render();
        });
        return button;
      }),
    );
    list.replaceChildren(
      ...words.map((entry) => {
        const item = document.createElement('li');
        const word = document.createElement('span');
        word.className = 'vocab-word';
        word.textContent = entry.word;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'vocab-del';
        remove.textContent = '×';
        remove.title = entry.word;
        remove.addEventListener('click', async () => {
          const next = await chrome.runtime.sendMessage({ type: 'remove-word', lang: current, word: entry.word }).catch(() => null);
          if (next) {
            data = next;
            render();
          }
        });
        item.append(word, remove);
        return item;
      }),
    );
  }

  copy.addEventListener('click', async () => {
    const text = (data[current] ?? []).map((entry) => entry.word).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = say('copied');
      setTimeout(() => (copy.textContent = say('copy')), 1200);
    } catch {
      // the clipboard was blocked: nothing to do
    }
  });

  render();
  return section;
}

document.body.append(await vocabularyPanel());
