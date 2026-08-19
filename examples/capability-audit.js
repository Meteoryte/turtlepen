/**
 * Capability audit — draw the things the help claims, then LOOK at them.
 *
 * Every shape here has unit tests asserting exact quadrant sets. That proves
 * the mask is what the code says it is; it proves nothing about whether a
 * reader sees a cylinder. Six of these shapes had never been rendered at all,
 * which is precisely the gap this project keeps rediscovering.
 *
 *   node examples/capability-audit.js
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { statSync } from 'node:fs';

import {
  createDocument, placeBox, applyPen, addPage, createGroup, moveGroup,
  createConstraint, occupancy, validate, acceptFinding, exportSvg, saveDocument, NODE_SHAPES,
} from '../src/core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (f) => path.join(here, '..', 'diagrams', f);

const doc = createDocument({ name: 'Capability audit', canvas: { cols: 150, rows: 96 } });
const pen = (id, program, opts = {}) => applyPen(doc, opts.page ?? 'base', program, { id, ...opts });

const col = (c) => {
  let s = '';
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
};

pen('title', 'text "CAPABILITY AUDIT — every node shape, drawn" at D3 span 60x3 font 16 weight 700');

// ---- every non-container shape, same span, so differences are the shape ----
const SHAPES = NODE_SHAPES.filter((s) => s !== 'lane' && s !== 'group');
SHAPES.forEach((shape, i) => {
  const c = 4 + (i % 5) * 29;
  const r = 8 + Math.floor(i / 5) * 16;
  placeBox(doc, 'base', {
    id: `s_${shape}`, at: `${col(c)}${r}`, span: '24x11', label: shape,
    shape, align: 'center', fill: '#2ea685',
  });
});

// ---- containers, which claim only a frame ----
placeBox(doc, 'base', { id: 'the_lane', at: 'D42', span: '68x20', label: 'lane — members sit inside', shape: 'lane', fill: '#eef2ee' });
placeBox(doc, 'base', { id: 'inside_a', at: 'J48', span: '20x8', label: 'a member', align: 'center', fill: '#2ea685' });
placeBox(doc, 'base', { id: 'inside_b', at: 'AJ48', span: '20x8', label: 'another', align: 'center', fill: '#2ea685' });

placeBox(doc, 'base', { id: 'the_group', at: 'BX42', span: '54x20', label: 'group — a named container', shape: 'group', fill: '#f4f1e8' });
placeBox(doc, 'base', { id: 'grouped', at: 'CD48', span: '20x8', label: 'contained', align: 'center', fill: '#c2ed98' });

// ---- tone: density, not opacity ----
pen('tone_label', 'text "tone — half-toned shapes ink half their quadrants, and claim half" at D66 span 70x3 font 12 weight 600');
[['quarter', 8], ['half', 26], ['three-quarter', 44], ['solid', 62]].forEach(([tone, c]) => {
  pen(`tone_${tone}`, `pen ${col(c + 4)}74\ndisc 7`, { role: 'artwork', paint: 'cells', tone });
  pen(`tone_${tone}_l`, `text "${tone}" at ${col(c)}80 span 16x2 align center font 10`);
});

// ---- pattern along a path, keyed to distance travelled ----
pen('dashed', 'pen CB70\nright 20 line', { role: 'artwork', pattern: 'dashed', color: '#7a5c2e', width: 3 });
pen('dotted', 'pen CB74\nright 20 line', { role: 'artwork', pattern: 'dotted', color: '#7a5c2e', width: 3 });
pen('pattern_l', 'text "dashed / dotted" at CB78 span 22x2 align center font 10');

// ---- an overlay page: annotation that does not compete for quadrants ----
addPage(doc, { id: 'notes', intent: 'overlay', z: 1, title: 'annotation' });
pen('note', 'text "overlay page — sits on top without an L001" at D86 span 60x3 font 12 weight 600', { page: 'notes' });

// ---- groups and constraints, exercised rather than described ----
createGroup(doc, { id: 'lane_contents', label: 'lane contents', members: ['inside_a', 'inside_b'] });
moveGroup(doc, 'lane_contents', 2, 0);   // whole quadrants: 2 = one cell right
createConstraint(doc, {
  id: 'grouped_follows', dependent: 'grouped', target: 'the_group',
  dependentAnchor: 'NW', targetAnchor: 'NW', offsetX: 12, offsetY: 12,
});

// ---- free_space: does it find the room that is actually left? ----
const room = occupancy.freeRects(doc, 'base', { minCellsW: 10, minCellsH: 4, limit: 3 });
if (room[0]) console.log('  free_space fields:', Object.keys(room[0]).join(', '));

// A shape catalogue is not a process. The flowchart rules self-activate on any
// document containing a decision, which is correct — and this is exactly the
// case accept_finding exists for: declaring the exception rather than weakening
// the rule so catalogues stop tripping it.
for (const f of validate(doc).open) {
  if (f.rule === 'F002') {
    acceptFinding(doc, f.fingerprint,
      'this is a catalogue of shapes, not a flowchart — the decision is on display, not deciding anything');
  }
}

const log = validate(doc);
const bad = log.open.filter((f) => f.severity !== 'S3');
console.log(`shapes drawn: ${SHAPES.length} + 2 containers`);
console.log(`free_space found ${room.length} region(s); largest ${room[0]?.cells?.w}x${room[0]?.cells?.h} at ${room[0]?.at}`);
console.log(`findings: ${log.open.length} open (${bad.length} above INFO)`);
for (const f of log.open.filter((x) => x.severity !== 'S3')) {
  console.log(`  [${f.severity}] ${f.rule} ${f.actors.join(', ')} — ${f.message.slice(0, 110)}`);
}

const svg = await exportSvg(doc, out('capability-audit.svg'), { margin: 24 });
await saveDocument(doc, out('capability-audit.turtlepen.json'));
console.log(`wrote ${path.basename(svg)} (${statSync(svg).size} bytes)`);
if (bad.length) process.exit(1);
