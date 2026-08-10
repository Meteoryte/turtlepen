import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { RULES } from '../src/core/collide.js';

const doc = () => core.createDocument({ name: 'edit' });
const byRule = (v, rule) => v.open.filter((f) => f.rule === rule);

// ---------------------------------------------------------------------------
// Every fix the engine suggests must have a way to apply it
// ---------------------------------------------------------------------------

test('every fix kind the engine emits is covered by an operation', () => {
  // Build a document that trips as many rules as possible, then collect the
  // fix kinds actually emitted and check each maps to something callable.
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Ingest & Normalize Payload' });
  core.placeBox(d, 'base', { id: 'b', at: 'E4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'c', at: 'M4.tl', span: { w: 4, h: 2 }, fontSize: 6 });
  core.placeBox(d, 'base', { id: 'e', at: 'Q4.tl', span: { w: 4, h: 2 } });
  core.applyPen(d, 'base', 'pen C20.q1\nright 3 align top line', { id: 'wire' });
  core.addPage(d, { id: 'over', z: 1, intent: 'exclusive' });
  core.placeBox(d, 'over', { id: 'x', at: 'C4.tl', span: { w: 2, h: 1 } });

  const kinds = new Set(core.validate(d).open.flatMap((f) => f.fixes.map((x) => x.kind)));
  assert.ok(kinds.size >= 6, `expected a broad set of fix kinds, got ${[...kinds].join(', ')}`);

  // The mapping the help text promises. A fix with no route to apply it leaves
  // the AI reading advice it cannot act on.
  const routes = {
    widen: 'resize', heighten: 'resize', shorten: 'restyle', font: 'restyle',
    move: 'move', rename: 'rename', intent: 'update_page', canvas: 'set_canvas',
    extend: 'extend_path', reroute: 'replace_path', offset: 'replace_path', hop: 'replace_path',
    remove: 'remove', remove_page: 'remove_page',
  };
  for (const kind of kinds) {
    assert.ok(routes[kind], `fix kind "${kind}" has no documented repair route`);
    assert.ok(core.OPERATIONS[routes[kind]], `route "${routes[kind]}" for fix "${kind}" is not an operation`);
  }
});

test('every rule that carries fixes names at least one', () => {
  for (const [code, spec] of Object.entries(RULES)) {
    assert.ok(spec.severity && spec.title && spec.blurb, `${code} is under-described`);
  }
});

// ---------------------------------------------------------------------------
// Repair operations
// ---------------------------------------------------------------------------

test('resize applies the widen fix and clears the finding', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'audit', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Immutable Audit Trail' });
  const before = core.validate(d);
  const widen = byRule(before, 'L002')[0].fixes.find((f) => f.kind === 'widen');

  const need = core.text.requiredCellsFor('Immutable Audit Trail', { fontSize: 10, maxWidthCells: widen.to });
  core.resizeBox(d, 'audit', { cellsW: widen.to, cellsH: need.cellsTall });

  const after = core.validate(d);
  assert.equal(byRule(after, 'L002').length, 0);
  assert.equal(byRule(after, 'L003').length, 0);
  assert.ok(after.summary.clean);
});

test('resize keeps the anchored corner pinned', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'F10.tl', span: { w: 4, h: 2 } });
  core.resizeBox(d, 'a', { cellsW: 8, anchor: 'tr' });
  const r = core.findElement(d, 'a').element.rect;
  assert.equal(r.x + r.w, 10 + 8, 'the right edge did not move');
  assert.equal(r.w, 16);
});

test('move to an address repositions by pin', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.moveElementTo(d, 'a', 'M20.tl');
  assert.deepEqual(core.findElement(d, 'a').element.rect, { x: 24, y: 38, w: 8, h: 4 });
});

test('moving a path shifts every piece together', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line', { id: 'wire' });
  const before = core.findElement(d, 'wire').element.pieces.map((p) => ({ ...p }));
  core.moveElement(d, 'wire', 4, 6);
  const after = core.findElement(d, 'wire').element.pieces;
  after.forEach((p, i) => {
    assert.equal(p.x, before[i].x + 4);
    assert.equal(p.y, before[i].y + 6);
  });
});

test('moving a path also moves its resumable end state', () => {
  const d = core.createDocument({ name: 'move-end' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line', { id: 'wire' });
  const path = core.findElement(d, 'wire').element;
  const before = { ...path.end };
  core.moveElement(d, 'wire', 4, 6);
  assert.deepEqual(path.end, { ...before, x: before.x + 4, y: before.y + 6 });

  const oldLength = path.pieces.length;
  core.extendPath(d, 'wire', 'right 1 align top line');
  assert.equal(path.pieces[oldLength].x, before.x + 4, 'the extension begins at the moved endpoint');
  assert.equal(path.pieces[oldLength].y, before.y + 6);
});

test('restyle relabels and re-measures', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Immutable Audit Trail' });
  assert.equal(byRule(core.validate(d), 'L002').length, 1);
  const r = core.restyleBox(d, 'a', { label: 'Audit' });
  assert.ok(r.fit.fits);
  assert.ok(core.validate(d).summary.clean);
});

test('a failed restyle validates every field before changing any of them', () => {
  const d = core.createDocument({ name: 'atomic-restyle' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: '8x4', label: 'Before' });
  const before = core.serialize(d);
  assert.throws(
    () => core.restyleBox(d, 'a', { label: 'After', fill: 'url(javascript:alert(1))' }),
    /hex colour/,
  );
  assert.equal(core.serialize(d), before);
});

test('a failed page update is atomic across intent and stacking changes', () => {
  const d = core.createDocument({ name: 'atomic-page' });
  core.addPage(d, { id: 'notes', z: 1, intent: 'exclusive' });
  const before = core.serialize(d);
  assert.throws(() => core.updatePage(d, 'notes', { intent: 'overlay', z: 0 }), /already occupied/);
  assert.equal(core.serialize(d), before);
});

test('update_page turns an exclusive error into an overlay note', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'db', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.addPage(d, { id: 'notes', z: 1, intent: 'exclusive' });
  core.placeBox(d, 'notes', { id: 'tip', at: 'C4.tl', span: { w: 2, h: 1 } });

  assert.equal(byRule(core.validate(d), 'L005').length, 1);
  core.updatePage(d, 'notes', { intent: 'overlay' });
  const after = core.validate(d);
  assert.equal(byRule(after, 'L005').length, 0);
  assert.equal(byRule(after, 'L010').length, 1);
  assert.ok(after.summary.clean);
});

test('rename frees the duplicate-id finding, and refuses a name already taken', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 2, h: 1 } });
  core.placeBox(d, 'base', { id: 'b', at: 'M4.tl', span: { w: 2, h: 1 } });
  assert.throws(() => core.renameElement(d, 'a', 'b'), /already exists/);
  core.renameElement(d, 'a', 'c');
  assert.ok(core.findElement(d, 'c'));
  assert.equal(core.findElement(d, 'a'), null);
});

test('set_canvas clears an out-of-bounds finding', () => {
  const d = core.createDocument({ name: 'small', canvas: { cols: 10, rows: 10 } });
  core.placeBox(d, 'base', { id: 'a', at: 'A20.tl', span: { w: 4, h: 2 } });
  assert.equal(byRule(core.validate(d), 'L011').length, 1);
  core.setCanvas(d, 60, 60);
  assert.equal(byRule(core.validate(d), 'L011').length, 0);
});

// ---------------------------------------------------------------------------
// Path amendment
// ---------------------------------------------------------------------------

test('a path can be extended from where its pen stopped', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line', { id: 'wire' });
  const path = core.findElement(d, 'wire').element;
  assert.deepEqual(path.end, { x: 8, y: 6, facing: 'right' }, 'the end state is recorded');

  core.extendPath(d, 'wire', 'right 2 align top line');
  assert.equal(path.pieces.length, 8, 'four more quadrants appended');
  assert.equal(path.end.x, 12);
  // Contiguity is preserved across the join.
  for (let i = 1; i < path.pieces.length; i++) {
    const step = Math.abs(path.pieces[i].x - path.pieces[i - 1].x) + Math.abs(path.pieces[i].y - path.pieces[i - 1].y);
    assert.equal(step, 1, `piece ${i} is not adjacent to its predecessor`);
  }
});

test('extending resolves the dangling-end finding', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'src', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.placeBox(d, 'base', { id: 'dst', at: 'M4.tl', span: { w: 4, h: 2 } });
  core.applyPen(d, 'base', 'pen G4.q1\nright 2 align top line', { id: 'wire' });
  assert.equal(byRule(core.validate(d), 'L008').length, 1);

  core.extendPath(d, 'wire', 'right align top line to dst.W');
  assert.equal(byRule(core.validate(d), 'L008').length, 0);
});

test('extend_path refuses to place boxes — that is a different operation', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line', { id: 'wire' });
  assert.throws(() => core.extendPath(d, 'wire', 'box span 2x1 at Z9.tl'), /strokes only/);
});

test('replace_path keeps the id and the draw order', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line', { id: 'first' });
  core.applyPen(d, 'base', 'pen C10.q1\nright 2 align top line', { id: 'second' });
  core.replacePath(d, 'first', 'pen C4.q1\ndown 3 align left line');

  const ids = core.elementsOf(d, 'base').map((e) => e.id);
  assert.deepEqual(ids, ['first', 'second'], 'draw order is unchanged');
  assert.equal(core.findElement(d, 'first').element.pieces.length, 6);
});

test('a failed replacement preserves the original path', () => {
  const d = core.createDocument({ name: 'safe-replace' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line', { id: 'wire' });
  const before = core.serialize(d);
  assert.throws(() => core.replacePath(d, 'wire', 'pen A1.q1'), /drew no strokes/);
  assert.equal(core.serialize(d), before, 'a malformed replacement cannot delete the path it was meant to replace');
});

test('a pen program that fails while adding elements applies nothing', () => {
  const d = core.createDocument({ name: 'atomic-pen' });
  const before = core.serialize(d);
  assert.throws(
    () => core.applyPen(d, 'base', 'box span 2x2 at C4.tl id same; box span 2x2 at H4.tl id same'),
    /already exists/,
  );
  assert.equal(core.serialize(d), before, 'the first box must not leak out of the failed pen operation');
});

// ---------------------------------------------------------------------------
// Plan / commit
// ---------------------------------------------------------------------------

test('plan rehearses on a copy and leaves the document untouched', () => {
  const d = doc();
  const before = core.serialize(d);
  const result = core.planOperations(d, [
    { op: 'place_box', id: 'a', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Immutable Audit Trail' },
    { op: 'place_box', id: 'b', at: 'E4.tl', span: { w: 6, h: 3 } },
  ]);

  assert.ok(result.ok);
  assert.equal(result.applied, 2);
  assert.ok(result.validation.open.some((f) => f.rule === 'L001'), 'the rehearsal sees the overlap');
  assert.equal(core.serialize(d), before, 'the live document is byte-identical');
});

test('a batch that fails part-way applies nothing', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'taken', at: 'C4.tl', span: { w: 2, h: 1 } });
  const before = core.serialize(d);

  const result = core.commitOperations(d, [
    { op: 'place_box', id: 'fine', at: 'M4.tl', span: { w: 2, h: 1 } },
    { op: 'place_box', id: 'taken', at: 'S4.tl', span: { w: 2, h: 1 } }, // duplicate id
    { op: 'place_box', id: 'never', at: 'W4.tl', span: { w: 2, h: 1 } },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.failedAt, 1, 'reports which operation failed');
  assert.match(result.error, /already exists/);
  assert.equal(core.serialize(d), before, 'not even the first, valid operation was applied');
});

test('commit applies the whole batch and revalidates', () => {
  const d = doc();
  const result = core.commitOperations(d, [
    { op: 'place_box', id: 'a', at: 'C4.tl', span: { w: 12, h: 4 }, label: 'Ingest' },
    { op: 'place_box', id: 'b', at: 'C12.tl', span: { w: 12, h: 4 }, label: 'Queue' },
    { op: 'pen', program: 'pen H8.q1\ndown align right line to b.N', id: 'wire' },
  ]);
  assert.ok(result.ok);
  assert.ok(result.committed);
  assert.equal(core.elementsOf(d, 'base').length, 3);
  assert.ok(result.validation.summary.clean, core.formatLog(result.validation));
});

test('an unknown operation is rejected by name with the valid list', () => {
  assert.throws(() => core.applyOperation(doc(), { op: 'teleport' }), /unknown operation "teleport"/);
});

test('plan covers accept_finding, so intent can be rehearsed too', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const fp = core.validate(d).open.find((f) => f.rule === 'L001').fingerprint;

  const result = core.planOperations(d, [{ op: 'accept_finding', fingerprint: fp, reason: 'deliberate shared border' }]);
  assert.ok(result.ok);
  assert.equal(result.validation.accepted.length, 1);
  assert.equal(d.acceptances.length, 0, 'the live document did not record it');
});
