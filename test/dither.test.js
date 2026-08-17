/**
 * Drawing a photo into the lattice.
 *
 * The quadrant is already a 5px bitmap cell, so a dithered image is exact on the
 * grid by construction — no rounding, nothing to report as drift. Ordered
 * (Bayer) dithering is the default because it is deterministic: the same input
 * yields byte-identical output every run, which is the property the whole
 * project rests on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { ditherToQuadrants, BAYER_4 } from '../src/core/dither.js';
import { decode } from '../src/core/png.js';
import { solidPng, encodePng, dataUri } from './helpers/png-fixture.js';

const place = (d, extra = {}) =>
  core.placeImage(d, 'base', {
    id: 'photo', at: 'C4.tl', span: { w: 6, h: 4 }, mode: 'dither',
    source: dataUri(solidPng(60, 40, [0, 0, 0])), ...extra,
  });

test('solid black turns every quadrant on', () => {
  const grid = ditherToQuadrants(decode(solidPng(24, 16, [0, 0, 0])), 12, 8);
  assert.equal(grid.width, 12);
  assert.equal(grid.height, 8);
  assert.equal(grid.on.filter(Boolean).length, 12 * 8, 'ink everywhere');
});

test('solid white turns every quadrant off', () => {
  const grid = ditherToQuadrants(decode(solidPng(24, 16, [255, 255, 255])), 12, 8);
  assert.equal(grid.on.filter(Boolean).length, 0, 'no ink at all');
});

test('mid grey lands on exactly half, which is what a threshold matrix promises', () => {
  // 4x4 Bayer over a footprint that is a whole number of tiles: half the
  // thresholds sit above mid grey and half below, so the split is exact.
  const grid = ditherToQuadrants(decode(solidPng(32, 32, [128, 128, 128])), 16, 16);
  const on = grid.on.filter(Boolean).length;
  assert.equal(on, (16 * 16) / 2, `expected an exact half, got ${on}`);
});

test('the threshold matrix is a proper Bayer ordering', () => {
  const flat = BAYER_4.flat().sort((a, b) => a - b);
  assert.deepEqual(flat, [...Array(16).keys()], 'every rank 0..15 appears exactly once');
});

test('a gradient produces a gradient of ink, not a flat field', () => {
  const w = 64, h = 8;
  const samples = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const i = (y * w + x) * 3;
      samples[i] = v; samples[i + 1] = v; samples[i + 2] = v;
    }
  }
  const grid = ditherToQuadrants(decode(encodePng(w, h, samples, { colorType: 2 })), 32, 4);
  const leftHalf = grid.on.slice(0, 32 * 4).filter((_, i) => i % 32 < 16).length;
  const inkLeft = grid.on.filter((v, i) => v && i % 32 < 16).length;
  const inkRight = grid.on.filter((v, i) => v && i % 32 >= 16).length;
  assert.ok(inkLeft > inkRight, `dark end inks more (${inkLeft}) than light end (${inkRight})`);
  assert.ok(leftHalf > 0);
});

test('transparent pixels read as ground, not as black', () => {
  const rgba = new Uint8Array(4 * 4 * 4); // all zero: transparent black
  const grid = ditherToQuadrants(decode(encodePng(4, 4, rgba, { colorType: 6 })), 4, 4);
  assert.equal(grid.on.filter(Boolean).length, 0, 'fully transparent is empty, not solid ink');
});

// ---------------------------------------------------------------------------
// Through the document
// ---------------------------------------------------------------------------

test('mode dither no longer refuses', () => {
  const d = core.createDocument({ name: 'pics' });
  assert.doesNotThrow(() => place(d));
});

test('a dithered image claims exactly its footprint, and collides normally', () => {
  const d = core.createDocument({ name: 'pics' });
  const el = place(d);
  assert.equal(core.shapes.claimedQuads(el.rect).size, 6 * 2 * 4 * 2);

  core.placeBox(d, 'base', { id: 'over', at: 'C4.tl', span: { w: 6, h: 4 } });
  assert.ok(core.validate(d).open.some((f) => f.rule === 'L001'), 'an image is a first-class citizen');
});

test('a dithered image draws quadrants, not an embedded bitmap', () => {
  const d = core.createDocument({ name: 'pics' });
  place(d);
  const svg = core.renderSvg(d);
  assert.ok(!svg.includes('<image'), 'nothing is embedded — the picture is drawn');
  assert.match(svg, /class="dither"/);
});

test('the same image dithers to byte-identical output every time', () => {
  const build = () => {
    const d = core.createDocument({ name: 'pics' });
    place(d);
    return core.renderSvg(d);
  };
  assert.equal(build(), build(), 'determinism is the whole reason Bayer is the default');
});

test('a large dithered image merges runs rather than emitting a rect per quadrant', () => {
  const d = core.createDocument({ name: 'pics' });
  core.placeImage(d, 'base', {
    id: 'big', at: 'C4.tl', span: { w: 40, h: 30 }, mode: 'dither',
    source: dataUri(solidPng(400, 300, [0, 0, 0])),
  });
  const svg = core.renderSvg(d);
  const rects = (svg.match(/<rect class="dither-run"/g) ?? []).length;
  // Solid black is 80x60 = 4800 quadrants but only 60 full-width runs.
  assert.ok(rects <= 60, `merged to ${rects} runs, not 4800 rects`);
  assert.ok(rects > 0);
});

test('embed mode still embeds — dither did not become the default', () => {
  const d = core.createDocument({ name: 'pics' });
  place(d, { mode: 'embed' });
  assert.match(core.renderSvg(d), /<image[^>]+data:image\/png;base64,/);
});

test('dithering a format that cannot be decoded refuses by name', () => {
  const d = core.createDocument({ name: 'pics' });
  assert.throws(
    () => core.placeImage(d, 'base', {
      id: 'j', at: 'C4.tl', span: { w: 4, h: 4 }, mode: 'dither',
      source: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    }),
    /PNG|jpeg/i,
  );
});

test('dither refuses a footprint large enough to exhaust memory', () => {
  assert.throws(
    () => ditherToQuadrants({ width: 1, height: 1, pixels: new Uint8Array([0, 0, 0, 255]) }, 1001, 1000),
    /safety limit/,
  );
});
