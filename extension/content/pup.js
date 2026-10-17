// Spot, the first companion: a pixel shiba drawn from parts (content/pixels.js). Each animation is a loop of frames;
// a frame is a list of rows, one character per cell, '.' for transparent and the rest from `palette`.
(() => {
  const { drawFrame, mirror } = globalThis.spotslate.pixels;
  const WIDTH = 16;
  const HEIGHT = 16;

  const HEAD = [
    '.k........k.',
    'kok......kok',
    'kpokkkkkkopk',
    'kooooooooook',
    'kookooookook',
    'kwwookkoowwk',
    'kwwwwwwwwwwk',
    '.kwwwwwwwwk.',
    '..kkkkkkkk..',
  ];
  // Eyes shut in a smile (^ ^) and the tongue out: dancing.
  const HAPPY_HEAD = HEAD.map((row, y) => {
    if (y === 3) return 'kookooookook';
    if (y === 4) return 'kokokookokok';
    if (y === 7) return '.kwwwppwwwk.';
    return row;
  });
  const BLINK_HEAD = HEAD.map((row, y) => (y === 4 ? 'koddooooddok' : row));

  // The chest, belly, legs and feet, one row each; `chest` rows of chest.
  const body = (chest) => [...Array(chest).fill('kowwok'), 'kooook', 'kwkkwk', 'kkkkkk'];
  const ARM_DOWN = ['.kk', 'kok', 'kwk', '.k.'];
  const ARM_UP = ['.k...', 'kwk..', 'kok..', '.kok.', '..kok', '...kk'];

  // The whole dog: `pose` is 'crouch', 'stand' or 'jump', `arms` 'down', 'left' or 'right' (the one raised).
  function dog({ pose = 'stand', arms = 'down', head = HEAD }) {
    const top = { crouch: 3, stand: 2, jump: 1 }[pose];
    const chest = pose === 'crouch' ? 1 : 2;
    const bodyTop = top + 9;
    /** @type {[SpotSlate.Part, number, number][]} */
    const layers = [[head, 2, top], [body(chest), 5, bodyTop]];
    layers.push(arms === 'left' ? [ARM_UP, 0, top + 4] : [ARM_DOWN, 3, bodyTop]);
    layers.push(arms === 'right' ? [mirror(ARM_UP), 11, top + 4] : [mirror(ARM_DOWN), 10, bodyTop]);
    return drawFrame(WIDTH, HEIGHT, layers);
  }

  const pup = {
    name: 'Spot',
    width: WIDTH,
    height: HEIGHT,
    palette: { k: '#3a2a1e', o: '#f0a04b', d: '#c9772e', w: '#fff6e8', p: '#ff8aa0' },
    animations: {
      dance: {
        fps: 7,
        frames: [
          dog({ pose: 'crouch', head: HAPPY_HEAD }),
          dog({ pose: 'jump', arms: 'left', head: HAPPY_HEAD }),
          dog({ pose: 'crouch', head: HAPPY_HEAD }),
          dog({ pose: 'jump', arms: 'right', head: HAPPY_HEAD }),
        ],
      },
      idle: {
        fps: 4,
        frames: [dog({}), dog({}), dog({}), dog({}), dog({ head: BLINK_HEAD }), dog({})],
      },
    },
  };

  const spotslate = (globalThis.spotslate ??= {});
  spotslate.heroes = { ...spotslate.heroes, pup };
})();
