import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../extension/content/pixels.js';
import '../../extension/content/pup.js';
import '../../extension/content/cat.js';
import '../../extension/content/corgi.js';
import { COMPANIONS } from '../../extension/lib/settings.js';

const { heroes } = globalThis.spotslate;
const MOODS = ['dance', 'idle'];
const distinct = (frames) => new Set(frames.map((rows) => rows.join('\n'))).size;

test('the companions to choose from are the heroes there are', () => {
  assert.deepEqual(Object.keys(heroes).sort(), [...COMPANIONS].sort());
  assert.deepEqual(COMPANIONS, ['pup', 'cat', 'corgi']);
});

test('every hero has a dance and a rest, each a loop of frames, and a name', () => {
  for (const [name, hero] of Object.entries(heroes)) {
    assert.ok(hero.name, name);
    for (const mood of MOODS) {
      const { fps, frames } = hero.animations[mood];
      assert.ok(fps > 0, `${name} ${mood}`);
      assert.ok(frames.length >= 2, `${name} ${mood}`);
    }
  }
});

test('every frame of every hero fills its size with transparent cells and colors of its palette', () => {
  for (const [name, hero] of Object.entries(heroes)) {
    for (const [animation, { frames }] of Object.entries(hero.animations)) {
      frames.forEach((rows, index) => {
        const where = `${name} ${animation} frame ${index}`;
        assert.equal(rows.length, hero.height, where);
        for (const row of rows) {
          assert.equal(row.length, hero.width, where);
          for (const cell of row) assert.ok(cell === '.' || cell in hero.palette, `${where}: ${cell}`);
        }
      });
    }
  }
});

test('every dance moves', () => {
  for (const [name, hero] of Object.entries(heroes)) assert.ok(distinct(hero.animations.dance.frames) >= 2, name);
  assert.ok(distinct(heroes.pup.animations.dance.frames) >= 3);
});

test('the things a hero does now and then are animations of its own, apart from its dance and rest', () => {
  for (const [name, hero] of Object.entries(heroes)) {
    for (const fidget of hero.fidgets ?? []) {
      assert.ok(!MOODS.includes(fidget), `${name} ${fidget}`);
      assert.ok(hero.animations[fidget].fps > 0, `${name} ${fidget}`);
      assert.ok(distinct(hero.animations[fidget].frames) >= 3, `${name} ${fidget}`);
    }
  }
});

test('Spot keeps to its dance and rest, the cat licks itself and yawns, the corgi wiggles its rear', () => {
  assert.equal(heroes.pup.fidgets, undefined);
  assert.deepEqual(heroes.cat.fidgets, ['lick', 'yawn']);
  assert.deepEqual(heroes.corgi.fidgets, ['wiggle']);
});

test('the corgi dances with its back turned, so none of its dance looks like its rest', () => {
  const rest = new Set(heroes.corgi.animations.idle.frames.map((rows) => rows.join('\n')));
  for (const rows of heroes.corgi.animations.dance.frames) assert.ok(!rest.has(rows.join('\n')));
});

test('a fidget ends as the hero rests, so going back to the rest does not jump', () => {
  for (const [name, hero] of Object.entries(heroes)) {
    const rest = hero.animations.idle.frames[0].join('\n');
    for (const fidget of hero.fidgets ?? []) {
      const { frames } = hero.animations[fidget];
      const last = frames.at(-1).join('\n');
      assert.ok(hero.animations.idle.frames.some((rows) => rows.join('\n') === last) || last === rest, `${name} ${fidget}`);
    }
  }
});

test('drawFrame lays parts over each other in order, clipped to the frame', () => {
  const { drawFrame, mirror } = globalThis.spotslate.pixels;
  const layers = [[['ab', 'b.'], 1, 0], [['c.c'], 2, 1], [['x'], 2, 0], [['d'], -1, 2]];
  assert.deepEqual(drawFrame(4, 3, layers), ['.ax.', '.bc.', '....']);
  assert.deepEqual(mirror(['ab.', 'c..']), ['.ba', '..c']);
});
