/**
 * A swimlane flowchart — proof that containers hold their members.
 *
 * Three lanes down the page, each naming the role that performs its steps.
 * Every node sits inside a lane and collides with nothing, because a container
 * reserves only its title band and border ring and leaves its hole free.
 *
 * Flow runs HORIZONTALLY within a lane and VERTICALLY between them. The
 * vertical hops necessarily cross a lane border, which is a real L004 — the
 * connector does cross inked ink — and is exactly what `accept_finding` is
 * for: handing over is the point of a swimlane, not a defect.
 *
 *   node build-swimlane.js
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { statSync } from 'node:fs';

import {
  createDocument, placeBox, applyPen, validate, acceptFinding, exportSvg, saveDocument, loadDocument, preservePerceptualReview,
} from './src/core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = process.env.TURTLEPEN_OUTPUT_DIR
  ? path.resolve(process.env.TURTLEPEN_OUTPUT_DIR)
  : path.join(here, 'diagrams');
const out = (f) => path.join(outputRoot, f);
const documentPath = out('swimlane-order-handling.turtlepen.json');
const previous = await loadDocument(documentPath).catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

const INK = { lane: '#eef2ee', node: '#2ea685', end: '#c2ed98', start: '#0f766e' };
const FIXED_CREATED_AT = '2026-08-26T22:40:43.689Z';
const FIXED_ACCEPTED_AT = new Map([
  ['155995cbffa5', '2026-08-26T22:40:45.170Z'],
  ['2b000c28ce08', '2026-08-26T22:40:44.675Z'],
  ['807a53ce8158', '2026-08-26T22:40:46.090Z'],
  ['f61146bb58fa', '2026-08-26T22:40:45.627Z'],
]);

const doc = createDocument({ name: 'Order handling — swimlanes', canvas: { cols: 122, rows: 66 } });
doc.createdAt = FIXED_CREATED_AT;
const pen = (id, program) => applyPen(doc, 'base', program, { id });

pen('title', 'text "ORDER HANDLING" at D3 span 30x3 font 16 weight 700');

// Lanes: who performs the steps inside.
for (const [id, row, label] of [
  ['lane_customer', 8, 'Customer'],
  ['lane_sales', 27, 'Sales'],
  ['lane_warehouse', 46, 'Warehouse'],
]) {
  placeBox(doc, 'base', { id, at: `D${row}`, span: '112x17', label, shape: 'lane', align: 'left', fill: INK.lane });
}

// Steps, each seated in a lane's hole.
placeBox(doc, 'base', { id: 'place', at: 'H14', span: '22x8', label: 'Place order', shape: 'terminator', align: 'center', fill: INK.start });
placeBox(doc, 'base', { id: 'receive', at: 'H33', span: '22x8', label: 'Receive order', align: 'center', fill: INK.node });
placeBox(doc, 'base', { id: 'stock', at: 'AO33', span: '16x8', label: 'In stock?', shape: 'decision', align: 'center', fill: INK.node });
placeBox(doc, 'base', { id: 'backorder', at: 'CB33', span: '22x8', label: 'Back-order it', align: 'center', fill: INK.node });
placeBox(doc, 'base', { id: 'pick', at: 'AL52', span: '22x8', label: 'Pick and pack', align: 'center', fill: INK.node });
placeBox(doc, 'base', { id: 'ship', at: 'BR52', span: '20x8', label: 'Shipped', shape: 'terminator', align: 'center', fill: INK.end });

// Within a lane: horizontal. Between lanes: vertical.
pen('e_place_receive', 'pen from place.S\ndown line to receive.N arrow');
pen('e_receive_stock', 'pen from receive.E\nright line to stock.W arrow');
pen('e_stock_backorder', 'pen from stock.E\nright line to backorder.W arrow');
pen('e_stock_pick', 'pen from stock.S\ndown line to pick.N arrow');
pen('e_pick_ship', 'pen from pick.E\nright line to ship.W arrow');

pen('l_no', 'text "NO" at BM34 span 5x2 align center');
pen('l_yes', 'text "YES" at AY44 span 5x2 align center');

// Crossing a lane border is the handover a swimlane exists to show.
for (const f of validate(doc).open) {
  if (f.rule === 'L004' && f.actors.some((a) => a.startsWith('lane_'))) {
    acceptFinding(doc, f.fingerprint,
      'the flow hands over between lanes here — crossing the lane border is what a swimlane depicts');
  }
}
for (const acceptance of doc.acceptances) {
  acceptance.acceptedAt = FIXED_ACCEPTED_AT.get(acceptance.fingerprint) ?? FIXED_CREATED_AT;
}

const log = validate(doc);
const bad = log.open.filter((f) => f.severity !== 'S3');
console.log(`elements: ${Object.values(doc.elements).flat().length}`);
console.log(`findings: ${log.open.length} open (${bad.length} above INFO), ${log.accepted.length} accepted`);
for (const f of log.open) console.log(`  [${f.severity}] ${f.rule} ${f.actors.join(', ')} — ${f.message.slice(0, 110)}`);

const svg = await exportSvg(doc, out('swimlane-order-handling.svg'), { margin: 24 });
preservePerceptualReview(doc, previous);
await saveDocument(doc, documentPath);
console.log(`wrote ${path.basename(svg)} (${statSync(svg).size} bytes) + .turtlepen.json`);

if (bad.length) {
  console.error('refusing to call this done: findings above INFO remain');
  process.exit(1);
}
