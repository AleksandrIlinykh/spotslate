// Momo and Bobo, two monkeys: companions drawn from the same parts (content/pixels.js) like Spot. Momo jumps while it
// waits, and now and then, resting, grabs its head with both hands. Bobo never jumps: it holds its head, worried.
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

  // Bobo's face: wide eyes under brows arched in worry and a mouth turned down.
  const WORRIED_HEAD = withRows(HEAD, { 3: 'kfkbbddbbkfk', 4: 'kfkbdffdbkfk', 5: '.kbwkffkwbk.', 6: '.kbffddffbk.', 7: '..kbdffdbk..' });
  const WORRIED_BLINK_HEAD = withRows(WORRIED_HEAD, { 5: '.kbwdffdwbk.' });
  // A drop of sweat at the temple.
  const SWEAT = ['.s', 'ss'];

  // The chest, belly, legs and feet, one row each; `chest` rows of chest.
  const body = (chest) => [...Array(chest).fill('kbffbk'), 'kbbbbk', 'kbkkbk', 'kkkkkk'];
  const ARM_DOWN = ['.kk', 'kbk', 'kfk', '.k.'];
  const ARM_UP = ['.k...', 'kfk..', 'kbk..', '.kbk.', '..kbk', '...kk'];

  // The whole monkey: `pose` is 'crouch', 'stand' or 'jump', `arms` 'down', 'left', 'right' or 'both' (raised); `shake`
  // moves the head, and the hands raised to it, sideways by that many cells, and `sweat` adds a drop at its temple.
  function monkey({ pose = 'stand', arms = 'down', head = HEAD, shake = 0, sweat = false }) {
    const top = { crouch: 3, stand: 2, jump: 1 }[pose];
    const chest = pose === 'crouch' ? 1 : 2;
    const bodyTop = top + 9;
    const left = arms === 'left' || arms === 'both';
    const right = arms === 'right' || arms === 'both';
    /** @type {[SpotSlate.Part, number, number][]} */
    const layers = [[head, 2 + shake, top], [body(chest), 5, bodyTop]];
    layers.push(left ? [ARM_UP, 0 + shake, top + 4] : [ARM_DOWN, 3, bodyTop]);
    layers.push(right ? [mirror(ARM_UP), 11 + shake, top + 4] : [mirror(ARM_DOWN), 10, bodyTop]);
    if (sweat) layers.push([SWEAT, 14, top + 1]);
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

  const resting = monkey({ head: WORRIED_HEAD });
  const bobo = {
    name: 'Bobo',
    width: WIDTH,
    height: HEIGHT,
    // The colors of the picture it comes from: grey-tan hair, rosy grey skin, near black outlines, a cool light for the sweat.
    palette: { k: '#1a1516', b: '#927c73', f: '#b99a97', w: '#ddd3d4', d: '#4d3f3f', s: '#a9b1c9' },
    animations: {
      // Both hands on its head, shaking it left and right and bobbing, a drop of sweat on its temple.
      dance: {
        fps: 6,
        frames: [
          monkey({ arms: 'both', head: WORRIED_HEAD, shake: -1 }),
          monkey({ arms: 'both', pose: 'crouch', head: WORRIED_HEAD, sweat: true }),
          monkey({ arms: 'both', head: WORRIED_HEAD, shake: 1 }),
          monkey({ arms: 'both', pose: 'crouch', head: WORRIED_HEAD }),
        ],
      },
      idle: {
        fps: 4,
        frames: [resting, resting, resting, resting, monkey({ head: WORRIED_BLINK_HEAD }), resting],
      },
    },
  };

  const spotslate = (globalThis.spotslate ??= {});
  spotslate.heroes = { ...spotslate.heroes, monkey: momo, chimp: bobo };
})();
