#!/usr/bin/env node
/**
 * A worked example: map the diagram, see whether it conflicts, then commit.
 *
 * It deliberately makes the mistake this project exists to catch — a box sized
 * by eye rather than by measurement — and catches it during a REHEARSAL, before
 * anything is written. It then repairs the plan with the engine's own reported
 * numbers, commits a clean composition, and shows the two kinds of Z-page.
 *
 *   node examples/build-example.js
 */

import { resolve } from 'node:path';
import * as core from '../src/core/index.js';

const OUT = resolve(process.cwd(), 'diagrams/example.turtlepen.json');
const SVG = resolve(process.cwd(), 'diagrams/example.svg');
const FIXED_CREATED_AT = '2026-08-10T13:29:24.124Z';
const previous = await core.loadDocument(OUT).catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

const rule = (s) => console.log(`\n${'─'.repeat(72)}\n${s}\n${'─'.repeat(72)}`);

const doc = core.createDocument({ name: 'ingest pipeline', canvas: { cols: 120, rows: 60 } });
doc.createdAt = FIXED_CREATED_AT;

// --- 1. Measure before deciding a size ---------------------------------------
rule('1. measure BEFORE sizing anything — the step most tools cannot offer');

const LABEL = 'Ingest & Normalize Payload';
const guess = core.text.fitReport(LABEL, core.geometry.rect(0, 0, 12, 8), { fontSize: 10 });
console.log(`a 6x4 guess:  fits=${guess.fits}  ${guess.charsPerLine} chars/line, needs ${guess.lineCount} lines, ${guess.visibleLines} visible`);

const measured = core.text.requiredCellsFor(LABEL, { fontSize: 10, maxWidthCells: 14 });
console.log(`measured:     at 14 cells wide -> ${measured.lines} line(s), ${measured.charsPerLine} chars/line, ${measured.cellsTall} cells tall`);

// --- 2. Rehearse the whole composition ---------------------------------------
rule('2. plan the whole composition — nothing is written yet');

const composition = [
  { op: 'place_box', id: 'ingest', at: 'C4.tl', span: { w: 14, h: 4 }, label: LABEL, corner: 'rounded' },
  { op: 'place_box', id: 'queue', at: 'C12.tl', span: { w: 14, h: 4 }, label: 'Work Queue', corner: 'rounded' },
  { op: 'place_box', id: 'db', at: 'V12.tl', span: { w: 10, h: 4 }, label: 'Postgres', corner: 'indented' },

  // Each leg's `align` matches the half-cell the previous piece left the cursor
  // on — that is what keeps the path contiguous. The run ends in an arrowhead,
  // so it points at the box without overlapping it.
  {
    op: 'pen',
    id: 'ingest-to-queue',
    program: `
      pen J8.q1
      down 2 align right line
      down corner align top right
      right 3 align top line
      right corner align left bottom
      down align left line to queue.N arrow
    `,
  },
  { op: 'pen', id: 'queue-to-db', program: 'pen Q14.q1\nright align top line to db.W arrow' },

  // The mistake: sized by eye rather than by measurement.
  { op: 'place_box', id: 'audit', at: 'C20.tl', span: { w: 6, h: 3 }, label: 'Immutable Audit Trail' },
];

const rehearsal = core.planOperations(doc, composition);
console.log(`rehearsed ${rehearsal.applied} operation(s) on a copy. Live document elements: ${core.elementsOf(doc, 'base').length}\n`);
console.log(core.formatLog(rehearsal.validation));

// --- 3. Repair the plan, not the document ------------------------------------
rule('3. repair the PLAN using the numbers the rehearsal handed back');

const overflow = rehearsal.validation.open.find((f) => f.rule === 'L002');
const widen = overflow.fixes.find((f) => f.kind === 'widen');
const need = core.text.requiredCellsFor('Immutable Audit Trail', { fontSize: 10, maxWidthCells: widen.to });
console.log(`applying: ${widen.description}, then ${need.cellsTall} cells tall for ${need.lines} line(s)`);

const auditOp = composition.find((o) => o.id === 'audit');
auditOp.span = { w: widen.to, h: need.cellsTall };

const second = core.planOperations(doc, composition);
console.log(core.formatLog(second.validation));

// --- 4. Commit ----------------------------------------------------------------
rule('4. commit — all of it, or none of it');

const committed = core.commitOperations(doc, composition);
console.log(`committed ${committed.applied} operation(s); page "base" now holds ${core.elementsOf(doc, 'base').length} elements`);
console.log(committed.validation.summary.clean ? 'validates CLEAN' : 'NOT CLEAN');

// --- 5. Z-pages: the same geometry, two meanings ---------------------------------
rule('5. Z-pages — identical overlap, opposite severity');

core.addPage(doc, { id: 'notes', z: 1, intent: 'overlay', title: 'Review notes' });
core.placeBox(doc, 'notes', { id: 'note-1', at: 'C1.tl', span: { w: 8, h: 3 }, label: 'p95 4.2s', corner: 'chamfered' });
core.placeBox(doc, 'notes', { id: 'note-marker', at: 'P4.tl', span: { w: 1, h: 1 } });

core.addPage(doc, { id: 'phase2', z: 2, intent: 'exclusive', title: 'Phase 2 additions' });
core.placeBox(doc, 'phase2', { id: 'cache', at: 'AH12.tl', span: { w: 8, h: 3 }, label: 'Redis', corner: 'rounded' });
core.placeBox(doc, 'phase2', { id: 'cache-marker', at: 'P12.tl', span: { w: 1, h: 1 } });

const staged = core.validate(doc);
console.log(core.formatLog(staged, { showFixes: false }));

// --- 6. Adjudicate ----------------------------------------------------------------
rule('6. adjudicate — declare which overlaps are intended');

const exclusiveHit = staged.open.find((f) => f.rule === 'L005');
console.log(`the stacking is deliberate, so page "phase2" is really an overlay: ${exclusiveHit.fixes[0].description}`);
core.updatePage(doc, 'phase2', { intent: 'overlay' });

const final = core.validate(doc);
console.log(core.formatLog(final));

// --- 7. See it -------------------------------------------------------------------
rule('7. render');

console.log(core.renderAscii(doc, { page: 'base', findings: final.open }).text);

core.preservePerceptualReview(doc, previous);
await core.saveDocument(doc, OUT);
await core.exportSvg(doc, SVG, { findings: final.open, showGrid: true });
console.log(`\nwrote ${OUT}`);
console.log(`wrote ${SVG}`);
console.log(`\nview it:  node src/viewer/server.js --doc ${OUT}`);

process.exitCode = final.summary.clean ? 0 : 1;
