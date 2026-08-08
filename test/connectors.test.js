/**
 * Connector ergonomics.
 *
 * Every test here corresponds to a mistake made during a real authoring session
 * (`examples/agent-session.js`), not to a hypothesis about what might go wrong.
 * The first run of that session produced four dangling connectors from entirely
 * natural usage; these lock in the fixes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { runPen } from '../src/core/pen.js';
import { approachPoint, portPoint } from '../src/core/shapes.js';
import { quadToAddress } from '../src/core/address.js';
import { rect } from '../src/core/geometry.js';

const doc = () => core.createDocument({ name: 'connectors' });
const byRule = (v, rule) => v.open.filter((f) => f.rule === rule);

// ---------------------------------------------------------------------------
// Seats: where a connector should start
// ---------------------------------------------------------------------------

test('a seat sits outside the box on every face, which is not symmetric', () => {
  const r = rect(4, 6, 32, 6); // C4, 16x3 cells
  // The south and east faces are already outside the box; north and west are
  // the box's own first row and column, so they step back by one.
  assert.deepEqual(approachPoint(r, 'S'), { x: 20, y: 12, facing: 'down' });
  assert.deepEqual(approachPoint(r, 'E'), { x: 36, y: 9, facing: 'right' });
  assert.deepEqual(approachPoint(r, 'N'), { x: 20, y: 5, facing: 'up' });
  assert.deepEqual(approachPoint(r, 'W'), { x: 3, y: 9, facing: 'left' });
});

test('a corner is not a seat, because it does not say which way to leave', () => {
  assert.throws(() => approachPoint(rect(0, 0, 8, 4), 'NE'), /not a cardinal face/);
});

test('pen from <id>.<face> seats the cursor and faces it outward', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'gateway', at: 'C4.tl', span: { w: 16, h: 3 } });
  const r = runPen('pen from gateway.S', { resolveElement: (id) => core.findElement(d, id)?.element ?? null });
  assert.equal(quadToAddress(r.cursor.x, r.cursor.y), 'K7.q1');
  assert.equal(r.facing, 'down');
});

test('a connector seated at a port and left to its defaults lands on the port', () => {
  // The original failure: the default alignment was a fixed side, so a stroke
  // leaving a seated cursor shifted one quadrant off the port it aimed at.
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 16, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'C12.tl', span: { w: 16, h: 3 } });
  core.applyPen(d, 'base', 'pen from a.S\ndown line to b.N arrow', { id: 'wire' });

  const v = core.validate(d);
  assert.equal(byRule(v, 'L008').length, 0, 'nothing dangles');
  assert.equal(byRule(v, 'L016').length, 0, 'the target is reached');
  assert.equal(byRule(v, 'L004').length, 0, 'and it does not enter either box');
  assert.ok(v.summary.clean);
});

test('an explicit alignment still wins over the carried track', () => {
  const r = runPen('pen C4.q1\ndown 2 align right line');
  assert.equal(r.pieces[0].align, 'right');
  assert.equal(r.pieces[0].x, 5, 'snapped onto the right half of the cell');
});

test('the carried track is followed when no alignment is given', () => {
  const left = runPen('pen C4.q1\ndown 2 line');   // q1 is the left half
  const right = runPen('pen C4.q2\ndown 2 line');  // q2 is the right half
  assert.equal(left.pieces[0].align, 'left');
  assert.equal(right.pieces[0].align, 'right');
  assert.equal(left.pieces[0].x, 4);
  assert.equal(right.pieces[0].x, 5);
});

// ---------------------------------------------------------------------------
// Arrival: "to" sets a distance, not a destination
// ---------------------------------------------------------------------------

test('a path that names a target but stops short of it is reported', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'src', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'far', at: 'W20.tl', span: { w: 6, h: 3 } });
  // Travels the right distance downward, but in the wrong column entirely.
  core.applyPen(d, 'base', 'pen from src.S\ndown line to far.N arrow', { id: 'wire' });

  const hit = byRule(core.validate(d), 'L016')[0];
  assert.ok(hit, 'the miss is caught');
  assert.equal(hit.severity, 'S2');
  assert.deepEqual(hit.actors.sort(), ['far', 'wire']);
  assert.ok(hit.metrics.gapQuadrantsX > 0, 'and the sideways gap is quantified');
  assert.match(hit.message, /aimed at "far\.N"/);
});

test('targeting a box on an intermediate leg is not a miss', () => {
  // "Go right until level with it, then turn" is correct usage. Judging arrival
  // per command would cry wolf on every multi-leg route.
  const d = doc();
  core.placeBox(d, 'base', { id: 'src', at: 'C20.tl', span: { w: 16, h: 3 } });
  core.placeBox(d, 'base', { id: 'dst', at: 'W12.tl', span: { w: 16, h: 3 } });
  core.applyPen(
    d,
    'base',
    `
    pen from src.E
    right 1 line
    right corner align left top
    up line to dst.W
    up corner align bottom right
    right line to dst.W arrow
    `,
    { id: 'route' },
  );

  const v = core.validate(d);
  assert.equal(byRule(v, 'L016').length, 0, core.formatLog(v));
  assert.equal(byRule(v, 'L008').length, 0);
  assert.ok(v.summary.clean, core.formatLog(v));
});

test('a path aiming at a bare address is not target-checked', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen A1.q1\nright line to E1.q1', { id: 'wire' });
  assert.equal(byRule(core.validate(d), 'L016').length, 0, 'only named elements are destinations');
});

// ---------------------------------------------------------------------------
// Arrival is symmetric in all four directions
//
// Found by authoring a diagram, not by inspection: a connector running LEFT into
// an east face, or UP into a south face, stopped two quadrants clear of the box
// while the mirror-image runs landed on the seat. The cause was portPoint mixing
// conventions — N and W resolved to the box's own first row/column, S and E to
// the exclusive edge one quadrant OUTSIDE it. Since a line's last piece lands
// one quadrant before the resolved point, that asymmetry only ever showed up in
// the decreasing directions.
// ---------------------------------------------------------------------------

test('a port resolves to the box\'s own edge quadrant on every side', () => {
  const r = rect(4, 6, 32, 6); // C4, 16x3 cells — quadrants x 4..35, y 6..11
  // The invariant that makes arrival symmetric: the seat is always the port
  // plus one step outward, so every direction can share one code path.
  assert.deepEqual(portPoint(r, 'N'), { x: 20, y: 6 });
  assert.deepEqual(portPoint(r, 'W'), { x: 4, y: 9 });
  assert.deepEqual(portPoint(r, 'S'), { x: 20, y: 11 }, 'the box\'s last row, not one past it');
  assert.deepEqual(portPoint(r, 'E'), { x: 35, y: 9 }, 'the box\'s last column, not one past it');

  for (const [face, d] of [['N', [0, -1]], ['S', [0, 1]], ['W', [-1, 0]], ['E', [1, 0]]]) {
    const port = portPoint(r, face);
    const seat = approachPoint(r, face);
    assert.deepEqual(
      { x: seat.x, y: seat.y },
      { x: port.x + d[0], y: port.y + d[1] },
      `the ${face} seat is one step outward from the ${face} port`,
    );
  }
});

test('a corner port resolves inside the box, not diagonally outside it', () => {
  const r = rect(4, 6, 32, 6);
  assert.deepEqual(portPoint(r, 'NW'), { x: 4, y: 6 });
  assert.deepEqual(portPoint(r, 'NE'), { x: 35, y: 6 });
  assert.deepEqual(portPoint(r, 'SW'), { x: 4, y: 11 });
  assert.deepEqual(portPoint(r, 'SE'), { x: 35, y: 11 });
});

test('a connector arrives cleanly travelling in any of the four directions', () => {
  // Identical geometry, mirrored. Any direction that reports a finding here is
  // an asymmetry in the engine, not in the drawing.
  const cases = [
    ['right', 'hub', 'C20', 'W20', 'pen from src.E\nright line to dst.W arrow'],
    ['down', 'hub', 'C20', 'C32', 'pen from src.S\ndown line to dst.N arrow'],
    ['left', 'hub', 'W20', 'C20', 'pen from src.W\nleft line to dst.E arrow'],
    ['up', 'hub', 'C32', 'C20', 'pen from src.N\nup line to dst.S arrow'],
  ];
  for (const [dir, , srcAt, dstAt, program] of cases) {
    const d = doc();
    core.placeBox(d, 'base', { id: 'src', at: `${srcAt}.tl`, span: { w: 12, h: 3 } });
    core.placeBox(d, 'base', { id: 'dst', at: `${dstAt}.tl`, span: { w: 12, h: 3 } });
    core.applyPen(d, 'base', program, { id: 'wire' });

    const v = core.validate(d);
    assert.equal(byRule(v, 'L016').length, 0, `travelling ${dir} reaches its target — ${core.formatLog(v)}`);
    assert.equal(byRule(v, 'L008').length, 0, `travelling ${dir} does not dangle — ${core.formatLog(v)}`);
    assert.equal(byRule(v, 'L004').length, 0, `travelling ${dir} stops outside the box — ${core.formatLog(v)}`);
    assert.ok(v.summary.clean, `travelling ${dir} is clean — ${core.formatLog(v)}`);
  }
});

test('an arrowhead travelling left or up lands on the seat, not past it', () => {
  // The exact footprint, because "no findings" would also be satisfied by a
  // path that stopped one quadrant too far and happened to dodge every rule.
  const d = doc();
  core.placeBox(d, 'base', { id: 'src', at: 'W20.tl', span: { w: 12, h: 3 } });
  core.placeBox(d, 'base', { id: 'dst', at: 'C20.tl', span: { w: 12, h: 3 } });
  core.applyPen(d, 'base', 'pen from src.W\nleft line to dst.E arrow', { id: 'wire' });

  const { element } = core.findElement(d, 'wire');
  const tip = element.pieces.at(-1);
  const seat = approachPoint(core.findElement(d, 'dst').element.rect, 'E');
  assert.equal(tip.type, 'arrow');
  assert.deepEqual({ x: tip.x, y: tip.y }, { x: seat.x, y: tip.y }, 'the head sits in dst\'s east seat column');
  assert.equal(quadToAddress(tip.x, tip.y), quadToAddress(seat.x, tip.y));
});

// ---------------------------------------------------------------------------
// One span format everywhere
// ---------------------------------------------------------------------------

test('a span may be written either way, wherever it is accepted', () => {
  assert.deepEqual(core.normalizeSpan('12x5'), { w: 12, h: 5 });
  assert.deepEqual(core.normalizeSpan({ w: 12, h: 5 }), { w: 12, h: 5 });

  const d = doc();
  core.placeBox(d, 'base', { id: 'str', at: 'C4.tl', span: '6x3' });
  core.placeBox(d, 'base', { id: 'obj', at: 'M4.tl', span: { w: 6, h: 3 } });
  assert.deepEqual(core.findElement(d, 'str').element.rect, { x: 4, y: 6, w: 12, h: 6 });
  assert.deepEqual(
    core.findElement(d, 'obj').element.rect,
    { x: 24, y: 6, w: 12, h: 6 },
    'both spellings produce identical geometry',
  );
});

test('a malformed span says what it wanted, including the object form', () => {
  assert.throws(() => core.normalizeSpan('twelve'), /"12x5" or \{ w: 12, h: 5 \}/);
  assert.throws(() => core.normalizeSpan({ w: 0, h: 2 }), /at least 1x1/);
});

// ---------------------------------------------------------------------------
// The whole session, as a regression
// ---------------------------------------------------------------------------

test('a realistic two-column diagram authors clean with no hand-computed addresses', () => {
  const d = core.createDocument({ name: 'session', canvas: { cols: 140, rows: 80 } });
  const at = { client: 'C4', gateway: 'C12', checkout: 'C20', events: 'C28', payments: 'W12', inventory: 'W20', ledger: 'W28' };
  const ops = Object.entries(at).map(([id, cell]) => ({
    op: 'place_box', id, at: `${cell}.tl`, span: { w: 16, h: 3 }, label: id, corner: 'rounded',
  }));
  ops.push(
    { op: 'pen', id: 'c-g', program: 'pen from client.S\ndown line to gateway.N arrow' },
    { op: 'pen', id: 'g-c', program: 'pen from gateway.S\ndown line to checkout.N arrow' },
    { op: 'pen', id: 'c-e', program: 'pen from checkout.S\ndown line to events.N arrow' },
    { op: 'pen', id: 'p-i', program: 'pen from payments.S\ndown line to inventory.N arrow' },
    { op: 'pen', id: 'i-l', program: 'pen from inventory.S\ndown line to ledger.N arrow' },
  );

  const result = core.commitOperations(d, ops);
  assert.ok(result.ok, result.error);
  assert.equal(result.validation.open.length, 0, core.formatLog(result.validation));
});

// ---------------------------------------------------------------------------
// P3 — centring a stroke against the corridor, not the cell
// ---------------------------------------------------------------------------

test('align center is still refused when there is nothing to measure against', () => {
  // Raw runPen has no document, so no corridor can be found. The old error
  // stands: better to refuse than to invent a 2.5px offset.
  assert.throws(() => runPen('pen C4.q1\ndown 2 align center line'), /center/);
});

test('a stroke centres in the corridor between two boxes', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'left', at: 'C20.tl', span: { w: 8, h: 3 } });
  core.placeBox(d, 'base', { id: 'right', at: 'S20.tl', span: { w: 8, h: 3 } });
  // left claims quadrants x 4..19, right claims x 36..51 — corridor is 20..35.
  core.applyPen(d, 'base', 'pen M20.q1\ndown 2 align center line', { id: 'mid' });

  const { element } = core.findElement(d, 'mid');
  const x = element.pieces[0].x;
  assert.ok(x >= 20 && x <= 35, `landed at ${x}, inside the corridor`);
  assert.ok(Math.abs(x - 27.5) <= 0.5, `landed at ${x}, adjacent to the corridor's true middle`);
  assert.equal(Number.isInteger(x), true, 'and on a whole quadrant, as always');
});

test('an even corridor has no exact middle, and says so rather than absorbing it', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'left', at: 'C20.tl', span: { w: 8, h: 3 } });
  core.placeBox(d, 'base', { id: 'right', at: 'S20.tl', span: { w: 8, h: 3 } });
  core.applyPen(d, 'base', 'pen M20.q1\ndown 2 align center line', { id: 'mid' });

  const hit = core.validate(d).open.filter((f) => f.rule === 'L018')[0];
  assert.ok(hit, 'the half-quadrant it could not use is reported');
  assert.equal(hit.severity, 'S3', 'as information — it never blocks a save');
});
