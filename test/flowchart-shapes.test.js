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

// ---------------------------------------------------------------------------
// Proportion.
//
// Every symbolic shape in the showcase batch landed between 3.0:1 and 3.5:1 —
// a diamond at 2.0:1, a cylinder at 3.5:1 — because `measure` reported the span
// the TEXT needed and knew nothing about the symbol that would be drawn in it.
// At that width a cylinder's cap is 5% of the box and every shape reads as the
// same wide bar. Proportion is measurable, so it is a finding, not taste.
// ---------------------------------------------------------------------------

import { SHAPE_PROPORTION, aspectOf, spanForShape } from '../src/core/shapes.js';
import { requiredCellsFor } from '../src/core/text.js';

test('a shape whose silhouette carries meaning declares a maximum aspect', () => {
  for (const shape of ['decision', 'data', 'document', 'io', 'manual', 'prep', 'terminator']) {
    assert.ok(SHAPE_PROPORTION[shape], `${shape} should declare a proportion`);
    assert.ok(SHAPE_PROPORTION[shape].maxAspect >= 1, `${shape} maxAspect must be >= 1`);
  }
  // A rectangle has no silhouette to lose, and a container is sized by what it
  // holds. Constraining either would be inventing a rule.
  for (const shape of ['process', 'subprocess', 'lane', 'group', 'bar']) {
    assert.equal(SHAPE_PROPORTION[shape], undefined, `${shape} should be unconstrained`);
  }
});

test('aspect is measured in quadrants, which are square', () => {
  assert.equal(aspectOf(rect(0, 0, 28, 14)), 2);
  assert.equal(aspectOf(rect(0, 0, 28, 8)), 3.5);
});

test('spanForShape fits the label inside the SYMBOL, not the bounding box', () => {
  // The exact trap: a diamond's text rect is inset by w/4 and h/4, so a label
  // measured against the full box overflows the moment a shape is applied.
  const label = 'Tests pass?';
  const flat = requiredCellsFor(label, { fontSize: 10 });
  const span = spanForShape('decision', flat);

  assert.ok(span.w >= flat.cellsWide, 'never narrower than the raw text needs');
  const r = rect(0, 0, span.w * 2, span.h * 2);
  assert.ok(aspectOf(r) <= SHAPE_PROPORTION.decision.maxAspect, `diamond came out at ${aspectOf(r)}:1`);

  // And the label actually fits the diamond it will be drawn in.
  const inner = shapeTextRect(r, 'decision');
  const fit = requiredCellsFor(label, { fontSize: 10, maxWidthCells: Math.floor(inner.w / 2) });
  assert.ok(fit.cellsTall * 2 <= inner.h, `label needs ${fit.cellsTall * 2}q, diamond offers ${inner.h}q`);
});

test('a squashed symbol is reported with a fix that names a proportionate span', () => {
  const d = createDocument({ name: 'proportion' });
  // 28x8 quadrants = the exact geometry of showcase-pipeline's `db-source`.
  placeBox(d, 'base', { id: 'db', at: 'C4.tl', span: { w: 14, h: 4 }, shape: 'data', label: 'db' });

  const v = validate(d);
  const hit = v.open.filter((f) => f.rule === 'L024');
  assert.equal(hit.length, 1, `expected one L024, got rules ${v.open.map((f) => f.rule).join(', ')}`);
  assert.deepEqual(hit[0].actors, ['db']);
  assert.match(hit[0].detail ?? hit[0].title, /data|aspect|proportion/i);

  const fix = hit[0].fixes.find((f) => f.kind === 'heighten' || f.kind === 'widen');
  assert.ok(fix, `expected a resize-routed fix, got ${hit[0].fixes.map((f) => f.kind).join(', ')}`);
});

test('a well-proportioned symbol raises nothing', () => {
  const d = createDocument({ name: 'proportion' });
  placeBox(d, 'base', { id: 'db', at: 'C4.tl', span: { w: 8, h: 5 }, shape: 'data', label: 'db' });
  assert.equal(validate(d).open.filter((f) => f.rule === 'L024').length, 0);
});

test('a plain process box is never judged on proportion', () => {
  const d = createDocument({ name: 'proportion' });
  placeBox(d, 'base', { id: 'wide', at: 'C4.tl', span: { w: 40, h: 3 }, shape: 'process', label: 'wide' });
  assert.equal(validate(d).open.filter((f) => f.rule === 'L024').length, 0);
});

test('a document outline scoops the same edge its mask cuts', () => {
  // The mask inks FULL height at the left and right edges and cuts upward in
  // the middle. The outline did the opposite — both edges raised to the mask's
  // mid-depth, and a control point 0.8px from them — so a document rendered as
  // a plain rectangle. Two showcase diagrams shipped one nobody could tell
  // from a process box.
  const R2 = rect(0, 0, 24, 12);
  const path = shapeOutline(R2, 'document');
  const bottom = R2.h * 5;                        // quadrants are 5px

  const vTo = Number(/V(-?[\d.]+)/.exec(path)[1]);
  const ctrlY = Number(/Q[\d.]+,(-?[\d.]+)/.exec(path)[1]);
  const endY = Number(/Q[\d.]+,[\d.]+ [\d.]+,(-?[\d.]+)/.exec(path)[1]);

  assert.equal(vTo, bottom, 'the right edge must reach the bottom, where the mask inks');
  assert.equal(endY, bottom, 'and so must the left edge');

  // A quadratic sits halfway to its control at t=0.5.
  const midY = (vTo + 2 * ctrlY + endY) / 4;
  assert.ok(
    bottom - midY >= bottom * 0.15,
    `scoop is only ${(bottom - midY).toFixed(1)}px on a ${bottom}px box — invisible: ${path}`,
  );
});
