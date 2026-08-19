/**
 * Flowchart node shapes.
 *
 * The point of these assertions is that a shape is an EXACT quadrant set. If a
 * diamond were "roughly half" its bounding box the collision log would be an
 * opinion, and the whole engine rests on it not being one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NODE_SHAPES, assertNodeShape, shapeCutQuads, shapeTextRect, visualQuads, claimedQuads,
} from '../src/core/shapes.js';
import { rect } from '../src/core/geometry.js';
import { shapeOutline } from '../src/core/svg.js';
import { createDocument, placeBox, validate } from '../src/core/index.js';

const R = rect(0, 0, 22, 11);

test('every named shape is accepted and anything else is refused by name', () => {
  for (const s of NODE_SHAPES) assert.equal(assertNodeShape(s), s);
  assert.throws(() => assertNodeShape('octagon'), /unknown node shape "octagon"/);
});

test('a decision inks exactly half its bounding box on even dimensions', () => {
  // A diamond inscribed in a rectangle covers half its area, and on an
  // even-by-even box the lattice can express that exactly.
  const even = rect(0, 0, 12, 8);
  assert.equal(claimedQuads(even).size, 96);
  assert.equal(visualQuads(even, 'square', 'decision').size, 48);
});

test('an odd dimension costs the diamond exactly one row, and says so', () => {
  // With an odd height the centre row is full width and there is no half to
  // split, so the count is one row over half. That is arithmetic, not drift:
  // the engine is not permitted to fudge a quadrant to make the number tidy.
  const claimed = claimedQuads(R).size;          // 22 x 11 = 242
  const ink = visualQuads(R, 'square', 'decision').size;
  assert.equal(claimed, 242);
  assert.equal(ink, 122);
  assert.equal(ink - Math.floor(claimed / 2), 1);
});

test('a decision is symmetric on both axes', () => {
  const cut = shapeCutQuads(R, 'decision');
  for (let j = 0; j < R.h; j++) {
    for (let i = 0; i < R.w; i++) {
      const here = cut.has(`${i},${j}`);
      assert.equal(here, cut.has(`${R.w - 1 - i},${j}`), `x mirror at ${i},${j}`);
      assert.equal(here, cut.has(`${i},${R.h - 1 - j}`), `y mirror at ${i},${j}`);
    }
  }
});

test('a decision keeps its four cardinal vertices and drops its four corners', () => {
  const cut = shapeCutQuads(R, 'decision');
  const mx = Math.floor(R.w / 2), my = Math.floor(R.h / 2);
  assert.ok(!cut.has(`${mx},0`), 'north vertex must be inked');
  assert.ok(!cut.has(`${mx},${R.h - 1}`), 'south vertex must be inked');
  assert.ok(!cut.has(`0,${my}`), 'west vertex must be inked');
  assert.ok(!cut.has(`${R.w - 1},${my}`), 'east vertex must be inked');
  for (const [x, y] of [[0, 0], [R.w - 1, 0], [0, R.h - 1], [R.w - 1, R.h - 1]]) {
    assert.ok(cut.has(`${x},${y}`), `corner ${x},${y} must be carved away`);
  }
});

test('claimed footprint is identical whatever the shape', () => {
  // Layout, gutters and free_space must not change when a node becomes a
  // diamond — only the ink does.
  const base = claimedQuads(R).size;
  for (const s of NODE_SHAPES) {
    assert.equal(claimedQuads(R).size, base, s);
    assert.ok(visualQuads(R, 'square', s).size <= base, `${s} cannot ink more than it claims`);
  }
});

test('a shape too small to read stays a rectangle instead of becoming a blob', () => {
  const tiny = rect(0, 0, 2, 2);
  assert.equal(shapeCutQuads(tiny, 'decision').size, 0);
  assert.deepEqual(shapeTextRect(tiny, 'decision'), tiny);
});

test('shape masks are deterministic', () => {
  const a = [...shapeCutQuads(R, 'decision')].sort().join('|');
  const b = [...shapeCutQuads(R, 'decision')].sort().join('|');
  assert.equal(a, b);
});

test('a diamond offers a label about half the bounding box', () => {
  const t = shapeTextRect(R, 'decision');
  assert.equal(t.w, R.w - 2 * Math.floor(R.w / 4));
  assert.equal(t.h, R.h - 2 * Math.floor(R.h / 4));
  assert.ok(t.w < R.w && t.h < R.h);
});

test('a label that fits a rectangle can still overflow the diamond', () => {
  // The whole reason shapes are more than decoration.
  const doc = createDocument({ name: 'fit', cols: 80, rows: 40 });
  placeBox(doc, 'base', { id: 'r1', at: 'C3', span: '23x7', label: 'Internationalization' });
  placeBox(doc, 'base', { id: 'd1', at: 'C14', span: '23x7', label: 'Internationalization', shape: 'decision' });
  const open = validate(doc).open.filter((f) => f.rule === 'L002');
  assert.equal(open.filter((f) => f.actors.includes('r1')).length, 0, 'rectangle fits');
  assert.equal(open.filter((f) => f.actors.includes('d1')).length, 1, 'diamond must report overflow');
});

test('a stroke clipping a carved corner is information, not an error', () => {
  const doc = createDocument({ name: 'clip', cols: 60, rows: 30 });
  placeBox(doc, 'base', { id: 'd', at: 'J5', span: '16x9', label: '', shape: 'decision' });
  // Run along the diamond's top-left carved corner, well clear of its body.
  const open = validate(doc).open;
  assert.equal(open.filter((f) => f.rule === 'L004').length, 0);
});

test('every shape emits an outline the renderer can draw', () => {
  for (const s of NODE_SHAPES) {
    const d = shapeOutline(R, s);
    if (['process', 'subprocess'].includes(s)) {
      assert.equal(d, null, `${s} falls back to the rectangle outline`);
    } else {
      assert.match(d, /^M[-\d.]/, `${s} outline must start with a move`);
      assert.ok(d.includes('Z'), `${s} outline must be closed`);
    }
  }
});
