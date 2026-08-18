/**
 * Swimlanes and grouping containers.
 *
 * A container is the one shape that does NOT reserve its interior. That makes
 * these tests the load-bearing ones: the hole must be free, the frame must not
 * be, and ordinary boxes must be completely unaffected by the change that made
 * it possible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTAINER_SHAPES, isContainer, containerClaimQuads, containerBand,
  shapeTextRect, visualQuads, claimedQuads,
} from '../src/core/shapes.js';
import { rect } from '../src/core/geometry.js';
import { elementClaimed } from '../src/core/document.js';
import { createDocument, placeBox, validate } from '../src/core/index.js';

const R = rect(0, 0, 20, 12);

const rules = (doc) => validate(doc).open.map((f) => `${f.rule} ${f.actors.join(',')}`);

function laneWith(members = []) {
  const doc = createDocument({ name: 'lane', canvas: { cols: 60, rows: 30 } });
  placeBox(doc, 'base', { id: 'lane1', at: 'C3', span: '30x14', label: 'Sales', shape: 'lane' });
  for (const m of members) placeBox(doc, 'base', m);
  return doc;
}

test('containers are named and recognised', () => {
  assert.deepEqual([...CONTAINER_SHAPES], ['lane', 'group']);
  assert.ok(isContainer('lane') && isContainer('group'));
  assert.ok(!isContainer('process') && !isContainer('decision'));
});

test('a container claims a ring and a title band, never its hole', () => {
  const claimed = containerClaimQuads(R);
  const band = containerBand(R);
  assert.ok(claimed.size < claimedQuads(R).size, 'a container must reserve less than a slab');

  // Title band: every quadrant across the top.
  for (let x = 0; x < R.w; x++) assert.ok(claimed.has(`${x},0`), `band at ${x},0`);
  // Border: the sides and the foot below the band.
  assert.ok(claimed.has(`0,${band + 1}`), 'left border');
  assert.ok(claimed.has(`${R.w - 1},${band + 1}`), 'right border');
  assert.ok(claimed.has(`5,${R.h - 1}`), 'bottom border');
  // The hole: free.
  assert.ok(!claimed.has(`5,${band + 1}`), 'the interior must be free');
});

test('the interior a container leaves free is exactly what it does not claim', () => {
  const ink = visualQuads(R, 'square', 'lane');
  const claimed = containerClaimQuads(R);
  assert.equal(ink.size, claimed.size, 'a container inks precisely what it reserves');
});

test('elementClaimed reports the ring for a container box', () => {
  const el = { kind: 'box', shape: 'lane', rect: R };
  assert.equal(elementClaimed(el).size, containerClaimQuads(R).size);
  const solid = { kind: 'box', shape: 'process', rect: R };
  assert.equal(elementClaimed(solid).size, claimedQuads(R).size, 'ordinary boxes are untouched');
});

test('a member sitting inside a lane collides with nothing', () => {
  const doc = laneWith([{ id: 'step', at: 'F8', span: '12x5', label: 'Take order' }]);
  assert.deepEqual(rules(doc), [], 'the whole point of a container');
});

test('a node straddling the frame still reports L001', () => {
  // The containment must not become a licence to overlap the border.
  const doc = laneWith([{ id: 'straddle', at: 'A6', span: '8x4', label: 'x' }]);
  const l001 = validate(doc).open.filter((f) => f.rule === 'L001');
  assert.equal(l001.length, 1);
  assert.ok(l001[0].actors.includes('lane1') && l001[0].actors.includes('straddle'));
});

test('two lanes side by side do not collide, and nesting is allowed', () => {
  const doc = createDocument({ name: 'lanes', canvas: { cols: 90, rows: 40 } });
  placeBox(doc, 'base', { id: 'a', at: 'C3', span: '26x14', label: 'Sales', shape: 'lane' });
  placeBox(doc, 'base', { id: 'b', at: 'AF3', span: '26x14', label: 'Ops', shape: 'lane' });
  assert.deepEqual(rules(doc).filter((r) => r.startsWith('L001')), []);

  // A group nested inside a lane: two rings, neither touching the other.
  placeBox(doc, 'base', { id: 'inner', at: 'F8', span: '18x7', label: 'Batch', shape: 'group' });
  assert.deepEqual(rules(doc).filter((r) => r.startsWith('L001')), [], 'nesting is legitimate');
});

test('a container label belongs in its title band', () => {
  const t = shapeTextRect(R, 'lane');
  assert.equal(t.y, R.y, 'the label sits at the top');
  assert.equal(t.h, containerBand(R));
  assert.ok(t.h < R.h, 'never the whole hole');
});

test('the band is tall enough for the label it is given', () => {
  // A title band that cannot show its own title would be a container that
  // always reports L003 — useless, and noise that trains you to ignore the log.
  const doc = laneWith();
  assert.deepEqual(rules(doc).filter((r) => r.startsWith('L003')), []);
});

test('two ordinary boxes still collide exactly as before', () => {
  // Regression guard: L001 now tests the claimed intersection rather than the
  // bounding boxes. For solid boxes those are the same thing, and must stay so.
  const doc = createDocument({ name: 'solid', canvas: { cols: 40, rows: 20 } });
  placeBox(doc, 'base', { id: 'a', at: 'C3', span: '10x5', label: 'a' });
  placeBox(doc, 'base', { id: 'b', at: 'F5', span: '10x5', label: 'b' });
  const l001 = validate(doc).open.filter((f) => f.rule === 'L001');
  assert.equal(l001.length, 1);
  assert.ok(l001[0].metrics.overlapQuadrants > 0);
});

test('a container too small to read stays an ordinary rectangle', () => {
  const tiny = rect(0, 0, 2, 2);
  const el = { kind: 'box', shape: 'lane', rect: tiny };
  assert.equal(elementClaimed(el).size, claimedQuads(tiny).size);
});
