// A small confirmation that fades in at the bottom of the page and fades out, used when Alt+A saves a word. It is a
// plain element with inline !important styles (like the highlight), not a shadow root: it shows only a public word and
// takes no input, so it needs no isolation.
(() => {
  const ROOT_ID = 'spotslate-toast';
  const SHOWN_MS = 1600;

  const important = (rules) => rules.map((rule) => `${rule} !important`).join('; ');
  // The flying word: a little pill that the companion tosses up and away when a word is saved, into the vocabulary.
  const TOSS_STYLE = important([
    'all: initial',
    'position: fixed',
    'display: block',
    'padding: 3px 10px',
    'border-radius: 10px',
    'background: #1a7f37',
    'color: #ffffff',
    'font: 12px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'white-space: nowrap',
    'z-index: 2147483647',
    'pointer-events: none',
    'transform: translate(-50%, -50%)',
  ]);
  const STYLE = important([
    'all: initial',
    'position: fixed',
    'left: 50%',
    'bottom: 24px',
    'transform: translateX(-50%)',
    'display: block',
    'max-width: 80vw',
    'padding: 8px 14px',
    'border-radius: 8px',
    'background: #1f2328',
    'color: #ffffff',
    'font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'white-space: nowrap',
    'overflow: hidden',
    'text-overflow: ellipsis',
    'box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3)',
    'z-index: 2147483647',
    'pointer-events: none',
  ]);

  /** @type {SpotSlate['createToast']} */
  function createToast() {
    const box = document.createElement('div');
    box.id = ROOT_ID;
    let timer = 0;
    let frame = 0;
    const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      show(text) {
        box.textContent = text;
        box.style.cssText = `${STYLE}; opacity: ${motion ? '0' : '1'} !important; transition: ${motion ? 'opacity 0.15s ease' : 'none'} !important;`;
        if (!box.isConnected) document.documentElement.append(box);
        if (motion) {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => box.style.setProperty('opacity', '1', 'important'));
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          box.style.setProperty('opacity', '0', 'important');
          setTimeout(() => box.remove(), motion ? 200 : 0);
        }, SHOWN_MS);
      },
      // The companion tosses the word up and away from `origin` (where the companion is) into the vocabulary. Skipped
      // with reduced motion; the toast still confirms.
      toss(text, origin) {
        if (!motion || !origin) return;
        const pill = document.createElement('div');
        pill.dataset.spotslateToss = '';
        pill.textContent = text;
        pill.style.cssText = `${TOSS_STYLE}; left: ${Math.round(origin.x)}px !important; top: ${Math.round(origin.y)}px !important;`;
        document.documentElement.append(pill);
        const drift = (Math.random() - 0.5) * 90;
        const rise = 130;
        const animation = pill.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.6) rotate(0deg)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1) rotate(-6deg)', opacity: 1, offset: 0.18 },
            { transform: `translate(calc(-50% + ${drift * 0.5}px), calc(-50% - ${rise * 0.6}px)) scale(1) rotate(6deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${rise}px)) scale(0.25) rotate(14deg)`, opacity: 0 },
          ],
          { duration: 700, easing: 'cubic-bezier(0.25, 0.7, 0.35, 1)' },
        );
        animation.onfinish = animation.oncancel = () => pill.remove();
      },
    };
  }

  Object.assign((globalThis.spotslate ??= {}), { createToast });
})();
