// Biscuit, a corgi: a companion drawn from parts (content/pixels.js) like Spot. It sits panting, and while it waits it
// turns its back and wiggles its round white rear; now and then it does that while resting too.
(() => {
  const { drawFrame, withRows } = globalThis.spotslate.pixels;
  const WIDTH = 16;
  const HEIGHT = 16;

  const FACE = [
    '.k........k.',
    'kok......kok',
    'kopk....kpok',
    'koopkkkkpook',
    'koooowwooook',
    'kookowwokook',
    'kwwwwkkwwwwk',
    'kwwwwwwwwwwk',
    '.kwwwwwwwwk.',
    '..kkkkkkkk..',
  ];
  const PANTING_FACE = withRows(FACE, { 7: 'kwwwwppwwwwk', 8: '.kwwwwpwwwk.' });
  const BLINK_FACE = withRows(PANTING_FACE, { 5: 'koddowwoddok' });
  // Eyes shut in a smile (^ ^): turning round to wiggle.
  const HAPPY_FACE = withRows(PANTING_FACE, { 4: 'kookowwokook', 5: 'kokokwwkokok' });
  const BODY = ['.kowwok.', 'koowwook', 'koowwook', 'kwwkkwwk', 'kkkkkkkk'];

  // From behind: the back of the head, then the round white rear on short legs.
  const HEAD_BACK = [
    '.k........k.',
    'kok......kok',
    'kodk....kdok',
    'koodkkkkdook',
    'kooooooooook',
    'kooooooooook',
    'kdoooooooodk',
    '.kddddddddk.',
  ];
  const REAR = [
    '..kooooooook..',
    '.kooowwwwoook.',
    'koowwwccwwwook',
    'kowwwwccwwwwok',
    '.kwwwwkkwwwwk.',
    '..kwk....kwk..',
    '..kkk....kkk..',
  ];

  const facing = (face = PANTING_FACE) => drawFrame(WIDTH, HEIGHT, [[BODY, 4, 11], [face, 2, 1]]);
  // From behind, the rear swayed `sway` cells to the right (or left, below 0).
  const turned = (sway = 0) => drawFrame(WIDTH, HEIGHT, [[REAR, 1 + sway, 9], [HEAD_BACK, 2, 1]]);

  const sitting = facing();
  const biscuit = {
    name: 'Biscuit',
    width: WIDTH,
    height: HEIGHT,
    palette: { k: '#3a2a1e', o: '#e8873a', d: '#c46a22', w: '#fff6e8', c: '#ecd9bd', p: '#ff8aa0' },
    animations: {
      dance: { fps: 8, frames: [turned(-1), turned(), turned(1), turned()] },
      idle: { fps: 4, frames: [sitting, facing(FACE), sitting, facing(FACE), facing(BLINK_FACE), sitting] },
      wiggle: {
        fps: 8,
        frames: [facing(HAPPY_FACE), turned(), turned(-1), turned(1), turned(-1), turned(1), turned(), facing(HAPPY_FACE), sitting],
      },
    },
    fidgets: ['wiggle'],
  };

  const spotslate = (globalThis.spotslate ??= {});
  spotslate.heroes = { ...spotslate.heroes, corgi: biscuit };
})();
