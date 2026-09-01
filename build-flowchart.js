/**
 * Build the reference decision flowchart with real flowchart symbols.
 *
 * This exists as a script rather than a saved document because it is evidence:
 * the same chart was previously attempted with rectangles standing in for
 * decisions, and a reader could not tell the difference from the JSON. Here the
 * shape of every node is stated in one readable place, and the script refuses
 * to finish if the finished state is not clean.
 *
 *   node build-flowchart.js
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  createDocument, placeBox, applyPen, validate, exportSvg, saveDocument, loadDocument, preservePerceptualReview,
} from './src/core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = process.env.TURTLEPEN_OUTPUT_DIR
  ? path.resolve(process.env.TURTLEPEN_OUTPUT_DIR)
  : path.join(here, 'diagrams');
const out = (f) => path.join(outputRoot, f);
const documentPath = out('flowchart-important-process.turtlepen.json');
const previous = await loadDocument(documentPath).catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

const INK = { decision: '#2ea685', start: '#0f766e', fix: '#00a67d', end: '#c2ed98', muted: '#e9e7e1' };
const FIXED_CREATED_AT = '2026-08-26T22:40:43.319Z';

// The vertical spine. Every decision is a diamond; row is its top edge.
const SPINE = [
  ['others', 14, 'Will others see this chart?'],
  ['impressive', 27, 'Need to be impressive?'],
  ['reading', 40, 'Clear where to start reading?'],
  ['spelling', 53, 'Free of spelling and logic errors?'],
  ['fonts', 66, 'Fonts consistent?'],
  ['lines', 79, 'Lines organized?'],
  ['color', 92, 'Added color?'],
  ['good', 105, 'Do the colors look good?'],
  ['contrast', 118, 'Useful contrast?'],
];

// Decisions whose NO returns to the fix block on the left.
const RETURNS = SPINE.slice(2);

const doc = createDocument({ name: 'Important Process — flowchart', canvas: { cols: 115, rows: 148 } });
doc.createdAt = FIXED_CREATED_AT;
const pen = (id, program) => applyPen(doc, 'base', program, { id });

pen('title', 'text "IMPORTANT PROCESS" at F4 span 30x3 font 16 weight 700');

// One start, and only one — the flowchart rule that is worth being literal about.
placeBox(doc, 'base', { id: 'start', at: 'AW5', span: '24x8', label: 'Start', shape: 'terminator', align: 'center', fill: INK.start });

for (const [id, row, label] of SPINE) {
  placeBox(doc, 'base', { id, at: `AZ${row}`, span: '18x11', label, shape: 'decision', align: 'center', fill: INK.decision });
}

placeBox(doc, 'base', { id: 'fix', at: 'F40', span: '27x87', align: 'center', fill: INK.fix,
  label: 'Gotta fix that. Make changes, then return to the last question you answered.' });
placeBox(doc, 'base', { id: 'optional', at: 'CF20', span: '25x9', label: 'OK, all of this is optional.', shape: 'terminator', align: 'center', fill: INK.muted });
placeBox(doc, 'base', { id: 'congrats', at: 'AU132', span: '28x7', label: 'Congrats! You have a beautiful diagram.', shape: 'terminator', align: 'center', fill: INK.end });

// YES runs straight down the spine: top-to-bottom order, one arrow per path.
const chain = ['start', ...SPINE.map(([id]) => id), 'congrats'];
for (let i = 0; i < chain.length - 1; i++) {
  pen(`e_${chain[i]}_yes`, `pen from ${chain[i]}.S\ndown line to ${chain[i + 1]}.N arrow`);
}

// NO leaves west on the decision's own row, so seven returns share no track.
// This is the whole answer to the "traffic jam" a previous attempt hit by
// funnelling every return through one column.
for (const [id] of RETURNS) {
  pen(`e_${id}_no`, `pen from ${id}.W\nleft line to fix.E arrow`);
}

// The two early exits leave east to the optional terminator.
pen('e_others_no', 'pen from others.E\nright line to optional.N\ndown corner align top right\ndown line to optional.N arrow');
pen('e_imp_no', 'pen from impressive.E\nright line to optional.S\nup corner align bottom right\nup line to optional.S arrow');

// Branch labels. Rule 3: every branch out of a decision says which one it is.
const YES_ROWS = [25, 38, 51, 64, 77, 90, 103, 116, 129];
SPINE.forEach(([id], i) => pen(`l_${id}_yes`, `text "YES" at BK${YES_ROWS[i]} span 5x2 align center`));
RETURNS.forEach(([id, row]) => pen(`l_${id}_no`, `text "NO" at AL${row + 1} span 5x2 align center`));
pen('l_others_no', 'text "NO" at BY15 span 5x2 align center');
pen('l_imp_no', 'text "NO" at BY28 span 5x2 align center');

// Done means validated at the FINAL state, rendered, and clean.
const log = validate(doc);
const bad = log.open.filter((f) => !['S3'].includes(f.severity));
console.log(`elements: ${Object.values(doc.elements).flat().length}`);
console.log(`findings: ${log.open.length} open (${bad.length} above INFO), ${log.accepted?.length ?? 0} accepted`);
for (const f of log.open) console.log(`  [${f.severity}] ${f.rule} ${f.actors.join(', ')} — ${f.message.slice(0, 120)}`);

// exportSvg writes; renderSvg only returns a string. Awaiting it — and
// reporting the byte count — is the difference between saying "wrote" and
// having written.
const svgPath = await exportSvg(doc, out('flowchart-important-process.svg'), { showGrid: true, bounds: 'content', margin: 20 });
preservePerceptualReview(doc, previous);
await saveDocument(doc, documentPath);
const { statSync } = await import('node:fs');
console.log(`wrote ${path.basename(svgPath)} (${statSync(svgPath).size} bytes) + .turtlepen.json`);

if (bad.length) {
  console.error('refusing to call this done: findings above INFO remain');
  process.exit(1);
}
