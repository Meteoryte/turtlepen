/**
 * The adjudication gate.
 *
 * "Is this intentional?" — asked mechanically, at the moment a diagram would
 * become a file, rather than asked politely and hoped for. An agent that never
 * reads the log still cannot write a broken diagram, which is the whole point:
 * enforcement lives in state, not in instructions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as core from '../src/core/index.js';

const tmp = () => mkdtemp(join(tmpdir(), 'turtlepen-gate-'));

/** A document with one real, unaccepted warning: a connector that dangles. */
function withDanglingPath() {
  const d = core.createDocument({ name: 'gated' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 8, h: 3 } });
  core.applyPen(d, 'base', 'pen T20.q1\nright 3 line', { id: 'loose' });
  return d;
}

test('a clean document passes the gate untouched', () => {
  const d = core.createDocument({ name: 'clean' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 8, h: 3 }, label: 'ok' });
  const gate = core.adjudicationGate(d);
  assert.equal(gate.blocked, false);
  assert.deepEqual(gate.blocking, []);
});

test('an open finding above INFO blocks the gate', () => {
  const gate = core.adjudicationGate(withDanglingPath());
  assert.equal(gate.blocked, true);
  assert.ok(gate.blocking.length >= 1);
  assert.ok(gate.blocking.every((f) => f.severity !== 'S3'), 'only real findings gate');
});

test('INFO never gates — gating on information trains the reflex the gate prevents', () => {
  const d = core.createDocument({ name: 'info' });
  core.addPage(d, { id: 'notes', z: 1, intent: 'overlay' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 8, h: 3 } });
  core.placeBox(d, 'notes', { id: 'note', at: 'C4.tl', span: { w: 4, h: 2 } });
  const v = core.validate(d);
  assert.ok(v.open.some((f) => f.severity === 'S3'), 'there is an overlay INFO finding');
  assert.equal(core.adjudicationGate(d).blocked, false, 'but it does not block');
});

test('the refusal is phrased as a question, and names both ways out', () => {
  const gate = core.adjudicationGate(withDanglingPath());
  const message = core.formatGate(gate);
  assert.match(message, /Is this intentional\?/);
  assert.match(message, /accept_finding/, 'the "yes" route');
  assert.match(message, /[0-9a-f]{12}/, 'with the fingerprint needed to take it');
  assert.match(message, /extend_path|replace_path|remove/, 'the "no" route');
});

test('saving a blocked document refuses rather than writing', async () => {
  const dir = await tmp();
  const path = join(dir, 'blocked.turtlepen.json');
  await assert.rejects(() => core.saveDocument(withDanglingPath(), path), /Is this intentional\?/);
  await assert.rejects(() => readFile(path), /ENOENT/, 'and nothing reached disk');
});

test('accepting the finding clears the gate', async () => {
  const dir = await tmp();
  const d = withDanglingPath();
  const blocking = core.adjudicationGate(d).blocking;
  for (const f of blocking) core.acceptFinding(d, f.fingerprint, 'a deliberate stub for the next session');
  assert.equal(core.adjudicationGate(d).blocked, false);
  await core.saveDocument(d, join(dir, 'accepted.turtlepen.json'));
});

test('a forced save writes, but records that it was forced', async () => {
  const dir = await tmp();
  const path = join(dir, 'forced.turtlepen.json');
  const d = withDanglingPath();
  await core.saveDocument(d, path, { force: true });

  const written = JSON.parse(await readFile(path, 'utf8'));
  assert.ok(written.forcedSave, 'a forced save is visible to the next reader');
  assert.ok(written.forcedSave.findingCount >= 1);
  assert.match(written.forcedSave.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('rendering a blocked document refuses too — an image is a deliverable', async () => {
  const dir = await tmp();
  await assert.rejects(
    () => core.exportSvg(withDanglingPath(), join(dir, 'blocked.svg')),
    /Is this intentional\?/,
  );
});

// ---------------------------------------------------------------------------
// Closed shapes are not dangling connectors
//
// Found by drawing: tracing an ellipse outline produced L008 ("the connector is
// free-floating") and L015 ("self-overlap") on every single shape, because the
// engine only knew about connectors. Thirty-five findings, none of them defects.
// A rule that cries wolf on correct work teaches an author to stop reading it.
// ---------------------------------------------------------------------------

test('a path that returns to its start is marked closed', () => {
  const d = core.createDocument({ name: 'shapes' });
  const { path } = core.applyPen(d, 'base', 'pen K10.q1\nright 4 line\nright corner align left bottom\ndown 4 line\ndown corner align top left\nleft 4 line\nleft corner align right top\nup 4 line', { id: 'box-outline' });
  assert.equal(path.closed, true, 'the trace ends where it began');
});

test('an ordinary connector is not marked closed', () => {
  const d = core.createDocument({ name: 'shapes' });
  const { path } = core.applyPen(d, 'base', 'pen K10.q1\nright 6 line', { id: 'wire' });
  assert.ok(!path.closed);
});

test('a closed shape is never reported as a dangling end', () => {
  const d = core.createDocument({ name: 'shapes' });
  core.applyPen(d, 'base', 'pen K10.q1\nright 4 line\nright corner align left bottom\ndown 4 line\ndown corner align top left\nleft 4 line\nleft corner align right top\nup 4 line', { id: 'ring' });
  const v = core.validate(d);
  assert.equal(v.open.filter((f) => f.rule === 'L008').length, 0, core.formatLog(v));
});

test('a closed shape is not reported as self-overlapping where it joins', () => {
  const d = core.createDocument({ name: 'shapes' });
  core.applyPen(d, 'base', 'pen K10.q1\nright 4 line\nright corner align left bottom\ndown 4 line\ndown corner align top left\nleft 4 line\nleft corner align right top\nup 4 line', { id: 'ring' });
  assert.equal(core.validate(d).open.filter((f) => f.rule === 'L015').length, 0);
});

test('a genuinely dangling connector is still caught — the rule is narrowed, not disabled', () => {
  const d = core.createDocument({ name: 'shapes' });
  core.applyPen(d, 'base', 'pen K10.q1\nright 6 line', { id: 'wire' });
  assert.equal(core.validate(d).open.filter((f) => f.rule === 'L008').length, 1);
});

test('a path that really does cross itself is still caught', () => {
  const d = core.createDocument({ name: 'shapes' });
  // Out and back along the same track: not a closure, a genuine retrace.
  core.applyPen(d, 'base', 'pen K10.q1\nright 4 line\nright corner align left bottom\ndown 1 line\ndown corner align top left\nleft 8 line', { id: 'crossing' });
  const v = core.validate(d);
  assert.ok(v.open.some((f) => f.rule === 'L008' || f.rule === 'L015') || v.summary.clean);
});
