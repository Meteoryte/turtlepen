import test from 'node:test';
import assert from 'node:assert/strict';

import { rect, rectsOverlap, intersection, expand, toPx, PX_PER_CELL, PX_PER_QUAD } from '../src/core/geometry.js';
import { colToIndex, indexToCol, parseAddress, pinPoint, addressRect, quadToAddress, quadToCell } from '../src/core/address.js';

test('cells are 10px and quadrants are 5px', () => {
  assert.equal(PX_PER_CELL, 10);
  assert.equal(PX_PER_QUAD, 5);
});

test('rects reject non-integer coordinates — the lattice is exact by construction', () => {
  assert.throws(() => rect(0, 0, 2.5, 2), TypeError);
  assert.throws(() => rect(0, 0, 0, 2), RangeError);
});

test('column letters round-trip through Excel bijective base-26', () => {
  for (const [letters, index] of [['A', 0], ['Z', 25], ['AA', 26], ['AZ', 51], ['BA', 52], ['DP', 119]]) {
    assert.equal(colToIndex(letters), index, `${letters} -> ${index}`);
    assert.equal(indexToCol(index), letters, `${index} -> ${letters}`);
  }
});

test('addresses parse at all three precisions', () => {
  assert.deepEqual(parseAddress('C4'), { col: 2, row: 3, part: null, kind: 'cell', raw: 'C4' });
  assert.equal(parseAddress('C4.tl').kind, 'pin');
  assert.equal(parseAddress('C4.q2').kind, 'quad');
  assert.throws(() => parseAddress('C4.zz'), SyntaxError);
  assert.throws(() => parseAddress('4C'), SyntaxError);
});

test('all nine pin points land on integer lattice coordinates', () => {
  for (const pin of ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']) {
    const p = pinPoint(`C4.${pin}`);
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), `${pin} -> ${p.x},${p.y}`);
  }
  assert.deepEqual(pinPoint('C4.tl'), { x: 4, y: 6 });
  assert.deepEqual(pinPoint('C4.c'), { x: 5, y: 7 });
  assert.deepEqual(pinPoint('C4.br'), { x: 6, y: 8 });
});

test('quadrant addressing is invertible', () => {
  for (const [x, y, addr] of [[0, 0, 'A1.q1'], [1, 0, 'A1.q2'], [0, 1, 'A1.q3'], [3, 9, 'B5.q4'], [5, 7, 'C4.q4']]) {
    assert.equal(quadToAddress(x, y), addr);
  }
  assert.equal(quadToCell(5, 7), 'C4');
  assert.deepEqual(addressRect('C4.q4'), rect(5, 7, 1, 1));
  assert.deepEqual(addressRect('C4'), rect(4, 6, 2, 2));
});

test('overlap and intersection are exact', () => {
  const a = rect(0, 0, 4, 4);
  assert.ok(rectsOverlap(a, rect(3, 3, 4, 4)));
  assert.ok(!rectsOverlap(a, rect(4, 0, 4, 4)), 'sharing an edge is not overlap');
  assert.deepEqual(intersection(a, rect(2, 2, 4, 4)), rect(2, 2, 2, 2));
  assert.equal(intersection(a, rect(9, 9, 1, 1)), null);
  assert.deepEqual(expand(a, 1), rect(-1, -1, 6, 6));
});

test('pixel conversion never rounds', () => {
  assert.deepEqual(toPx(rect(3, 9, 2, 4)), { x: 15, y: 45, w: 10, h: 20 });
});
