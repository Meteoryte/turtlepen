#!/usr/bin/env node
/**
 * Repairing an existing vector without redrawing it.
 *
 * This is the workflow the SVG editing capability audit asks for, run end to
 * end over the real stdio MCP: an SVG arrives from outside, is compiled into
 * ordinary lattice geometry, and is then *edited* — combined, offset, sliced,
 * reordered, measured — rather than thrown away and drawn again.
 *
 * The point is what is NOT here. Nothing re-derives the artwork from a
 * description, nothing guesses a coordinate, and every derived object can say
 * which objects it came from. A repair that cannot preserve the lattice is
 * refused by name instead of approximated, and this file asserts that too.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { createMcpClient } from './mcp-client.js';

const quiet = process.argv.includes('--quiet');
const cwd = await mkdtemp(resolve(tmpdir(), 'turtlepen-vector-repair-'));
const mcp = createMcpClient({ cwd, createdAt: '2026-08-29T09:00:00.000Z' });
const say = (line) => { if (!quiet) process.stdout.write(`${line}\n`); };

async function call(name, args = {}) {
  const result = await mcp.call(name, args);
  if (result.isError) throw new Error(`${name}: ${result.text ?? result.error}`);
  return result.text;
}
const asJson = async (name, args) => JSON.parse(await call(name, args));

// An icon of the kind a designer would hand over: two lattice-aligned bars that
// are meant to read as one mark, plus a separate rule beneath them.
const INCOMING_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">',
  '  <rect x="40" y="40" width="60" height="40" fill="#2f6fed" />',
  '  <rect x="90" y="40" width="60" height="40" fill="#2f6fed" />',
  '  <rect x="40" y="120" width="110" height="10" fill="#8a94a6" />',
  '</svg>',
].join('\n');

try {
  await mcp.init();
  await call('new_diagram', { name: 'vector repair', path: 'repair.turtlepen.json', cols: 60, rows: 30 });
  await writeFile(resolve(cwd, 'incoming.svg'), INCOMING_SVG, 'utf8');

  // 1. Inspect before mutating. inspect_svg compiles nothing into the document;
  //    it reports what an import WOULD produce, including any lattice shift.
  const report = await asJson('inspect_svg', { source: 'incoming.svg', prefix: 'mark' });
  say(`inspect_svg: ${report.elements.length} importable elements, ${report.rejected?.length ?? 0} refused`);
  assert.equal(report.elements.length, 3, 'all three rectangles are lattice-compatible');

  // 2. Import. From here the artwork is ordinary TurtlePen geometry: the same
  //    boolean, slice, collision, history and render paths as hand-drawn work.
  const imported = await asJson('import_svg', { source: 'incoming.svg', prefix: 'mark' });
  assert.deepEqual(imported.created, ['mark-1', 'mark-2', 'mark-3'], 'ids are deterministic');
  say(`import_svg: created ${imported.created.join(', ')}`);

  // 3. Measure before deciding. Exact quadrant areas and bounds, not estimates.
  const before = await asJson('inspect', { ids: imported.created, footprint: 'visual' });
  say(`inspect: ${before.elements.map((e) => `${e.id}=${e.quadrants}q`).join(' ')}`);

  // 4. The two bars were always one mark. Union welds them into a single
  //    object with exact set algebra — no redraw, and provenance is retained.
  const welded = await asJson('boolean', { action: 'union', ids: ['mark-1', 'mark-2'], id: 'mark' });
  say(`boolean union -> ${welded.id ?? 'mark'}`);

  // 5. Give the mark a keyline by dilating it outward one quadrant, keeping the
  //    original so the two can be compared rather than one silently replacing it.
  //    The colour is not decoration: an offset painted in its source's own
  //    colour is invisible in the render, and an example whose output does not
  //    show the thing it claims is not evidence of anything.
  await call('offset_path', {
    id: 'mark', distance: 1, resultId: 'mark-keyline', removeSource: false, color: '#0b2f7a',
  });

  // 6. The rule beneath is one object but reads as two. Slice it on a named
  //    lattice boundary; the result ids are stated, not discovered afterwards.
  const cut = await asJson('slice', {
    id: 'mark-3', axis: 'vertical', at: 'K1.tl', mode: 'partition', ids: ['rule-left', 'rule-right'],
  });
  say(`slice -> ${(cut.created ?? cut.ids ?? []).join(', ')}`);

  // 7. Stacking is explicit: the keyline belongs behind the mark it outlines.
  await call('reorder', { id: 'mark-keyline', action: 'send_to_back' });

  // 8. Measure the repaired result, then let the engine judge it.
  const after = await asJson('inspect', { ids: ['mark', 'mark-keyline'], footprint: 'visual' });
  const keyline = after.elements.find((e) => e.id === 'mark-keyline');
  const mark = after.elements.find((e) => e.id === 'mark');
  assert.ok(keyline.quadrants > mark.quadrants, 'an outward offset must enclose more than its source');
  say(`inspect: mark=${mark.quadrants}q keyline=${keyline.quadrants}q `
    + `(bounds ${mark.bounds.w}x${mark.bounds.h} -> ${keyline.bounds.w}x${keyline.bounds.h})`);

  const log = await asJson('validate', { format: 'json' });
  say(`validate: ${log.open.length} open finding(s)`);

  // The engine will not render an unadjudicated overlap, and it is right not
  // to: a keyline enclosing its mark is indistinguishable, from geometry
  // alone, from two paths accidentally drawn on top of each other. The
  // difference is intent, so intent has to be stated rather than inferred.
  const overlap = log.open.find((f) => f.rule === 'L006');
  assert.ok(overlap, 'an enclosing keyline must be reported, not silently allowed');
  await call('accept_finding', {
    fingerprint: overlap.fingerprint,
    reason: 'The keyline is an outward offset of this exact mark and sits behind it, '
      + 'so full containment is the intended result rather than two paths colliding.',
  });

  // 9. The refusals are the other half of the contract. Geometry that cannot
  //    land on the lattice is named, not rounded into something plausible.
  const curved = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">'
    + '<path d="M0 0 C 10 10, 20 0, 30 10" stroke="#000" fill="none"/></svg>';
  const refusedCurve = await mcp.call('import_svg', { source: curved });
  assert.equal(refusedCurve.isError, true, 'a Bezier curve has no exact lattice form');
  say(`refused as designed: ${refusedCurve.text.split('\n')[0].slice(0, 96)}`);

  const offGrid = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">'
    + '<rect x="3" y="7" width="11" height="9" fill="#000"/></svg>';
  const refusedOffGrid = await mcp.call('import_svg', { source: offGrid });
  assert.equal(refusedOffGrid.isError, true, 'off-lattice coordinates are refused by default');
  // ...and are accepted only when the caller says so, with every shift reported.
  const quantized = await asJson('inspect_svg', { source: offGrid, quantize: 'nearest', prefix: 'snap' });
  assert.ok(quantized.elements.length > 0, 'quantize:"nearest" is the explicit opt-in');
  say('off-lattice input: refused by default, importable only via quantize:"nearest"');

  // 10. The whole repair is one undoable history, and it renders.
  await call('render', { path: 'repair.svg' });
  const svg = await readFile(resolve(cwd, 'repair.svg'), 'utf8');
  assert.match(svg, /<svg/, 'the repaired document exports as SVG');

  const status = await asJson('history', { action: 'status' });
  assert.ok(status.undo_available > 0, 'every step above is undoable');
  say(`history: ${status.undo_available} undoable step(s); next undo is ${status.next_undo}`);

  say('vector repair session OK — the artwork was edited, never redrawn.');
} finally {
  await mcp.close();
  await rm(cwd, { recursive: true, force: true });
}
