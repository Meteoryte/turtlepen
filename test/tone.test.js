/**
 * Tone — density for drawn artwork.
 *
 * Assertions are exact quadrant sets and exact counts. The whole point of
 * integer geometry is that a test can be exact; an approximate assertion here
 * would be a smell.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { toneMask, normalizeTone, inksAt, MIN_TONE } from '../src/core/tone.js';

const block = (x0, y0, w, h) => {
  const out = [];
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) out.push({ x, y });
  return out;
};
const keys = (quads) => new Set(quads.map((q) => `${q.x},${q.y}`));

test('half tone inks exactly half of a 4x4 Bayer tile', () => {
  const kept = toneMask(block(0, 0, 4, 4), { tone: 0.5 });
  assert.equal(kept.length, 8, 'a 4x4 tile at half tone is exactly 8 of 16 quadrants');
});

test('quarter and three-quarter land on their exact matrix ranks', () => {
  assert.equal(toneMask(block(0, 0, 4, 4), { tone: 0.25 }).length, 4);
  assert.equal(toneMask(block(0, 0, 4, 4), { tone: 0.75 }).length, 12);
});

test('tone 1 is a no-op and returns the same array', () => {
  const quads = block(0, 0, 4, 4);
  assert.equal(toneMask(quads, { tone: 1 }), quads, 'solid tone must not copy or filter');
  assert.equal(toneMask(quads, {}).length, 16);
});

test('the threshold keys off absolute lattice position, so tiles line up', () => {
  // Shifted by a whole matrix the pattern repeats; shifted by one it does not.
  const at = (dx) => [...keys(toneMask(block(dx, 0, 4, 4), { tone: 0.5 }))]
    .map((k) => { const [x, y] = k.split(',').map(Number); return `${x - dx},${y}`; }).sort().join(' ');
  assert.equal(at(0), at(4), 'four quadrants over is the same tile');
  assert.notEqual(at(0), at(1), 'one quadrant over is a different phase');
});

test('a toned path claims exactly what it inks', () => {
  const doc = core.createDocument({ name: 'tone', cols: 20, rows: 20 });
  core.applyPen(doc, 'base', 'pen C3.q1\ndash 8 e', {
    id: 'toned', role: 'artwork', paint: 'cells', tone: 0.5,
  });
  const { element } = core.findElement(doc, 'toned');
  assert.equal(core.elementClaimed(element).size, element.pieces.length);
  assert.ok(element.pieces.length < 8, 'half tone must remove quadrants');
  assert.equal(element.stroke.tone, 0.5, 'tone is persisted for provenance');
});

test('feather thins the boundary and leaves the core solid', () => {
  const solid = block(0, 0, 8, 8);
  const kept = keys(toneMask(solid, { tone: 1, feather: 2 }));
  // Interior quadrants are 3+ from the edge, so they survive at full density.
  for (const q of block(3, 3, 2, 2)) assert.ok(kept.has(`${q.x},${q.y}`), `core ${q.x},${q.y} kept`);
  assert.ok(kept.size < solid.length, 'the boundary must lose quadrants');
});

test('texture is deterministic for a given seed', () => {
  const a = keys(toneMask(block(0, 0, 8, 8), { texture: 'eroded', seed: 'mark' }));
  const b = keys(toneMask(block(0, 0, 8, 8), { texture: 'eroded', seed: 'mark' }));
  assert.deepEqual([...a].sort(), [...b].sort());
  const c = keys(toneMask(block(0, 0, 8, 8), { texture: 'eroded', seed: 'other' }));
  assert.notDeepEqual([...a].sort(), [...c].sort(), 'a different seed erodes differently');
});

test('normalizeTone accepts named steps and rejects the unrenderable', () => {
  assert.equal(normalizeTone('half'), 0.5);
  assert.equal(normalizeTone('SOLID'), 1);
  assert.equal(normalizeTone(null), 1);
  for (const bad of [0, 0.03, 1.1, 'faint', {}]) {
    assert.throws(() => normalizeTone(bad), `${JSON.stringify(bad)} must be rejected`);
  }
  assert.ok(inksAt(0, 0, 1), 'solid inks every quadrant');
  assert.ok(!inksAt(0, 0, MIN_TONE / 2), 'below the floor nothing inks');
});

test('the floor is the lowest density that inks anything, and it is position-dependent', () => {
  // C3.q1 is quadrant (4,4); 4 % 4 == 0, so it sits on Bayer rank 0 — the one
  // rank MIN_TONE clears. C3.q4 is (5,5), rank 4, which it does not.
  assert.ok(inksAt(4, 4, MIN_TONE), 'rank 0 inks at the floor — this is what makes it the floor');
  assert.ok(!inksAt(5, 5, MIN_TONE), 'rank 4 does not');
});

test('a tone that would erase the whole path is refused, not silently drawn empty', () => {
  const doc = core.createDocument({ name: 'tone', cols: 20, rows: 20 });
  assert.throws(
    () => core.applyPen(doc, 'base', 'pen C3.q4\ndot', { id: 'gone', role: 'artwork', tone: MIN_TONE }),
    /no inked quadrants/,
  );
  // The same mark one quadrant over survives, because tone is keyed to the
  // lattice rather than to the shape.
  const kept = core.applyPen(doc, 'base', 'pen C3.q1\ndot', { id: 'kept', role: 'artwork', tone: MIN_TONE });
  assert.equal(kept.path.pieces.length, 1);
});

test('tone reaches the same place through plan as through the tool', () => {
  const doc = core.createDocument({ name: 'tone', cols: 20, rows: 20 });
  core.applyOperation(doc, {
    op: 'pen', id: 'viaplan', page: 'base', program: 'pen C3.q1\ndash 8 e',
    role: 'artwork', paint: 'cells', tone: 'half',
  });
  const { element } = core.findElement(doc, 'viaplan');
  assert.equal(element.stroke.tone, 0.5, 'a named step normalises identically in core');
});

// ---------------------------------------------------------------------------
// Stroke patterns — rhythm along the path, not density across the lattice.
// ---------------------------------------------------------------------------
import { patternMask, normalizePattern } from '../src/core/pattern.js';

test('dashed and dotted keep their exact cadence', () => {
  const run = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 }));
  assert.equal(patternMask(run, 'dashed').length, 12, '3 on / 2 off over 20');
  assert.equal(patternMask(run, 'dotted').length, 10, '1 on / 1 off over 20');
  assert.equal(patternMask(run, null), run, 'no pattern is a no-op');
});

test('a dash is keyed to distance travelled, not to the lattice', () => {
  // The same run shifted on the lattice keeps an identical cadence. Tone would
  // change here; a dash must not, or it would restart at every corner.
  const at = (dx) => patternMask(
    Array.from({ length: 12 }, (_, i) => ({ x: i + dx, y: 0 })), 'dashed',
  ).map((q) => q.x - dx);
  assert.deepEqual(at(0), at(1));
  assert.deepEqual(at(0), at(7));
});

test('a dashed path claims only the quadrants it inks', () => {
  const doc = core.createDocument({ name: 'dash', cols: 30, rows: 8 });
  core.applyPen(doc, 'base', 'pen C3.q1\ndash 20 e', { id: 'trend', role: 'artwork', pattern: 'dashed' });
  const { element } = core.findElement(doc, 'trend');
  assert.equal(element.pieces.length, 12);
  assert.equal(core.elementClaimed(element).size, 12);
  assert.equal(element.stroke.pattern, 'dashed');
});

test('normalizePattern rejects anything not in the closed set', () => {
  assert.equal(normalizePattern(null), null);
  for (const bad of ['dash', 'solid', 'double', 7]) {
    assert.throws(() => normalizePattern(bad), `${JSON.stringify(bad)} must be rejected`);
  }
});
