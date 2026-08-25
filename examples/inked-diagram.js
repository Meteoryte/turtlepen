#!/usr/bin/env node
/**
 * A diagram with no text in it.
 *
 * Not "no words" — no `<text>` element. Every letter here is quadrants on the
 * lattice, drawn by TurtleFont, which means the file renders identically on a
 * machine with no fonts installed, and every mark in it is a path a plotter can
 * follow. Until `stroke_label` existed this was not possible: a box label was
 * always an SVG text run, so any drawing with words in it depended on the
 * viewer's font stack for its most important content.
 *
 * The vertical caption is the other thing that was impossible — a quarter turn
 * is exact on a square lattice, so a rotated label loses nothing.
 *
 * The sizes are the honest cost. Cap height is six quadrants, so an inked node
 * is roughly three times the node you would draw for an 11px label. That is
 * arithmetic, not a defect, and it is why `place_box` labels are still there.
 *
 *   node examples/inked-diagram.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import * as font from '../src/core/turtlefont.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const doc = core.createDocument({
  name: 'inked pipeline', cols: 260, rows: 190, createdAt: '2026-08-25T09:00:00.000Z',
});
core.OPERATIONS.set_background(doc, { color: '#f7f4ec' });

// Nodes, sized from the ink rather than guessed at. requiredCellsForStrokeText
// reports what the words need; the box is then built around that, which is the
// same measure-before-placing rule the rest of the engine runs on.
const NODES = [
  ['intake', 'Intake', 'terminator'],
  ['build', 'Build', 'process'],
  ['test', 'Run tests', 'process'],
  ['ship', 'Ship it', 'terminator'],
];

// The row is carried, not written down: an inked node is as tall as its words
// need, so a fixed address would only hold until a label changed.
let row = 3;
for (const [id, label, shape] of NODES) {
  const need = font.requiredCellsForStrokeText(label);
  // A symbol carves its own label area out of its box, so the span comes from
  // spanForShape rather than from a margin picked by hand — the same rule the
  // engine already applies to <text> labels.
  const span = core.shapes.spanForShape(shape, need);
  const box = { w: span.w + 2, h: span.h + 2 };
  core.OPERATIONS.place_box(doc, {
    id,
    at: `C${row}.tl`,
    span: box,
    label: '',
    shape,
    corner: shape === 'process' ? 'rounded' : 'square',
  });
  core.OPERATIONS.stroke_label(doc, { id: `${id}-ink`, target: id, text: label, color: '#12202c' });
  row += box.h + 8;
}

// Connectors, drawn by the router as usual — ink labels change nothing about
// how anything else in the engine works.
for (const [from, to] of [['intake', 'build'], ['build', 'test'], ['test', 'ship']]) {
  const route = core.routeProgram(doc, 'base', `${from}.S`, `${to}.N`);
  if (route.program) core.OPERATIONS.pen(doc, { id: `${from}-${to}`, program: route.program });
}

// The heading, and a caption turned a quarter turn — exact, so it loses
// nothing. Both are placed clear of the widest node rather than at a guessed
// address, because an inked node is only as wide as its words require.
const right = Math.max(...core.elementsOf(doc, 'base')
  .filter((e) => e.kind === 'box')
  .map((e) => e.rect.x + e.rect.w)) + 6;
core.OPERATIONS.stroke_text(doc, {
  id: 'title', at: core.address.quadToAddress(right, 3), text: 'RELEASE', scale: 2, color: '#1b2733',
});
core.OPERATIONS.stroke_text(doc, {
  id: 'side',
  at: core.address.quadToAddress(right + 4, 3 + font.LINE_HEIGHT * 2 + 8),
  text: 'EVERY MARK IS A PATH',
  rotate: 90,
  color: '#a4551f',
});

const findings = core.validate(doc);
await core.exportSvg(doc, resolve(project, 'diagrams/inked-diagram.svg'), { force: true, margin: 18 });
await core.saveDocument(doc, resolve(project, 'diagrams/inked-diagram.turtlepen.json'), { force: true });

// The claim in the header, checked rather than asserted.
const svg = await import('node:fs/promises').then((fs) => fs.readFile(resolve(project, 'diagrams/inked-diagram.svg'), 'utf8'));
const textRuns = (svg.match(/<text/g) ?? []).length;

const bar = '═'.repeat(70);
console.log(bar);
console.log(`  ${NODES.length} nodes, every label inked`);
console.log(`  <text> elements in the exported SVG: ${textRuns}`);
console.log(`  ${core.formatLog(findings).split('\n')[0]}`);
console.log(bar);
console.log('  diagrams/inked-diagram.svg');
console.log(bar);
if (textRuns !== 0) {
  console.error('  FAILED: this drawing is supposed to contain no text elements at all');
  process.exitCode = 1;
}
