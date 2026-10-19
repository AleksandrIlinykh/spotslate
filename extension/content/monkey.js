// Momo, a monkey: a companion drawn from parts (content/pixels.js) like Spot. It jumps while it waits, and now and
// then, resting, it grabs its head with both hands.
(() => {
  const { drawFrame, mirror, withRows } = globalThis.spotslate.pixels;
  const WIDTH = 16;
  const HEIGHT = 16;

  // A round brown head with big ears at the sides and a tan face: two dark eyes and a small mouth.
  const HEAD = [
    '...kbbbbk...',
    '..kbbbbbbk..',
    '.kbbbbbbbbk.',
    'kfkbbbbbbkfk',
    'kfkbffffbkfk',
    '.kbfkffkfbk.',
    '.kbffppffbk.',
    '..kbffffbk..',
    '...kkkkkk...',
  ];
  // Eyes shut in a smile (^ ^) and a wide grin: jumping.
  const HAPPY_HEAD = withRows(HEAD, { 5: '.kbfdffdfbk.', 6: '.kbfppppfbk.' });
  const BLINK_HEAD = withRows(HEAD, { 5: '.kbfdffdfbk.' });
  // Wide eyes and an open mouth: hands at its head.
  const PANIC_HEAD = withRows(HEAD, { 5: '.kbwkffkwbk.', 6: '.kbfkkkkfbk.' });

  // The chest, belly, legs and feet, one row each; `chest` rows of chest.
  const body = (chest) => [...Array(chest).fill('kbffbk'), 'kbbbbk', 'kbkkbk', 'kkkkkk'];
  const ARM_DOWN = ['.kk', 'kbk', 'kfk', '.k.'];
  const ARM_UP = ['.k...', 'kfk..', 'kbk..', '.kbk.', '..kbk', '...kk'];

  // The whole monkey: `pose` is 'crouch', 'stand' or 'jump', `arms` 'down', 'left', 'right' or 'both' (raised).
  function monkey({ pose = 'stand', arms = 'down', head = HEAD }) {
    const top = { crouch: 3, stand: 2, jump: 1 }[pose];
    const chest = pose === 'crouch' ? 1 : 2;
    const bodyTop = top + 9;
    const left = arms === 'left' || arms === 'both';
    const right = arms === 'right' || arms === 'both';
    /** @type {[SpotSlate.Part, number, number][]} */
    const layers = [[head, 2, top], [body(chest), 5, bodyTop]];
    layers.push(left ? [ARM_UP, 0, top + 4] : [ARM_DOWN, 3, bodyTop]);
    layers.push(right ? [mirror(ARM_UP), 11, top + 4] : [mirror(ARM_DOWN), 10, bodyTop]);
    return drawFrame(WIDTH, HEIGHT, layers);
  }

  const standing = monkey({});
  const momo = {
    name: 'Momo',
    width: WIDTH,
    height: HEIGHT,
    palette: { k: '#3a2a1e', b: '#8a5a33', f: '#d9a86b', w: '#fff6e8', p: '#ff8aa0', d: '#5a3a22' },
    animations: {
      dance: {
        fps: 7,
        frames: [
          monkey({ pose: 'crouch', head: HAPPY_HEAD }),
          monkey({ pose: 'jump', arms: 'both', head: HAPPY_HEAD }),
          monkey({ pose: 'crouch', head: HAPPY_HEAD }),
          monkey({ pose: 'jump', arms: 'both', head: HAPPY_HEAD }),
        ],
      },
      idle: {
        fps: 4,
        frames: [standing, standing, standing, standing, monkey({ head: BLINK_HEAD }), standing],
      },
      // Both hands fly to its head and it shakes, then it lets go.
      panic: {
        fps: 6,
        frames: [
          monkey({ arms: 'both', head: PANIC_HEAD }),
          monkey({ arms: 'both', pose: 'crouch', head: PANIC_HEAD }),
          monkey({ arms: 'both', head: PANIC_HEAD }),
          monkey({ arms: 'both', pose: 'crouch', head: PANIC_HEAD }),
          monkey({ arms: 'both', head: PANIC_HEAD }),
          standing,
        ],
      },
    },
    fidgets: ['panic'],
  };

  const spotslate = (globalThis.spotslate ??= {});
  spotslate.heroes = { ...spotslate.heroes, monkey: momo };
})();
