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
import {
  analyse, analyseRuns, ditherToQuadrants, downsampleCoverage, runsOf, simplifyToQuadrants, BAYER_4,
  resolveSupersample, MAX_READABLE_TRANSITION_RATIO, MIN_SIMPLIFY_SHORT_SIDE,
  MAX_SIMPLIFY_QUADRANTS, MAX_SIMPLIFY_WORKING_QUADRANTS,
} from '../src/core/dither.js';
import { decode } from '../src/core/png.js';
import { solidPng, encodePng, dataUri } from './helpers/png-fixture.js';

const place = (d, extra = {}) =>
  core.placeImage(d, 'base', {
    id: 'photo', at: 'C4.tl', span: { w: 6, h: 4 }, mode: 'dither',
    source: dataUri(solidPng(60, 40, [0, 0, 0])), ...extra,
  });

function unitLineArt(width = 96, height = 64) {
  const pixels = new Uint8Array(width * height * 3).fill(255);
  const ink = (x, y) => {
    const index = (y * width + x) * 3;
    pixels[index] = 0; pixels[index + 1] = 0; pixels[index + 2] = 0;
  };
  for (let y = 12; y <= 54; y++) for (let x = 14; x <= 68; x++) {
    if (x <= 16 || x >= 66 || y <= 14 || y >= 52 || (x % 10 < 2 && y > 22)) ink(x, y);
  }
  for (let y = 3; y <= 20; y++) for (let x = 73; x <= 89; x++) {
    if (x <= 75 || x >= 87 || y <= 5 || y >= 18) ink(x, y);
  }
  for (let x = 69; x <= 80; x++) { ink(x, 42); ink(x, 44); }
  return encodePng(width, height, pixels, { colorType: 2 });
}

function subQuadrantLineArt(width = 768, height = 512) {
  const pixels = new Uint8Array(width * height * 3).fill(255);
  const ink = (x, y) => {
    const index = (y * width + x) * 3;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
  };
  for (let y = 128; y < 448; y++) {
    for (let x = 160; x < 608; x++) {
      if (x < 192 || x >= 576 || y < 160 || y >= 416) ink(x, y);
    }
  }
  for (let y = 32; y < 129; y++) ink(384, y);
  return encodePng(width, height, pixels);
}

function continuousScene(width = 96, height = 64) {
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x > 18 && x < 72 && y > 10 && y < 56;
    const value = inside ? 80 + Math.round((x / width) * 80) : 125 + Math.round((y / height) * 80);
    const index = (y * width + x) * 3;
    pixels[index] = value;
    pixels[index + 1] = Math.min(255, value + (inside ? 20 : 45));
    pixels[index + 2] = Math.min(255, value + (inside ? 35 : 5));
  }
  return encodePng(width, height, pixels, { colorType: 2 });
}

function transparentIcon(width = 16, height = 16) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    if (x > 5 && x < width - 6 && y > 5 && y < height - 6) continue;
    const index = (y * width + x) * 4;
    pixels[index + 3] = 255;
  }
  return encodePng(width, height, pixels, { colorType: 6 });
}

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

test('downscaling area-averages source pixels and upscaling repeats nearest samples', () => {
  const row = new Uint8Array([
    0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255,
    0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  const downscaled = ditherToQuadrants(decode(encodePng(4, 2, row, { colorType: 2 })), 2, 1);
  assert.deepEqual([...downscaled.on], [1, 0]);

  const tiny = new Uint8Array([0, 0, 0, 255, 255, 255]);
  const upscaled = ditherToQuadrants(decode(encodePng(2, 1, tiny, { colorType: 2 })), 4, 2);
  assert.deepEqual([...upscaled.on], [1, 1, 0, 0, 1, 1, 0, 0]);
});

test('dither contain pads and cover crops without stretching the source aspect', () => {
  const black = decode(solidPng(4, 2, [0, 0, 0]));
  const contained = ditherToQuadrants(black, 4, 4, { fit: 'contain' });
  assert.deepEqual([...contained.on], [
    0, 0, 0, 0,
    1, 1, 1, 1,
    1, 1, 1, 1,
    0, 0, 0, 0,
  ]);
  const covered = ditherToQuadrants(black, 4, 4, { fit: 'cover' });
  assert.equal(covered.on.filter(Boolean).length, 16);
});

test('readability analysis identifies checkerboard noise and accepts sparse structure', () => {
  const busy = ditherToQuadrants(decode(solidPng(32, 32, [128, 128, 128])), 16, 16);
  const busyStats = analyse(busy);
  assert.equal(busyStats.readability, 'busy');
  assert.ok(busyStats.transitionRatio > MAX_READABLE_TRANSITION_RATIO);

  const sparse = { width: 8, height: 8, on: new Uint8Array(64) };
  for (let y = 1; y < 7; y++) sparse.on[y * 8 + 3] = 1;
  const sparseStats = analyse(sparse);
  assert.equal(sparseStats.readability, 'pass');
  assert.ok(sparseStats.transitionRatio < MAX_READABLE_TRANSITION_RATIO);
  assert.throws(() => analyseRuns([{ x: 1, y: 1, w: 2 }, { x: 2, y: 1, w: 2 }], 8, 8), /overlap/);
  assert.throws(() => analyseRuns([{ x: 7, y: 1, w: 2 }], 8, 8), /outside/);
});

test('supersample resolve preserves weighted coverage through runs and analysis', () => {
  const working = new Uint8Array(16);
  working.set([1, 1, 1, 1]);
  const resolved = downsampleCoverage(working, 1, 1, 4);
  assert.deepEqual([...resolved.on], [1]);
  assert.deepEqual([...resolved.coverage], [0.25]);
  assert.equal(resolved.method, 'box-average');
  assert.equal(resolved.workingSamplesPerOutput, 16);
  assert.equal(resolved.possibleCoverageLevels, 17);
  assert.equal(resolved.partialCoverageSamples, 1);

  const runs = runsOf({ width: 1, height: 1, on: resolved.on, coverage: resolved.coverage });
  assert.deepEqual(runs, [{ x: 0, y: 0, w: 1, opacity: 0.25 }]);
  assert.deepEqual(analyseRuns(runs, 1, 1), analyse({ width: 1, height: 1, ...resolved }));
  assert.throws(() => analyseRuns([{ x: 0, y: 0, w: 1, opacity: 0 }], 1, 1), /opacity.*greater than 0/i);
  assert.throws(() => analyseRuns([{ x: 0, y: 0, w: 1, opacity: 1.1 }], 1, 1), /opacity.*no greater than 1/i);
  assert.throws(() => downsampleCoverage(working, 1, 1, 3), /expected 9 working samples/);
});

test('simplify preserves near-binary structure without reproducing Bayer checker tone', () => {
  const decoded = decode(unitLineArt());
  const first = simplifyToQuadrants(decoded, 48, 32);
  const second = simplifyToQuadrants(decoded, 48, 32);
  const stats = analyse(first);
  assert.equal(first.processing.strategy, 'threshold-simplify');
  assert.equal(first.processing.nearBinary, true);
  assert.equal(first.processing.scaleDirection, 'downscale');
  assert.equal(stats.readability, 'pass');
  assert.ok(stats.coverageRatio > 0.05 && stats.coverageRatio < 0.5);
  assert.deepEqual([...first.on], [...second.on], 'adaptive output remains deterministic');
  assert.ok(first.on.slice(0, 16 * 48).some(Boolean), 'disconnect survives in the upper region');
  assert.ok(first.on.slice(16 * 48).some(Boolean), 'cabinet survives below it');
});

test('simplify can process at 4x linear resolution and reduce to the unchanged 1x lattice', () => {
  const decoded = decode(subQuadrantLineArt());
  const direct = simplifyToQuadrants(decoded, 48, 32, { detail: 'medium', supersample: 1 });
  const supersampled = simplifyToQuadrants(decoded, 48, 32, { detail: 'medium', supersample: 4 });
  const repeated = simplifyToQuadrants(decoded, 48, 32, { detail: 'medium', supersample: 4 });

  assert.deepEqual({ width: supersampled.width, height: supersampled.height }, { width: 48, height: 32 });
  assert.equal(supersampled.processing.requestedSupersample, 4);
  assert.equal(supersampled.processing.resolvedSupersample, 4);
  assert.deepEqual(supersampled.processing.workingCanvas, { width: 192, height: 128, unit: 'quadrants' });
  assert.equal(supersampled.processing.workingSamplesPerOutput, 16);
  assert.equal(supersampled.processing.downsampleMethod, 'box-average');
  assert.equal(supersampled.processing.possibleCoverageLevels, 17);
  assert.ok(supersampled.processing.partialCoverageSamples > 0);
  assert.equal(supersampled.processing.scaleDirection, 'downscale');
  assert.deepEqual([...supersampled.on], [...repeated.on], '4x processing remains deterministic');
  assert.deepEqual([...supersampled.coverage], [...repeated.coverage], 'weighted resolve remains deterministic');

  const upperBand = (grid) => grid.coverage.slice(0, 8 * grid.width).reduce((sum, value) => sum + value, 0);
  assert.equal(upperBand(direct), 0, 'direct reduction loses the sub-quadrant antenna');
  assert.ok(upperBand(supersampled) > 0, '4x processing retains weighted evidence of the thin connected feature');
});

test('simplify supersampling is bounded and auto resolves without silent explicit fallback', () => {
  assert.equal(resolveSupersample('auto', 48, 32), 4);
  assert.equal(resolveSupersample('auto', 500, 500), 2);
  assert.equal(500 * 500 * 2 * 2, MAX_SIMPLIFY_WORKING_QUADRANTS);
  assert.throws(() => resolveSupersample(3, 48, 32), /must be auto, 1, 2, 4/);
  assert.throws(
    () => resolveSupersample(4, 500, 500),
    /4x simplify supersampling.*4000000 working quadrants.*limit 1000000/i,
  );
});

test('simplify reports heuristic continuous-tone processing and refuses meaningless or tiny output', () => {
  const continuous = simplifyToQuadrants(decode(continuousScene()), 48, 32);
  assert.equal(continuous.processing.strategy, 'adaptive-simplify');
  assert.equal(continuous.processing.nearBinary, false);
  assert.equal(analyse(continuous).readability, 'pass');

  assert.throws(
    () => simplifyToQuadrants(decode(solidPng(96, 64, [128, 128, 128])), 48, 32),
    /no stable subject contrast/,
  );
  assert.throws(
    () => simplifyToQuadrants(decode(unitLineArt()), MIN_SIMPLIFY_SHORT_SIDE, MIN_SIMPLIFY_SHORT_SIDE - 1),
    /at least 24 quadrants.*short side/i,
  );
  assert.throws(
    () => simplifyToQuadrants(decode(unitLineArt()), 501, 500),
    new RegExp(`${MAX_SIMPLIFY_QUADRANTS}-quadrant analysis limit`),
  );
});

test('simplify upscales transparent icon structure without inventing detail', () => {
  const result = simplifyToQuadrants(decode(transparentIcon()), 32, 32, { detail: 'high' });
  assert.equal(result.processing.scaleDirection, 'upscale');
  assert.equal(result.processing.sourcePixelsPerSample, 0.5);
  assert.equal(result.processing.strategy, 'threshold-simplify');
  assert.equal(result.on[0], 0, 'transparent black composites to page ground');
  assert.ok(analyse(result).ink > 0);
  assert.equal(analyse(result).readability, 'pass');
});

test('simplify detail presets change the continuous-tone ink budget monotonically', () => {
  const decoded = decode(continuousScene());
  const low = simplifyToQuadrants(decoded, 48, 32, { detail: 'low' });
  const medium = simplifyToQuadrants(decoded, 48, 32, { detail: 'medium' });
  const high = simplifyToQuadrants(decoded, 48, 32, { detail: 'high' });
  assert.equal(low.processing.resolvedDetail, 'low');
  assert.equal(medium.processing.resolvedDetail, 'medium');
  assert.equal(high.processing.resolvedDetail, 'high');
  assert.ok(analyse(low).ink < analyse(medium).ink);
  assert.ok(analyse(medium).ink < analyse(high).ink);
});

test('continuous-tone simplify creates an explicit semantic-review finding', () => {
  const doc = core.createDocument({ name: 'heuristic simplification' });
  core.placeImage(doc, 'base', {
    id: 'heuristic', at: 'C4.tl', span: '24x16', source: dataUri(continuousScene()), mode: 'simplify',
  });
  const finding = core.validate(doc).open.find((entry) => entry.rule === 'L023');
  assert.equal(finding.severity, 'S2');
  assert.match(finding.message, /continuous-tone.*cannot know.*blind identity/i);

  const reviewed = core.createDocument({ name: 'prepared simplification' });
  core.placeImage(reviewed, 'base', {
    id: 'prepared', at: 'C4.tl', span: '24x16', source: dataUri(unitLineArt()), mode: 'simplify',
  });
  assert.equal(core.validate(reviewed).open.some((entry) => entry.rule === 'L023'), false);
});

// ---------------------------------------------------------------------------
// Through the document
// ---------------------------------------------------------------------------

test('mode dither no longer refuses', () => {
  const d = core.createDocument({ name: 'pics' });
  assert.doesNotThrow(() => place(d));
});

test('busy dither blocks publication with an actionable L022 finding', () => {
  const d = core.createDocument({ name: 'busy photo' });
  core.placeImage(d, 'base', {
    id: 'noisy', at: 'C4.tl', span: '8x8', mode: 'dither',
    source: dataUri(solidPng(32, 32, [128, 128, 128])),
  });
  const finding = core.validate(d).open.find((entry) => entry.rule === 'L022');
  assert.equal(finding.severity, 'S2');
  assert.match(finding.message, /checker pattern.*embed mode.*line art/i);
  assert.deepEqual(finding.fixes[0], {
    kind: 'remove',
    description: 'remove "noisy", simplify its source or choose embed mode, then place_image again',
    params: { id: 'noisy' },
  });
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
