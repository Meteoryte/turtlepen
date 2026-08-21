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
import { createDocument, placeBox, applyPen, validate, findElement } from '../src/core/index.js';

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

// --- what layout needs from the router --------------------------------------

test('the port slot survives routing instead of being thrown away', () => {
  const doc = board();
  const plain = routeProgram(doc, 'base', 'a.S', 'c.N');
  const slotted = routeProgram(doc, 'base', 'a.S#2', 'c.N');
  assert.match(slotted.program, /^pen from a\.S#2\b/, 'the emitted program must keep the slot');
  assert.notEqual(
    /line to ([A-Z]+\d+\.q\d)/.exec(plain.program)[1],
    /line to ([A-Z]+\d+\.q\d)/.exec(slotted.program)[1],
    'a different slot must leave the box at a different quadrant',
  );
});

test('a named track puts the crossing leg exactly where the caller asked', () => {
  const doc = board();
  const low = routeProgram(doc, 'base', 'a.S', 'c.N', { track: 20 });
  const high = routeProgram(doc, 'base', 'a.S', 'c.N', { track: 24 });
  assert.equal(low.turns, 2);
  assert.equal(high.turns, 2);
  const rowOf = (program) => /line to [A-Z]+(\d+)\.q\d/.exec(program)[1];
  assert.notEqual(rowOf(low.program), rowOf(high.program));
  // Two connectors between the same pair of ranks must be able to run on
  // different lines; sharing the midpoint is what made them overlap.
  assert.notEqual(low.program, high.program);
});

test('avoid "boxes" treats a connector as a crossing and a box as a wall', () => {
  const doc = board();
  // Fill the direct channel between a and b with a connector.
  applyPen(doc, 'base', 'pen from a.S\ndown line to b.N arrow', { id: 'blocker' });

  const strict = routeProgram(doc, 'base', 'a.S#2', 'b.N#2');
  const lenient = routeProgram(doc, 'base', 'a.S#2', 'b.N#2', { avoid: 'boxes' });
  assert.equal(lenient.clear, true, 'crossing another line is a crossing, not a failure');
  assert.ok(strict.tried.length > 0);

  // A box is still a wall either way.
  placeBox(doc, 'base', { id: 'wall', at: 'D10', span: '12x3', label: 'Wall' });
  const blocked = routeProgram(doc, 'base', 'a.S', 'b.N', { avoid: 'boxes' });
  assert.equal(blocked.clear, false, 'a box in the channel still refuses the route');
  assert.equal(blocked.blockedBy.by, 'wall');
});

test('a loop back up the page arrives travelling toward its target', () => {
  // Out of one right face, up the margin, back in the other right face. The
  // two faces point the same way, so the leg that arrives runs OPPOSITE to the
  // leg that left — the case where reusing the first direction emitted a
  // program the pen refused.
  // Its own board: a loop-back runs up the outside, so anything parked out
  // there is testing clearance rather than direction.
  const doc = createDocument({ name: 'loop', canvas: { cols: 90, rows: 50 } });
  placeBox(doc, 'base', { id: 'a', at: 'D4', span: '12x5', label: 'A' });
  placeBox(doc, 'base', { id: 'b', at: 'D16', span: '12x5', label: 'B' });
  const margin = Math.max(...['a', 'b'].map((id) => {
    const { rect } = findElement(doc, id).element;
    return rect.x + rect.w;
  })) + 4;
  const r = routeProgram(doc, 'base', 'b.E', 'a.E', { track: margin });
  assert.ok(r.program, `a margin loop-back must be routable: ${r.note ?? ''}`);
  assert.match(r.program, /left line to a\.E arrow$/, 'the final leg travels back toward the target');
  // And it has to actually run: the program and the geometry cannot disagree.
  assert.doesNotThrow(() => applyPen(doc, 'base', r.program, { id: 'loop' }));
});
