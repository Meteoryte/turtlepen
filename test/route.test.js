/**
 * Connector routing.
 *
 * The contract is narrow on purpose: it emits a pen program and changes
 * nothing. So the tests check that what it emits actually draws what it
 * promised, that it refuses honestly rather than inventing a contorted path,
 * and that it never touches the document.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeProgram } from '../src/core/route.js';
import { createDocument, placeBox, applyPen, validate } from '../src/core/index.js';

function board() {
  const doc = createDocument({ name: 'route', canvas: { cols: 90, rows: 50 } });
  placeBox(doc, 'base', { id: 'a', at: 'D4', span: '12x5', label: 'A' });
  placeBox(doc, 'base', { id: 'b', at: 'D16', span: '12x5', label: 'B' });
  placeBox(doc, 'base', { id: 'c', at: 'AB16', span: '12x5', label: 'C' });
  return doc;
}

test('a clear straight run is found and needs no turns', () => {
  const r = routeProgram(board(), 'base', 'a.S', 'b.N');
  assert.equal(r.clear, true);
  assert.equal(r.turns, 0);
  assert.match(r.program, /^pen from a\.S/);
  assert.match(r.program, /down line to b\.N arrow/);
});

test('the emitted program actually draws a clean connector', () => {
  // The whole promise: what it hands back must validate like anything hand-drawn.
  const doc = board();
  const r = routeProgram(doc, 'base', 'a.S', 'b.N');
  applyPen(doc, 'base', r.program, { id: 'routed' });
  const bad = validate(doc).open.filter((f) => f.severity !== 'S3');
  assert.deepEqual(bad.map((f) => f.rule), [], 'a routed connector must not need repair');
});

test('routing changes nothing by itself', () => {
  const doc = board();
  const before = JSON.stringify(doc);
  routeProgram(doc, 'base', 'a.S', 'b.N');
  routeProgram(doc, 'base', 'a.S', 'c.N');
  assert.equal(JSON.stringify(doc), before, 'route must be a proposal, not a mutation');
});

test('an offset target is reached with turns', () => {
  const doc = board();
  const r = routeProgram(doc, 'base', 'a.S', 'c.N');
  assert.equal(r.clear, true);
  assert.ok(r.turns >= 1, 'reaching a different column needs at least one turn');
  applyPen(doc, 'base', r.program, { id: 'routed' });
  const bad = validate(doc).open.filter((f) => f.severity !== 'S3');
  assert.deepEqual(bad.map((f) => `${f.rule} ${f.actors.join(',')}`), []);
});

test('an occupied track is reported blocked rather than routed around forever', () => {
  const doc = board();
  const first = routeProgram(doc, 'base', 'a.S', 'b.N');
  applyPen(doc, 'base', first.program, { id: 'first' });

  // The same seat is now taken by the path just drawn.
  const second = routeProgram(doc, 'base', 'a.S', 'c.N');
  assert.equal(second.clear, false);
  assert.equal(second.program, null, 'no program is better than an unreadable one');
  assert.match(second.note, /Move something, or draw the path by hand/);
});

test('a blocked route names what is in the way', () => {
  const doc = board();
  placeBox(doc, 'base', { id: 'wall', at: 'D11', span: '12x3', label: 'wall' });
  const r = routeProgram(doc, 'base', 'a.S', 'b.N');
  assert.equal(r.clear, false);
  assert.equal(r.blockedBy.by, 'wall', 'naming the obstacle is the useful part');
  assert.match(r.blockedBy.at, /^[A-Z]+\d+/, 'and where it blocks');
});

test('every attempt it made is reported, not just the outcome', () => {
  const doc = board();
  placeBox(doc, 'base', { id: 'wall', at: 'D11', span: '12x3', label: 'wall' });
  const r = routeProgram(doc, 'base', 'a.S', 'b.N');
  assert.ok(Array.isArray(r.tried) && r.tried.length > 0);
  for (const t of r.tried) assert.equal(typeof t.turns, 'number');
});

test('faces are required on both ends', () => {
  const doc = board();
  assert.throws(() => routeProgram(doc, 'base', 'a', 'b.N'), /needs faces on both ends/);
  assert.throws(() => routeProgram(doc, 'base', 'a.S', 'b'), /needs faces on both ends/);
});

test('an unknown element is refused by name', () => {
  const doc = board();
  assert.throws(() => routeProgram(doc, 'base', 'nope.S', 'b.N'), /no element "nope"/);
});

// ---------------------------------------------------------------------------
// A proposal the parser rejects is worse than no proposal.
//
// `route` converts a quadrant distance to cells by halving it. An odd run
// therefore came out as "left 0.5 line", which the pen grammar refuses — the
// router was handing back a program it could not itself run. Found while
// rebuilding the showcase flowchart, where two ports happened to land an odd
// number of quadrants apart.
// ---------------------------------------------------------------------------

test('every route the engine proposes is a program the pen can actually run', () => {
  // Sweep offsets so some port pairs land an odd number of quadrants apart.
  let proposed = 0;
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = 0; dx < 6; dx++) {
      const d = createDocument({ name: 'route-parse', canvas: { cols: 90, rows: 50 } });
      placeBox(d, 'base', { id: 'a', at: 'D4', span: '5x3' });
      placeBox(d, 'base', { id: 'b', at: `${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[12 + dx]}${12 + dy}`, span: '5x3' });

      for (const [from, to] of [['a.S', 'b.N'], ['a.E', 'b.W'], ['a.S', 'b.W']]) {
        const r = routeProgram(d, 'base', from, to);
        if (!r.clear) continue;
        proposed += 1;
        assert.doesNotMatch(r.program, /\d+\.\d+/, `fractional distance in: ${r.program}`);
        // The real proof is that it runs.
        const fresh = createDocument({ name: 'x', canvas: { cols: 90, rows: 50 } });
        placeBox(fresh, 'base', { id: 'a', at: 'D4', span: '5x3' });
        placeBox(fresh, 'base', { id: 'b', at: `${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[12 + dx]}${12 + dy}`, span: '5x3' });
        assert.doesNotThrow(
          () => applyPen(fresh, 'base', r.program, { id: 'wire' }),
          `route proposed an unparseable program: ${r.program}`,
        );
      }
    }
  }
  assert.ok(proposed > 10, `expected the sweep to produce routes, got ${proposed}`);
});
