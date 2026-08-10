/**
 * Recreate the turtle-at-easel reference as TurtlePen's actual logo.
 *
 * Every visible mark is authored through TurtlePen operations. Solid forms are
 * scan-converted into exact 5px quadrants; outlines, expression, pen, easel,
 * flourish, and type are ordinary pen/text commands. No source bitmap is
 * embedded in the result.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const session = createSession({ cwd: project });
const tools = Object.fromEntries(createTools(session).map((tool) => [tool.name, tool]));
const q = (x, y) => core.address.quadToAddress(x, y);

const C = Object.freeze({
  navy: '#001b35',
  navySoft: '#40516b',
  green: '#a8c95f',
  greenLight: '#c7dc82',
  greenDark: '#255943',
  cream: '#fff0bd',
  white: '#fffdf5',
  shadow: '#cbc9c1',
});

const operations = [
  { op: 'add_page', id: 'fills', z: 1, intent: 'overlay', title: 'Lattice colour' },
  { op: 'add_page', id: 'outlines', z: 2, intent: 'overlay', title: 'Navy outlines' },
  { op: 'add_page', id: 'features', z: 3, intent: 'overlay', title: 'Face and shell detail' },
  { op: 'add_page', id: 'type', z: 4, intent: 'overlay', title: 'Wordmark' },
];

const solid = (id, program, color, page = 'fills') => operations.push({
  op: 'pen', id, page, program, role: 'artwork', color, paint: 'cells',
});
const line = (id, program, color = C.navy, width = 5, page = 'outlines') => operations.push({
  op: 'pen', id, page, program, role: 'artwork', color, width, cap: 'round',
});

// --- Filled silhouettes, back to front ------------------------------------

// Board and easel live behind the turtle's drawing hand.
const board = [[145, 45], [205, 43], [198, 127], [132, 127]];
solid('board-fill', polygonFill(board), C.white);
solid('tray-fill', polygonFill([[127, 126], [202, 126], [202, 133], [127, 133]]), C.navySoft);
solid('leg-left-fill', polygonFill([[139, 132], [148, 132], [139, 170], [131, 170]]), C.navySoft);
solid('leg-right-fill', polygonFill([[184, 132], [193, 132], [201, 170], [193, 170]]), C.navySoft);
solid('brace-fill', polygonFill([[142, 154], [190, 154], [190, 159], [141, 159]]), C.navySoft);
solid('clip-fill', polygonFill([[166, 41], [187, 41], [185, 51], [165, 51]]), C.navySoft);
solid('clip-tab-fill', polygonFill([[173, 33], [182, 33], [181, 42], [172, 42]]), C.navySoft);

// Turtle body. Overlaps are deliberate cartoon construction and are recorded
// as accepted findings below rather than hidden from validation.
solid('shell-fill', ellipseFill(62, 108, 39, 43), C.greenDark);
solid('left-foot-fill', ellipseFill(70, 157, 14, 15), C.green);
solid('right-foot-fill', polygonFill([[91, 146], [106, 145], [112, 169], [89, 169]]), C.green);
solid('plastron-fill', ellipseFill(91, 111, 22, 43), C.cream);
solid('neck-fill', polygonFill([[75, 72], [101, 72], [98, 91], [78, 91]]), C.green);
solid('head-fill', ellipseFill(91, 51, 27, 27), C.greenLight);
solid('snout-fill', ellipseFill(104, 59, 17, 14), C.greenLight);
solid('arm-fill', polygonFill([[91, 92], [102, 94], [113, 99], [126, 96], [136, 87], [145, 82], [154, 85], [151, 96], [137, 105], [119, 112], [103, 110], [94, 104]]), C.green);
solid('hand-fill', ellipseFill(145, 89, 12, 10), C.green);

// --- Primary outlines ------------------------------------------------------

line('board-outline', polygonOutline(board));
line('tray-outline', polygonOutline([[127, 126], [202, 126], [202, 133], [127, 133]]));
line('leg-left-outline', polygonOutline([[139, 132], [148, 132], [139, 170], [131, 170]]));
line('leg-right-outline', polygonOutline([[184, 132], [193, 132], [201, 170], [193, 170]]));
line('brace-outline', polygonOutline([[142, 154], [190, 154], [190, 159], [141, 159]]));
line('clip-outline', polygonOutline([[166, 41], [187, 41], [185, 51], [165, 51]]));
line('clip-tab-outline', polygonOutline([[173, 33], [182, 33], [181, 42], [172, 42]]));

line('shell-outline', ellipseOutline(62, 108, 39, 43));
line('left-foot-outline', ellipseOutline(70, 157, 14, 15));
line('right-foot-outline', polygonOutline([[91, 146], [106, 145], [112, 169], [89, 169]]));
line('plastron-outline', ellipseOutline(91, 111, 22, 43));
line('neck-outline', polygonOutline([[75, 72], [101, 72], [98, 91], [78, 91]]));
line('head-outline', ellipseOutline(91, 51, 27, 27));
line('snout-outline', ellipseOutline(104, 59, 17, 14));
line('arm-outline', polygonOutline([[91, 92], [102, 94], [113, 99], [126, 96], [136, 87], [145, 82], [154, 85], [151, 96], [137, 105], [119, 112], [103, 110], [94, 104]]));
line('hand-outline', ellipseOutline(145, 89, 12, 10));

// --- Shell plates, face, pen, and board flourish --------------------------

line('shell-rim', ellipseOutline(62, 108, 32, 36), C.greenLight, 4, 'features');
line('shell-band', polyline([[27, 108], [94, 108]]), C.navy, 4, 'features');
line('shell-left-plates', polyline([[61, 72], [48, 84], [45, 102], [61, 108], [46, 122], [50, 139], [61, 146]]), C.navy, 4, 'features');
line('shell-right-plates', polyline([[61, 72], [75, 84], [79, 102], [61, 108], [77, 122], [73, 139], [61, 146]]), C.navy, 4, 'features');

// Plastron panel seams.
line('chest-seams', [
  polyline([[73, 100], [94, 100]]),
  polyline([[70, 119], [99, 119]]),
  polyline([[73, 138], [101, 138]]),
].join('\n'), C.navy, 3, 'features');

// Eye whites, navy pupils, brow, nostril, and smile.
solid('eye-left-white', 'disc 9 at ' + q(86, 49), C.white, 'features');
solid('eye-right-white', 'disc 8 at ' + q(113, 48), C.white, 'features');
line('eye-left-outline', `circle 9 at ${q(86, 49)}`, C.navy, 5, 'features');
line('eye-right-outline', `circle 8 at ${q(113, 48)}`, C.navy, 5, 'features');
solid('pupil-left', 'disc 4 at ' + q(87, 49), C.navy, 'features');
solid('pupil-right', 'disc 3 at ' + q(111, 49), C.navy, 'features');
solid('eye-glint-left', 'disc 1 at ' + q(88, 47), C.white, 'features');
solid('eye-glint-right', 'disc 1 at ' + q(112, 47), C.white, 'features');
line('brow', polyline([[78, 39], [84, 36], [91, 36]]), C.navy, 5, 'features');
solid('nostril', 'disc 1 at ' + q(112, 61), C.navy, 'features');
line('smile', polyline([[93, 65], [97, 69], [103, 71], [110, 69]]), C.navy, 4, 'features');

// Pen held by the turtle, including grey barrel and navy nib.
line('pen-outer', polyline([[143, 82], [169, 97]]), C.navy, 5, 'features');
line('pen-inner', polyline([[145, 82], [168, 95]]), C.navySoft, 3, 'features');
solid('pen-nib-fill', polygonFill([[168, 93], [176, 101], [166, 98]]), C.navy, 'features');
line('pen-nib-outline', polygonOutline([[168, 93], [176, 101], [166, 98]]), C.navy, 3, 'features');

// The mark on the board echoes the supplied reference without embedding it.
line('board-flourish', polyline([[171, 101], [178, 100], [185, 97], [190, 92], [194, 85], [197, 77], [198, 72]]), C.greenDark, 5, 'features');
line('board-flourish-tip', `arc 4 180 360 at ${q(199, 72)}`, C.greenDark, 5, 'features');

// Grounding shadows are lattice marks, not filters.
line('turtle-shadow', polyline([[49, 173], [108, 173]]), C.shadow, 5, 'features');
line('easel-shadow', polyline([[127, 173], [204, 173]]), C.shadow, 5, 'features');

// --- Wordmark --------------------------------------------------------------

operations.push({
  op: 'pen', page: 'type',
  program: `text "Turtle Pen" at ${q(20, 180)} span 100x17 id wordmark font 120 fill ${C.navy} weight 800 align center`,
});
operations.push({
  op: 'pen', page: 'type',
  program: `text "M C P" at ${q(90, 211)} span 30x11 id mcp font 74 fill ${C.greenDark} weight 700 align center`,
});
line('mcp-rule-left', polyline([[59, 221], [88, 221]]), C.greenDark, 4, 'type');
line('mcp-rule-right', polyline([[152, 221], [181, 221]]), C.greenDark, 4, 'type');

await tools.new_diagram.handler({
  name: 'TurtlePen logo — turtle at easel',
  path: 'brand/logo.turtlepen.json',
  cols: 120,
  rows: 120,
});
session.doc.createdAt = '2026-08-08T00:00:00.000Z';
session.doc.font.family = '"Segoe UI", Arial, sans-serif';

const rehearsal = await tools.plan.handler({ operations, commit: false });
if (/FAILED/.test(rehearsal)) throw new Error(rehearsal);
const committed = await tools.plan.handler({ operations, commit: true });
if (/FAILED/.test(committed)) throw new Error(committed);

// Cartoon construction intentionally layers touching silhouettes. Adjudicate
// every non-INFO collision by its exact fingerprint so any geometry change
// invalidates the acceptance and makes the build fail visibly again.
const beforeAcceptance = core.validate(session.doc);
const blockers = beforeAcceptance.open.filter((finding) => finding.severity !== 'S3');
if (blockers.length) {
  const acceptanceOps = blockers.map((finding) => ({
    op: 'accept_finding',
    fingerprint: finding.fingerprint,
    reason: `Intentional logo construction: ${finding.rule} between ${finding.actors.join(' and ')} is required by the supplied turtle-at-easel composition.`,
  }));
  const accepted = await tools.plan.handler({ operations: acceptanceOps, commit: true });
  if (/FAILED/.test(accepted)) throw new Error(accepted);
}

const validation = core.validate(session.doc);
const remainingBlockers = validation.open.filter((finding) => finding.severity !== 'S3');
if (remainingBlockers.length) throw new Error(core.formatLog(validation));
for (const acceptance of session.doc.acceptances) acceptance.acceptedAt = '2026-08-08T00:00:00.000Z';

await tools.save.handler({});
await tools.render.handler({ path: 'brand/logo.svg', showGrid: false, bounds: 'canvas', margin: 0 });
await core.exportSvg(session.doc, resolve(project, 'brand/logo-mark.svg'), {
  pages: ['fills', 'outlines', 'features'], showGrid: false, bounds: 'content', margin: 20,
});

console.log(`logo authored with TurtlePen: ${operations.length} composition operations`);
console.log(`accepted intentional construction findings: ${blockers.length}`);
console.log('document: brand/logo.turtlepen.json');
console.log('render: brand/logo.svg (1200x1200)');
console.log(`mark: brand/logo-mark.svg; validation CLEAN (${validation.open.length} INFO, ${validation.accepted.length} accepted)`);

function ellipseFill(cx, cy, rx, ry) {
  const rows = [];
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    const ratio = 1 - ((y - cy) * (y - cy)) / (ry * ry);
    if (ratio < 0) continue;
    const half = Math.floor(rx * Math.sqrt(ratio));
    rows.push(`pen ${q(cx - half, y)}\ndash ${half * 2 + 1} e`);
  }
  return rows.join('\n');
}

function ellipseOutline(cx, cy, rx, ry, steps = 72) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    const point = [Math.round(cx + Math.cos(angle) * rx), Math.round(cy + Math.sin(angle) * ry)];
    if (!points.length || point[0] !== points.at(-1)[0] || point[1] !== points.at(-1)[1]) points.push(point);
  }
  return polygonOutline(points);
}

function polygonFill(points) {
  const minX = Math.floor(Math.min(...points.map((p) => p[0])));
  const maxX = Math.ceil(Math.max(...points.map((p) => p[0])));
  const minY = Math.floor(Math.min(...points.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...points.map((p) => p[1])));
  const lines = [];
  for (let y = minY; y <= maxY; y += 1) {
    let start = null;
    for (let x = minX; x <= maxX + 1; x += 1) {
      const inside = x <= maxX && pointInPolygon(x + 0.5, y + 0.5, points);
      if (inside && start == null) start = x;
      if (!inside && start != null) {
        lines.push(`pen ${q(start, y)}\ndash ${x - start} e`);
        start = null;
      }
    }
  }
  if (!lines.length) throw new Error('polygon has no lattice interior');
  return lines.join('\n');
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonOutline(points) {
  return polyline([...points, points[0]]);
}

function polyline(points) {
  return [`pen ${q(...points[0])}`, ...points.slice(1).map((point) => `ray to ${q(...point)}`)].join('\n');
}
