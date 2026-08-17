/**
 * PNG decoding.
 *
 * Written from scratch on node:zlib because zero runtime dependencies is a
 * design choice here, not an accident. Only what the dither path actually needs
 * is supported: 8-bit, non-interlaced, colour types 0/2/3/4/6. Anything else is
 * refused by name rather than decoded into plausible-looking garbage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decode } from '../src/core/png.js';
import { encodePng, solidPng } from './helpers/png-fixture.js';

test('a 2x2 image decodes to the exact pixels it was built from', () => {
  const samples = new Uint8Array([
    255, 0, 0, 0, 255, 0,
    0, 0, 255, 255, 255, 255,
  ]);
  const img = decode(encodePng(2, 2, samples, { colorType: 2 }));

  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.deepEqual([...img.pixels.slice(0, 4)], [255, 0, 0, 255], 'red, opaque');
  assert.deepEqual([...img.pixels.slice(4, 8)], [0, 255, 0, 255], 'green');
  assert.deepEqual([...img.pixels.slice(8, 12)], [0, 0, 255, 255], 'blue');
  assert.deepEqual([...img.pixels.slice(12, 16)], [255, 255, 255, 255], 'white');
});

test('every scanline filter reverses to the same pixels', () => {
  // A gradient, so no filter is accidentally a no-op on this data.
  const w = 6, h = 5;
  const samples = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      samples[i] = x * 40; samples[i + 1] = y * 50; samples[i + 2] = (x + y) * 20;
    }
  }
  const expected = decode(encodePng(w, h, samples, { colorType: 2, filter: 0 })).pixels;

  for (const f of [1, 2, 3, 4]) {
    const got = decode(encodePng(w, h, samples, { colorType: 2, filter: f })).pixels;
    assert.deepEqual([...got], [...expected], `filter ${f} round-trips`);
  }
});

test('filters may vary per scanline, as real encoders emit them', () => {
  const w = 4, h = 5;
  const samples = new Uint8Array(w * h * 3).map((_, i) => (i * 7) % 256);
  const flat = decode(encodePng(w, h, samples, { colorType: 2, filter: 0 })).pixels;
  const mixed = decode(encodePng(w, h, samples, { colorType: 2, filter: [0, 1, 2, 3, 4] })).pixels;
  assert.deepEqual([...mixed], [...flat]);
});

test('greyscale, greyscale+alpha and RGBA all normalise to RGBA', () => {
  const grey = decode(encodePng(2, 1, new Uint8Array([128, 200]), { colorType: 0 }));
  assert.deepEqual([...grey.pixels.slice(0, 4)], [128, 128, 128, 255]);

  const greyA = decode(encodePng(1, 1, new Uint8Array([90, 64]), { colorType: 4 }));
  assert.deepEqual([...greyA.pixels], [90, 90, 90, 64]);

  const rgba = decode(encodePng(1, 1, new Uint8Array([10, 20, 30, 40]), { colorType: 6 }));
  assert.deepEqual([...rgba.pixels], [10, 20, 30, 40]);
});

test('a palette image resolves its indices', () => {
  const png = encodePng(2, 1, new Uint8Array([1, 0]), {
    colorType: 3,
    palette: [[9, 9, 9], [200, 100, 50]],
  });
  const img = decode(png);
  assert.deepEqual([...img.pixels.slice(0, 4)], [200, 100, 50, 255]);
  assert.deepEqual([...img.pixels.slice(4, 8)], [9, 9, 9, 255]);
});

test('a solid image decodes uniformly at size', () => {
  const img = decode(solidPng(8, 4, [17, 17, 17]));
  assert.equal(img.pixels.length, 8 * 4 * 4);
  for (let i = 0; i < 8 * 4; i++) assert.equal(img.pixels[i * 4], 17);
});

test('an interlaced PNG is refused by name, not decoded into garbage', () => {
  const png = solidPng(4, 4, [0, 0, 0]);
  png[28] = 1; // IHDR interlace byte
  assert.throws(() => decode(png), /interlac/i);
});

test('a non-PNG is refused', () => {
  assert.throws(() => decode(Buffer.from('GIF89a and then some')), /PNG/i);
});

test('declared PNG dimensions are bounded before pixel allocation', () => {
  const png = solidPng(1, 1, [0, 0, 0]);
  png.writeUInt32BE(20_000, 16);
  assert.throws(() => decode(png), /safety limit|too large/i);
});

test('a PNG chunk that extends beyond the file is refused by location', () => {
  const png = solidPng(1, 1, [0, 0, 0]);
  png.writeUInt32BE(10_000, 8);
  assert.throws(() => decode(png), /chunk at byte 8.*beyond the end/);
});

test('a PNG stream cannot inflate past its declared dimensions', () => {
  const png = solidPng(2, 1, [0, 0, 0]);
  png.writeUInt32BE(1, 16);
  assert.throws(() => decode(png), /declared 1x1 extent|exactly 4/);
});
