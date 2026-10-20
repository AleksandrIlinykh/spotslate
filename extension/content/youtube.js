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
//    word), cached by line, and the previous translation stays on screen (dimmed) until the next one is ready, so there
//    is no flicker between cues. Look-ahead: content/youtube-timedtext.js hands over the cue timeline, and the lines
//    just ahead of the playhead are translated into the cache in advance, so the display (driven by the native caption,
//    to stay aligned with it) finds them ready and there is no lag. Only the lines of the video being watched are sent,
//    and only while captions show.
(() => {
  /** @type {SpotSlate['markCaptionBlock']} */
  function markCaptionBlock(element) {
    const cue = element?.closest?.('.captions-text');
    if (cue instanceof HTMLElement && cue.closest('.ytp-caption-window-container')) cue.dataset.spotslateBlock = '';
  }

  // Parse a `/api/timedtext` json3 body (content/youtube-timedtext.js hands it over) into the cue timeline: each event
  // is a displayable line with a start and end. Empty events (line breaks) are dropped; the cues come out time-ordered.
  /** @type {SpotSlate['parseTimedText']} */
  function parseTimedText(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return [];
    }
    const events = Array.isArray(data?.events) ? data.events : [];
    const cues = [];
    for (const event of events) {
      if (typeof event?.tStartMs !== 'number') continue;
      const text = (event.segs ?? [])
        .map((seg) => (seg && typeof seg.utf8 === 'string' ? seg.utf8 : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      const start = event.tStartMs / 1000;
      const end = (event.tStartMs + (typeof event.dDurationMs === 'number' ? event.dDurationMs : 0)) / 1000;
      cues.push({ start, end, text });
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  const SUB_CLASS = 'spotslate-sub';
  const WAIT_CLASS = 'spotslate-sub-wait';
  const STALE_CLASS = 'spotslate-sub-stale';
  const SETTLE_MS = 450; // wait for a cue's text to settle (auto-captions stream word by word) before translating it
  const GAP_PX = 2; // between our line's bottom and the native caption's top
  const LOOKAHEAD_S = 15; // translate cues this far ahead of the playhead, so the translation is ready before the line
  const WARM_MAX = 2; // cues warmed per tick, so the look-ahead fills gradually instead of in one burst of requests
  const WARM_EVERY_MS = 1000; // between warming ticks

  const CAPTIONS_CSS = `
    .${SUB_CLASS} {
      position: absolute; z-index: 60; pointer-events: none;
      text-align: center; white-space: pre-wrap; line-height: 1.2;
      transition: opacity 0.15s ease;
    }
    .${SUB_CLASS}.${STALE_CLASS} { opacity: 0.45; }
    .${SUB_CLASS} span {
      display: inline-block; padding: 0 0.5em; border-radius: 2px; font-size: 0.88em;
      background: rgba(8, 8, 8, 0.75); color: #ffdf6b; opacity: 0.95;
    }
    .${SUB_CLASS} .${WAIT_CLASS} { letter-spacing: 0.15em; animation: spotslate-sub-pulse 1.1s ease-in-out infinite; }
    @keyframes spotslate-sub-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.95; } }
    @media (prefers-reduced-motion: reduce) {
      .${SUB_CLASS} { transition: none; }
      .${SUB_CLASS} .${WAIT_CLASS} { animation: none; }
    }
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
    let currentText = ''; // the native cue text last handled (the DOM fallback), so the same line is not translated twice
    const cache = new Map(); // `${targetLang}\n${text}` -> translation
    // The cue timeline from timedtext (look-ahead): the lines just ahead of the playhead are translated into the cache,
    // so sync's lookup is a hit when the line appears and there is no lag. The display stays driven by the native
    // caption (sync), so the translation stays aligned with it. `onTimedText` listens for the MAIN-world messages.
    let videoId = '';
    /** @type {SpotSlate.Cue[]} */
    let timeline = [];
    let lastWarm = 0;
    const pending = new Set(); // `${targetLang}\n${text}` being translated ahead, so a cue is not warmed twice
    /** @type {((event: MessageEvent) => void) | null} */
    let onTimedText = null;

    const captionsEl = () => document.querySelector('.ytp-caption-window-container .captions-text');

    // While an ad plays, YouTube marks the player `ad-showing`/`ad-interrupting` and may show the ad's own captions.
    // Those are not the video, so they are not translated (it would waste a request and clutter the ad). The player
    // API that would say this (getAdState) lives in the page's own world, out of reach, but the class is in the DOM.
    const adShowing = () => {
      const player = document.querySelector('#movie_player');
      return !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    };

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
      if (!player || adShowing() || !(cue instanceof HTMLElement) || !cue.isConnected) {
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

    // Put `content` in the overlay (a preloader when `wait`), or clear it when null, then reposition. Anything shown is
    // current, so the stale dim is cleared.
    function render(content, wait = false) {
      if (content === null) {
        overlay?.replaceChildren();
        overlay?.classList.remove(STALE_CLASS);
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
      overlay.classList.remove(STALE_CLASS);
      shownText = !wait;
      place();
    }

    // Dim the line kept on screen while the next one is translated, so a translation that no longer matches the caption
    // reads as catching up, not as the truth; cleared as soon as the new translation (or a preloader) replaces it.
    function markStale(on) {
      overlay?.classList.toggle(STALE_CLASS, on);
    }

    // Track the native caption while it shows (it moves as it reflows and as the controls come and go); stop when it
    // is gone (the observer restarts this when the next caption appears), so nothing runs over a bare video.
    function track() {
      if (!running) {
        raf = 0;
        return;
      }
      if (timeline.length) warmTimeline();
      place();
      raf = captionsEl() ? requestAnimationFrame(track) : 0;
    }

    function startTracking() {
      if (!raf && running) raf = requestAnimationFrame(track);
    }

    const videoTime = () => {
      const video = document.querySelector('#movie_player video');
      return video instanceof HTMLMediaElement ? video.currentTime : null;
    };

    // The look-ahead only warms the cache; the display stays driven by the native caption (sync), so the translation
    // stays aligned with the line on screen. Cue start times run a line ahead of the display, so driving by them would
    // show the translation before the original; warming the upcoming lines instead makes sync's lookup a hit when the
    // line appears, so there is no lag. Throttled, and off during ads or with no caption.
    function warmTimeline() {
      if (adShowing() || !captionsEl()) return;
      const t = videoTime();
      if (t == null) return;
      const now = performance.now();
      if (now - lastWarm < WARM_EVERY_MS) return;
      lastWarm = now;
      warmAhead(t);
    }

    // Translate a cue ahead of time into the cache (once); `pending` keeps a cue from being warmed twice at once.
    function warm(text) {
      const key = `${targetLang}\n${text}`;
      if (cache.has(key) || pending.has(key)) return false;
      pending.add(key);
      Promise.resolve(translate(text)).then(
        (answer) => {
          pending.delete(key);
          const translation = answer?.trim?.() ?? '';
          if (translation) cache.set(key, translation);
        },
        () => pending.delete(key),
      );
      return true;
    }

    function warmAhead(t) {
      let warmed = 0;
      for (const cue of timeline) {
        if (cue.start < t) continue;
        if (cue.start > t + LOOKAHEAD_S) break;
        if (warm(cue.text) && ++warmed >= WARM_MAX) break;
      }
    }

    function handleTimedText(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.spotslate !== 'spotslate-timedtext' || typeof data.body !== 'string') return;
      const cues = parseTimedText(data.body);
      if (cues.length === 0) return;
      if (timeline.length === 0) {
        timeline = cues;
        return;
      }
      const seen = new Set(timeline.map((cue) => `${cue.start}|${cue.text}`));
      for (const cue of cues) {
        const id = `${cue.start}|${cue.text}`;
        if (!seen.has(id)) {
          seen.add(id);
          timeline.push(cue);
        }
      }
      timeline.sort((a, b) => a.start - b.start);
    }

    async function sync() {
      if (adShowing()) {
        // An ad is playing: drop any line and translate nothing until the video is back.
        currentText = '';
        render(null);
        return;
      }
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
      if (shownText) markStale(true); // keep the last translation up, dimmed, so it reads as catching up
      else render('...', true); // nothing shown yet: a preloader instead
      const translation = (await translate(text))?.trim();
      if (currentText !== text) return; // the cue moved on while translating
      if (!translation) {
        if (shownText) markStale(false); // nothing came back: keep the last line, undimmed
        else render(null); // nothing to fall back to: clear the preloader
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
        if (options.videoId !== undefined && options.videoId !== videoId) {
          videoId = options.videoId; // a new video: its timeline, and what was shown, start over
          timeline = [];
          currentText = '';
        }
        running = true;
        if (!onTimedText) {
          onTimedText = handleTimedText;
          window.addEventListener('message', onTimedText);
        }
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
        if (onTimedText) {
          window.removeEventListener('message', onTimedText);
          onTimedText = null;
        }
        clearTimeout(timer);
        timer = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        currentText = '';
        timeline = [];
        pending.clear();
        shownText = false;
        overlay?.remove();
        overlay = null;
      },
    };
  }

  Object.assign((globalThis.spotslate ??= {}), { markCaptionBlock, createCaptions, parseTimedText });
})();
