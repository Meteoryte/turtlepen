import test from 'node:test';
import assert from 'node:assert/strict';

import {
  breakCycles, rankNodes, insertDummies, countCrossings, orderRanks, assignX, layoutGraph,
} from '../src/core/layout.js';
import * as core from '../src/core/index.js';

const node = (id, cellsW = 4, cellsH = 2) => ({ id, cellsW, cellsH });

test('longest-path ranking puts a node below its deepest predecessor', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d')];
  // a->b->c->d and a->d: d must sit at rank 3, not rank 1.
  const edges = [
    { from: 'a', to: 'b', edge: 0 }, { from: 'b', to: 'c', edge: 1 },
    { from: 'c', to: 'd', edge: 2 }, { from: 'a', to: 'd', edge: 3 },
  ];
  const rank = rankNodes(nodes, edges);
  assert.equal(rank.get('a'), 0);
  assert.equal(rank.get('b'), 1);
  assert.equal(rank.get('c'), 2);
  assert.equal(rank.get('d'), 3);
});

test('a cycle is broken by reversing exactly one edge, and the reversal is reported', () => {
  const nodes = [node('a'), node('b'), node('c')];
  const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }];
  const { edges: acyclic, reversed } = breakCycles(nodes, edges);
  assert.equal(reversed.length, 1, 'one back edge closes this cycle');
  assert.equal(reversed[0], 2, 'c->a is the edge that closes it');
  const flipped = acyclic.find((e) => e.reversed);
  assert.deepEqual({ from: flipped.from, to: flipped.to }, { from: 'a', to: 'c' });
  // And ranking now terminates rather than throwing.
  assert.doesNotThrow(() => rankNodes(nodes, acyclic));
});

test('a self loop is set aside rather than ranked', () => {
  const { edges, selfLoops } = breakCycles([node('a')], [{ from: 'a', to: 'a' }]);
  assert.deepEqual(selfLoops, [0]);
  assert.equal(edges.length, 0);
});

test('an edge spanning three ranks gains exactly two virtual nodes', () => {
  const nodes = [node('a'), node('b'), node('c'), node('d')];
  const edges = [
    { from: 'a', to: 'b', edge: 0 }, { from: 'b', to: 'c', edge: 1 },
    { from: 'c', to: 'd', edge: 2 }, { from: 'a', to: 'd', edge: 3 },
  ];
  const rank = rankNodes(nodes, edges);
  const { nodes: all, chains, segments } = insertDummies(nodes, edges, rank);
  assert.equal(chains.get(3).length, 2, 'a->d crosses ranks 1 and 2');
  assert.equal(chains.get(0).length, 0, 'a->b is adjacent and needs no lane');
  assert.equal(all.length, 6, 'four real nodes plus two lane nodes');
  // The long edge is now four segments end to end, not one leap.
  assert.equal(segments.filter((s) => s.edge === 3).length, 3);
  assert.equal(rank.get(chains.get(3)[0]), 1);
  assert.equal(rank.get(chains.get(3)[1]), 2);
});

test('crossings between two ranks are counted exactly', () => {
  const segments = [{ from: 'a', to: 'y' }, { from: 'b', to: 'x' }];
  assert.equal(countCrossings(['a', 'b'], ['x', 'y'], segments), 1);
  assert.equal(countCrossings(['a', 'b'], ['y', 'x'], segments), 0);
  // Three mutually crossing edges make three pairs, not two.
  const three = [{ from: 'a', to: 'z' }, { from: 'b', to: 'y' }, { from: 'c', to: 'x' }];
  assert.equal(countCrossings(['a', 'b', 'c'], ['x', 'y', 'z'], three), 3);
});

test('ordering removes a crossing that declaration order creates', () => {
  // Declared a,b over x,y with a->y and b->x: one crossing until the lower
  // rank is reordered. This is the exact defect a hand-written row counter
  // cannot see.
  const byRank = [['a', 'b'], ['x', 'y']];
  const segments = [{ from: 'a', to: 'y' }, { from: 'b', to: 'x' }];
  const { order, crossings } = orderRanks(byRank, segments);
  assert.equal(crossings, 0);
  assert.deepEqual(order[1], ['y', 'x']);
});

test('ordering never returns a worse arrangement than it was given', () => {
  const byRank = [['a', 'b', 'c'], ['x', 'y', 'z']];
  const segments = [{ from: 'a', to: 'x' }, { from: 'b', to: 'y' }, { from: 'c', to: 'z' }];
  const { order, crossings } = orderRanks(byRank, segments);
  assert.equal(crossings, 0);
  assert.deepEqual(order, byRank, 'an already-clean ordering is left alone');
});

test('x positions are whole cells and keep the declared gap', () => {
  const order = [['a', 'b']];
  const sizeOf = (id) => ({ id, cellsW: id === 'a' ? 6 : 4, cellsH: 2, dummy: false });
  const x = assignX(order, [], sizeOf, 4);
  assert.equal(x.get('a'), 0);
  assert.equal(x.get('b'), 10, 'six wide plus a gap of four');
  for (const v of x.values()) assert.ok(Number.isInteger(v), 'no coordinate may need rounding');
});

test('a parent is centred over its children rather than sitting above the first', () => {
  const { positions } = layoutGraph({
    nodes: [node('root', 4), node('l', 4), node('m', 4), node('r', 4)],
    edges: [{ from: 'root', to: 'l' }, { from: 'root', to: 'm' }, { from: 'root', to: 'r' }],
    gapX: 4, gapY: 5, originCol: 3, originRow: 3,
  });
  const mid = (id) => positions.get(id).col + 2; // half of a four-cell box
  assert.equal(mid('root'), mid('m'), 'the root sits over the middle child');
  assert.ok(mid('l') < mid('root') && mid('root') < mid('r'));
});

test('ranks step down the page by the tallest node on the rank', () => {
  const { positions } = layoutGraph({
    nodes: [node('a', 4, 2), node('b', 4, 6), node('c', 4, 2)],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    gapY: 5, originRow: 3,
  });
  assert.equal(positions.get('a').row, 3);
  assert.equal(positions.get('b').row, 10, 'a is two tall plus a gap of five');
  assert.equal(positions.get('c').row, 21, 'b is six tall plus a gap of five');
});

test('a long edge reports the lane it travels through', () => {
  const { lanes, positions } = layoutGraph({
    nodes: [node('a'), node('b'), node('c')],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }],
  });
  assert.equal(lanes.get(0).length, 0, 'a->b is adjacent');
  assert.equal(lanes.get(2).length, 1, 'a->c passes one rank and gets one waypoint');
  const [via] = lanes.get(2);
  assert.equal(via.rank, 1, 'the waypoint is on the rank it skips');
  assert.notEqual(via.col, positions.get('b').col, 'the lane does not sit on top of b');
  assert.ok(Number.isInteger(via.col) && Number.isInteger(via.row));
});

test('layout reduces crossings on a graph whose declaration order is adversarial', () => {
  // Two parents feeding two children, declared so that a naive spine crosses.
  const { crossings, crossingsBefore } = layoutGraph({
    nodes: [node('p1'), node('p2'), node('c1'), node('c2')],
    edges: [{ from: 'p1', to: 'c2' }, { from: 'p2', to: 'c1' }],
  });
  assert.equal(crossingsBefore, 1, 'as declared, the two edges cross');
  assert.equal(crossings, 0, 'laid out, they do not');
});

test('layout refuses an edge naming a node it was not given', () => {
  assert.throws(
    () => layoutGraph({ nodes: [node('a')], edges: [{ from: 'a', to: 'ghost' }] }),
    /not one of the nodes/,
  );
});

test('layout refuses an empty graph rather than returning an empty drawing', () => {
  assert.throws(() => layoutGraph({ nodes: [] }), /at least one node/);
});

test('every returned coordinate is an integer cell, dummies included', () => {
  const { positions, lanes } = layoutGraph({
    nodes: 'abcdefg'.split('').map((c) => node(c, 5, 3)),
    edges: [
      { from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' },
      { from: 'c', to: 'd' }, { from: 'd', to: 'e' }, { from: 'a', to: 'f' },
      { from: 'f', to: 'g' }, { from: 'e', to: 'g' }, { from: 'g', to: 'a' },
    ],
  });
  for (const p of positions.values()) {
    assert.ok(Number.isInteger(p.col) && Number.isInteger(p.row), 'positions are whole cells');
    assert.ok(p.col >= 0 && p.row >= 0, 'nothing is laid out off the top-left of the page');
  }
  for (const points of lanes.values()) {
    for (const q of points) assert.ok(Number.isInteger(q.col) && Number.isInteger(q.row));
  }
});

test('laying out the same graph twice gives the same answer', () => {
  const graph = {
    nodes: 'abcdef'.split('').map((c) => node(c)),
    edges: [
      { from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' },
      { from: 'c', to: 'e' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' },
    ],
  };
  const one = layoutGraph(graph);
  const two = layoutGraph(graph);
  assert.deepEqual([...one.positions.entries()], [...two.positions.entries()]);
  assert.equal(one.crossings, two.crossings);
});

test('no two boxes on a rank overlap after layout', () => {
  const { positions } = layoutGraph({
    nodes: [node('root', 30, 2), node('a', 4, 2), node('b', 4, 2), node('c', 4, 2)],
    edges: [{ from: 'root', to: 'a' }, { from: 'root', to: 'b' }, { from: 'root', to: 'c' }],
    gapX: 4,
  });
  const rank1 = ['a', 'b', 'c']
    .map((id) => ({ id, ...positions.get(id) }))
    .sort((p, q) => p.col - q.col);
  for (let i = 0; i + 1 < rank1.length; i++) {
    assert.ok(rank1[i].col + 4 <= rank1[i + 1].col, `${rank1[i].id} must not run into ${rank1[i + 1].id}`);
  }
});

function semanticPair() {
  const doc = core.createDocument({ name: 'directed layout', canvas: { cols: 60, rows: 40 } });
  core.placeBox(doc, 'base', { id: 'source', at: 'C4.tl', span: '6x3', label: 'Source' });
  core.placeBox(doc, 'base', { id: 'target', at: 'C16.tl', span: '6x3', label: 'Target' });
  core.connectNodes(doc, {
    id: 'request', from: 'source.S', to: 'target.N', routing: 'orthogonal',
    description: 'sends a request', technology: 'HTTPS', tags: ['critical'],
    properties: { owner: 'platform' }, perspectives: { security: 'reviewed' },
    relationshipLabel: 'Submit', outcome: 'Accepted',
  });
  return doc;
}

test('document layout supports all reading directions, explicit pins, and semantic rerouting', () => {
  const expectations = {
    'top-down': (a, b) => b.rect.y > a.rect.y,
    'bottom-up': (a, b) => b.rect.y < a.rect.y,
    'left-right': (a, b) => b.rect.x > a.rect.x,
    'right-left': (a, b) => b.rect.x < a.rect.x,
  };
  for (const [direction, ordered] of Object.entries(expectations)) {
    const doc = semanticPair();
    const result = core.layoutElements(doc, { direction, pins: { source: 'M10.tl' } });
    const source = core.findElement(doc, 'source').element;
    const target = core.findElement(doc, 'target').element;
    const relationship = core.findElement(doc, 'request').element;
    assert.equal(ordered(source, target), true, `${direction} must preserve reading order`);
    assert.deepEqual({ x: source.rect.x, y: source.rect.y }, core.address.pinPoint('M10.tl'));
    assert.equal(result.pinned[0].id, 'source');
    assert.equal(relationship.description, 'sends a request');
    assert.equal(relationship.technology, 'HTTPS');
    assert.equal(relationship.relationshipLabel, 'Submit');
    assert.equal(relationship.outcome, 'Accepted');
    assert.deepEqual(relationship.tags, ['critical']);
    assert.deepEqual(relationship.properties, { owner: 'platform' });
    assert.deepEqual(relationship.perspectives, { security: 'reviewed' });
  }
});
