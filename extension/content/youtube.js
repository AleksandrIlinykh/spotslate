// YouTube captions. Two things:
//
// 1. markCaptionBlock: a caption cue is `.captions-text` (its visual lines inside), in the player's
//    `.ytp-caption-window-container`. Marking the cue as one translatable block lets Alt over a caption translate the
//    whole current line at once, not just the visual row under the pointer. main.js calls it only while the user is
//    picking (Alt held), so nothing runs on its own, and it is a no-op wherever there is no caption.
//
// 2. createCaptions: dual subtitles. While the native captions show (the user's own CC button is the on/off switch),
//    each caption line is translated and shown just above it. The translation is NOT put inside YouTube's caption
//    window: auto-captions reflow line by line and YouTube replaces the whole caption node on every cue, so a line
//    living in that box is destroyed each cue and rides its constant resize (it flickers, and it shoves the native
//    line). Instead the translation lives in one overlay of our own, appended to `#movie_player` (so it shows in
//    fullscreen too) and positioned over the player just above the native caption window, tracking it. We never touch
//    the native caption DOM, so the native line never moves because of us. The translation reads smaller and in a warm
//    tint, to tell it from the original. A cue's text is translated once it settles (auto-captions stream word by
//    word), cached by line, and the previous translation stays on screen until the next one is ready, so there is no
//    flicker between cues. Only the lines of the video being watched are sent, and only while captions show.
(() => {
  /** @type {SpotSlate['markCaptionBlock']} */
  function markCaptionBlock(element) {
    const cue = element?.closest?.('.captions-text');
    if (cue instanceof HTMLElement && cue.closest('.ytp-caption-window-container')) cue.dataset.spotslateBlock = '';
  }

  const SUB_CLASS = 'spotslate-sub';
  const WAIT_CLASS = 'spotslate-sub-wait';
  const SETTLE_MS = 450; // wait for a cue's text to settle (auto-captions stream word by word) before translating it
  const GAP_PX = 2; // between our line's bottom and the native caption's top

  const CAPTIONS_CSS = `
    .${SUB_CLASS} {
      position: absolute; z-index: 60; pointer-events: none;
      text-align: center; white-space: pre-wrap; line-height: 1.2;
    }
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
    /** @type {(text: string) => void} */
    let onCue = () => {};
    let targetLang = 'en';
    let observer = null;
    let styled = false;
    let running = false;
    let timer = 0;
    let raf = 0;
    /** @type {HTMLElement | null} */
    let overlay = null;
    let shownText = false; // whether the overlay currently shows a translation (not a preloader, not empty)
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

    // Our one overlay, kept inside the current player (YouTube rebuilds the player between videos, so re-adopt it).
    function ensureOverlay() {
      const player = document.querySelector('#movie_player');
      if (!player) return null;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = SUB_CLASS;
      }
      if (overlay.parentElement !== player) player.append(overlay);
      return overlay;
    }

    // Pin the overlay over the player, its bottom just above the native caption window's top, as wide as it, in its
    // font size. Hidden when there is no caption or nothing to show, so it never lingers over a bare video.
    function place() {
      const player = document.querySelector('#movie_player');
      const cue = captionsEl();
      if (!player || !(cue instanceof HTMLElement) || !cue.isConnected) {
        if (overlay) overlay.style.display = 'none';
        return;
      }
      if (!overlay || overlay.childNodes.length === 0) {
        if (overlay) overlay.style.display = 'none';
        return;
      }
      ensureOverlay();
      const windowEl = cue.closest('.caption-window') ?? cue;
      const pr = player.getBoundingClientRect();
      const nr = windowEl.getBoundingClientRect();
      const seg = cue.querySelector('.ytp-caption-segment');
      overlay.style.display = '';
      overlay.style.left = `${nr.left - pr.left}px`;
      overlay.style.width = `${nr.width}px`;
      overlay.style.top = '';
      overlay.style.bottom = `${pr.bottom - nr.top + GAP_PX}px`;
      if (seg) overlay.style.fontSize = getComputedStyle(seg).fontSize;
    }

    // Put `content` in the overlay (a preloader when `wait`), or clear it when null, then reposition.
    function render(content, wait = false) {
      if (content === null) {
        overlay?.replaceChildren();
        shownText = false;
        place();
        return;
      }
      ensureOverlay();
      if (!overlay) return;
      const span = document.createElement('span');
      if (wait) span.className = WAIT_CLASS;
      span.textContent = content;
      overlay.replaceChildren(span);
      shownText = !wait;
      place();
    }

    // Track the native caption while it shows (it moves as it reflows and as the controls come and go); stop when it
    // is gone (the observer restarts this when the next caption appears), so nothing runs over a bare video.
    function track() {
      if (!running) {
        raf = 0;
        return;
      }
      place();
      raf = captionsEl() ? requestAnimationFrame(track) : 0;
    }

    function startTracking() {
      if (!raf && running) raf = requestAnimationFrame(track);
    }

    async function sync() {
      const cue = captionsEl();
      if (!(cue instanceof HTMLElement)) {
        currentText = '';
        render(null);
        return;
      }
      const text = cue.innerText.trim();
      if (!text) {
        currentText = '';
        render(null);
        return;
      }
      if (text === currentText) {
        place();
        return;
      }
      currentText = text;
      onCue(text); // tell main.js a new cue settled, so it can build the video's context from the lines seen
      const key = `${targetLang}\n${text}`;
      const cached = cache.get(key);
      if (cached !== undefined) {
        render(cached);
        return;
      }
      if (!shownText) render('...', true); // preload only when nothing is shown yet; else keep the last line up
      const translation = (await translate(text))?.trim();
      if (currentText !== text) return; // the cue moved on while translating
      if (!translation) {
        if (!shownText) render(null); // nothing came back and nothing to fall back to: clear the preloader
        return;
      }
      cache.set(key, translation);
      render(translation);
    }

    function scheduleSync() {
      clearTimeout(timer);
      timer = setTimeout(sync, SETTLE_MS);
    }

    return {
      // Starts watching the player for captions (idempotent); `translate(text)` returns the line's translation, and
      // `onCue(text)` (optional) is told each new cue, so main.js can build the video's context.
      start(options) {
        translate = options.translate;
        onCue = options.onCue ?? (() => {});
        if (options.targetLang !== targetLang) {
          targetLang = options.targetLang;
          currentText = ''; // the open cue must be translated again, into the new language
        }
        running = true;
        if (!observer) {
          injectStyle();
          observer = new MutationObserver(() => {
            place(); // keep glued to the native caption as it reflows, before the (debounced) translation catches up
            startTracking();
            scheduleSync();
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
        startTracking();
        scheduleSync();
      },
      stop() {
        running = false;
        observer?.disconnect();
        observer = null;
        clearTimeout(timer);
        timer = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        currentText = '';
        shownText = false;
        overlay?.remove();
        overlay = null;
      },
    };
  }

  Object.assign((globalThis.spotslate ??= {}), { markCaptionBlock, createCaptions });
})();
