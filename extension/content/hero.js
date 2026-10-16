// The companion: a small pixel character by the mouse pointer while Alt is held, and on the edge of the translation
// popup after. Its frames come from a hero definition (content/pup.js, cat.js, corgi.js). It never takes the mouse:
// hovering and clicks go through it to the page.
(() => {
  const ROOT_ID = 'spotslate-hero';
  const SCALE = 2; // css pixels per cell
  const POINTER_GAP = { x: 12, y: 16 }; // below and right of the tip of the mouse pointer, clear of the arrow
  const PERCH_INSET = 10; // from the popup's left edge
  const MARGIN = 4;
  const FOLLOW = 0.4; // share of the way to the mouse covered each frame
  const HOP_MS = 320;
  const HOP_HEIGHT = 18;
  const HOP_DISTANCE = 48; // a perch that moves farther than this at once is hopped to
  const REST = 'idle'; // the mood in which a hero does its fidgets now and then
  const FIDGET_PAUSE_MS = [5000, 12000]; // the shortest and the longest rest between two fidgets
  const SVG = 'http://www.w3.org/2000/svg';

  // Inline !important beats any page rule, as for the translation popup.
  const HOST_STYLE = [
    'all: initial',
    'position: fixed',
    'top: 0',
    'left: 0',
    'display: block',
    'z-index: 2147483647',
    'pointer-events: none',
  ]
    .map((rule) => `${rule} !important`)
    .join('; ');

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  // One strip of all the frames of an animation side by side, as runs of same-colored cells.
  function strip(hero, name, scale) {
    const { frames } = hero.animations[name];
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', `strip strip-${name}`);
    svg.setAttribute('viewBox', `0 0 ${frames.length * hero.width} ${hero.height}`);
    svg.setAttribute('width', String(frames.length * hero.width * scale));
    svg.setAttribute('height', String(hero.height * scale));
    svg.setAttribute('shape-rendering', 'crispEdges');
    const shapes = {};
    frames.forEach((rows, index) =>
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; ) {
          let end = x + 1;
          while (row[end] === row[x]) end++;
          if (row[x] !== '.') shapes[row[x]] = `${shapes[row[x]] ?? ''}M${index * hero.width + x} ${y}h${end - x}v1h${x - end}z`;
          x = end;
        }
      }),
    );
    for (const [cell, path] of Object.entries(shapes)) {
      const shape = document.createElementNS(SVG, 'path');
      shape.setAttribute('d', path);
      shape.setAttribute('fill', hero.palette[cell]);
      svg.append(shape);
    }
    return svg;
  }

  // The visible window onto the strips, the strip being played stepping through its frames. A strip shown again
  // starts from its first frame.
  function spriteCss(hero, scale) {
    const width = hero.width * scale;
    const rules = Object.entries(hero.animations).map(([name, { fps, frames }]) => {
      const seconds = (frames.length / fps).toFixed(3);
      return `
        :host([data-play="${name}"]) .strip-${name} { display: block; }
        .strip-${name} { animation: play-${name} ${seconds}s steps(${frames.length}) infinite; }
        @keyframes play-${name} { to { transform: translateX(-${frames.length * width}px); } }`;
    });
    return `
      .sprite {
        position: relative;
        width: ${width}px;
        height: ${hero.height * scale}px;
        overflow: hidden;
        transform-origin: 50% 100%;
        animation: appear 160ms ease-out;
      }
      .strip { display: none; position: absolute; top: 0; left: 0; }
      @keyframes appear { from { transform: scale(0.3); opacity: 0; } }
      ${rules.join('\n')}
      @media (prefers-reduced-motion: reduce) { .sprite, .strip { animation: none; } }
    `;
  }

  const duration = (hero, name) => (hero.animations[name].frames.length / hero.animations[name].fps) * 1000;

  // Draws `hero` in a shadow root of `host`, `scale` css pixels per cell. It plays the animation of the mood it is
  // given (`data-mood` and `data-play` on the host); resting, it now and then plays one of its fidgets once instead
  // (`data-play`), unless the user asks for reduced motion.
  function drawHero(hero, host, { scale = SCALE } = {}) {
    const shadow = host.attachShadow({ mode: globalThis.spotslate.SHADOW_MODE });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(spriteCss(hero, scale));
    shadow.adoptedStyleSheets = [sheet];
    const sprite = document.createElement('div');
    sprite.className = 'sprite';
    sprite.append(...Object.keys(hero.animations).map((name) => strip(hero, name, scale)));
    shadow.append(sprite);
    host.dataset.hero = hero.name;
    let mood = null;
    let timer = 0;

    const play = (name) => {
      if (host.dataset.play !== name) host.dataset.play = name;
    };

    function restAWhile() {
      const [shortest, longest] = FIDGET_PAUSE_MS;
      timer = setTimeout(fidget, shortest + Math.random() * (longest - shortest));
    }

    function fidget() {
      if (reducedMotion()) {
        restAWhile();
        return;
      }
      const name = hero.fidgets[Math.floor(Math.random() * hero.fidgets.length)];
      play(name);
      timer = setTimeout(() => {
        play(mood);
        restAWhile();
      }, duration(hero, name));
    }

    return {
      setMood(next) {
        if (next === mood) return;
        clearTimeout(timer);
        mood = next;
        host.dataset.mood = next;
        play(next);
        if (next === REST && hero.fidgets?.length) restAWhile();
      },
      // Stops the fidgets; the next mood starts afresh.
      stop() {
        clearTimeout(timer);
        mood = null;
      },
    };
  }

  // `spot()` says where the hero should be on each frame: null for nowhere, { mouse: { x, y }, mood } next to the
  // mouse pointer, or { perch: rect, mood } on the edge of that rect. `mood` names one of the hero's animations.
  function createHero(hero, spot) {
    const size = { width: hero.width * SCALE, height: hero.height * SCALE };
    let host = null;
    let drawn = null; // drawHero() on the host
    let frame = 0;
    let at = null; // where the hero is drawn: { x, y }
    let kind = null; // 'mouse' or 'perch'
    let hop = null; // { from, start } while hopping

    function build() {
      host = document.createElement('div');
      host.id = ROOT_ID;
      host.style.cssText = HOST_STYLE;
      drawn = drawHero(hero, host);
    }

    function targetOf(where) {
      const right = document.documentElement.clientWidth - MARGIN - size.width;
      const bottom = window.innerHeight - MARGIN - size.height;
      if (where.mouse) {
        const { x, y } = where.mouse;
        const left = x + POINTER_GAP.x <= right ? x + POINTER_GAP.x : x - POINTER_GAP.x - size.width;
        const top = y + POINTER_GAP.y <= bottom ? y + POINTER_GAP.y : y - POINTER_GAP.y / 2 - size.height;
        return { x: clamp(left, MARGIN, right), y: clamp(top, MARGIN, bottom) };
      }
      const { left, top, bottom: under } = where.perch;
      return { x: clamp(left + PERCH_INSET, MARGIN, right), y: top - size.height >= MARGIN ? top - size.height : under };
    }

    function draw({ x, y }) {
      host.style.setProperty('transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`, 'important');
    }

    function hide() {
      cancelAnimationFrame(frame);
      frame = 0;
      drawn?.stop();
      host?.remove();
      at = null;
      kind = null;
      hop = null;
    }

    function tick(now) {
      frame = 0;
      const where = spot();
      if (!where) {
        hide();
        return;
      }
      if (!host) build();
      drawn.setMood(where.mood);
      const target = targetOf(where);
      const nextKind = where.mouse ? 'mouse' : 'perch';
      if (!at) {
        at = target;
      } else if (reducedMotion()) {
        hop = null;
        at = target;
      } else if (nextKind !== kind || (nextKind === 'perch' && !hop && Math.hypot(target.x - at.x, target.y - at.y) > HOP_DISTANCE)) {
        hop = { from: at, start: now };
      }
      kind = nextKind;
      if (hop) {
        const progress = Math.min(1, (now - hop.start) / HOP_MS);
        const eased = 1 - (1 - progress) ** 2;
        at = {
          x: hop.from.x + (target.x - hop.from.x) * eased,
          y: hop.from.y + (target.y - hop.from.y) * eased - HOP_HEIGHT * Math.sin(Math.PI * progress),
        };
        if (progress === 1) hop = null;
      } else if (kind === 'mouse') {
        const dx = target.x - at.x;
        const dy = target.y - at.y;
        at = Math.hypot(dx, dy) < 0.5 ? target : { x: at.x + dx * FOLLOW, y: at.y + dy * FOLLOW };
      } else {
        at = target;
      }
      draw(at);
      if (!host.isConnected) document.documentElement.append(host);
      frame = requestAnimationFrame(tick);
    }

    return {
      // Call when the hero may have somewhere to be; it then keeps itself up to date until spot() says nowhere.
      wake() {
        if (!frame) frame = requestAnimationFrame(tick);
      },
      hide,
    };
  }

  Object.assign((globalThis.spotslate ??= {}), { createHero, drawHero });
})();
