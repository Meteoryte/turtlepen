/**
 * Flowchart semantic rules.
 *
 * Each rule is tested twice: that it fires on a chart that breaks the
 * convention, and that it stays silent on one that does not. A rule only
 * proven to stay silent is indistinguishable from a rule that does nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDocument, placeBox, applyPen, validate } from '../src/core/index.js';

const rules = (doc) => validate(doc).open.map((f) => f.rule);

/** A minimal well-formed chart: one start, one decision that branches, one end. */
function goodChart() {
  const doc = createDocument({ name: 'good', canvas: { cols: 90, rows: 70 } });
  placeBox(doc, 'base', { id: 'start', at: 'T4', span: '20x6', label: 'Start', shape: 'terminator' });
  placeBox(doc, 'base', { id: 'ask', at: 'T14', span: '20x9', label: 'Ready?', shape: 'decision' });
  placeBox(doc, 'base', { id: 'done', at: 'T30', span: '20x6', label: 'Done', shape: 'terminator' });
  placeBox(doc, 'base', { id: 'fix', at: 'B14', span: '14x9', label: 'Fix it' });
  applyPen(doc, 'base', 'pen from start.S\ndown line to ask.N arrow', { id: 'e1' });
  applyPen(doc, 'base', 'pen from ask.S\ndown line to done.N arrow', { id: 'e2' });
  applyPen(doc, 'base', 'pen from ask.W\nleft line to fix.E arrow', { id: 'e3' });
  return doc;
}

test('a well-formed chart raises no flowchart findings', () => {
  const found = rules(goodChart()).filter((r) => r.startsWith('F'));
  assert.deepEqual(found, [], 'a correct chart must be silent');
});

test('F001 fires when a second terminator has nothing leading into it', () => {
  const doc = goodChart();
  // A stray end that nothing points at reads as a second beginning.
  placeBox(doc, 'base', { id: 'stray', at: 'AT4', span: '20x6', label: 'Also start?', shape: 'terminator' });
  const open = validate(doc).open.filter((f) => f.rule === 'F001');
  assert.equal(open.length, 1);
  assert.equal(open[0].severity, 'S1');
  assert.ok(open[0].actors.includes('stray'));
  assert.ok(open[0].actors.includes('start'));
  assert.match(open[0].message, /one beginning/);
});

test('F002 fires on a decision with only one way out', () => {
  const doc = createDocument({ name: 'one-way', canvas: { cols: 90, rows: 70 } });
  placeBox(doc, 'base', { id: 'start', at: 'T4', span: '20x6', label: 'Start', shape: 'terminator' });
  placeBox(doc, 'base', { id: 'ask', at: 'T14', span: '20x9', label: 'Ready?', shape: 'decision' });
  placeBox(doc, 'base', { id: 'done', at: 'T30', span: '20x6', label: 'Done', shape: 'terminator' });
  applyPen(doc, 'base', 'pen from start.S\ndown line to ask.N arrow', { id: 'e1' });
  applyPen(doc, 'base', 'pen from ask.S\ndown line to done.N arrow', { id: 'e2' });

  const open = validate(doc).open.filter((f) => f.rule === 'F002');
  assert.equal(open.length, 1);
  assert.equal(open[0].actors[0], 'ask');
  assert.equal(open[0].metrics.outgoing, 1);
});

test('F002 offers a fix that is actually applicable', () => {
  const doc = createDocument({ name: 'dead-end', canvas: { cols: 60, rows: 40 } });
  placeBox(doc, 'base', { id: 'lonely', at: 'J6', span: '20x9', label: 'Well?', shape: 'decision' });
  const f = validate(doc).open.find((x) => x.rule === 'F002');
  assert.ok(f, 'a decision with no branches must be reported');
  // "it is a process step drawn as a diamond" has to be actionable, not just true.
  const shapeFix = f.fixes.find((x) => x.kind === 'shape');
  assert.ok(shapeFix, 'F002 must offer the restyle route');
  assert.equal(shapeFix.to, 'process');
});

test('the rules stay out of documents that are not flowcharts', () => {
  // The existing corpus is all plain rectangles. Nothing may be reclassified.
  const doc = createDocument({ name: 'plain', canvas: { cols: 60, rows: 40 } });
  placeBox(doc, 'base', { id: 'a', at: 'D4', span: '16x5', label: 'A box' });
  placeBox(doc, 'base', { id: 'b', at: 'D14', span: '16x5', label: 'Another' });
  assert.deepEqual(rules(doc).filter((r) => r.startsWith('F')), []);
});

test('edges come from what the author stated, not from proximity', () => {
  // A path merely passing near a node must not count as leaving it.
  const doc = createDocument({ name: 'adjacency', canvas: { cols: 90, rows: 60 } });
  placeBox(doc, 'base', { id: 'start', at: 'T4', span: '20x6', label: 'Start', shape: 'terminator' });
  placeBox(doc, 'base', { id: 'ask', at: 'T14', span: '20x9', label: 'Ready?', shape: 'decision' });
  applyPen(doc, 'base', 'pen from start.S\ndown line to ask.N arrow', { id: 'e1' });
  // Two unauthored strokes drawn beside the decision, naming no source.
  applyPen(doc, 'base', 'pen AR16\nright 6 line', { id: 'loose1', role: 'artwork' });
  applyPen(doc, 'base', 'pen AR20\nright 6 line', { id: 'loose2', role: 'artwork' });

  const f = validate(doc).open.find((x) => x.rule === 'F002');
  assert.ok(f, 'strokes that merely pass by must not be counted as branches');
  assert.equal(f.metrics.outgoing, 0);
});
