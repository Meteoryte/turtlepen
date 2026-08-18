/**
 * Logo v2 — a new mark, drawing the old one.
 *
 * The first attempt at this was backwards: it put the old mark on the old
 * mark's own easel, which is a copy holding a copy, not a second version.
 *
 * This mark is genuinely new. The turtle is built from the flowchart shape
 * vocabulary this release ships — a `prep` hexagon shell, a `terminator` head,
 * `process` feet — so the mark is made of the thing the release added. On its
 * easel sits the PREVIOUS mark, placed with `place_image mode:"simplify"` from
 * a raster of brand/logo-mark.svg, on an overlay page beneath the pen so the
 * nib genuinely overlaps the artwork it is drawing.
 *
 *   node build_logo_v2.js
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { statSync, readFileSync } from 'node:fs';

import {
  createDocument, addPage, placeBox, applyPen, placeImage,
  validate, acceptFinding, exportSvg, saveDocument,
} from './src/core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (f) => path.join(here, 'brand', f);

const INK = {
  shell: '#1f6f4a',      // carapace
  plate: '#2f8f5b',      // shell plates
  skin: '#8fc866',       // head and feet
  board: '#fdfcf7',      // the canvas being drawn on
  frame: '#3f4a63',      // easel timber
};

const doc = createDocument({ name: 'TurtlePen logo v2 — the mark drawing the mark', canvas: { cols: 112, rows: 112 } });
const pen = (id, program, opts = {}) => applyPen(doc, opts.page ?? 'base', program, { id, ...opts });

// Anatomy lives on Z-pages, exactly as the previous mark does. Overlapping
// body parts on one page are an L001 error and should be; on stacked overlay
// pages they are L010 information, which is what a shell under a neck is.
addPage(doc, { id: 'parts', intent: 'overlay', z: 1, title: 'body parts over the shell' });
addPage(doc, { id: 'drawing', intent: 'overlay', z: 2, title: 'the previous mark, being drawn' });
addPage(doc, { id: 'ink', intent: 'overlay', z: 3, title: 'line work over everything' });

// ---------------------------------------------------------------- the turtle
// Shell as a hexagon: flat through the middle, tapered at both ends. The shape
// this release added, doing the job it was added for.
placeBox(doc, 'base', { id: 'shell', at: 'H46', span: '40x30', shape: 'prep', fill: INK.shell, label: '' });
placeBox(doc, 'parts', { id: 'plate-mid', at: 'S53', span: '16x16', shape: 'prep', fill: INK.plate, label: '' });

// Head: a terminator, because a head is where this creature starts.
placeBox(doc, 'parts', { id: 'neck', at: 'AF44', span: '12x9', fill: INK.skin, corner: 'rounded', label: '' });
placeBox(doc, 'parts', { id: 'head', at: 'AH33', span: '22x14', shape: 'terminator', fill: INK.skin, label: '' });

// Feet.
placeBox(doc, 'parts', { id: 'foot-fore', at: 'AB76', span: '12x7', shape: 'terminator', fill: INK.skin, label: '' });
placeBox(doc, 'parts', { id: 'foot-hind', at: 'L76', span: '12x7', shape: 'terminator', fill: INK.skin, label: '' });

// ---------------------------------------------------------------- the easel
placeBox(doc, 'base', { id: 'board', at: 'BL28', span: '36x38', fill: INK.board, label: '' });
placeBox(doc, 'base', { id: 'tray', at: 'BJ67', span: '40x4', fill: INK.frame, label: '' });
pen('leg-left', 'pen BN72\nray to BL90', { page: 'ink', role: 'artwork', color: INK.frame, width: 4, cap: 'round' });
pen('leg-right', 'pen CD72\nray to CF90', { page: 'ink', role: 'artwork', color: INK.frame, width: 4, cap: 'round' });
pen('leg-brace', 'pen BM84\nray to CE84', { page: 'ink', role: 'artwork', color: INK.frame, width: 3, cap: 'round' });

// Eye, arm, and the pen it holds.
pen('eye', 'pen AV38\ndisc 3', { page: 'ink', role: 'artwork', paint: 'cells' });
pen('arm', 'pen AR48\nray to BJ52', { page: 'ink', role: 'artwork', color: INK.skin, width: 5, cap: 'round' });
pen('nib', 'pen BJ52\nray to BP56', { page: 'ink', role: 'artwork', color: '#2b2a26', width: 3, cap: 'round' });

// ------------------------------------------------- what is on the easel: v1
placeImage(doc, 'drawing', {
  id: 'drawn-logo-v1',
  at: 'BN31',
  span: '32x27',
  // core/ is pure: it never touches the filesystem, so the path is resolved
  // to a data URI here, in the layer that is allowed to do I/O.
  source: `data:image/png;base64,${readFileSync(path.join(here, 'brand', 'logo-v2-source-mark.png')).toString('base64')}`,
  mode: 'simplify',
  detail: 'high',
});

// ---------------------------------------------------------------- wordmark
pen('wordmark', 'text "Turtle Pen" at AD94 span 46x7 font 30 weight 700 align center');
pen('sub', 'text "MCP" at AR103 span 20x4 font 14 weight 500 align center');

// ---------------------------------------------------------------- done means
// A neck joins a head. Declared, with a reason, rather than nudged apart until
// the log went quiet — and it lapses on its own if either shape moves.
const DELIBERATE = [
  [['neck', 'head'], 'the neck joins the head — the shared quadrants are the join'],
  [['arm', 'nib'], 'the hand holds the pen; the meeting quadrant is the grip'],
  [['plate-mid', 'neck'], 'the central shell plate meets the neck — one body, not two shapes'],
];
for (const f of validate(doc).open) {
  const match = DELIBERATE.find(([pair]) => pair.every((a) => f.actors.includes(a)));
  if (match) acceptFinding(doc, f.fingerprint, match[1]);
}

const log = validate(doc);
const bad = log.open.filter((f) => f.severity !== 'S3');
console.log(`elements: ${Object.values(doc.elements).flat().length}`);
console.log(`findings: ${log.open.length} open (${bad.length} above INFO)`);
for (const f of log.open) console.log(`  [${f.severity}] ${f.rule} ${f.actors.join(', ')} — ${f.message.slice(0, 110)}`);

const svg = await exportSvg(doc, out('logo-v2.svg'), { margin: 20 });
await saveDocument(doc, out('logo-v2.turtlepen.json'));
console.log(`wrote brand/logo-v2.svg (${statSync(svg).size} bytes) + .turtlepen.json`);

if (bad.length) {
  console.error('refusing to call this done: findings above INFO remain');
  process.exit(1);
}
