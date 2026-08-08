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

import { rayQuads, circleQuads, arcQuads, polygonQuads, dashQuads, DIR8 } from '../src/core/raster.js';

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
