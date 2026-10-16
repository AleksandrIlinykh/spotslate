// Ink, a black cat: a companion drawn from parts (content/pixels.js) like Spot. It sits with its tail swaying, kneads
// while it waits, and now and then licks a paw and washes its face, or yawns.
(() => {
  const { drawFrame, withRows } = globalThis.spotslate.pixels;
  const WIDTH = 16;
  const HEIGHT = 16;

  const HEAD = [
    '.k........k.',
    'kbk......kbk',
    'kpbkkkkkkbpk',
    'kbbsbbbbsbbk',
    'kbykybbykybk',
    'kbykybbykybk',
    'kbbbbppbbbbk',
    '.kbbkbbkbbk.',
    '..kkkkkkkk..',
  ];
  const SHUT_EYES = { 4: 'kbbbbbbbbbbk', 5: 'kbsssbbsssbk' };
  const BLINK_HEAD = withRows(HEAD, SHUT_EYES);
  // Eyes shut in a smile (^ ^): kneading.
  const HAPPY_HEAD = withRows(HEAD, { 3: 'kbbbbbbbbbbk', 4: 'kbbsbbbbsbbk', 5: 'kbsbsbbsbsbk' });
  const TWITCH_HEAD = withRows(HEAD, { 0: '.k..........', 1: 'kbk.......kk', 2: 'kpbkkkkkkkbk' });
  const LICK_HEAD = withRows(HEAD, { ...SHUT_EYES, 7: '.kbppkbbbbk.' });
  const YAWN_HEAD = withRows(HEAD, { ...SHUT_EYES, 7: '.kbbkppkbbk.' });
  const WIDE_YAWN_HEAD = withRows(HEAD, { ...SHUT_EYES, 6: 'kbbbkppkbbbk', 7: '.kbkppppkbk.' });

  const BODY = ['.kbbbbk.', 'kbbbbbbk', 'kbbbbbbk', 'kbbbbbbk', 'kkkkkkkk'];
  const PAW = ['kssk', 'kkkk'];
  const RAISED_PAW = ['.kk.', 'kssk', 'kbbk', 'kbbk', '.kbk'];
  const TAILS = {
    up: ['..kk', '.kbk', '.kbk', 'kbk.', 'kbk.', 'kbk.', 'kk..'],
    right: ['....', '..kk', '.kbk', 'kbk.', 'kbk.', 'kbk.', 'kk..'],
    left: ['.kk.', 'kbk.', 'kbk.', 'kbk.', 'kbk.', 'kbk.', 'kk..'],
  };

  // The whole cat, sitting: `paws` lifts the left and the right front paw by that many cells (kneading); `raised` puts
  // the left one up by the face instead, its top that many cells under the top of the head.
  function cat({ head = HEAD, tail = 'up', top = 2, paws = [0, 0], raised = null } = {}) {
    const layers = [[TAILS[tail], 11, top + 7], [BODY, 4, top + 9]];
    if (raised === null) layers.push([PAW, 4, 14 - paws[0]]);
    layers.push([PAW, 8, 14 - paws[1]], [head, 2, top]);
    if (raised !== null) layers.push([RAISED_PAW, 3, top + raised - 1]);
    return drawFrame(WIDTH, HEIGHT, layers);
  }

  const sitting = cat();
  const licking = [cat({ head: BLINK_HEAD, raised: 8 }), cat({ head: LICK_HEAD, raised: 7 })];
  const washing = [cat({ head: BLINK_HEAD, raised: 4 }), cat({ head: BLINK_HEAD, raised: 2 })];

  const ink = {
    name: 'Ink',
    width: WIDTH,
    height: HEIGHT,
    palette: { k: '#111117', b: '#3a3a4a', s: '#64647c', y: '#f5d547', p: '#ff8aa0' },
    animations: {
      dance: {
        fps: 6,
        frames: [
          cat({ head: HAPPY_HEAD, paws: [1, 0] }),
          cat({ head: HAPPY_HEAD }),
          cat({ head: HAPPY_HEAD, paws: [0, 1] }),
          cat({ head: HAPPY_HEAD }),
        ],
      },
      idle: {
        fps: 4,
        frames: [
          sitting,
          sitting,
          cat({ tail: 'right' }),
          cat({ tail: 'right' }),
          cat({ head: BLINK_HEAD }),
          cat({ tail: 'left' }),
          sitting,
          cat({ head: TWITCH_HEAD }),
        ],
      },
      lick: { fps: 6, frames: [...licking, ...licking, ...licking, ...washing, ...washing, licking[0], sitting] },
      yawn: {
        fps: 5,
        frames: [
          cat({ head: BLINK_HEAD }),
          cat({ head: YAWN_HEAD, top: 1 }),
          cat({ head: WIDE_YAWN_HEAD, top: 1 }),
          cat({ head: WIDE_YAWN_HEAD, top: 1 }),
          cat({ head: YAWN_HEAD }),
          cat({ head: BLINK_HEAD }),
          sitting,
        ],
      },
    },
    fidgets: ['lick', 'yawn'],
  };

  const spotslate = (globalThis.spotslate ??= {});
  spotslate.heroes = { ...spotslate.heroes, cat: ink };
})();
