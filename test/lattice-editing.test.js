import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';

const doc = (name = 'lattice editing') => core.createDocument({ name });

function boxesForBoolean() {
  const d = doc();
  core.placeBox(d, 'base', { id: 'left', at: 'C4.tl', span: { w: 2, h: 2 } });
  core.placeBox(d, 'base', { id: 'right', at: 'D4.tl', span: { w: 2, h: 2 } });
  return d;
}

test('boolean set algebra creates exact deterministic lattice geometry', () => {
  const expected = { union: 24, difference: 8, intersection: 8, xor: 16 };
  for (const [action, quadrants] of Object.entries(expected)) {
    const d = boxesForBoolean();
    const result = core.booleanGeometry(d, { action, ids: ['left', 'right'] });
    const output = core.findElement(d, 'left');

    assert.equal(result.result, 'left');
    assert.equal(core.findElement(d, 'right'), null);
    assert.equal(output.element.kind, 'path');
    assert.equal(output.element.stroke.paint, 'cells');
    assert.equal(core.elementClaimed(output.element).size, quadrants);
    assert.deepEqual(output.element.provenance, {
      operation: `boolean_${action}`,
      sources: ['left', 'right'],
      footprint: 'visual',
    });
  }
});

test('an empty boolean result is rejected before source geometry changes', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'left', at: 'C4.tl', span: { w: 2, h: 2 } });
  core.placeBox(d, 'base', { id: 'right', at: 'M4.tl', span: { w: 2, h: 2 } });
  const before = core.serialize(d);

  assert.throws(
    () => core.booleanGeometry(d, { action: 'intersection', ids: ['left', 'right'] }),
    /would leave no quadrants/,
  );
  assert.equal(core.serialize(d), before);
});

test('slice divides at an explicit lattice boundary, persists deterministic part ids', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'panel', at: 'C4.tl', span: { w: 4, h: 2 } });

  const result = core.sliceGeometry(d, { id: 'panel', axis: 'vertical', at: 'E4.tl' });
  assert.deepEqual(result.created, ['panel-part-1', 'panel-part-2']);
  assert.deepEqual(result.quadrants, [16, 16]);
  assert.equal(core.findElement(d, 'panel'), null);
  assert.deepEqual(
    core.elementsOf(d, 'base').map((element) => element.id),
    ['panel-part-1', 'panel-part-2'],
  );
  assert.equal(core.serialize(core.deserialize(core.serialize(d))), core.serialize(d));
});

test('offset performs exact lattice morphology and rejects off-grid expansion', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'panel', at: 'C4.tl', span: { w: 2, h: 2 } });

  const inset = core.offsetPath(d, { id: 'panel', distance: -1 });
  assert.equal(inset.quadrants, 4);
  assert.equal(core.findElement(d, 'panel').element.provenance.metric, 'chebyshev');

  const nearEdge = doc();
  core.placeBox(nearEdge, 'base', { id: 'edge', at: 'A4.tl', span: { w: 2, h: 2 } });
  const before = core.serialize(nearEdge);
  assert.throws(() => core.offsetPath(nearEdge, { id: 'edge', distance: 1 }), /no negative lattice addresses/);
  assert.equal(core.serialize(nearEdge), before);
});

test('path editing clears stale pen state, joins adjacent paths, and splits them deterministically', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 line', { id: 'wire', role: 'artwork' });
  assert.ok(core.findElement(d, 'wire').element.end);

  core.editPath(d, { id: 'wire', action: 'move', index: 1, at: 'D4.q2' });
  assert.equal(core.findElement(d, 'wire').element.end, undefined);
  core.strokeToPath(d, { id: 'wire' });
  assert.equal(core.findElement(d, 'wire').element.stroke.paint, 'cells');

  core.applyPen(d, 'base', 'pen C10.q1\nright 1 line', { id: 'first', role: 'artwork' });
  core.applyPen(d, 'base', 'pen D10.q1\nright 1 line', { id: 'second', role: 'artwork' });
  const joined = core.editPath(d, { id: 'first', action: 'join', with: 'second' });
  assert.equal(joined.result, 'first');
  assert.equal(core.findElement(d, 'second'), null);
  assert.equal(core.findElement(d, 'first').element.pieces.length, 4);

  const split = core.editPath(d, { id: 'first', action: 'split', index: 2 });
  assert.deepEqual(split.created, ['first', 'first-part-2']);
  assert.equal(core.findElement(d, 'first').element.pieces.length, 2);
  assert.equal(core.findElement(d, 'first-part-2').element.pieces.length, 2);
});

test('normalization only removes duplicate path quadrants', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 1 line\nleft 1 line', { id: 'loop', role: 'artwork' });
  const before = core.findElement(d, 'loop').element.pieces.length;

  const result = core.normalizePath(d, { id: 'loop' });
  assert.ok(result.removed > 0);
  assert.equal(core.findElement(d, 'loop').element.pieces.length, before - result.removed);
});

test('reorder, duplicate, and arrays preserve explicit order, group ownership, and quadrant deltas', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 2, h: 2 } });
  core.placeBox(d, 'base', { id: 'b', at: 'J4.tl', span: { w: 2, h: 2 } });
  core.placeBox(d, 'base', { id: 'c', at: 'Q4.tl', span: { w: 2, h: 2 } });
  core.createGroup(d, { id: 'set', members: ['b'] });

  core.reorderElement(d, { id: 'a', action: 'bring_to_front' });
  assert.deepEqual(core.elementsOf(d, 'base').map((element) => element.id), ['b', 'c', 'a']);

  core.duplicateElement(d, { id: 'b', to: 'b-copy', dx: 4, dy: 2 });
  assert.deepEqual(core.findElement(d, 'b-copy').element.rect, { x: 22, y: 8, w: 4, h: 4 });
  assert.ok(core.findGroup(d, 'set').members.includes('b-copy'));

  const array = core.arrayElements(d, {
    id: 'b-copy', columns: 2, rows: 2, stepX: 6, stepY: 4, prefix: 'tile',
  });
  assert.deepEqual(array.created, ['tile-1', 'tile-2', 'tile-3']);
  assert.deepEqual(core.findElement(d, 'tile-3').element.rect, { x: 28, y: 12, w: 4, h: 4 });
  assert.ok(core.findGroup(d, 'set').members.includes('tile-3'));
});

test('inspect returns exact areas, rational centers, intersections, and gaps', () => {
  const d = boxesForBoolean();
  const inspected = core.inspectGeometry(d, { ids: ['left', 'right'] });

  assert.equal(inspected.elements[0].quadrants, 16);
  assert.deepEqual(inspected.elements[0].bounds, { x: 4, y: 6, w: 4, h: 4 });
  assert.deepEqual(inspected.elements[0].center, { xNumerator: 12, yNumerator: 16, denominator: 2 });
  assert.equal(inspected.intersections[0].quadrants, 8);
  assert.deepEqual(inspected.intersections[0].boundsGap, {
    x: 0, y: 0, manhattan: 0, euclideanSquared: 0,
  });
});

test('new mutations have dry-run parity and leave failed plans unchanged', () => {
  const d = boxesForBoolean();
  const before = core.serialize(d);
  const operations = [
    { op: 'boolean', action: 'union', ids: ['left', 'right'], id: 'joined' },
    { op: 'offset_path', id: 'joined', distance: 1, resultId: 'outline', removeSource: false },
    { op: 'duplicate', id: 'outline', to: 'outline-copy', dx: 10, dy: 0 },
    { op: 'reorder', id: 'outline-copy', action: 'bring_to_front' },
  ];

  const rehearsal = core.planOperations(d, operations);
  assert.equal(rehearsal.ok, true);
  assert.equal(core.serialize(d), before, 'a dry run must not change the live document');
  const committed = core.commitOperations(d, operations);
  assert.equal(committed.ok, true);
  assert.equal(core.serialize(d), core.serialize(rehearsal.preview));

  const stable = core.serialize(d);
  const failed = core.planOperations(d, [{ op: 'slice', id: 'joined', axis: 'vertical', at: 'ZZ999.tl' }]);
  assert.equal(failed.ok, false);
  assert.equal(core.serialize(d), stable);
});
