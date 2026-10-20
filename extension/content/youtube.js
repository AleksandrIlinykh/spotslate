// YouTube captions. A caption cue is `.captions-text` (its visual lines inside), in the player's
// `.ytp-caption-window-container`. Marking the cue as one translatable block lets Alt over a caption translate the
// whole current line at once, not just the visual row under the pointer. main.js calls markCaptionBlock only while
// the user is picking (Alt held), so nothing runs on its own, and it is a no-op wherever there is no caption.
(() => {
  /** @type {SpotSlate['markCaptionBlock']} */
  function markCaptionBlock(element) {
    const cue = element?.closest?.('.captions-text');
    if (cue instanceof HTMLElement && cue.closest('.ytp-caption-window-container')) cue.dataset.spotslateBlock = '';
  }

  Object.assign((globalThis.spotslate ??= {}), { markCaptionBlock });
})();
