#!/usr/bin/env node
/**
 * What auto-layout is actually worth — the same graph, twice.
 *
 * BEFORE is drawn the way every other example in this repo was drawn, and the
 * way an AI writing a diagram naturally writes one: pick a gap constant, keep a
 * running row counter, and place each node in the order it was thought of. That
 * is not laziness, it is what you do when you have no layout engine. It also
 * guarantees the two failures a reader notices immediately — edges that cross
 * for no reason, and a parent sitting above the left-most of its children
 * instead of above their middle.
 *
 * AFTER is the identical document with one `layout` call on it.
 *
 * The point is not that the second picture is prettier. It is that the
 * difference is MEASURED — crossings before and after, printed — rather than
 * asserted, and that nothing about the drawing was invented: the graph came
 * from the connectors the author had already drawn.
 *
 *   node examples/layout-before-after.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const FIXED_CREATED_AT = '2026-08-21T09:00:00.000Z';

// A release pipeline: two intake paths, a shared build, a fan-out to three
// checks, a gate that all three feed, and a rollback edge that runs backwards
// up the page. Declared in the order someone would think of it, which is not
// the order it should be drawn in.
const NODES = [
  ['ticket', 'Ticket raised', 'terminator'],
  ['hotfix', 'Hotfix raised', 'terminator'],
  ['build', 'Build', 'process'],
  ['unit', 'Unit tests', 'process'],
  ['e2e', 'End-to-end tests', 'process'],
  ['scan', 'Security scan', 'process'],
  ['gate', 'All green?', 'decision'],
  ['stage', 'Deploy to staging', 'process'],
  ['prod', 'Deploy to production', 'process'],
  ['rollback', 'Roll back', 'process'],
  ['done', 'Released', 'terminator'],
];

const EDGES = [
  ['ticket', 'build'], ['hotfix', 'build'],
  ['build', 'e2e'], ['build', 'unit'], ['build', 'scan'],
  ['e2e', 'gate'], ['unit', 'gate'], ['scan', 'gate'],
  ['gate', 'stage'], ['gate', 'rollback'],
  ['stage', 'prod'], ['prod', 'done'],
  ['rollback', 'build'],
];

// --- BEFORE: the hand-written spine ----------------------------------------

const doc = core.createDocument({
  name: 'release pipeline', cols: 150, rows: 90, createdAt: FIXED_CREATED_AT,
});

const GAP_X = 4;
const GAP_Y = 5;
const TOP = 3;
const LEFT = 3;

// The uniform width worked out with Math.max — present in every example in
// this repo, and the reason a short label sits in a box built for a long one.
const measured = NODES.map(([, label, shape]) => {
  const m = core.text.requiredCellsFor(label, { fontSize: 10 });
  return core.shapes.spanForShape(shape, m);
});
const W = Math.max(...measured.map((m) => m.w));
const H = Math.max(...measured.map((m) => m.h));

// The running row counter: four per row, wrap, next row. Nothing knows what is
// connected to what.
NODES.forEach(([id, label, shape], i) => {
  const col = LEFT + (i % 4) * (W + GAP_X);
  const row = TOP + Math.floor(i / 4) * (H + GAP_Y);
  core.OPERATIONS.place_box(doc, {
    id, at: `${core.address.indexToCol(col)}${row}.tl`, span: { w: W, h: H }, label, shape, align: 'center',
  });
});

// Connectors drawn between whatever the spine produced. `route` finds a clear
// path if one exists and says so honestly if it does not — which, on a spine,
// it frequently does not.
// EVERY edge gets drawn, including the ones that come out badly. Routing only
// the ones that happen to be clear would quietly delete the connections the
// spine handles worst, and those are exactly the ones the comparison is about.
const spineProgram = (from, to) => {
  const a = core.findElement(doc, from).element.rect;
  const b = core.findElement(doc, to).element.rect;
  if (b.y > a.y) return `pen from ${from}.S
down align right line to ${to}.N arrow`;
  if (b.y < a.y) return `pen from ${from}.N
up align right line to ${to}.S arrow`;
  return b.x > a.x
    ? `pen from ${from}.E
right align bottom line to ${to}.W arrow`
    : `pen from ${from}.W
left align bottom line to ${to}.E arrow`;
};

for (const [from, to] of EDGES) {
  core.OPERATIONS.pen(doc, { id: `${from}-${to}`, program: spineProgram(from, to) });
}

const before = core.validate(doc);
await core.exportSvg(doc, resolve(project, 'diagrams/layout-before.svg'), { force: true, margin: 24 });

// --- AFTER: one call --------------------------------------------------------

const report = core.OPERATIONS.layout(doc, { page: 'base', gapX: 8, gapY: 10 });
const after = core.validate(doc);
await core.exportSvg(doc, resolve(project, 'diagrams/layout-after.svg'), { force: true, margin: 24 });
await core.saveDocument(doc, resolve(project, 'diagrams/layout-after.turtlepen.json'), { force: true });

// --- the measured difference ------------------------------------------------

const bar = '═'.repeat(70);
console.log(bar);
console.log('  BEFORE — hand-written spine, four to a row');
console.log(`    ${NODES.length} nodes, ${EDGES.length} edges`);
console.log(`    findings: ${core.formatLog(before).split('\n')[0]}`);
console.log(bar);
console.log('  AFTER — one layout call');
console.log(`    ${report.moved} of ${report.boxes} boxes moved, ${report.ranks} ranks deep`);
console.log(`    edge crossings ${report.crossingsBefore} -> ${report.crossings}`);
console.log(`    ${report.routed.length} connector(s) redrawn, ${report.stranded.length} could not be`);
for (const rev of report.reversed) {
  console.log(`    reversed ${rev.from} -> ${rev.to} to break a cycle (the rollback edge)`);
}
for (const s of report.stranded) {
  console.log(`    STRANDED ${s.id}: ${s.blockedBy ? `${s.blockedBy.by} at ${s.blockedBy.at}` : s.note}`);
}
console.log(`    findings: ${core.formatLog(after).split('\n')[0]}`);
console.log(bar);
console.log('  diagrams/layout-before.svg  diagrams/layout-after.svg');
console.log(bar);
