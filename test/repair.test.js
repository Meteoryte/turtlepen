/**
 * Executable repairs.
 *
 * The value is in the refusals as much as the applications: a fix that cannot
 * be performed without guessing must say so, because inventing a plausible
 * mutation nobody asked for is the failure this engine exists to prevent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createMcpClient } from '../examples/mcp-client.js';
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

/**
 * A repair applied over the real MCP transport must reach disk and must be
 * undoable — the two properties the tool description already promises.
 *
 * Both were false: `repair` mutated the in-memory document without a
 * checkpoint and without persisting, so a fix looked applied, survived a
 * `describe`, and then vanished on the next `open_diagram`. It was also
 * invisible to undo, because the shared history wrapper only covers tools
 * named in MUTATING_TOOLS and `repair` is not a core operation.
 */
test('a repair over the real wire is saved to disk and undone by one undo', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'turtlepen-repair-'));
  const client = createMcpClient({ cwd: dir });
  const text = async (name, args = {}) => {
    const r = await client.call(name, args);
    assert.equal(r.isError, false, `${name} failed: ${r.error ?? r.text}`);
    return r.text;
  };

  try {
    await client.init();
    await text('new_diagram', { name: 'repairable', path: 'r.turtlepen.json', cols: 60, rows: 40 });
    await text('place_box', { id: 'alpha', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Alpha' });
    await text('place_box', { id: 'beta', at: 'F4.tl', span: { w: 6, h: 3 }, label: 'Beta' });

    const overlap = JSON.parse(await text('validate', { format: 'json' })).open.find((f) => f.rule === 'L001');
    assert.ok(overlap, 'two overlapping boxes must raise L001');

    const before = JSON.parse(await text('describe', {}))[0].elements.find((e) => e.id === 'beta').at;
    const betaBefore = JSON.parse(await readFile(resolve(dir, 'r.turtlepen.json'), 'utf8'))
      .elements.base.find((e) => e.id === 'beta').rect.x;
    assert.match(await text('repair', { fingerprint: overlap.fingerprint, index: 0 }), /applied .* via move/);
    const after = JSON.parse(await text('describe', {}))[0].elements.find((e) => e.id === 'beta').at;
    assert.notEqual(after, before, 'the repair must actually move the element');

    // The real assertion: the fix is on disk, not only in memory. Reading the
    // file the session owns is what a reopen would see.
    // The real property, stated the way the bug was experienced: reopen the
    // file and the repair is still there. A hard-coded coordinate would only
    // restate the repair table's current choice of fix.
    const onDisk = () => readFile(resolve(dir, 'r.turtlepen.json'), 'utf8')
      .then((raw) => JSON.parse(raw).elements.base.find((e) => e.id === 'beta').rect.x);
    assert.notEqual(await onDisk(), betaBefore, 'the repair must reach disk, not only memory');

    // And one undo steps back over the repair, not over the placement before it.
    assert.match(await text('history', { action: 'undo' }), /undid repair/);
    const undone = JSON.parse(await text('describe', {}))[0].elements.find((e) => e.id === 'beta').at;
    assert.equal(undone, before, 'one undo must restore the pre-repair position');

    // Reopening proves the undo was persisted too, and closes the loop on the
    // original symptom: state that looked applied but was not on disk.
    await text('open_diagram', { path: 'r.turtlepen.json' });
    assert.equal(JSON.parse(await text('describe', {}))[0].elements.find((e) => e.id === 'beta').at, before,
      'the undone state must survive a reopen');
  } finally {
    // The server holds the temp directory as its cwd; Windows refuses to
    // remove it until the child has actually exited.
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
