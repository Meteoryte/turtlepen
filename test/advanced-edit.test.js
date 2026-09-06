import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core/index.js';

function drawing() {
  const doc = core.createDocument({ name: 'editing proof', cols: 60, rows: 40 });
  core.applyPen(doc, 'base', 'pen F6.q1\nright 3 line\ndown 2 line', { id: 'elbow', role: 'artwork' });
  return doc;
}
const ink = (doc, id) => [...core.elementClaimed(core.findElement(doc, id).element)].sort();

test('quarter turns and reflections preserve exact artwork and are reversible', () => {
  const doc = drawing(); const original = ink(doc, 'elbow');
  for (let i = 0; i < 4; i++) core.applyOperation(doc, { op: 'transform', ids: ['elbow'], rotate: 90, pivot: 'K11.q1' });
  assert.deepEqual(ink(doc, 'elbow'), original);
  for (let i = 0; i < 2; i++) core.applyOperation(doc, { op: 'transform', ids: ['elbow'], flip: 'horizontal' });
  assert.deepEqual(ink(doc, 'elbow'), original);
});

test('transform groups and integer cell scaling share plan and persisted state', () => {
  const doc = drawing();
  core.applyOperation(doc, { op: 'stroke_to_path', id: 'elbow', resultId: 'solid' });
  core.createGroup(doc, { id: 'assembly', members: ['solid'] });
  const count = ink(doc, 'solid').length;
  const operation = { op: 'transform', group: 'assembly', scaleX: 2, scaleY: 3 };
  const before = core.serialize(doc); const plan = core.planOperations(doc, [operation]);
  assert.equal(plan.ok, true, plan.error); assert.equal(core.serialize(doc), before);
  assert.equal(core.commitOperations(doc, [operation]).committed, true);
  assert.deepEqual(ink(doc, 'solid'), ink(plan.preview, 'solid'));
  assert.equal(ink(doc, 'solid').length, count * 6);
  assert.deepEqual(ink(core.deserialize(core.serialize(doc)), 'solid'), ink(doc, 'solid'));
});

test('invalid or destructive-to-semantics transforms refuse atomically', () => {
  const doc = drawing(); const before = core.serialize(doc);
  for (const args of [{ rotate: 45 }, { scaleX: 0 }, { scaleX: 1.5 }, { rotate: 180, pivot: 'A1.q1' }]) {
    assert.throws(() => core.applyOperation(doc, { op: 'transform', ids: ['elbow'], ...args }));
    assert.equal(core.serialize(doc), before);
  }
});

test('shape cuts consume exact intersections and retain all source quadrants', () => {
  const doc = core.createDocument();
  core.placeBox(doc, 'base', { id: 'subject', at: 'C3', span: '8x6' });
  core.placeBox(doc, 'base', { id: 'knife', at: 'F2', span: '2x9' });
  const original = ink(doc, 'subject');
  const result = core.applyOperation(doc, { op: 'slice', id: 'subject', cutter: 'knife', mode: 'partition', footprint: 'claimed' });
  assert.equal(result.created.length, 2);
  assert.deepEqual([...new Set(result.created.flatMap(id => ink(doc, id)))].sort(), original);
  assert.ok(core.findElement(doc, 'knife'));
});

test('queries are explicit, bounded, stable, and non-mutating', () => {
  const doc = drawing();
  core.placeBox(doc, 'base', { id: 'node', at: 'U10', span: '8x3', label: 'API' });
  core.annotateElement(doc, 'node', { tags: ['service'], properties: { owner: 'team' } });
  const before = core.serialize(doc);
  assert.deepEqual(core.queryElements(doc, { tags: ['service'] }).ids, ['node']);
  assert.deepEqual(core.queryElements(doc, { kind: 'path', invert: true }).ids, ['node']);
  const limited = core.queryElements(doc, { limit: 1 });
  assert.equal(limited.total, 2); assert.equal(limited.nextOffset, 1);
  assert.equal(core.serialize(doc), before);
});

test('guides are native persisted scaffolding and remain release blockers when hidden', () => {
  const doc = drawing();
  core.applyOperation(doc, { op: 'guide', action: 'create', id: 'baseline', from: 'C20.q1', to: 'Z20.q1' });
  const guide = core.findElement(doc, 'baseline'); assert.equal(guide.element.kind, 'path');
  core.updatePage(doc, guide.page, { visible: false });
  const reopened = core.deserialize(core.serialize(doc));
  assert.match(core.releaseCheck(reopened).blockers.join(' '), /construction.*baseline/i);
  core.applyOperation(reopened, { op: 'guide', action: 'remove', id: 'baseline' });
  assert.doesNotMatch(core.releaseCheck(reopened).blockers.join(' '), /construction/);
});

test('guide snapping reports exact movement and cleanup preserves distinct semantics', () => {
  const doc = drawing();
  core.applyOperation(doc, { op: 'guide', id: 'baseline', from: 'C20.q1', to: 'Z20.q1' });
  const result = core.applyOperation(doc, { op: 'guide', action: 'snap', id: 'baseline', ids: ['elbow'], anchor: 'S' });
  assert.equal(result.moved.length, 1);
  assert.equal(core.elementAnchor(doc, 'elbow', 'S').y, 38);
  core.duplicateElement(doc, { id: 'elbow', to: 'duplicate' });
  core.duplicateElement(doc, { id: 'elbow', to: 'meaningful' });
  core.annotateElement(doc, 'meaningful', { description: 'A different semantic role' });
  const cleaned = core.applyOperation(doc, { op: 'cleanup', ids: ['elbow', 'duplicate', 'meaningful'], removeDuplicates: true });
  assert.deepEqual(cleaned.removed, ['duplicate']);
  assert.ok(core.findElement(doc, 'meaningful'));
});
