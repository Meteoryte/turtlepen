import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';

const doc = () => core.createDocument({ name: 'test' });
const rules = (v) => v.open.map((f) => f.rule);
const byRule = (v, rule) => v.open.filter((f) => f.rule === rule);

test('same-page overlap is critical and names the exact quadrants', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'api', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'api' });
  core.placeBox(d, 'base', { id: 'db', at: 'F4.tl', span: { w: 6, h: 3 }, label: 'db' });

  const v = core.validate(d);
  const hit = byRule(v, 'L001');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].severity, 'S0');
  assert.deepEqual(hit[0].actors.sort(), ['api', 'db']);
  assert.ok(hit[0].cells.length > 0, 'reports the colliding quadrants');
  assert.ok(hit[0].fixes.length > 0, 'every finding carries a fix');
});

test('text overflow is a first-class collision, not a rendering surprise', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'norm', at: 'C4.tl', span: { w: 6, h: 4 }, label: 'Ingest & Normalize Payload' });

  const v = core.validate(d);
  assert.ok(rules(v).includes('L002'), 'width overflow');
  assert.ok(rules(v).includes('L003'), 'height overflow');
  const w = byRule(v, 'L002')[0];
  assert.equal(w.severity, 'S1');
  assert.match(w.message, /over by 4px/);
  assert.equal(w.metrics.charsPerLine, 8);
});

test('a well-sized box produces no fit findings', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'norm', at: 'C4.tl', span: { w: 12, h: 5 }, label: 'Ingest & Normalize Payload' });
  const v = core.validate(d);
  assert.equal(byRule(v, 'L002').length, 0);
  assert.equal(byRule(v, 'L003').length, 0);
});

test('corner style decides whether a crossing stroke is an error or a note', () => {
  const square = doc();
  core.placeBox(square, 'base', { id: 'box', at: 'F6.tl', span: { w: 4, h: 2 }, corner: 'square' });
  core.applyPen(square, 'base', 'pen F5.q1\ndown align left line to F6.q3', { id: 'wire' });
  assert.ok(rules(core.validate(square)).includes('L004'), 'a square box is inked to its corner');

  const rounded = doc();
  core.placeBox(rounded, 'base', { id: 'box', at: 'F6.tl', span: { w: 4, h: 2 }, corner: 'rounded' });
  core.applyPen(rounded, 'base', 'pen F5.q1\ndown align left line to F6.q3', { id: 'wire' });
  const v = core.validate(rounded);
  assert.ok(!rules(v).includes('L004'), 'the rounded corner is claimed but not inked');
  const note = byRule(v, 'L013')[0];
  assert.ok(note, 'the pass-through is still reported, as information');
  assert.equal(note.severity, 'S3');
});

test('a stroke through the body of a box is an error whatever the corner style', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'box', at: 'F6.tl', span: { w: 4, h: 3 }, corner: 'rounded' });
  core.applyPen(d, 'base', 'pen G5.q1\ndown 3 align left line', { id: 'wire' });
  const hit = byRule(core.validate(d), 'L004')[0];
  assert.ok(hit);
  assert.equal(hit.severity, 'S1');
  assert.deepEqual(hit.actors.sort(), ['box', 'wire']);
});

test('page intent decides the severity of the same geometry', () => {
  const overlayDoc = doc();
  core.placeBox(overlayDoc, 'base', { id: 'db', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'db' });
  core.addPage(overlayDoc, { id: 'notes', z: 1, intent: 'overlay' });
  core.placeBox(overlayDoc, 'notes', { id: 'tip', at: 'C4.tl', span: { w: 2, h: 1 }, label: '!' });

  const v1 = core.validate(overlayDoc);
  assert.equal(byRule(v1, 'L010').length, 1, 'expected overlap on an overlay page is information');
  assert.equal(byRule(v1, 'L010')[0].severity, 'S3');
  assert.equal(byRule(v1, 'L005').length, 0);

  const exclusiveDoc = doc();
  core.placeBox(exclusiveDoc, 'base', { id: 'db', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'db' });
  core.addPage(exclusiveDoc, { id: 'east', z: 1, intent: 'exclusive' });
  core.placeBox(exclusiveDoc, 'east', { id: 'gw', at: 'C4.tl', span: { w: 2, h: 1 }, label: 'gw' });

  const v2 = core.validate(exclusiveDoc);
  assert.equal(byRule(v2, 'L005').length, 1, 'the same overlap on an exclusive page is an error');
  assert.equal(byRule(v2, 'L005')[0].severity, 'S1');
  assert.ok(byRule(v2, 'L005')[0].fixes.some((f) => f.kind === 'intent'), 'suggests declaring overlay intent');
});

test('an overlay that crosses a lower label is an error, not harmless layering', () => {
  const d = doc();
  core.placeBox(d, 'base', {
    id: 'checkout', at: 'C4.tl', span: { w: 16, h: 3 }, label: 'Checkout Orchestrator',
  });
  core.addPage(d, { id: 'review', z: 1, intent: 'overlay' });
  core.placeBox(d, 'review', {
    id: 'slow', at: 'E4.tl', span: { w: 10, h: 3 }, label: 'p95 4.2s',
  });

  const v = core.validate(d);
  const hit = byRule(v, 'L021')[0];
  assert.ok(hit, 'the overlay must report the text it hides');
  assert.equal(hit.severity, 'S1');
  assert.deepEqual(hit.actors.sort(), ['checkout', 'slow']);
  assert.ok(hit.cells.length > 0, 'the finding names the obscured quadrants');
  assert.ok(hit.fixes.some((f) => f.kind === 'move'));
  assert.equal(v.summary.clean, false);
});

test('an overlay may cross a box border without obscuring its label', () => {
  const d = doc();
  core.placeBox(d, 'base', {
    id: 'checkout', at: 'C6.tl', span: { w: 16, h: 5 }, label: 'Checkout Orchestrator',
  });
  core.addPage(d, { id: 'review', z: 1, intent: 'overlay' });
  core.placeBox(d, 'review', {
    id: 'slow', at: 'K4.tl', span: { w: 10, h: 3 }, label: 'p95 4.2s',
  });

  const v = core.validate(d);
  assert.equal(byRule(v, 'L010').length, 1, 'the deliberate border overlap remains visible');
  assert.equal(byRule(v, 'L021').length, 0, 'the label remains readable');
});

test('the AI adjudicates intent, and the acceptance lapses when geometry changes', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });

  const before = core.validate(d);
  const finding = byRule(before, 'L001')[0];
  core.acceptFinding(d, finding.fingerprint, 'the two panes deliberately share a border');

  const after = core.validate(d);
  assert.equal(byRule(after, 'L001').length, 0, 'accepted findings leave the open list');
  assert.equal(after.accepted.length, 1);
  assert.equal(after.accepted[0].reason, 'the two panes deliberately share a border');
  assert.equal(d.acceptances[0].rule, 'L001');
  assert.equal(d.acceptances[0].page, 'base');
  assert.equal(after.staleAcceptances.length, 0);

  core.moveElement(d, 'b', 2, 0);
  const moved = core.validate(d);
  assert.equal(byRule(moved, 'L001').length, 1, 'new geometry means a new finding, not a suppressed one');
  assert.equal(moved.staleAcceptances.length, 1, 'the old acceptance is reported as stale');
  assert.notEqual(byRule(moved, 'L001')[0].fingerprint, finding.fingerprint);
  const log = core.formatLog(moved);
  assert.match(log, /L001 page:base/);
  assert.doesNotMatch(log, /undefined/);
});

test('accepting without a reason is refused', () => {
  const d = doc();
  assert.throws(() => core.acceptFinding(d, 'abc123', '   '), /requires a reason/);
});

test('accepting an unknown or expired fingerprint is refused without leaving a stale record', () => {
  const d = doc();
  assert.throws(
    () => core.acceptFinding(d, 'abc123', 'not a real finding'),
    /not a current finding/,
  );
  assert.deepEqual(d.acceptances, []);
});

test('touching boxes are flagged for having no gutter', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.placeBox(d, 'base', { id: 'b', at: 'G4.tl', span: { w: 4, h: 2 } });
  const v = core.validate(d);
  assert.equal(byRule(v, 'L001').length, 0, 'they do not overlap');
  assert.equal(byRule(v, 'L007').length, 1, 'but they touch');
});

test('a free-floating connector is reported once, not once per end', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 3 align top line', { id: 'wire' });
  const hits = byRule(core.validate(d), 'L008');
  assert.equal(hits.length, 1, 'one finding per path, not two');
  assert.deepEqual(hits[0].metrics.looseEnds, ['start', 'end']);
  assert.match(hits[0].message, /either end/);
  assert.equal(hits[0].cells.length, 2, 'but it still names both loose quadrants');
});

test('a connector anchored at one end reports only the loose end', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'src', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.applyPen(d, 'base', 'pen G4.q1\nright 3 align top line', { id: 'wire' });
  const hits = byRule(core.validate(d), 'L008');
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].metrics.looseEnds, ['end']);
});

test('findings are ranked most severe first', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 }, label: 'Ingest & Normalize Payload' });
  core.placeBox(d, 'base', { id: 'b', at: 'E4.tl', span: { w: 6, h: 3 } });
  const v = core.validate(d);
  const order = { S0: 0, S1: 1, S2: 2, S3: 3 };
  const ranks = v.open.map((f) => order[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y), 'sorted by severity');
  assert.equal(v.summary.clean, false);
  assert.equal(v.summary.total, v.open.length);
});

test('a duplicate id is critical because targets become ambiguous', () => {
  const d = doc();
  core.addPage(d, { id: 'top', z: 1, intent: 'overlay' });
  core.placeBox(d, 'base', { id: 'db', at: 'C4.tl', span: { w: 2, h: 1 } });
  d.elements.top.push({ id: 'db', kind: 'box', rect: { x: 40, y: 40, w: 4, h: 2 }, label: '', fontSize: 10, corner: 'square', align: 'left' });
  assert.ok(rules(core.validate(d)).includes('L012'));
});

test('the log renders with severity, fingerprint and fixes', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const log = core.formatLog(core.validate(d));
  assert.match(log, /CRITICAL/);
  assert.match(log, /L001 node overlap/);
  assert.match(log, /status: NOT CLEAN/);
  assert.match(log, /fix:/);
});

// ---------------------------------------------------------------------------
// Reason quality — a fingerprint proves a finding is real, never that it was
// considered. These came from a session that accepted 145 findings in `for`
// loops with `reason: `${label}: ${f.rule}``, producing four diagrams that
// reported CLEAN while carrying 26 broken strokes.
// ---------------------------------------------------------------------------

test('a reason that only restates the finding rule is refused', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const f = byRule(core.validate(d), 'L001')[0];

  for (const empty of ['L001', 'overlay composition: L001', 'informational: L001', 'pipeline: L001']) {
    assert.throws(() => core.acceptFinding(d, f.fingerprint, empty), /restates/, `should refuse "${empty}"`);
  }
  assert.deepEqual(d.acceptances, [], 'a refused acceptance leaves no record');
});

test('citing the rule is fine when the reason also explains it', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const f = byRule(core.validate(d), 'L001')[0];

  core.acceptFinding(d, f.fingerprint, 'L001 here is deliberate — the sky band is meant to run under the tower to the canvas edge');
  assert.equal(d.acceptances.length, 1);
});

test('a reason naming a different rule than the one accepted is not a restatement', () => {
  // The wireframe tool accepts an L007 with a reason that mentions L001 to draw
  // the contrast. Keying the check to any rule code instead of the finding's
  // own rule would break the engine's own acceptances.
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.placeBox(d, 'base', { id: 'b', at: 'G4.tl', span: { w: 4, h: 2 } });
  const f = byRule(core.validate(d), 'L007')[0];

  core.acceptFinding(d, f.fingerprint, 'touching is the limit case, not an encroachment — an encroachment would report as L001');
  assert.equal(d.acceptances.length, 1);
});

test('one reason cannot be spread verbatim across an unlimited number of findings', () => {
  const d = doc();
  // 24 overlapping pairs — the shape of the server-room batch that accepted
  // 24 L001s under the single string "server room: L001".
  for (let i = 0; i < 24; i++) {
    const row = 4 + i * 4;
    core.placeBox(d, 'base', { id: `a${i}`, at: `C${row}.tl`, span: { w: 6, h: 3 } });
    core.placeBox(d, 'base', { id: `b${i}`, at: `F${row}.tl`, span: { w: 6, h: 3 } });
  }
  const reason = 'these panes deliberately share a border for the exploded view';
  const prints = byRule(core.validate(d), 'L001').map((f) => f.fingerprint);
  assert.ok(prints.length >= 16, `fixture needs >15 findings, got ${prints.length}`);

  // Fifteen is the corpus-calibrated limit: art-deco-hero honestly repeats one
  // rationale across fourteen frame members, so that has to keep working.
  for (let i = 0; i < 15; i++) core.acceptFinding(d, prints[i], reason);
  assert.equal(d.acceptances.length, 15, 'fifteen identical reasons are allowed');

  assert.throws(() => core.acceptFinding(d, prints[15], reason), /already explains 15/);
  assert.equal(d.acceptances.length, 15, 'the refused sixteenth leaves no record');

  // A distinct reason for the same finding still lands.
  core.acceptFinding(d, prints[15], 'this pair is the cutaway seam, judged separately from the others');
  assert.equal(d.acceptances.length, 16);
});

test('re-accepting the same fingerprint with the same reason is an update, not a repeat', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const f = byRule(core.validate(d), 'L001')[0];
  const reason = 'the two panes deliberately share a border for the exploded view';

  core.acceptFinding(d, f.fingerprint, reason);
  core.acceptFinding(d, f.fingerprint, reason);
  assert.equal(d.acceptances.length, 1);
});

// ---------------------------------------------------------------------------
// L025 — depth flattened onto one page.
//
// The lattice has no z-buffer, so "in front of" is not a property an element
// holds; it is which page the element sits on. A projected scene that puts
// everything on one page has thrown its depth away, and the symptom is a pile
// of L006 "will render as a merged line" findings — which is exactly what
// showcase-perspective accepted ten of.
// ---------------------------------------------------------------------------

test('two things at different depths sharing a page cannot occlude each other', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'monitor', at: 'C4.tl', span: { w: 10, h: 6 } });
  core.placeBox(d, 'base', { id: 'cable', at: 'F6.tl', span: { w: 10, h: 3 } });
  core.findElement(d, 'monitor').element.depth = 90;
  core.findElement(d, 'cable').element.depth = 30;

  const hit = byRule(core.validate(d), 'L025');
  assert.equal(hit.length, 1, 'the overlap is a depth conflict, not just an overlap');
  assert.deepEqual(hit[0].actors.sort(), ['cable', 'monitor']);
  assert.match(hit[0].message, /page/i);

  // `layer`, not `move`: a move is a distance in cells, and changing which
  // page a thing sits on is a different action with a different vocabulary.
  const fix = hit[0].fixes.find((f) => f.kind === 'layer');
  assert.ok(fix, `expected a layer fix, got ${hit[0].fixes.map((f) => f.kind).join(', ')}`);
  assert.equal(fix.params.id, 'cable', 'the NEARER thing is the one that moves up');
  assert.ok(fix.params.toPage, 'and the fix names a destination page');
});

test('the same overlap on separate pages is depth working, not a finding', () => {
  const d = doc();
  core.addPage(d, { id: 'near', z: 1, intent: 'overlay' });
  core.placeBox(d, 'base', { id: 'monitor', at: 'C4.tl', span: { w: 10, h: 6 } });
  core.placeBox(d, 'near', { id: 'cable', at: 'F6.tl', span: { w: 10, h: 3 } });
  core.findElement(d, 'monitor').element.depth = 90;
  core.findElement(d, 'cable').element.depth = 30;

  assert.equal(byRule(core.validate(d), 'L025').length, 0);
});

test('things at the same depth sharing a page are not a depth conflict', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 10, h: 6 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F6.tl', span: { w: 10, h: 3 } });
  core.findElement(d, 'a').element.depth = 90;
  core.findElement(d, 'b').element.depth = 92;

  assert.equal(byRule(core.validate(d), 'L025').length, 0, 'a flat scene is a legitimate drawing');
});

test('elements with no depth recorded are never judged on depth', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 10, h: 6 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F6.tl', span: { w: 10, h: 3 } });
  assert.equal(byRule(core.validate(d), 'L025').length, 0, 'a flowchart has no depth to get wrong');
});
