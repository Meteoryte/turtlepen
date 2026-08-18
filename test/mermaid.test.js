/**
 * Mermaid flowchart import.
 *
 * The import is a COMPILER onto existing operations. So the tests that matter
 * are that it maps the symbol vocabulary correctly, that it refuses what it
 * cannot do instead of silently dropping it, and that what it emits is subject
 * to ordinary validation like anything drawn by hand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMermaid, parseNodeRef, mermaidToOperations } from '../src/core/mermaid.js';
import { createDocument, OPERATIONS, validate } from '../src/core/index.js';

// A linear chart: one start, no decision, so it lays out as a straight spine.
// It is deliberately NOT branching — a decision with one way out is an invalid
// flowchart, and F002 caught exactly that when this fixture first had one.
const CHART = [
  'flowchart TD',
  '  A([Start]) --> B[Ship it]',
  '  B -->|done| C([Finished])',
].join('\n');

test('mermaid node brackets map onto the symbol vocabulary', () => {
  const cases = [
    ['A([Start])', 'terminator'],
    ['B{Ready?}', 'decision'],
    ['C[Ship it]', 'process'],
    ['D[/Input/]', 'io'],
    ['E[\\Manual\\]', 'manual'],
    ['F{{Prepare}}', 'prep'],
    ['G[(Store)]', 'data'],
    ['H[[Sub]]', 'subprocess'],
    ['I(Round)', 'terminator'],
  ];
  for (const [text, shape] of cases) {
    assert.equal(parseNodeRef(text).shape, shape, text);
  }
});

test('longer delimiters win, so ([x]) is not read as [x]', () => {
  // The ordering bug this would otherwise have: a terminator silently becoming
  // a process box, which is a wrong diagram that validates perfectly.
  assert.equal(parseNodeRef('A([Start])').shape, 'terminator');
  assert.equal(parseNodeRef('A[Start]').shape, 'process');
  assert.equal(parseNodeRef('A[[Start]]').shape, 'subprocess');
});

test('labels are read, quotes stripped, and a bare id keeps its own name', () => {
  assert.equal(parseNodeRef('A["Quoted label"]').label, 'Quoted label');
  assert.equal(parseNodeRef('A').label, null);
  const { nodes } = parseMermaid('flowchart TD\n  A --> B[Named]');
  assert.equal(nodes.find((n) => n.id === 'A').label, 'A', 'an unlabelled node falls back to its id');
  assert.equal(nodes.find((n) => n.id === 'B').label, 'Named');
});

test('a later mention refines an earlier bare reference', () => {
  const { nodes } = parseMermaid('flowchart TD\n  A --> B\n  B{Really?} --> C[End]');
  assert.equal(nodes.find((n) => n.id === 'B').shape, 'decision');
});

test('edge labels are captured', () => {
  const { edges } = parseMermaid(CHART);
  assert.equal(edges.length, 2);
  assert.equal(edges.find((e) => e.from === 'B' && e.to === 'C').label, 'done');
});

test('unsupported syntax is refused by name, never silently dropped', () => {
  // Dropping half a diagram and reporting success is the failure mode this
  // project treats as a defect everywhere else.
  for (const line of ['  subgraph one', '  classDef big fill:#f00', '  click A "http://x"', '  style A fill:#0f0']) {
    assert.throws(() => parseMermaid(`flowchart TD\n  A --> B\n${line}`), /not supported by this importer/);
  }
});

test('a missing header is refused', () => {
  assert.throws(() => parseMermaid('A --> B'), /expected a "flowchart" or "graph" header/);
});

test('comments and blank lines are ignored', () => {
  const { nodes, edges } = parseMermaid('flowchart TD\n\n  %% a note\n  A --> B\n');
  assert.equal(nodes.length, 2);
  assert.equal(edges.length, 1);
});

test('compiled operations are ordinary operations the engine already has', () => {
  const { operations } = mermaidToOperations(CHART);
  for (const op of operations) {
    assert.ok(OPERATIONS[op.op], `emitted an operation the engine cannot perform: ${op.op}`);
  }
});

test('an imported chart validates like anything drawn by hand', () => {
  const { operations } = mermaidToOperations(CHART);
  const doc = createDocument({ name: 'imported', canvas: { cols: 120, rows: 90 } });
  for (const op of operations) OPERATIONS[op.op](doc, op);

  const open = validate(doc).open;
  // The point is not that an import is magically clean — it is that the import
  // is subject to the same log. Nothing may be above INFO on this simple spine.
  const bad = open.filter((f) => f.severity !== 'S3');
  assert.deepEqual(bad.map((f) => `${f.rule} ${f.actors.join(',')}`), [], 'straight spine must import clean');

  // And the flowchart rules apply to it, because it really is a flowchart.
  assert.equal(open.filter((f) => f.rule === 'F001').length, 0, 'one start');
});

test('the importer says when it has laid out something it cannot route', () => {
  // Honesty about the boundary: it places a spine, it does not route.
  const branching = 'flowchart TD\n  A{Which?} --> B[Left]\n  A --> C[Right]';
  const r = mermaidToOperations(branching);
  assert.ok(r.notes.length > 0, 'a branch that is not a straight drop must be reported');
  assert.match(r.notes[0], /does not route/);
});

test('a decision imported from mermaid still has to branch', () => {
  // F002 is not suspended just because the geometry arrived from a compiler.
  const oneWay = 'flowchart TD\n  A([Start]) --> B{Ready?}\n  B --> C([Done])';
  const { operations } = mermaidToOperations(oneWay);
  const doc = createDocument({ name: 'oneway', canvas: { cols: 120, rows: 90 } });
  for (const op of operations) OPERATIONS[op.op](doc, op);
  assert.equal(validate(doc).open.filter((f) => f.rule === 'F002').length, 1);
});
