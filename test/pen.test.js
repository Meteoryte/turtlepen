import test from 'node:test';
import assert from 'node:assert/strict';

import { runPen, parseCommand } from '../src/core/pen.js';
import { quadToAddress } from '../src/core/address.js';
import { alignTrack, alignmentFor } from '../src/core/shapes.js';

test('the original phrasing parses, token order and all', () => {
  const c = parseCommand('up 1 align right line');
  assert.equal(c.dir, 'up');
  assert.equal(c.n, 1);
  assert.deepEqual(c.align, ['right']);
  assert.equal(c.element, 'line');

  const corner = parseCommand('up indented corner align right bottom');
  assert.equal(corner.element, 'corner');
  assert.equal(corner.style, 'indented');
  assert.deepEqual(corner.align, ['right', 'bottom']);
});

test('a bare address is a location — the (location) form', () => {
  assert.equal(parseCommand('up 1 align right line (C7.q2)').at, 'C7.q2');
  assert.equal(parseCommand('pen B5 bl').at, 'B5.bl');
  assert.equal(parseCommand('right align bottom line to db.W').to, 'db.W');
});

test('free text carries explicit alignment, safe colour, and weight through the pen grammar', () => {
  const r = runPen('text "Turtle Pen" at C4.tl span 20x5 id wordmark font 40 fill #001b35 weight 800 align center');
  assert.deepEqual(r.texts[0], {
    id: 'wordmark', rect: { x: 4, y: 6, w: 40, h: 10 }, text: 'Turtle Pen',
    fontSize: 40, align: 'center', color: '#001b35', weight: 800,
  });
});

test('align centre is rejected because it would leave the lattice', () => {
  assert.throws(() => alignmentFor('v', 'center'), /2\.5px/);
  assert.equal(alignTrack(2, 'left'), 2);
  assert.equal(alignTrack(2, 'right'), 3);
  assert.equal(alignTrack(7, 'top'), 6);
  assert.equal(alignTrack(7, 'bottom'), 7);
});

test('the worked example draws a continuous path with exact footprints', () => {
  const r = runPen(`
    pen B5 bl
    up 1 align right line
    up indented corner align right bottom
    right 2 align bottom line
  `);

  // `up 1` travels exactly one 10px cell = two quadrants, so the vertical run
  // stays inside row 5; the cursor then lands in row 4, where the corner sits.
  assert.deepEqual(
    r.pieces.map((p) => quadToAddress(p.x, p.y)),
    ['B5.q4', 'B5.q2', 'B4.q4', 'C4.q3', 'C4.q4', 'D4.q3', 'D4.q4'],
  );

  const [first, , corner] = r.pieces;
  assert.equal(first.type, 'line');
  assert.equal(first.align, 'right', 'the 5px stroke hugs the right half of column B');
  assert.equal(corner.type, 'corner');
  assert.equal(corner.style, 'indented');
  assert.deepEqual(corner.sides, ['bottom', 'right']);

  assert.equal(r.facing, 'right');
  assert.equal(quadToAddress(r.cursor.x, r.cursor.y), 'E4.q3', 'the cursor rests one quadrant beyond the last stroke');
  assert.equal(r.notes.length, 0, 'a well-formed path reports nothing');
});

test('every quadrant is contiguous with the one before it', () => {
  const r = runPen(`
    pen T20 tl
    down 3 align left line
    down corner align top right
    right 4 align top line
    right corner align left bottom
    down 2 align right line
  `);
  for (let i = 1; i < r.pieces.length; i++) {
    const a = r.pieces[i - 1], b = r.pieces[i];
    const step = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    assert.equal(step, 1, `piece ${i} at ${quadToAddress(b.x, b.y)} is not adjacent to ${quadToAddress(a.x, a.y)}`);
  }
});

test('a corner must include the side the path arrives on', () => {
  assert.throws(
    () => runPen('pen B5 bl\nup 1 align right line\nup corner align left top'),
    /do not include "bottom".*facing up/s,
  );
});

test('a mismatched track is reported, not silently corrected', () => {
  const r = runPen(`
    pen B5 bl
    up 1 align right line
    up 1 align left line
  `);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].code, 'L014');
  assert.match(r.notes[0].message, /discontinuity/);
  // The stroke is still drawn where it was asked for.
  assert.equal(quadToAddress(r.pieces.at(-1).x, r.pieces.at(-1).y), 'B4.q1');
});

test('self-overlap within one path is caught', () => {
  const r = runPen(`
    pen C4 tl
    right 1 align top line
    left 1 align top line
  `);
  assert.ok(r.notes.some((n) => n.code === 'L015'), JSON.stringify(r.notes));
});

test('to <address> computes the distance rather than making the AI count', () => {
  const r = runPen('pen A1 tl\nright align top line to E1.q1');
  assert.equal(r.pieces.length, 8, 'A1.q1 to E1.q1 is 8 quadrants');
  assert.equal(r.trace.at(-1).cells, 4);
});

test('to <id>.<port> resolves against placed boxes', () => {
  const r = runPen('pen A1 tl\nright align top line to db.W', {
    resolveElement: (id) => (id === 'db' ? { kind: 'box', rect: { x: 10, y: 0, w: 8, h: 4 } } : null),
  });
  assert.equal(r.pieces.length, 10);
});

test('a target that is not ahead of the cursor fails loudly', () => {
  assert.throws(() => runPen('pen E1 tl\nright align top line to A1.q1'), /not right of the cursor/);
});

test('box commands accept a pin so the AI picks which corner lands on the address', () => {
  const tl = runPen('box span 4x2 at C4.tl label "api"').boxes[0];
  assert.deepEqual(tl.rect, { x: 4, y: 6, w: 8, h: 4 });

  const centred = runPen('box span 4x2 at C4.c label "api"').boxes[0];
  assert.deepEqual(centred.rect, { x: 1, y: 5, w: 8, h: 4 }, 'centre pin straddles the cell');

  // K9's bottom-right corner point is quadrant (22,18); a 4x2 box hung from it
  // extends back 8 quadrants left and 4 up.
  const br = runPen('box span 4x2 at K9.br label "api"').boxes[0];
  assert.deepEqual(br.rect, { x: 14, y: 14, w: 8, h: 4 }, 'a bottom-right pin grows up and left');
});

test('a placement pushed off the origin fails with an explanation, not an index error', () => {
  assert.throws(
    () => runPen('box span 4x2 at C4.br label "api"'),
    /off the top-left of the grid.*no negative addressing/s,
  );
});
