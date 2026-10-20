// YouTube captions. Two things:
//
// 1. markCaptionBlock: a caption cue is `.captions-text` (its visual lines inside), in the player's
//    `.ytp-caption-window-container`. Marking the cue as one translatable block lets Alt over a caption translate the
//    whole current line at once, not just the visual row under the pointer. main.js calls it only while the user is
//    picking (Alt held), so nothing runs on its own, and it is a no-op wherever there is no caption.
//
// 2. createCaptions: dual subtitles. While the native captions show (the user's own CC button is the on/off switch),
//    each caption line is translated and the translation is added right above it, inside YouTube's caption window, so
//    it keeps the native font, position and fullscreen behaviour. The translation goes above the native line (not
//    below) and grows upward, so the native line the user is reading never jumps when the translation lands; a
//    translation is not instant, so a quiet preloader holds its place until it does. The translation reads smaller and
//    in a warm tint, to tell it from the original at a glance. Only the lines of the video the user is watching are
//    sent, and only while captions show; translations are cached by line so a repeat or a seek costs nothing.
(() => {
  /** @type {SpotSlate['markCaptionBlock']} */
  function markCaptionBlock(element) {
    const cue = element?.closest?.('.captions-text');
    if (cue instanceof HTMLElement && cue.closest('.ytp-caption-window-container')) cue.dataset.spotslateBlock = '';
  }

  const SUB_CLASS = 'spotslate-sub';
  const WAIT_CLASS = 'spotslate-sub-wait';
  const SETTLE_MS = 250; // let a cue's text settle (auto-captions stream word by word) before translating it

  const CAPTIONS_CSS = `
    .${SUB_CLASS} { text-align: center; white-space: pre-wrap; line-height: 1.2; margin: 0 0 0.12em; }
    .${SUB_CLASS} span {
      display: inline-block; padding: 0 0.5em; border-radius: 2px; font-size: 0.88em;
      background: rgba(8, 8, 8, 0.75); color: #ffdf6b; opacity: 0.95;
    }
    .${SUB_CLASS} .${WAIT_CLASS} { letter-spacing: 0.15em; animation: spotslate-sub-pulse 1.1s ease-in-out infinite; }
    @keyframes spotslate-sub-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.95; } }
    @media (prefers-reduced-motion: reduce) { .${SUB_CLASS} .${WAIT_CLASS} { animation: none; } }
  `;

  /** @type {SpotSlate['createCaptions']} */
  function createCaptions() {
    /** @type {(text: string) => Promise<string>} */
    let translate = async () => '';
    let targetLang = 'en';
    let observer = null;
    let styled = false;
    let timer = 0;
    let currentText = ''; // the native cue text last handled, so the same line is not translated twice
    const cache = new Map(); // `${targetLang}\n${text}` -> translation

    const captionsEl = () => document.querySelector('.ytp-caption-window-container .captions-text');

    function injectStyle() {
      if (styled) return;
      styled = true;
      const style = document.createElement('style');
      style.dataset.spotslate = 'captions';
      style.textContent = CAPTIONS_CSS;
      document.head?.append(style);
    }

    function removeLine() {
      for (const line of document.querySelectorAll(`.${SUB_CLASS}`)) line.remove();
    }

    // The translation goes above the native cue, as a sibling before `.captions-text` inside the caption window, so it
    // sits in the same box (keeping the caption's placement and fullscreen), grows upward so the native line below does
    // not jump, and reuses the one line already there (the cue's text changed in place) so a cue never gets two lines.
    function lineFor(native) {
      let line = native.previousElementSibling;
      if (!(line instanceof HTMLElement && line.classList.contains(SUB_CLASS))) {
        line = document.createElement('div');
        line.className = SUB_CLASS;
        native.before(line);
      }
      const seg = native.querySelector('.ytp-caption-segment');
      if (seg) line.style.fontSize = getComputedStyle(seg).fontSize; // size off the native caption; the span is smaller
      return line;
    }

    function renderText(native, translation) {
      const span = document.createElement('span');
      span.textContent = translation;
      lineFor(native).replaceChildren(span);
    }

    // While a line is being translated, hold its place with a quiet pulsing preloader, so the native line keeps still
    // and the user sees the translation is on its way.
    function renderWait(native) {
      const span = document.createElement('span');
      span.className = WAIT_CLASS;
      span.textContent = '...';
      lineFor(native).replaceChildren(span);
    }

    function clearLine(native) {
      const line = native.previousElementSibling;
      if (line instanceof HTMLElement && line.classList.contains(SUB_CLASS)) line.remove();
    }

    async function sync() {
      const native = captionsEl();
      if (!(native instanceof HTMLElement)) {
        currentText = '';
        return;
      }
      const text = native.innerText.trim();
      if (!text || text === currentText) return;
      currentText = text;
      const key = `${targetLang}\n${text}`;
      const cached = cache.get(key);
      if (cached !== undefined) {
        if (native.isConnected) renderText(native, cached);
        return;
      }
      if (native.isConnected) renderWait(native); // show the preloader while the translation is fetched
      const translation = (await translate(text))?.trim();
      if (currentText !== text || !native.isConnected) return; // the cue moved on while translating
      if (!translation) {
        clearLine(native); // nothing came back: drop the preloader rather than leave it spinning
        return;
      }
      cache.set(key, translation);
      renderText(native, translation);
    }

    function scheduleSync() {
      clearTimeout(timer);
      timer = setTimeout(sync, SETTLE_MS);
    }

    return {
      // Starts watching the player for captions (idempotent); `translate(text)` returns the line's translation.
      start(options) {
        translate = options.translate;
        if (options.targetLang !== targetLang) {
          targetLang = options.targetLang;
          currentText = ''; // the open cue must be translated again, into the new language
        }
        if (!observer) {
          injectStyle();
          observer = new MutationObserver(scheduleSync);
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
        scheduleSync();
      },
      stop() {
        observer?.disconnect();
        observer = null;
        clearTimeout(timer);
        timer = 0;
        currentText = '';
        removeLine();
      },
    };
  }

  Object.assign((globalThis.spotslate ??= {}), { markCaptionBlock, createCaptions });
})();
