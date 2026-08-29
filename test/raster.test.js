/**
 * Rasterised geometry.
 *
 * The lattice is orthogonal, so a diagonal, a circle and an arc are all the same
 * kind of thing: a computed set of whole quadrants. These are the classic
 * integer algorithms — Bresenham and midpoint — chosen because they are exact
 * and deterministic, which is the property the whole engine rests on. No
 * floating-point coordinate ever reaches the collision engine.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { rayQuads, circleQuads, arcQuads, polygonQuads, dashQuads, DIR8, curveQuads, ellipseQuads, fillInterior, discQuads } from '../src/core/raster.js';

const key = (q) => `${q.x},${q.y}`;
const keys = (qs) => qs.map(key);

test('a horizontal ray is exactly the quadrants between its ends', () => {
  assert.deepEqual(keys(rayQuads(0, 0, 4, 0)), ['0,0', '1,0', '2,0', '3,0', '4,0']);
});

test('a 45 degree ray steps one across for one down, every step', () => {
  assert.deepEqual(keys(rayQuads(0, 0, 4, 4)), ['0,0', '1,1', '2,2', '3,3', '4,4']);
});

test('a shallow ray distributes its steps evenly, which is what Bresenham is for', () => {
  const q = rayQuads(0, 0, 6, 2);
  assert.equal(q.length, 7, 'one quadrant per column of travel');
  assert.deepEqual(q[0], { x: 0, y: 0 });
  assert.deepEqual(q.at(-1), { x: 6, y: 2 });
  // y must never jump by more than one — a jump is a visible break in the line.
  for (let i = 1; i < q.length; i++) assert.ok(Math.abs(q[i].y - q[i - 1].y) <= 1, 'no gaps');
});

test('a ray is symmetric: drawing it backwards covers the same quadrants', () => {
  const fwd = new Set(keys(rayQuads(0, 0, 9, 4)));
  const back = new Set(keys(rayQuads(9, 4, 0, 0)));
  assert.deepEqual([...fwd].sort(), [...back].sort());
});

test('every one of the eight directions is a unit step', () => {
  assert.equal(Object.keys(DIR8).length, 8);
  for (const [name, [dx, dy]] of Object.entries(DIR8)) {
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `${name} is a unit step`);
    assert.ok(dx !== 0 || dy !== 0, `${name} moves`);
  }
});

test('a circle is eight-way symmetric, which is how the midpoint algorithm works', () => {
  const set = new Set(keys(circleQuads(0, 0, 8)));
  for (const q of circleQuads(0, 0, 8)) {
    assert.ok(set.has(`${-q.x},${q.y}`), `mirrored in x at ${key(q)}`);
    assert.ok(set.has(`${q.x},${-q.y}`), `mirrored in y at ${key(q)}`);
    assert.ok(set.has(`${q.y},${q.x}`), `mirrored in the diagonal at ${key(q)}`);
  }
});

test('a circle sits on its radius, never drifting off it', () => {
  const r = 12;
  for (const q of circleQuads(0, 0, r)) {
    const d = Math.hypot(q.x, q.y);
    assert.ok(Math.abs(d - r) <= 1, `${key(q)} is ${d.toFixed(2)} from centre, not ~${r}`);
  }
});

test('a circle has no duplicate quadrants, so it cannot self-overlap', () => {
  const q = circleQuads(3, 5, 10);
  assert.equal(new Set(keys(q)).size, q.length);
});

test('a degenerate radius is refused by name rather than drawn as nothing', () => {
  assert.throws(() => circleQuads(0, 0, 0), /radius/i);
});

test('an arc is the part of the circle inside its angles, and stays connected', () => {
  const full = circleQuads(0, 0, 14).length;
  const quarter = arcQuads(0, 0, 14, 0, 90);
  assert.ok(quarter.length < full, 'an arc is shorter than its circle');
  assert.ok(quarter.length > full / 6, 'but a quarter is a real portion of it');
  // Sorted along the sweep, consecutive quadrants must stay adjacent.
  for (let i = 1; i < quarter.length; i++) {
    const d = Math.max(Math.abs(quarter[i].x - quarter[i - 1].x), Math.abs(quarter[i].y - quarter[i - 1].y));
    assert.ok(d <= 1, `arc breaks between ${key(quarter[i - 1])} and ${key(quarter[i])}`);
  }
});

test('a full sweep of arc is the whole circle', () => {
  assert.equal(new Set(keys(arcQuads(0, 0, 9, 0, 360))).size, new Set(keys(circleQuads(0, 0, 9))).size);
});

test('a triangle is a closed polygon of three rays', () => {
  const tri = polygonQuads([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]);
  const set = new Set(keys(tri));
  assert.ok(set.has('0,0') && set.has('10,0') && set.has('5,8'), 'every vertex is drawn');
  assert.ok(set.has('5,0'), 'and the base between two of them');
  assert.equal(new Set(keys(tri)).size, tri.length, 'no quadrant is emitted twice');
});

test('a polygon of fewer than three points is refused', () => {
  assert.throws(() => polygonQuads([{ x: 0, y: 0 }, { x: 3, y: 3 }]), /three/i);
});

// ---------------------------------------------------------------------------
// Morse-style marks: dots and dashes in any of the eight directions
// ---------------------------------------------------------------------------

test('a dot is a single quadrant', () => {
  assert.deepEqual(dashQuads(4, 4, 'right', 1), [{ x: 4, y: 4 }]);
});

test('a dash runs the length asked, in the direction asked', () => {
  assert.deepEqual(keys(dashQuads(0, 0, 'right', 3)), ['0,0', '1,0', '2,0']);
  assert.deepEqual(keys(dashQuads(0, 0, 'down', 3)), ['0,0', '0,1', '0,2']);
});

test('a dash runs diagonally too, which is the whole point of eight directions', () => {
  assert.deepEqual(keys(dashQuads(0, 0, 'se', 3)), ['0,0', '1,1', '2,2']);
  assert.deepEqual(keys(dashQuads(5, 5, 'nw', 3)), ['5,5', '4,4', '3,3']);
});

test('an unknown direction is named in the error, with the legal set', () => {
  assert.throws(() => dashQuads(0, 0, 'sideways', 3), /sideways.*(n|ne|e|se|s|sw|w|nw)/s);
});

test('a dash of zero length is refused rather than silently drawing nothing', () => {
  assert.throws(() => dashQuads(0, 0, 'right', 0), /length/i);
});

// ---------------------------------------------------------------------------
// curve — a smooth line through points
//
// The shape vocabulary had `ray` (straight) and `arc` (circular) and nothing
// between them, so every organic line in a drawing — hair, drapery, a lip, a
// ridge — had to be sampled outside the engine and fed back in as a chain of
// rays. Four of the five Mona Lisa sheets carried a hand-rolled Catmull-Rom
// sampler for exactly this.
// ---------------------------------------------------------------------------

test('a curve passes through every control point it is given', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 10 }, { x: 40, y: 30 }];
  const quads = curveQuads(pts);
  const key = (p) => `${p.x},${p.y}`;
  const drawn = new Set(quads.map(key));
  for (const p of pts) assert.ok(drawn.has(key(p)), `curve misses its control point ${key(p)}`);
});

test('a curve is contiguous — every quadrant touches the one before it', () => {
  const quads = curveQuads([{ x: 0, y: 0 }, { x: 14, y: 22 }, { x: 36, y: 6 }, { x: 50, y: 28 }]);
  for (let i = 1; i < quads.length; i += 1) {
    const a = quads[i - 1];
    const b = quads[i];
    const step = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    assert.ok(step <= 1, `gap between ${a.x},${a.y} and ${b.x},${b.y}`);
  }
});

test('a curve is deterministic and lands on whole quadrants', () => {
  const pts = [{ x: 2, y: 3 }, { x: 18, y: 25 }, { x: 40, y: 9 }];
  const a = curveQuads(pts);
  const b = curveQuads(pts);
  assert.deepEqual(a, b);
  for (const p of a) {
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), `${p.x},${p.y} is not on the lattice`);
  }
});

test('two points is a ray, and curve says so rather than drawing one badly', () => {
  assert.throws(() => curveQuads([{ x: 0, y: 0 }, { x: 8, y: 8 }]), /three points.*ray/s);
});

test('a curve bends — it is not the straight line between its ends', () => {
  const straight = new Set(rayQuads(0, 0, 40, 0).map((p) => `${p.x},${p.y}`));
  const bent = curveQuads([{ x: 0, y: 0 }, { x: 20, y: 16 }, { x: 40, y: 0 }]);
  assert.ok(
    bent.some((p) => !straight.has(`${p.x},${p.y}`)),
    'a curve through an offset middle control point must leave the chord',
  );
});

// ---------------------------------------------------------------------------
// ellipse — the circle family, finished
//
// `circle` and `disc` existed; a face, an eye and a rotated plane are none of
// them. Every portrait sheet in the set carried its own ellipse sampler.
// ---------------------------------------------------------------------------

test('an ellipse with equal radii is exactly the circle of that radius', () => {
  const key = (p) => `${p.x},${p.y}`;
  const circle = new Set(circleQuads(0, 0, 12).map(key));
  const ell = new Set(ellipseQuads(0, 0, 12, 12).map(key));
  assert.deepEqual([...ell].sort(), [...circle].sort());
});

test('an ellipse spans its own radii on both axes', () => {
  const quads = ellipseQuads(50, 40, 20, 9);
  const xs = quads.map((p) => p.x);
  const ys = quads.map((p) => p.y);
  assert.equal(Math.min(...xs), 30);
  assert.equal(Math.max(...xs), 70);
  assert.equal(Math.min(...ys), 31);
  assert.equal(Math.max(...ys), 49);
});

test('a rotated ellipse keeps its area but not its bounding box', () => {
  const flat = ellipseQuads(60, 60, 24, 8);
  const tilted = ellipseQuads(60, 60, 24, 8, 40);
  const width = (q) => Math.max(...q.map((p) => p.x)) - Math.min(...q.map((p) => p.x));
  const height = (q) => Math.max(...q.map((p) => p.y)) - Math.min(...q.map((p) => p.y));
  assert.ok(width(tilted) < width(flat), 'a tilted ellipse is narrower than a flat one');
  assert.ok(height(tilted) > height(flat), 'and taller');
});

test('an ellipse is closed and contiguous', () => {
  const quads = ellipseQuads(40, 40, 18, 11);
  for (let i = 1; i < quads.length; i += 1) {
    const a = quads[i - 1];
    const b = quads[i];
    assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1, `gap at ${i}`);
  }
  const first = quads[0];
  const last = quads[quads.length - 1];
  assert.ok(Math.max(Math.abs(first.x - last.x), Math.abs(first.y - last.y)) <= 1, 'ellipse does not close');
});

test('a degenerate ellipse is refused by name', () => {
  assert.throws(() => ellipseQuads(0, 0, 0, 10), /whole radius/);
  assert.throws(() => ellipseQuads(0, 0, 10, 0), /whole radius/);
});

// ---------------------------------------------------------------------------
// fillInterior — the inside of a closed outline
//
// `polygon` claims the quadrants of its outline and nothing within, so a filled
// region had to be hand-hatched into dozens of separate elements. Flood from
// OUTSIDE and invert, rather than scanline parity: a rasterised curve produces
// doubled crossings at every local extremum, and parity counting gets those
// wrong in ways that depend on the shape.
// ---------------------------------------------------------------------------

test('a filled rectangle contains every quadrant inside its outline', () => {
  const outline = polygonQuads([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 },
  ]);
  const filled = fillInterior(outline);
  const key = (p) => `${p.x},${p.y}`;
  const have = new Set(filled.map(key));

  for (let y = 0; y <= 6; y += 1) {
    for (let x = 0; x <= 10; x += 1) {
      assert.ok(have.has(key({ x, y })), `missing ${x},${y}`);
    }
  }
  assert.equal(filled.length, 11 * 7, 'and nothing outside it');
});

test('a filled circle is denser than its outline and stays inside its radius', () => {
  const outline = circleQuads(0, 0, 12);
  const filled = fillInterior(outline);
  assert.ok(filled.length > outline.length * 4, 'a disc has far more quadrants than its ring');
  for (const p of filled) {
    assert.ok(Math.hypot(p.x, p.y) <= 13, `${p.x},${p.y} escaped the radius`);
  }
});

test('filling a closed shape agrees with the disc the engine already draws', () => {
  const key = (p) => `${p.x},${p.y}`;
  const filled = new Set(fillInterior(circleQuads(30, 30, 9)).map(key));
  for (const p of discQuads(30, 30, 9)) {
    assert.ok(filled.has(key(p)), `disc quadrant ${key(p)} is not in the filled circle`);
  }
});

test('a shape with a concavity fills the concavity but not the bay outside it', () => {
  // A C-shape: the hollow is outside the form and must stay empty.
  const outline = polygonQuads([
    { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 4, y: 3 },
    { x: 4, y: 7 }, { x: 12, y: 7 }, { x: 12, y: 10 }, { x: 0, y: 10 },
  ]);
  const have = new Set(fillInterior(outline).map((p) => `${p.x},${p.y}`));
  assert.ok(have.has('2,5'), 'the spine of the C is inside');
  assert.ok(!have.has('8,5'), 'the bay of the C is outside and must not fill');
});

test('an open path fills nothing rather than leaking across the sheet', () => {
  // Three sides of a square: flooding from outside reaches everywhere, so the
  // interior is empty. Leaking would be far worse than filling nothing.
  const open = [
    ...rayQuads(0, 0, 10, 0),
    ...rayQuads(10, 0, 10, 6),
    ...rayQuads(10, 6, 0, 6),
  ];
  const filled = fillInterior(open);
  const outlineKeys = new Set(open.map((p) => `${p.x},${p.y}`));
  assert.ok(
    filled.every((p) => outlineKeys.has(`${p.x},${p.y}`)),
    'an unclosed outline must not invent an interior',
  );
});
