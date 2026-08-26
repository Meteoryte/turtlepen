/**
 * The dense-artwork corpus — eight intricate diagrams built through TurtlePen's
 * own tool handlers.
 *
 * These eight were first authored in a single non-interactive pass that never
 * read a return value. Six of them committed nothing at all: `plan` is
 * all-or-nothing, so one bad operation in a batch of 204 discarded the other
 * 203, and the unconditional `save` that followed wrote a valid, empty, and
 * entirely convincing document. The script printed "built" eight times and
 * exited 0. The engine had reported every failure precisely and in plain
 * English; nothing was listening.
 *
 * So the harness below is the point of the file as much as the drawings are:
 *
 * - `call` throws on a failed operation. A tool that returns its errors as
 *   readable text is right for an agent that reads them, and a loaded gun for a
 *   script that does not.
 * - `finish` validates before saving and refuses to write a document carrying an
 *   S0 or S1 finding. Nothing here may ship broken and claim otherwise.
 * - Columns come from the engine's own `indexToCol`. The original hand-rolled
 *   `String.fromCharCode(65 + n)`, which yields `[`, `\` and `^` past Z — the
 *   candlestick chart died on `pen at ^59`.
 * - Positions that must line up exactly are computed in QUADRANTS and converted
 *   with `quadToAddress`. Cylinder caps meeting a body, gear teeth meeting a
 *   hub, and a picket meeting its peak are all cases where cell-resolution
 *   arithmetic silently lands half a cell out.
 * - Diagonals use `ray to <address>`, which is Bresenham at any angle. The first
 *   pass wrote `ne 8 line`, took the resulting parse error to mean the lattice
 *   had no diagonals, and faked them with stacked discs for the rest of the run.
 *
 * LAYERING. Intentionally overlapping artwork goes on its own overlay page.
 * Two paths sharing a quadrant on one page is L006, a warning that something
 * unintended happened; the same ink on an overlay is L010, information that
 * something planned did. The page stack is this engine's layer stack — using it
 * is what separates a dense drawing from a noisy one.
 */

import { createSession, createTools } from './src/mcp/tools.js';
import { indexToCol, quadToAddress } from './src/core/address.js';

// --- addressing helpers ----------------------------------------------------

/** 0-based cell column/row -> "AN20". Rows are 1-based in an address. */
const cell = (cx, cy) => `${indexToCol(cx)}${cy + 1}`;
/** Absolute quadrant point -> "AN21.q4". Two quadrants to a cell. */
const q = (x, y) => quadToAddress(x, y);
/** The top-left quadrant of a 0-based cell. */
const qOf = (cx, cy) => [cx * 2, cy * 2];

const session = createSession({ cwd: process.cwd() });
const toolMap = new Map(createTools(session).map((t) => [t.name, t.handler]));

/**
 * Every tool result is inspected. `plan` reports a failed batch as text rather
 * than throwing, which is correct for an agent and fatal for a script.
 */
async function call(name, args) {
  const handler = toolMap.get(name);
  if (!handler) throw new Error(`unknown tool: ${name}`);
  const result = await handler(args);
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  if (result?.isError || /^plan FAILED|\bFAILED at operation\b/m.test(text)) {
    throw new Error(`${name} failed:\n${text}`);
  }
  return text;
}

/**
 * Validate, then save only if nothing above a warning is open.
 *
 * S2 and S3 are reported but permitted: a warning on deliberately layered
 * artwork is the engine telling you what it sees, and INFO on an overlay is it
 * confirming the layering worked. S0 and S1 are defects and block the write.
 */
async function finish(name, svgPath) {
  const log = await call('validate', {});
  const counts = /(\d+) open\s+\((\d+) critical, (\d+) error, (\d+) warn, (\d+) info\)/.exec(log);
  const [, total, critical, error, warn, info] = counts ?? [];
  if (Number(critical) || Number(error)) {
    throw new Error(`${name} is not clean — ${critical} critical, ${error} error:\n${log.slice(0, 3000)}`);
  }
  await call('render', { path: svgPath, force: true });
  await call('save', { force: true });
  console.log(`  ${name}: clean — ${total} open (${warn} warn, ${info} info)`);
}

// ---------------------------------------------------------------------------
// 1. An intricate datacenter
// ---------------------------------------------------------------------------
async function datacenter() {
  console.log('1. Datacenter…');
  await call('new_diagram', { name: 'Datacenter', path: 'diagrams/gemini31-server-structure.turtlepen.json', cols: 140, rows: 90 });
  // One overlay per layer that deliberately covers the layer beneath it.
  for (const [id, z, title] of [
    ['chassis', 1, 'Storage chassis'], ['caps', 2, 'Cylinder caps'],
    ['blades', 3, 'Server blades'], ['lights', 4, 'Status LEDs'], ['cabling', 5, 'Cabling'],
  ]) await call('add_page', { id, z, intent: 'overlay', title });

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(4, 3)}.tl`, span: { w: 34, h: 4 }, label: 'Global Datacenter Topology', corner: 'chamfered' },
  ];

  // Three racks, each with eight blades and a column of status LEDs. The blades
  // sit INSIDE the rack, which is why they belong on an overlay: a stroke
  // through a box body on the same page is L004, and it is a real error there.
  const rackCols = [1, 15, 29];
  rackCols.forEach((rc, i) => {
    ops.push({ op: 'place_box', id: `rack${i}`, at: `${cell(rc, 14)}.tl`, span: { w: 10, h: 40 }, label: `Rack 0${i + 1}`, corner: 'square', fill: '#2B2D42' });
    for (let j = 0; j < 8; j++) {
      const row = 19 + j * 4;
      ops.push({ op: 'pen', id: `blade_${i}_${j}`, page: 'blades', role: 'artwork', color: '#8D99AE', width: 2, program: `pen at ${cell(rc, row)}\nright 9 align top line` });
      const lit = (i + j) % 3 === 0 ? '#EF233C' : '#80ED99';
      ops.push({ op: 'pen', id: `led_${i}_${j}_a`, page: 'lights', role: 'artwork', paint: 'cells', color: lit, program: `pen at ${cell(rc, row)}.q2\ndot` });
      ops.push({ op: 'pen', id: `led_${i}_${j}_b`, page: 'lights', role: 'artwork', paint: 'cells', color: '#00B4D8', program: `pen at ${cell(rc + 8, row)}.q4\ndot` });
    }
  });

  // Two storage cylinders. Radius is in quadrants, so a 14-quadrant cap is
  // exactly 7 cells each way — the body box lines up with the caps by
  // construction rather than by eye.
  const R = 14;
  [52, 72].forEach((centreCol, i) => {
    const [cxq] = qOf(centreCol, 0);
    const topRow = 19, bodyCells = 18;
    const [, topq] = qOf(0, topRow);
    const botq = topq + bodyCells * 2;
    ops.push({ op: 'place_box', id: `db_body_${i}`, page: 'chassis', at: `${cell(centreCol - R / 2, topRow)}.tl`, span: { w: R, h: bodyCells }, label: '', corner: 'square', fill: '#0077B6' });
    ops.push({ op: 'pen', id: `db_cap_${i}`, page: 'caps', role: 'artwork', paint: 'cells', color: '#023E8A', program: `pen at ${q(cxq, topq)}\narc ${R} 180 360` });
    ops.push({ op: 'pen', id: `db_foot_${i}`, page: 'caps', role: 'artwork', paint: 'cells', color: '#03045E', program: `pen at ${q(cxq, botq)}\narc ${R} 0 180` });
    ops.push({ op: 'place_box', id: `db_label_${i}`, at: `${cell(centreCol - R / 2, topRow + bodyCells + 3)}.tl`, span: { w: R, h: 4 }, label: `DB Cluster ${i + 1}`, corner: 'rounded' });
  });

  // Cabling runs beneath the racks and up into the storage tier. Only the first
  // stroke names an alignment: an omitted `align` continues on the track the
  // cursor is already on, which is what keeps a multi-leg run continuous.
  ops.push({ op: 'pen', id: 'cable_a', page: 'cabling', role: 'artwork', color: '#FCA311', width: 2, program: `pen at ${cell(3, 60)}\nright 45 align bottom line\nup 12 line\nright 14 line\nup 6 line` });
  ops.push({ op: 'pen', id: 'cable_b', page: 'cabling', role: 'artwork', color: '#E63946', width: 2, program: `pen at ${cell(17, 63)}\nright 41 align bottom line\nup 9 line\nright 20 line\nup 4 line` });

  await call('plan', { operations: ops, commit: true });
  await finish('datacenter', 'diagrams/gemini31-server-structure.svg');
}

// ---------------------------------------------------------------------------
// 2. Brain and neural learning process
// ---------------------------------------------------------------------------
async function brain() {
  console.log('2. Brain…');
  await call('new_diagram', { name: 'Neural Learning', path: 'diagrams/gemini31-teaching-loop.turtlepen.json', cols: 140, rows: 100 });

  // Six lobes that deliberately overlap. Each is its own paint layer, so every
  // overlap between them is L010 (planned) rather than L006 (accidental).
  const lobes = [
    { col: 41, row: 30, r: 15, fill: '#FFB5A7' },
    { col: 48, row: 24, r: 18, fill: '#FEC5BB' },
    { col: 59, row: 29, r: 16, fill: '#FCD5CE' },
    { col: 42, row: 44, r: 14, fill: '#F8EDEB' },
    { col: 52, row: 44, r: 17, fill: '#F9E2AE' },
    { col: 48, row: 54, r: 12, fill: '#E8E8E4' },
  ];
  for (let i = 0; i < lobes.length; i++) await call('add_page', { id: `lobe${i}`, z: i + 1, intent: 'overlay', title: `Lobe ${i + 1}` });
  await call('add_page', { id: 'synapses', z: 7, intent: 'overlay', title: 'Synapses' });
  await call('add_page', { id: 'pulses', z: 8, intent: 'overlay', title: 'Pulses' });

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(13, 3)}.tl`, span: { w: 30, h: 4 }, label: 'Cognitive Learning Patterns', corner: 'indented' },
    { op: 'place_box', id: 'input_read', at: `${cell(4, 24)}.tl`, span: { w: 12, h: 4 }, label: 'Reading', corner: 'rounded' },
    { op: 'place_box', id: 'input_prac', at: `${cell(4, 44)}.tl`, span: { w: 12, h: 4 }, label: 'Practice', corner: 'rounded' },
    { op: 'place_box', id: 'output', at: `${cell(112, 34)}.tl`, span: { w: 14, h: 4 }, label: 'Mastery', corner: 'rounded' },
  ];

  // An outline plus a slightly smaller filled disc: the disc sits strictly
  // inside the ring, so the two never share a quadrant within one path.
  lobes.forEach((l, i) => {
    ops.push({ op: 'pen', id: `lobe_${i}`, page: `lobe${i}`, role: 'artwork', paint: 'cells', color: l.fill, program: `pen at ${cell(l.col, l.row)}\ncircle ${l.r}\ndisc ${l.r - 1}` });
  });

  // Synapses are true diagonals — `ray`, not a stack of discs.
  const links = [[0, 1], [1, 2], [2, 4], [4, 5], [5, 3], [3, 0]];
  links.forEach(([a, b], i) => {
    ops.push({ op: 'pen', id: `synapse_${i}`, page: 'synapses', role: 'artwork', color: '#9D8189', width: 3, program: `pen at ${cell(lobes[a].col, lobes[a].row)}\nray to ${cell(lobes[b].col, lobes[b].row)}` });
    ops.push({ op: 'pen', id: `pulse_${i}`, page: 'pulses', role: 'artwork', paint: 'cells', color: '#FFE5D9', program: `pen at ${cell(lobes[b].col, lobes[b].row)}\ndisc 3` });
  });

  // Inputs feed the cortex and mastery leaves it. A connector has to ARRIVE:
  // the first pass drew these as fixed-length stubs that stopped in open space,
  // which validates clean and reads as unfinished. Each one now ends on the rim
  // of the lobe it feeds, computed from that lobe's own centre and radius.
  const rim = (lobe, dx) => {
    const [lx, ly] = qOf(lobe.col, lobe.row);
    return q(lx + dx * (lobe.r + 1), ly);
  };
  ops.push({ op: 'pen', id: 'read_flow', role: 'artwork', color: '#6D6875', width: 2, program: `pen from input_read.E\nray to ${rim(lobes[0], -1)}` });
  ops.push({ op: 'pen', id: 'prac_flow', role: 'artwork', color: '#6D6875', width: 2, program: `pen from input_prac.E\nray to ${rim(lobes[3], -1)}` });
  ops.push({ op: 'pen', id: 'out_flow', role: 'artwork', color: '#6D6875', width: 2, program: `pen from output.W\nray to ${rim(lobes[2], 1)}` });

  await call('plan', { operations: ops, commit: true });
  await finish('brain', 'diagrams/gemini31-teaching-loop.svg');
}

// ---------------------------------------------------------------------------
// 3. A dense candlestick chart
// ---------------------------------------------------------------------------
async function candlesticks() {
  console.log('3. Candlesticks…');
  await call('new_diagram', { name: 'Candlestick Chart', path: 'diagrams/gemini31-technical-analysis.turtlepen.json', cols: 150, rows: 100 });
  await call('add_page', { id: 'wicks', z: 1, intent: 'overlay', title: 'Wicks' });
  await call('add_page', { id: 'moving_avg', z: 2, intent: 'overlay', title: 'Moving average' });

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(2, 1)}.tl`, span: { w: 26, h: 4 }, label: 'BTC/USD  1H', corner: 'square' },
    // Only the opening stroke names a track; the other three continue on the one
    // the cursor is already on, which is what closes the rectangle without a gap.
    { op: 'pen', id: 'frame', role: 'artwork', color: '#333333', width: 2, program: `pen at ${cell(3, 9)}\nright 130 align top line\ndown 62 line\nleft 130 line\nup 62 line` },
  ];

  // A deterministic pseudo-random walk. The original used Math.random(), so no
  // two runs produced the same chart — and a document that changes every build
  // cannot be regression-tested, which is half of what this lattice is for.
  let seed = 20260810;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

  const BARS = 25, PITCH = 5, FIRST = 5;
  let close = 40;
  const maPoints = [];
  for (let i = 0; i < BARS; i++) {
    const col = FIRST + i * PITCH;
    const up = rand() > 0.45;
    const body = Math.floor(rand() * 8) + 3;
    const wickUp = Math.floor(rand() * 5) + 1;
    const wickDown = Math.floor(rand() * 5) + 1;
    close = Math.max(16, Math.min(52, close + (up ? -Math.floor(rand() * 5) : Math.floor(rand() * 5))));

    // The wick is a single stroke behind the body, so it goes on its own layer.
    ops.push({ op: 'pen', id: `wick_${i}`, page: 'wicks', role: 'artwork', color: '#666666', width: 2, program: `pen at ${cell(col + 1, close - wickUp)}\ndown ${body + wickUp + wickDown} align left line` });
    ops.push({ op: 'place_box', id: `body_${i}`, at: `${cell(col, close)}.tl`, span: { w: 3, h: body }, label: '', corner: 'square', fill: up ? '#2A9D8F' : '#E63946' });

    const vol = Math.floor(rand() * 10) + 2;
    ops.push({ op: 'place_box', id: `vol_${i}`, at: `${cell(col, 70 - vol)}.tl`, span: { w: 3, h: vol }, label: '', corner: 'square', fill: up ? '#1B4332' : '#6A040F' });

    const [mx, my] = qOf(col + 1, close + Math.floor(body / 2));
    maPoints.push(q(mx, my));
  }

  // One continuous ray-to-ray polyline through every bar's midpoint.
  ops.push({ op: 'pen', id: 'ma_line', page: 'moving_avg', role: 'artwork', color: '#E0A96D', width: 3, program: `pen at ${maPoints[0]}\n${maPoints.slice(1).map((p) => `ray to ${p}`).join('\n')}` });

  await call('plan', { operations: ops, commit: true });
  await finish('candlesticks', 'diagrams/gemini31-technical-analysis.svg');
}

// ---------------------------------------------------------------------------
// 4. A mechanical CI/CD pipeline drawn as gears
// ---------------------------------------------------------------------------
async function gears() {
  console.log('4. Gears…');
  await call('new_diagram', { name: 'Gears Workflow', path: 'diagrams/gemini31-workflow.turtlepen.json', cols: 160, rows: 90 });
  await call('add_page', { id: 'teeth', z: 1, intent: 'overlay', title: 'Gear teeth' });
  await call('add_page', { id: 'hubs', z: 2, intent: 'overlay', title: 'Hubs' });
  await call('add_page', { id: 'belts', z: 3, intent: 'overlay', title: 'Drive belts' });

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(9, 3)}.tl`, span: { w: 32, h: 4 }, label: 'Mechanical CI/CD Pipeline', corner: 'chamfered' },
  ];

  // Teeth at 24 real angles, not eight. `ray to` takes any endpoint, so the
  // tooth angle is trigonometry rounded once, at the endpoint, to a whole
  // quadrant — which is the only place a lattice needs it to be whole.
  const cogs = [
    { col: 22, row: 26, r: 12, color: '#457B9D', label: 'Code', labelCol: 18, labelRow: 42 },
    { col: 62, row: 26, r: 14, color: '#E63946', label: 'Build', labelCol: 58, labelRow: 44 },
    { col: 108, row: 26, r: 10, color: '#2A9D8F', label: 'Deploy', labelCol: 103, labelRow: 40 },
  ];

  cogs.forEach((g, i) => {
    const [cx, cy] = qOf(g.col, g.row);
    ops.push({ op: 'pen', id: `gear_${i}`, role: 'artwork', paint: 'cells', color: g.color, program: `pen at ${q(cx, cy)}\ndisc ${g.r}` });
    ops.push({ op: 'pen', id: `hub_${i}`, page: 'hubs', role: 'artwork', paint: 'cells', color: '#1D3557', program: `pen at ${q(cx, cy)}\ndisc 3\ncircle 5` });

    const TEETH = 24;
    for (let t = 0; t < TEETH; t++) {
      const a = (t / TEETH) * Math.PI * 2;
      const inner = g.r - 1, outer = g.r + 4;
      const x0 = cx + Math.round(Math.cos(a) * inner), y0 = cy + Math.round(Math.sin(a) * inner);
      const x1 = cx + Math.round(Math.cos(a) * outer), y1 = cy + Math.round(Math.sin(a) * outer);
      ops.push({ op: 'pen', id: `tooth_${i}_${t}`, page: 'teeth', role: 'artwork', paint: 'cells', color: '#A8DADC', program: `pen at ${q(x0, y0)}\nray to ${q(x1, y1)}` });
    }
    ops.push({ op: 'place_box', id: `cog_label_${i}`, at: `${cell(g.labelCol, g.labelRow)}.tl`, span: { w: 12, h: 4 }, label: g.label, corner: 'rounded' });
  });

  ops.push({ op: 'pen', id: 'belt_top', page: 'belts', role: 'artwork', color: '#333333', width: 3, program: `pen at ${cell(22, 17)}\nright 86 align bottom line` });
  ops.push({ op: 'pen', id: 'belt_bottom', page: 'belts', role: 'artwork', color: '#333333', width: 3, program: `pen at ${cell(22, 35)}\nright 86 align top line` });

  await call('plan', { operations: ops, commit: true });
  await finish('gears', 'diagrams/gemini31-workflow.svg');
}

// ---------------------------------------------------------------------------
// 5. A detailed apple
// ---------------------------------------------------------------------------
async function apple() {
  console.log('5. Apple…');
  await call('new_diagram', { name: 'Detailed Apple', path: 'diagrams/gemini31-scene-apple.turtlepen.json', cols: 100, rows: 80 });
  for (const [id, z, title] of [
    ['flesh', 1, 'Flesh'], ['shading', 2, 'Shading'], ['bite', 3, 'Bite'],
    ['stem', 4, 'Stem and leaf'], ['gloss', 5, 'Highlight'],
  ]) await call('add_page', { id, z, intent: 'overlay', title });

  // The silhouette is two r=20-quadrant discs centred on row 34 — ten cells of
  // radius — so the fruit occupies rows 24-44 and the stem has to leave from
  // row 26, not from an eyeballed row 20 that floats four cells clear of it.
  const [sx, sy] = qOf(24, 26);

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(9, 3)}.tl`, span: { w: 22, h: 4 }, label: 'Intricate Apple', corner: 'rounded' },
    // A shadow the fruit actually sits in: three overlapping discs make the
    // flattened ellipse the lattice has no primitive for, centred beneath the
    // silhouette rather than offset from it.
    { op: 'pen', id: 'shadow', role: 'artwork', paint: 'cells', color: '#E5E5E5', program: `pen at ${cell(19, 46)}\ndisc 11\npen at ${cell(24, 46)}\ndisc 11\npen at ${cell(29, 46)}\ndisc 11` },
    // Two overlapping lobes make the classic apple silhouette.
    { op: 'pen', id: 'body_left', page: 'flesh', role: 'artwork', paint: 'cells', color: '#D90429', program: `pen at ${cell(20, 34)}\ndisc 20` },
    { op: 'pen', id: 'body_right', page: 'flesh', role: 'artwork', paint: 'cells', color: '#D90429', program: `pen at ${cell(28, 34)}\ndisc 20` },
    { op: 'pen', id: 'body_warm', page: 'shading', role: 'artwork', paint: 'cells', color: '#EF233C', program: `pen at ${cell(23, 39)}\ndisc 18` },
    // The bite is subtraction by overpainting, which is what a lattice offers
    // instead of a boolean: the quadrants are still claimed, just recoloured.
    // It has to STRADDLE the silhouette edge. Painted wholly inside it — the
    // first pass put both discs in the body — the result is not a bite, it is
    // two white circles on an apple.
    { op: 'pen', id: 'bite_a', page: 'bite', role: 'artwork', paint: 'cells', color: '#FFFFFF', program: `pen at ${cell(39, 31)}\ndisc 9` },
    { op: 'pen', id: 'bite_b', page: 'bite', role: 'artwork', paint: 'cells', color: '#FFFFFF', program: `pen at ${cell(40, 39)}\ndisc 8` },
    // The stem curves, so it is two rays rather than a stroke-corner-stroke
    // run. A corner must name the side the path ARRIVES on — travelling up, a
    // path enters from the bottom — and a stalk that bends twice needs four
    // tokens to say what two endpoints already say.
    { op: 'pen', id: 'stem', page: 'stem', role: 'artwork', color: '#5C4033', width: 5, program: `pen at ${q(sx, sy)}\nray to ${q(sx + 5, sy - 11)}\nray to ${q(sx + 7, sy - 24)}` },
    // The leaf hangs off the stem's actual tip, not off an address that looked
    // about right — the first pass left it floating clear of the fruit.
    { op: 'pen', id: 'leaf_body', page: 'stem', role: 'artwork', paint: 'cells', color: '#2E8B57', program: `pen at ${q(sx + 14, sy - 22)}\ndisc 7` },
    { op: 'pen', id: 'leaf_edge', page: 'stem', role: 'artwork', paint: 'cells', color: '#1B5E3F', program: `pen at ${q(sx + 14, sy - 22)}\ncircle 8` },
    { op: 'pen', id: 'leaf_vein', page: 'stem', role: 'artwork', color: '#A7C957', width: 2, program: `pen at ${q(sx + 8, sy - 20)}\nray to ${q(sx + 21, sy - 24)}` },
    { op: 'pen', id: 'gloss', page: 'gloss', role: 'artwork', color: '#FFFFFF', width: 3, program: `pen at ${cell(16, 26)}\nray to ${q(...qOf(15, 31))}` },
  ];

  await call('plan', { operations: ops, commit: true });
  await finish('apple', 'diagrams/gemini31-scene-apple.svg');
}

// ---------------------------------------------------------------------------
// 6. A recursively branching tree
// ---------------------------------------------------------------------------
async function tree() {
  console.log('6. Tree…');
  await call('new_diagram', { name: 'Fractal Tree', path: 'diagrams/gemini31-scene-tree.turtlepen.json', cols: 120, rows: 100 });
  await call('add_page', { id: 'branches', z: 1, intent: 'overlay', title: 'Branches' });
  await call('add_page', { id: 'canopy', z: 2, intent: 'overlay', title: 'Canopy' });
  await call('add_page', { id: 'highlights', z: 3, intent: 'overlay', title: 'Leaf highlights' });

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(9, 3)}.tl`, span: { w: 24, h: 4 }, label: 'Deep Branching Tree', corner: 'rounded' },
  ];

  // Real recursion, in quadrant space. Every branch is a `ray` at its true
  // angle; the eight compass directions never enter into it.
  // A child starts one quadrant along its own heading rather than on its
  // parent's last quadrant. Two paths sharing a quadrant with no junction is
  // L006, and a tree of 60 branches would raise it 60 times for something that
  // is structure, not a defect — the log stops being worth reading long before
  // that. One quadrant of separation is invisible at 5px and honest to the rule.
  const tips = [];
  function branch(x, y, angle, length, depth) {
    const x0 = Math.round(x + Math.cos(angle));
    const y0 = Math.round(y + Math.sin(angle));
    const x1 = Math.round(x + Math.cos(angle) * length);
    const y1 = Math.round(y + Math.sin(angle) * length);
    ops.push({
      op: 'pen', id: `branch_${ops.length}`, page: 'branches', role: 'artwork',
      color: depth > 2 ? '#A0522D' : '#8B5A2B', width: Math.max(1, 5 - depth),
      program: `pen at ${q(x0, y0)}\nray to ${q(x1, y1)}`,
    });
    if (depth >= 4) { tips.push([x1, y1]); return; }
    branch(x1, y1, angle - 0.42 - depth * 0.05, length * 0.72, depth + 1);
    branch(x1, y1, angle + 0.42 + depth * 0.05, length * 0.72, depth + 1);
    if (depth === 1) branch(x1, y1, angle, length * 0.6, depth + 1);
  }
  const [rootX, rootY] = qOf(59, 88);
  branch(rootX, rootY, -Math.PI / 2, 34, 0);

  // Roots, splayed at their own angles.
  [Math.PI * 0.78, Math.PI * 0.22, Math.PI * 0.5].forEach((a, i) => {
    const x1 = Math.round(rootX + Math.cos(a) * 22), y1 = Math.round(rootY + Math.sin(a) * 22);
    ops.push({ op: 'pen', id: `root_${i}`, role: 'artwork', color: '#6F4E37', width: 4, program: `pen at ${q(rootX, rootY)}\nray to ${q(x1, y1)}` });
  });

  // Foliage clusters at the real branch tips rather than at guessed addresses.
  tips.forEach(([x, y], i) => {
    ops.push({ op: 'pen', id: `leaf_${i}`, page: 'canopy', role: 'artwork', paint: 'cells', color: i % 2 ? '#228B22' : '#2E8B57', program: `pen at ${q(x, y)}\ndisc 7` });
    ops.push({ op: 'pen', id: `leaf_hi_${i}`, page: 'highlights', role: 'artwork', paint: 'cells', color: '#32CD32', program: `pen at ${q(x + 2, y - 2)}\ndisc 4` });
  });

  await call('plan', { operations: ops, commit: true });
  await finish('tree', 'diagrams/gemini31-scene-tree.svg');
}

// ---------------------------------------------------------------------------
// 7. A weathered picket fence
// ---------------------------------------------------------------------------
async function fence() {
  console.log('7. Fence…');
  await call('new_diagram', { name: 'Detailed Fence', path: 'diagrams/gemini31-scene-fence.turtlepen.json', cols: 140, rows: 70 });
  for (const [id, z, title] of [
    ['rails', 1, 'Crossbars'], ['grain', 2, 'Wood grain'],
    ['nails', 3, 'Nails'], ['vines', 4, 'Vines'],
  ]) await call('add_page', { id, z, intent: 'overlay', title });

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(5, 3)}.tl`, span: { w: 26, h: 4 }, label: 'Weathered Picket Fence', corner: 'chamfered' },
  ];

  const PICKETS = 12, PITCH = 10, FIRST = 4, TOP = 15, TALL = 40, WIDE = 5;
  for (let i = 0; i < PICKETS; i++) {
    const col = FIRST + i * PITCH;
    ops.push({ op: 'place_box', id: `picket_${i}`, at: `${cell(col, TOP)}.tl`, span: { w: WIDE, h: TALL }, label: '', corner: 'square', fill: '#DDB892' });

    // A real triangular peak, from the picket's two top corners to a point
    // above its centre — computed in quadrants so the apex is exactly centred.
    //
    // The base sits one quadrant ABOVE the board's top row. Drawn on the row
    // itself it is inside the box, and a stroke through a box body is L004 — an
    // error the engine is right to raise even when the ink looks intentional.
    const [lx, ty] = qOf(col, TOP);
    const baseY = ty - 1;
    const rx = lx + WIDE * 2 - 1;
    const apexX = lx + WIDE, apexY = baseY - 9;
    ops.push({ op: 'pen', id: `peak_${i}`, role: 'artwork', paint: 'cells', color: '#DDB892', program: `pen at ${q(lx, baseY)}\ntriangle ${q(rx, baseY)} ${q(apexX, apexY)}` });

    // Grain: two off-vertical rays, so the boards do not read as printed.
    ops.push({ op: 'pen', id: `grain_a_${i}`, page: 'grain', role: 'artwork', color: '#B08968', width: 1, program: `pen at ${q(lx + 2, ty + 8)}\nray to ${q(lx + 3, ty + 34)}` });
    ops.push({ op: 'pen', id: `grain_b_${i}`, page: 'grain', role: 'artwork', color: '#B08968', width: 1, program: `pen at ${q(lx + 6, ty + 20)}\nray to ${q(lx + 5, ty + 58)}` });

    for (const railRow of [25, 45]) {
      const [, ny] = qOf(0, railRow);
      ops.push({ op: 'pen', id: `nail_${i}_${railRow}`, page: 'nails', role: 'artwork', paint: 'cells', color: '#4A4E69', program: `pen at ${q(lx + 4, ny + 2)}\ndot` });
    }
  }

  for (const [n, row] of [[1, 25], [2, 45]]) {
    ops.push({ op: 'place_box', id: `rail_${n}`, page: 'rails', at: `${cell(2, row)}.tl`, span: { w: 130, h: 3 }, label: '', corner: 'square', fill: '#9C6644' });
  }

  // One continuous vine, climbing at real angles.
  const vine = [[10, 120], [40, 96], [70, 104], [110, 78], [150, 88], [200, 46], [240, 58]];
  ops.push({
    op: 'pen', id: 'vine', page: 'vines', role: 'artwork', color: '#52B788', width: 3,
    program: `pen at ${q(...vine[0])}\n${vine.slice(1).map((p) => `ray to ${q(...p)}`).join('\n')}`,
  });
  vine.forEach(([x, y], i) => {
    ops.push({ op: 'pen', id: `vine_leaf_${i}`, page: 'vines', role: 'artwork', paint: 'cells', color: '#2D6A4F', program: `pen at ${q(x + 3, y - 3)}\ndisc 3` });
  });

  await call('plan', { operations: ops, commit: true });
  await finish('fence', 'diagrams/gemini31-scene-fence.svg');
}

// ---------------------------------------------------------------------------
// 8. A dense living room
// ---------------------------------------------------------------------------
async function livingRoom() {
  console.log('8. Living room…');
  await call('new_diagram', { name: 'Living Room Family', path: 'diagrams/gemini31-scene-living-room-family.turtlepen.json', cols: 160, rows: 110 });
  for (const [id, z, title] of [
    ['fittings', 1, 'Window and rug detail'], ['furniture', 2, 'Furniture'],
    // The sofa's arms sit ON its back and seat. Two boxes overlapping on one
    // page is L001 — critical, and correctly so, because on a single layer that
    // is two nodes claiming one space rather than one object drawn in front of
    // another. Upholstery is a layer.
    ['upholstery', 3, 'Sofa arms'],
    ['lamp', 4, 'Lamp'], ['people', 5, 'People'], ['pets', 6, 'Dog'],
  ]) await call('add_page', { id, z, intent: 'overlay', title });

  // One floor line and one rug span, so every object in the room is placed
  // against the same two numbers instead of against its own guess.
  const FLOOR = 70, RUG_COL = 64, RUG_W = 54;

  const ops = [
    { op: 'place_box', id: 'title', at: `${cell(9, 3)}.tl`, span: { w: 32, h: 4 }, label: 'Highly Detailed Living Room', corner: 'indented' },

    // Window, curtains and mullions.
    { op: 'place_box', id: 'window', at: `${cell(1, 14)}.tl`, span: { w: 20, h: 25 }, label: '', corner: 'square', fill: '#8ECAE6' },
    { op: 'pen', id: 'mullion_v', page: 'fittings', role: 'artwork', color: '#FFFFFF', width: 4, program: `pen at ${cell(11, 14)}\ndown 25 align left line` },
    { op: 'pen', id: 'mullion_h', page: 'fittings', role: 'artwork', color: '#FFFFFF', width: 4, program: `pen at ${cell(1, 26)}\nright 20 align top line` },
    { op: 'place_box', id: 'curtain_l', page: 'furniture', at: `${cell(1, 14)}.tl`, span: { w: 4, h: 25 }, label: '', corner: 'square', fill: '#E63946' },
    { op: 'place_box', id: 'curtain_r', page: 'furniture', at: `${cell(17, 14)}.tl`, span: { w: 4, h: 25 }, label: '', corner: 'square', fill: '#E63946' },

    // The rug lies UNDER the sofa. It was previously placed at the far left of
    // a 160-cell canvas while the furniture sat on the right — each element
    // individually correct, the room incoherent. Nothing in a collision log
    // catches that; only looking at the render does.
    { op: 'place_box', id: 'rug', at: `${cell(RUG_COL, FLOOR - 10)}.tl`, span: { w: RUG_W, h: 12 }, label: '', corner: 'square', fill: '#F4A261' },
  ];
  for (let i = 0; i < 10; i++) {
    ops.push({ op: 'pen', id: `rug_stripe_${i}`, page: 'fittings', role: 'artwork', color: '#E76F51', width: 3, program: `pen at ${cell(RUG_COL + 2 + i * 5, FLOOR - 10)}\ndown 12 align left line` });
  }

  // Sofa, built from four overlapping solids on one furniture layer — so they
  // are placed apart rather than stacked, and the shapes that must overlap sit
  // on the layer above.
  ops.push(
    { op: 'place_box', id: 'sofa_back', page: 'furniture', at: `${cell(74, 39)}.tl`, span: { w: 25, h: 6 }, label: '', corner: 'rounded', fill: '#2A9D8F' },
    { op: 'place_box', id: 'sofa_seat', page: 'furniture', at: `${cell(76, 45)}.tl`, span: { w: 21, h: 8 }, label: '', corner: 'rounded', fill: '#264653' },
    { op: 'place_box', id: 'sofa_arm_l', page: 'upholstery', at: `${cell(72, 41)}.tl`, span: { w: 4, h: 12 }, label: '', corner: 'rounded', fill: '#1D3557' },
    { op: 'place_box', id: 'sofa_arm_r', page: 'upholstery', at: `${cell(97, 41)}.tl`, span: { w: 4, h: 12 }, label: '', corner: 'rounded', fill: '#1D3557' },
    { op: 'pen', id: 'lamp_stand', page: 'lamp', role: 'artwork', color: '#333333', width: 4, program: `pen at ${cell(64, 34)}\ndown 25 align left line` },
    { op: 'pen', id: 'lamp_shade', page: 'lamp', role: 'artwork', paint: 'cells', color: '#FFB703', program: `pen at ${cell(64, 33)}\narc 8 180 360` },
  );

  // Three figures. A standing figure's feet are derived from FLOOR and its head
  // from its own height, so nobody hovers; a seated one is pinned to the sofa
  // seat instead. The first pass gave every figure a hand-picked head address
  // and fixed-length legs, and all three floated above the rug.
  const figures = [
    { id: 'p1', col: 82, scale: 1.0, seated: true, seatRow: 45 },
    { id: 'p2', col: 106, scale: 1.2, seated: false },
    { id: 'p3', col: 114, scale: 0.85, seated: false },
  ];
  figures.forEach((f) => {
    const s = f.scale;
    const [hx] = qOf(f.col, 0);
    // head -> neck -> hip -> feet, in quadrants, measured up from the floor.
    const legLen = Math.round(26 * s), torso = Math.round(16 * s), headR = Math.round(4 * s);
    const [, floorQ] = qOf(0, FLOOR);
    const hip = f.seated ? qOf(0, f.seatRow)[1] : floorQ - legLen;
    const neck = hip - torso;
    const hy = neck - headR - 2;
    ops.push({ op: 'pen', id: `${f.id}_head`, page: 'people', role: 'artwork', paint: 'cells', color: '#FDB833', program: `pen at ${q(hx, hy)}\ndisc ${Math.round(4 * s)}` });
    ops.push({ op: 'pen', id: `${f.id}_spine`, page: 'people', role: 'artwork', color: '#22223B', width: 3, program: `pen at ${q(hx, neck)}\nray to ${q(hx, hip)}` });
    ops.push({ op: 'pen', id: `${f.id}_arm_l`, page: 'people', role: 'artwork', color: '#22223B', width: 2, program: `pen at ${q(hx, neck + 2)}\nray to ${q(hx - Math.round(9 * s), neck + Math.round(9 * s))}` });
    ops.push({ op: 'pen', id: `${f.id}_arm_r`, page: 'people', role: 'artwork', color: '#22223B', width: 2, program: `pen at ${q(hx, neck + 2)}\nray to ${q(hx + Math.round(10 * s), neck - Math.round(4 * s))}` });
    if (f.seated) {
      // Seated: thighs forward along the seat, shins hanging to the floor. The
      // first version stopped both legs inside the sofa, where they read as
      // scribble over the upholstery rather than as a person sitting on it.
      const knee = hx + Math.round(14 * s);
      ops.push({ op: 'pen', id: `${f.id}_leg_l`, page: 'people', role: 'artwork', color: '#22223B', width: 2, program: `pen at ${q(hx, hip)}\nray to ${q(knee, hip + 2)}\nray to ${q(knee + 2, floorQ)}` });
      ops.push({ op: 'pen', id: `${f.id}_leg_r`, page: 'people', role: 'artwork', color: '#22223B', width: 2, program: `pen at ${q(hx, hip + 2)}\nray to ${q(knee - 2, hip + 4)}\nray to ${q(knee, floorQ)}` });
    } else {
      ops.push({ op: 'pen', id: `${f.id}_leg_l`, page: 'people', role: 'artwork', color: '#22223B', width: 2, program: `pen at ${q(hx, hip)}\nray to ${q(hx - Math.round(7 * s), floorQ)}` });
      ops.push({ op: 'pen', id: `${f.id}_leg_r`, page: 'people', role: 'artwork', color: '#22223B', width: 2, program: `pen at ${q(hx, hip)}\nray to ${q(hx + Math.round(7 * s), floorQ)}` });
    }
  });

  // The dog, curled on the rug — positioned from RUG_COL and FLOOR like
  // everything else in the room, not from an address that looked about right.
  const [dx, dy] = qOf(RUG_COL + 8, FLOOR - 5);
  ops.push(
    { op: 'pen', id: 'dog_body', page: 'pets', role: 'artwork', paint: 'cells', color: '#7F5539', program: `pen at ${q(dx, dy)}\ndisc 5` },
    { op: 'pen', id: 'dog_head', page: 'pets', role: 'artwork', paint: 'cells', color: '#9C6644', program: `pen at ${q(dx - 6, dy - 3)}\ndisc 3` },
    { op: 'pen', id: 'dog_tail', page: 'pets', role: 'artwork', color: '#7F5539', width: 2, program: `pen at ${q(dx + 5, dy + 2)}\nray to ${q(dx + 12, dy - 4)}` },
  );

  await call('plan', { operations: ops, commit: true });
  await finish('living room', 'diagrams/gemini31-scene-living-room-family.svg');
}

// ---------------------------------------------------------------------------

const BUILDS = [datacenter, brain, candlesticks, gears, apple, tree, fence, livingRoom];

async function run() {
  console.log('=== TurtlePen dense-artwork corpus ===\n');
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  for (let i = 0; i < BUILDS.length; i++) {
    if (only && only !== i + 1) continue;
    await BUILDS[i]();
  }
  console.log('\nAll requested diagrams committed clean and saved.');
}

run().catch((err) => {
  console.error(`\nBUILD FAILED\n${err.message}`);
  process.exit(1);
});
