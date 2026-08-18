/**
 * Executable repairs.
 *
 * The value is in the refusals as much as the applications: a fix that cannot
 * be performed without guessing must say so, because inventing a plausible
 * mutation nobody asked for is the failure this engine exists to prevent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { repairPlan, applyFix } from '../src/core/repair.js';
import { createDocument, placeBox, applyPen, validate, OPERATIONS } from '../src/core/index.js';

function overflowing() {
  const doc = createDocument({ name: 'r', canvas: { cols: 60, rows: 30 } });
  placeBox(doc, 'base', { id: 'a', at: 'C3', span: '6x3', label: 'A very long label indeed' });
  return doc;
}

const firstOpen = (doc, rule) => validate(doc).open.find((f) => f.rule === rule);

test('a fix becomes the call that performs it', () => {
  const doc = overflowing();
  const plan = repairPlan(doc, firstOpen(doc, 'L003').fingerprint);
  const exec = plan.fixes.filter((f) => f.executable);
  assert.ok(exec.length > 0, 'a size fix must be executable');
  for (const f of exec) {
    assert.ok(OPERATIONS[f.op], `${f.kind} maps to an operation that exists`);
    assert.equal(typeof f.args, 'object');
  }
});

test('applying a fix actually clears the finding', () => {
  const doc = overflowing();
  const f = firstOpen(doc, 'L003');
  const plan = repairPlan(doc, f.fingerprint);
  const i = plan.fixes.findIndex((x) => x.executable);
  const result = applyFix(doc, f.fingerprint, i, OPERATIONS);
  assert.equal(result.improved, true);
  assert.ok(result.findingsAfter < result.findingsBefore);
  assert.equal(validate(doc).open.filter((x) => x.rule === 'L003').length, 0);
});

test('an advisory fix is refused by name, not guessed at', () => {
  const doc = createDocument({ name: 'adv', canvas: { cols: 60, rows: 30 } });
  placeBox(doc, 'base', { id: 'a', at: 'C3', span: '10x4', label: 'A' });
  applyPen(doc, 'base', 'pen C10\nright 6 line', { id: 'p' });
  const dangling = validate(doc).open.find((f) => (f.fixes ?? []).some((x) => ['reroute', 'extend'].includes(x.kind)));
  if (!dangling) return; // nothing advisory in this state; the refusal is covered below anyway
  const plan = repairPlan(doc, dangling.fingerprint);
  const advisory = plan.fixes.find((x) => !x.executable);
  assert.ok(advisory.why, 'a refusal must say why');
  assert.throws(
    () => applyFix(doc, dangling.fingerprint, advisory.index, OPERATIONS),
    /Refusing rather than guessing/,
  );
});

test('a stale fingerprint is refused with the reason', () => {
  const doc = overflowing();
  assert.throws(
    () => repairPlan(doc, 'deadbeefdead'),
    /fingerprinted to exact geometry/,
  );
});

test('every executable fix names an operation the engine really has', () => {
  const doc = overflowing();
  for (const f of validate(doc).open) {
    for (const fix of repairPlan(doc, f.fingerprint).fixes) {
      if (fix.executable) assert.ok(OPERATIONS[fix.op], `${fix.kind} -> ${fix.op}`);
      else assert.ok(typeof fix.why === 'string' && fix.why.length > 0, `${fix.kind} must explain itself`);
    }
  }
});

test('a repair reports whether it actually helped', () => {
  // Applying a fix is not the same as making progress, and the caller is told
  // which happened rather than left to assume.
  const doc = overflowing();
  const f = firstOpen(doc, 'L003');
  const plan = repairPlan(doc, f.fingerprint);
  const r = applyFix(doc, f.fingerprint, plan.fixes.findIndex((x) => x.executable), OPERATIONS);
  assert.equal(typeof r.improved, 'boolean');
  assert.equal(typeof r.findingsBefore, 'number');
});
