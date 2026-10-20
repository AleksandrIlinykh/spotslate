// A small confirmation that fades in at the bottom of the page and fades out, used when Alt+A saves a word. It is a
// plain element with inline !important styles (like the highlight), not a shadow root: it shows only a public word and
// takes no input, so it needs no isolation.
(() => {
  const ROOT_ID = 'spotslate-toast';
  const SHOWN_MS = 1600;

  const important = (rules) => rules.map((rule) => `${rule} !important`).join('; ');
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
    };
  }

  Object.assign((globalThis.spotslate ??= {}), { createToast });
})();
