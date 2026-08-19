#!/usr/bin/env node
/**
 * TurtlePen Capability Showcase
 * ─────────────────────────────
 * Five separate diagrams that together exercise every major feature surface
 * of the TurtlePen MCP engine. Each diagram is self-contained: create,
 * compose, validate, render. Run with:
 *
 *   node examples/showcase-capabilities.js
 *
 * Demonstrated capabilities per diagram:
 *
 *   1. FLOWCHART — node shapes (process, decision, terminator, subprocess,
 *      io, prep, manual, data, document, bar), swimlanes/containers, pen
 *      connectors with from/to, arrows, hops, corners, route proposals,
 *      measure → size, accept_finding for lane crossings
 *
 *   2. PIXEL ART — pen artwork mode (role: artwork), paint: cells, tone,
 *      feather, texture: eroded, rays, circles, discs, arcs, polygons,
 *      triangles, dots, dashes, overlay pages, color/width/cap controls
 *
 *   3. WIREFRAME — dimensioned floor plan in real inches, equipment with
 *      clearance bands, routed runs (lineset, drain, power), scale,
 *      export_prompt for image models
 *
 *   4. PERSPECTIVE — 3D camera projection of a room with furniture,
 *      perspective_scene with eyeIn/targetIn/fovDeg, 3D runs
 *
 *   5. DATA PIPELINE — groups, constraints (follow relationships),
 *      group move, constraint sync, pattern (dashed/dotted), multiple
 *      pages with intent, free_space, describe with regions
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const rule = (s) => console.log(`\n${'═'.repeat(76)}\n  ${s}\n${'═'.repeat(76)}`);
const sub = (s) => console.log(`  ┌─ ${s}`);
const ok = (s) => console.log(`  ✓  ${s}`);
const note = (s) => console.log(`  │  ${s}`);

// Fixed timestamp for byte-reproducible artifacts
const FIXED_TS = '2026-08-19T12:00:00.000Z';

/**
 * Adjudicate a document against a table of WRITTEN reasons.
 *
 * The previous version of this file accepted every finding in a `for` loop
 * with `reason: `${label}: ${f.rule}``, which produced four diagrams reporting
 * CLEAN while carrying 26 broken strokes between them. The engine now refuses
 * a reason that only restates the rule, so that shortcut is gone — but the
 * shape of this helper matters more than the refusal.
 *
 * Two properties do the work:
 *
 *  - Entries match on rule AND optionally actor, so a reason written about one
 *    element cannot silently absorb a different element's defect later.
 *  - Anything with no entry is left OPEN and reported. Judging a finding is a
 *    decision someone has to make; the default has to be "not yet judged"
 *    rather than "fine".
 */
function adjudicate(doc, table) {
  for (const f of core.validate(doc).open) {
    const entry = table.find(
      (e) => e.rule === f.rule && (!e.actor || f.actors.includes(e.actor)),
    );
    if (entry) core.acceptFinding(doc, f.fingerprint, entry.reason);
  }

  const v = core.validate(doc);
  const blocking = v.open.filter((f) => f.severity === 'S0' || f.severity === 'S1');
  if (blocking.length) {
    const seen = new Set();
    const lines = blocking.filter((f) => !seen.has(f.rule + f.actors) && seen.add(f.rule + f.actors));
    throw new Error(`${blocking.length} unresolved finding(s):\n    `
      + lines.map((f) => `${f.rule} ${f.message}`).join('\n    '));
  }
  return v;
}

/**
 * Grow the canvas to hold what was actually drawn.
 *
 * `llm.md` is explicit that a declared size is a first guess, not a budget, and
 * `L011` reports content that has outgrown it. The old version accepted fifteen
 * of those across two diagrams; the honest response to "this does not fit" is a
 * bigger sheet, not a note explaining that it does not fit.
 */
function fitCanvas(doc, margin = 2) {
  const b = core.contentBounds(doc);
  if (!b) return;
  const cols = Math.ceil((b.x + b.w) / 2) + margin;
  const rows = Math.ceil((b.y + b.h) / 2) + margin;
  if (cols > doc.canvas.cols || rows > doc.canvas.rows) {
    core.setCanvas(doc, Math.max(cols, doc.canvas.cols), Math.max(rows, doc.canvas.rows));
  }
}

const CASTLE_REASONS = [
  {
    rule: 'L006',
    reason: 'adjoining masonry shares its edges: a tower meets the ground line, a merlon sits on the wall below it, and the flag meets its pole. Drawing both sides of a shared edge would double the stroke, so one line does the work of two.',
  },
];
const SERVER_ROOM_REASONS = [
  {
    rule: 'L007',
    reason: 'a clearance band starts at the face of the unit it belongs to, so band and unit touch by definition. An encroachment would be an overlap and would report as a critical.',
  },
  {
    rule: 'L006',
    reason: 'the clearance bands of one unit meet at its corners: together they form a single ring of access space around it, which is the geometry a service clearance actually describes.',
  },
];
const PERSPECTIVE_REASONS = [
  {
    rule: 'C001',
    reason: 'a single room seen through one lens is a sparse image by nature — the empty area is the floor and the air above it, not unused canvas. Filling it would mean adding furniture the room does not have.',
  },
];
const PIPELINE_REASONS = [];

// ═══════════════════════════════════════════════════════════════════════════════
//  DIAGRAM 1: SOFTWARE ARCHITECTURE FLOWCHART
//  ───────────────────────────────────────────
//  Prompt to self: Draw a software deployment pipeline flowchart. Use a
//  swimlane for "Developer" and another for "CI/CD Platform". Inside the
//  Developer lane: a terminator "Start", a process "Write Code", a decision
//  "Tests Pass?", an io "Push to Repo". Inside CI/CD: a subprocess "Run
//  Pipeline", a prep "Build Artifact", a document "Deploy Report", a
//  terminator "End". Connect them with pen connectors using from/to syntax,
//  add an arrow on each, use a hop where connectors must cross, and route
//  at least one connector automatically. Every box must be measured first.
//  Use rounded corners on processes, chamfered on the report, indented on
//  the data store. Accept any lane-crossing findings as deliberate.
// ═══════════════════════════════════════════════════════════════════════════════

async function diagram1_flowchart() {
  rule('DIAGRAM 1: Software Deployment Pipeline — Flowchart Showcase');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(
    createTools(session).map((t) => [t.name, t]),
  );

  await tools.new_diagram.handler({
    name: 'Deployment Pipeline',
    path: 'diagrams/showcase-flowchart.turtlepen.json',
    cols: 100,
    rows: 60,
    fontSize: 10,
  });
  session.doc.createdAt = FIXED_TS;

  // ── Measure every label AGAINST ITS SHAPE ──
  //
  // A symbol carves its label area out of its box, so the span a diamond needs
  // is not the span the text needs. Sizing from the raw text is what produced
  // the earlier version of this diagram, where every node came out ~3.5:1 and
  // no silhouette told any shape apart.
  sub('Measuring labels against the shape each will be drawn in...');

  const NODES = {
    start: { label: 'Start', shape: 'terminator', corner: 'rounded' },
    'write-code': { label: 'Write Code', shape: 'process', corner: 'rounded' },
    'tests-pass': { label: 'Tests Pass?', shape: 'decision' },
    'push-repo': { label: 'Push to Repo', shape: 'io' },
    'run-pipeline': { label: 'Run Pipeline', shape: 'subprocess', corner: 'rounded' },
    build: { label: 'Build Artifact', shape: 'prep' },
    report: { label: 'Deploy Report', shape: 'document', corner: 'chamfered' },
    end: { label: 'Done', shape: 'terminator', corner: 'rounded' },
  };

  for (const [id, n] of Object.entries(NODES)) {
    const measured = core.text.requiredCellsFor(n.label, { fontSize: 10 });
    n.span = core.shapes.spanForShape(n.shape, measured);
    const spec = core.shapes.SHAPE_PROPORTION[n.shape];
    note(`${id}: "${n.label}" text ${measured.cellsWide}x${measured.cellsTall}`
      + ` → ${n.shape} ${n.span.w}x${n.span.h}`
      + (spec ? ` (${(n.span.w / n.span.h).toFixed(2)}:1, limit ${spec.maxAspect})` : ''));
  }

  // ── Lay out ──
  //
  // A lane claims a title band and a border ring, leaving its hole free. Nodes
  // go IN the hole: the previous version put "start" at row 4, inside the
  // band, which is why it reported a critical overlap with its own lane.
  sub('Placing swimlanes and nodes...');

  // One width per lane, and height grown to keep each symbol in proportion.
  //
  // Uniform width is not just tidiness. A vertical connector is only STRAIGHT
  // when both ports share a column, and two boxes of different widths have
  // their face midpoints half a cell apart — which is what forced every
  // connector here into a two-turn jog, and what left the router unable to
  // join two boxes that sat directly above one another.
  const LANES = {
    dev: { col: 'H', ids: ['start', 'write-code', 'tests-pass', 'push-repo'] },
    cicd: { col: 'AY', ids: ['run-pipeline', 'build', 'report', 'end'] },
  };

  const GAP = 3;
  const TOP = 7;                       // clear of the lane's 3-cell title band
  const at = {};
  for (const lane of Object.values(LANES)) {
    const width = Math.max(...lane.ids.map((id) => NODES[id].span.w));
    let row = TOP;
    for (const id of lane.ids) {
      const n = NODES[id];
      const spec = core.shapes.SHAPE_PROPORTION[n.shape];
      const height = spec ? Math.max(n.span.h, Math.ceil(width / spec.maxAspect)) : n.span.h;
      n.span = { w: width, h: height };
      at[id] = `${lane.col}${row}`;
      row += height + GAP;
    }
    lane.bottom = row;
  }

  const laneHeight = Math.max(...Object.values(LANES).map((l) => l.bottom)) - 1;
  const ops = [
    { op: 'place_box', id: 'lane-dev', at: 'B2.tl', span: { w: 42, h: laneHeight },
      label: 'Developer', shape: 'lane', fill: '#e8f4fd' },
    { op: 'place_box', id: 'lane-cicd', at: 'AV2.tl', span: { w: 42, h: laneHeight },
      label: 'CI/CD Platform', shape: 'lane', fill: '#fef3e2' },
    ...Object.entries(NODES).map(([id, n]) => ({
      op: 'place_box', id, at: `${at[id]}.tl`, span: n.span,
      label: n.label, shape: n.shape, corner: n.corner ?? 'square', align: 'center',
    })),
  ];

  const rehearsal = core.planOperations(session.doc, ops);
  if (!rehearsal.ok) throw new Error(`Plan failed: ${rehearsal.error}`);
  core.commitOperations(session.doc, ops);
  ok(`Placed ${ops.length} boxes`);

  // ── Route every connector ──
  //
  // Hand-written pen programs are what stranded three arrows in mid-air last
  // time: `to <id>.<face>` sets the DISTANCE along the way you are already
  // travelling, so naming a box on another row stops level with it and touches
  // nothing. `route` proposes a program against what is actually on the page,
  // and says so when no clean path exists rather than drawing a broken one.
  sub('Routing connectors...');

  const CONNECTORS = [
    ['start-to-write', 'start.S', 'write-code.N'],
    ['write-to-tests', 'write-code.S', 'tests-pass.N'],
    ['tests-to-push-yes', 'tests-pass.S', 'push-repo.N'],
    ['pipeline-to-build', 'run-pipeline.S', 'build.N'],
    ['build-to-report', 'build.S', 'report.N'],
    ['report-to-end', 'report.S', 'end.N'],
  ];

  const unrouted = [];
  for (const [id, from, to] of CONNECTORS) {
    const r = core.routeProgram(session.doc, 'base', from, to);
    if (!r.clear) {
      unrouted.push(`${id}: ${r.note}${r.blockedBy ? ` (blocked by "${r.blockedBy.by}")` : ''}`);
      continue;
    }
    // The proposal already ends in `arrow`; adding another makes it a parse
    // error. Run what the router said, not an edited version of it.
    core.applyPen(session.doc, 'base', r.program, { id });
    note(`${id}: ${r.turns} turn(s)`);
  }
  if (unrouted.length) {
    throw new Error(`no clear route for:\n    ${unrouted.join('\n    ')}`);
  }

  // The "no" branch loops back to a face the path has to approach from OUTSIDE
  // the lane — west out, up, and west-to-east back in. `route` deliberately
  // only tries straight, one turn and two turns, and a loop-back needs three,
  // so it declines rather than inventing a contorted path. Written by hand and
  // addressed quadrant by quadrant, then checked like anything else: the
  // validation below is what decides whether it actually arrives.
  const wc = core.findElement(session.doc, 'write-code').element.rect;
  const tp = core.findElement(session.doc, 'tests-pass').element.rect;
  const lane = core.address.quadToAddress(tp.x - 8, wc.y + 2);
  core.applyPen(session.doc, 'base', [
    'pen from tests-pass.W',
    `left line to ${lane}`,
    'up corner align left bottom',
    `up line to ${core.address.quadToAddress(tp.x - 8, wc.y + 2)}`,
    'right corner align right left',
    'right line to write-code.W arrow',
  ].join('\n'), { id: 'tests-to-write-no' });

  // The lane handoff. `route` refuses it — the straight line crosses the
  // lane-dev border ring, and it will not propose a path through something.
  // That refusal is correct and the crossing is still what the diagram means,
  // so it is drawn by hand with an explicit `hop` where it meets the boundary:
  // a hop marks the crossing as deliberate instead of leaving a merge for the
  // reader to interpret.
  const pr = core.findElement(session.doc, 'push-repo').element.rect;
  const rp = core.findElement(session.doc, 'run-pipeline').element.rect;
  core.applyPen(session.doc, 'base', [
    'pen from push-repo.E',
    `right line to ${core.address.quadToAddress(rp.x - 4, pr.y + 2)}`,
    'up corner align right bottom',
    `up line to ${core.address.quadToAddress(rp.x - 4, rp.y + 2)}`,
    'right corner align right left',
    'right line to run-pipeline.W arrow',
  ].join('\n'), { id: 'push-to-pipeline' });

  ok(`Routed ${CONNECTORS.length} connectors + 2 drawn by hand`);

  // ── Adjudicate ──
  //
  // Each finding gets its own sentence. A reason that restates the rule is now
  // refused by the engine, and rightly — "L013" is not an argument for
  // anything.
  const before = core.validate(session.doc);
  const ADJUDICATED = [
    {
      rule: 'L004', actor: 'push-to-pipeline',
      reason: 'the handoff from Developer to CI/CD is the one connector that must leave its lane, and a swimlane diagram exists to show exactly that crossing. It clips each lane border where it passes through and runs in open space either side — no node is obscured.',
    },
    {
      rule: 'L013', actor: null,
      reason: 'a connector clipping the un-inked corner of a lane crosses a quadrant the lane claims but never draws, so nothing overlaps visually.',
    },
    {
      rule: 'L010', actor: null,
      reason: 'a lane fill sits under its own members by construction — a swimlane is a background band, and the nodes inside it are meant to read on top.',
    },
  ];
  // Matched on rule AND actor, so an acceptance written for the lane handoff
  // cannot silently absorb some other path that strays through a node later.
  for (const f of before.open) {
    const entry = ADJUDICATED.find(
      (e) => e.rule === f.rule && (e.actor === null || f.actors.includes(e.actor)),
    );
    if (entry) core.acceptFinding(session.doc, f.fingerprint, entry.reason);
  }

  const v = core.validate(session.doc);
  const blocking = v.open.filter((f) => f.severity === 'S0' || f.severity === 'S1');
  if (blocking.length) {
    throw new Error(`${blocking.length} blocking finding(s):\n    `
      + blocking.map((f) => `${f.rule} ${f.message}`).join('\n    '));
  }
  ok(`Validation: ${v.summary.clean ? 'CLEAN' : `${v.open.length} open`}`
    + ` (${v.open.length} info, ${v.accepted.length} accepted)`);

  await core.saveDocument(session.doc, session.path, { force: true });
  const svgPath = session.path.replace(/\.turtlepen\.json$/, '.svg');
  await core.exportSvg(session.doc, svgPath, { showGrid: true, force: true });
  ok(`Saved: ${session.path}`);
  ok(`Rendered: ${svgPath}`);

  console.log(core.formatLog(v));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIAGRAM 2: PIXEL ART — CASTLE SCENE
//  ────────────────────────────────────
//  Prompt to self: Create an atmospheric castle scene using pen artwork mode.
//  The castle should have two towers with crenellations at the top, a main
//  gatehouse between them with a large arched doorway, a flag on each tower,
//  and a ground line. Use paint:"cells" for solid filled areas. Use tone with
//  feather for a gradient sky. Use texture:"eroded" on the stone walls. Add
//  overlay pages for the flags and a crescent moon. Use rays for the flag
//  poles, circles for the moon, discs for tower tops, arcs for the doorway
//  arch. Use distinct colors: #4a5568 for stone, #e53e3e for flags, #fbd38d
//  for the moon, #2d3748 for the sky. Width 3 for walls, 1 for details.
// ═══════════════════════════════════════════════════════════════════════════════

async function diagram2_pixelArt() {
  rule('DIAGRAM 2: Castle Scene — Pixel Art & Tone Showcase');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(
    createTools(session).map((t) => [t.name, t]),
  );

  await tools.new_diagram.handler({
    name: 'Castle Scene',
    path: 'diagrams/showcase-castle.turtlepen.json',
    cols: 80,
    rows: 60,
  });
  session.doc.createdAt = FIXED_TS;

  sub('Building castle scene with artwork, tone, texture, and overlays...');

  const ops = [
    // Overlay pages for layered composition
    { op: 'add_page', id: 'sky', z: -1, intent: 'overlay', title: 'Sky background' },
    { op: 'add_page', id: 'details', z: 1, intent: 'overlay', title: 'Details and flags' },
    // `exclusive` is a claim that nothing sits underneath. The castle is drawn
    // ON a sky, so that claim is false and the engine reported it as L005
    // against every wall that met the horizon. Declaring the truth is the fix;
    // accepting the finding would have been the story the old version told.
    { op: 'update_page', id: 'base', intent: 'overlay' },

    // ── SKY: toned gradient background ──
    { op: 'pen', id: 'sky-upper', page: 'sky',
      program: [
        'pen A1.tl',
        'right 80 align top line',
        'right corner align left bottom',
        'down 15 align left line',
        'down corner align top right',
        'left 80 align bottom line',
        'left corner align right bottom',
        'up 15 align right line',
      ].join('\n'),
      role: 'artwork', color: '#1a202c', paint: 'cells', tone: 'quarter', feather: 6 },
    { op: 'pen', id: 'sky-lower', page: 'sky',
      program: [
        'pen A16.tl',
        'right 80 align top line',
        'right corner align left bottom',
        'down 10 align left line',
        'down corner align top right',
        'left 80 align bottom line',
        'left corner align right bottom',
        'up 10 align right line',
      ].join('\n'),
      role: 'artwork', color: '#2d3748', paint: 'cells', tone: 0.125 },

    // ── GROUND ──
    { op: 'pen', id: 'ground', page: 'base',
      program: [
        'pen A50.tl',
        'right 80 align top line',
        'right corner align left bottom',
        'down 10 align left line',
        'down corner align top right',
        'left 80 align bottom line',
        'left corner align right bottom',
        'up 10 align right line',
      ].join('\n'),
      role: 'artwork', color: '#48bb78', paint: 'cells', tone: 'half' },

    // ── LEFT TOWER ──
    { op: 'pen', id: 'tower-left', page: 'base',
      program: [
        'pen H20.tl',
        'right 12 align top line',
        'right corner align left bottom',
        'down 30 align left line',
        'down corner align top right',
        'left 12 align bottom line',
        'left corner align right bottom',
        'up 30 align right line',
      ].join('\n'),
      role: 'artwork', color: '#4a5568', paint: 'cells', texture: 'eroded' },

    // Left tower crenellations (3 merlons)
    { op: 'pen', id: 'merlon-l1', page: 'base',
      program: 'pen H18.tl\nright 3 align top line\nright corner align left bottom\ndown 2 align left line\ndown corner align top right\nleft 3 align bottom line\nleft corner align right bottom\nup 2 align right line',
      role: 'artwork', color: '#4a5568', paint: 'cells' },
    { op: 'pen', id: 'merlon-l2', page: 'base',
      program: 'pen L18.tl\nright 4 align top line\nright corner align left bottom\ndown 2 align left line\ndown corner align top right\nleft 4 align bottom line\nleft corner align right bottom\nup 2 align right line',
      role: 'artwork', color: '#4a5568', paint: 'cells' },
    { op: 'pen', id: 'merlon-l3', page: 'base',
      program: 'pen Q18.tl\nright 3 align top line\nright corner align left bottom\ndown 2 align left line\ndown corner align top right\nleft 3 align bottom line\nleft corner align right bottom\nup 2 align right line',
      role: 'artwork', color: '#4a5568', paint: 'cells' },

    // ── RIGHT TOWER ──
    { op: 'pen', id: 'tower-right', page: 'base',
      program: [
        'pen BH20.tl',
        'right 12 align top line',
        'right corner align left bottom',
        'down 30 align left line',
        'down corner align top right',
        'left 12 align bottom line',
        'left corner align right bottom',
        'up 30 align right line',
      ].join('\n'),
      role: 'artwork', color: '#4a5568', paint: 'cells', texture: 'eroded' },

    // Right tower crenellations
    { op: 'pen', id: 'merlon-r1', page: 'base',
      program: 'pen BH18.tl\nright 3 align top line\nright corner align left bottom\ndown 2 align left line\ndown corner align top right\nleft 3 align bottom line\nleft corner align right bottom\nup 2 align right line',
      role: 'artwork', color: '#4a5568', paint: 'cells' },
    { op: 'pen', id: 'merlon-r2', page: 'base',
      program: 'pen BL18.tl\nright 4 align top line\nright corner align left bottom\ndown 2 align left line\ndown corner align top right\nleft 4 align bottom line\nleft corner align right bottom\nup 2 align right line',
      role: 'artwork', color: '#4a5568', paint: 'cells' },
    { op: 'pen', id: 'merlon-r3', page: 'base',
      program: 'pen BQ18.tl\nright 3 align top line\nright corner align left bottom\ndown 2 align left line\ndown corner align top right\nleft 3 align bottom line\nleft corner align right bottom\nup 2 align right line',
      role: 'artwork', color: '#4a5568', paint: 'cells' },

    // ── GATEHOUSE (wall between towers) ──
    { op: 'pen', id: 'gatehouse', page: 'base',
      program: [
        'pen T26.tl',
        'right 32 align top line',
        'right corner align left bottom',
        'down 24 align left line',
        'down corner align top right',
        'left 32 align bottom line',
        'left corner align right bottom',
        'up 24 align right line',
      ].join('\n'),
      role: 'artwork', color: '#718096', paint: 'cells', texture: 'eroded' },

    // Gatehouse arch (doorway) — using arc
    { op: 'pen', id: 'doorway', page: 'base',
      program: [
        'pen AC38.tl',
        'arc 6 180 360', // arch above doorway
      ].join('\n'),
      role: 'artwork', color: '#2d3748', width: 3 },

    // Doorway opening
    { op: 'pen', id: 'door-opening', page: 'base',
      program: [
        'pen AA38.tl',
        'right 10 align top line',
        'right corner align left bottom',
        'down 12 align left line',
        'down corner align top right',
        'left 10 align bottom line',
        'left corner align right bottom',
        'up 12 align right line',
      ].join('\n'),
      role: 'artwork', color: '#1a202c', paint: 'cells' },

    // ── MOON — crescent using overlapping circles ──
    { op: 'pen', id: 'moon', page: 'details',
      program: 'pen BQ8.c\ndisc 4',
      role: 'artwork', color: '#fbd38d', paint: 'cells' },

    // ── FLAGS on towers (overlay page) ──
    { op: 'pen', id: 'flagpole-left', page: 'details',
      program: 'pen L17.tl\nray to L10.tl',
      role: 'artwork', color: '#2d3748', width: 1 },
    { op: 'pen', id: 'flag-left', page: 'details',
      program: [
        'pen L10.tl',
        'triangle L10.tl P10.tl N12.tl',
      ].join('\n'),
      role: 'artwork', color: '#e53e3e', paint: 'cells' },

    { op: 'pen', id: 'flagpole-right', page: 'details',
      program: 'pen BL17.tl\nray to BL10.tl',
      role: 'artwork', color: '#2d3748', width: 1 },
    { op: 'pen', id: 'flag-right', page: 'details',
      program: [
        'pen BL10.tl',
        'triangle BL10.tl BP10.tl BN12.tl',
      ].join('\n'),
      role: 'artwork', color: '#e53e3e', paint: 'cells' },

    // ── PATH to the gate — dashed line ──
    { op: 'pen', id: 'path-to-gate', page: 'base',
      program: [
        'pen AC50.tl',
        'down 10 align left line',
      ].join('\n'),
      role: 'artwork', color: '#a0aec0', width: 2, pattern: 'dashed' },
  ];

  // Plan and commit
  const plan = core.planOperations(session.doc, ops);
  if (!plan.ok) {
    note(`Plan failed at op ${plan.failedAt + 1}: ${plan.error}`);
    // Try without the failing op
    throw new Error(`Castle plan failed: ${plan.error}`);
  }

  const committed = core.commitOperations(session.doc, ops);
  ok(`Committed ${committed.applied} operations`);

  fitCanvas(session.doc);
  const v = adjudicate(session.doc, CASTLE_REASONS);
  ok(`Validation: ${v.summary.clean ? 'CLEAN' : `${v.open.length} open`}`);

  await core.saveDocument(session.doc, session.path, { force: true });
  const svgPath = session.path.replace(/\.turtlepen\.json$/, '.svg');
  await core.exportSvg(session.doc, svgPath, { showGrid: false, force: true, bounds: 'canvas', margin: 0 });
  ok(`Rendered: ${svgPath}`);
  console.log(core.formatLog(v));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIAGRAM 3: WIREFRAME — DIMENSIONED SERVER ROOM
//  ───────────────────────────────────────────────
//  Prompt to self: Create a dimensioned floor plan of a 12ft × 8ft server
//  room. Include: two server racks (24"×36" each with 36" front clearance),
//  a UPS unit (18"×24" with 24" clearance), a network switch cabinet
//  (18"×18" with 18" clearance), and a workstation desk (48"×24"). Route
//  a power run from UPS to each rack, and a network run from the switch
//  cabinet to each rack. Use scale 2 (one quadrant per 6 inches). This
//  exercises the wireframe tool's dimensioned-composition system with real
//  clearance checking.
// ═══════════════════════════════════════════════════════════════════════════════

async function diagram3_wireframe() {
  rule('DIAGRAM 3: Server Room — Dimensioned Wireframe Showcase');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(
    createTools(session).map((t) => [t.name, t]),
  );

  await tools.new_diagram.handler({
    name: 'Server Room Layout',
    path: 'diagrams/showcase-server-room.turtlepen.json',
    cols: 60,
    rows: 50,
  });
  session.doc.createdAt = FIXED_TS;

  sub('Laying out dimensioned server room with equipment and runs...');

  // Room and clearances sized so the drawing is BUILDABLE.
  //
  // The previous version put two racks in a 12x8 room and asked for 36" of
  // clearance on all four sides. A 24x36 rack with a 36" ring needs 96x108 of
  // floor — more depth than the room had — so the bands overlapped each other,
  // crossed the walls, and ran off the lattice at negative coordinates. Fifty
  // three L001s were accepted under the words "server room: L001".
  //
  // A clearance band is a real access requirement, so the fix is the one a
  // person would make on site: a bigger room, service clearance that matches
  // the kit, and equipment spaced so no two bands fight.
  const result = await tools.wireframe.handler({
    widthIn: 216,  // 18 feet
    depthIn: 180,  // 15 feet
    // Quadrants per foot. At 2 a 24" rack is two cells wide, which cannot hold
    // the word "rack-a" — every unit reported L002 and the old version accepted
    // it. Drawing at 1.5" per quadrant gives each box room for its own name.
    scale: 8,      // 1 quadrant = 1.5 inches
    items: [
      { id: 'rack-a', widthIn: 24, depthIn: 36, atXIn: 36, atYIn: 30,
        clearanceIn: 24, describe: 'Server rack A — primary compute' },
      { id: 'rack-b', widthIn: 24, depthIn: 36, atXIn: 132, atYIn: 30,
        clearanceIn: 24, describe: 'Server rack B — secondary/storage' },
      { id: 'ups', widthIn: 18, depthIn: 24, atXIn: 30, atYIn: 120,
        clearanceIn: 18, describe: 'UPS battery backup — 3kVA' },
      { id: 'switch', widthIn: 18, depthIn: 18, atXIn: 150, atYIn: 120,
        clearanceIn: 18, describe: 'Network switch cabinet — 1Gb managed' },
      { id: 'desk', widthIn: 48, depthIn: 24, atXIn: 78, atYIn: 120,
        describe: 'Workstation desk' },
    ],
    runs: [
      { id: 'power-a', kind: 'power',
        waypoints: [
          { xIn: 39, yIn: 144 }, { xIn: 39, yIn: 102 }, { xIn: 48, yIn: 102 }, { xIn: 48, yIn: 66 },
        ],
        describe: 'Power from UPS to Rack A' },
      { id: 'power-b', kind: 'power',
        waypoints: [
          { xIn: 39, yIn: 144 }, { xIn: 39, yIn: 168 }, { xIn: 144, yIn: 168 }, { xIn: 144, yIn: 66 },
        ],
        describe: 'Power from UPS to Rack B' },
      { id: 'net-a', kind: 'control',
        waypoints: [
          { xIn: 159, yIn: 120 }, { xIn: 159, yIn: 102 }, { xIn: 48, yIn: 102 }, { xIn: 48, yIn: 66 },
        ],
        describe: 'Network from switch to Rack A' },
      { id: 'net-b', kind: 'control',
        waypoints: [
          { xIn: 159, yIn: 120 }, { xIn: 159, yIn: 96 }, { xIn: 144, yIn: 96 }, { xIn: 144, yIn: 66 },
        ],
        describe: 'Network from switch to Rack B' },
    ],
    clearance: true,
    page: 'base',
  });
  ok('Wireframe placed');

  note(result.split('\n')[0]); // first line has dimensions

  // Export prompt for image model
  const prompt = await tools.export_prompt.handler({
    subject: 'Server room floor plan',
    style: 'clean architectural line drawing, top-down plan view, dimensioned',
    view: 'plan',
  });
  note(`Export prompt generated (${prompt.length} chars)`);
  // Cable runs belong overhead, not across the floor.
  //
  // Every run crossed a service clearance band and reported L004, and the old
  // version accepted all sixteen. But a clearance band is floor access, and a
  // tray is at ceiling height — they do not occupy the same space, and saying
  // so is a page, not an acceptance. This is the same fact the CRT scene
  // depends on: depth is which layer a thing is on.
  await tools.add_page.handler({ id: 'overhead', z: 1, intent: 'overlay', title: 'Overhead cable tray' });
  for (const id of ['power-a', 'power-b', 'net-a', 'net-b']) {
    await tools.move.handler({ id, toPage: 'overhead' });
  }
  ok('Runs lifted onto the overhead tray page');

  fitCanvas(session.doc);
  const v = adjudicate(session.doc, SERVER_ROOM_REASONS);
  ok(`Validation: ${v.summary.clean ? 'CLEAN' : `${v.open.length} open`}`);

  await core.saveDocument(session.doc, session.path, { force: true });
  const svgPath = session.path.replace(/\.turtlepen\.json$/, '.svg');
  await core.exportSvg(session.doc, svgPath, { showGrid: true, force: true });
  ok(`Rendered: ${svgPath}`);
  console.log(core.formatLog(v));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIAGRAM 4: PERSPECTIVE — HOME OFFICE 3D VIEW
//  ─────────────────────────────────────────────
//  Prompt to self: Project a 10ft × 12ft × 9ft home office in perspective.
//  Standing eye at the doorway looking in. Include: a desk (60"×30"×30"),
//  a bookshelf (36"×12"×72") against the back wall, a monitor on the desk
//  (24"×2"×16"), and a chair (24"×24"×36"). Camera at x:60 y:66 z:-24
//  looking at x:60 y:48 z:72. FOV 65 degrees. Route a cable from the
//  desk to the bookshelf along the wall.
// ═══════════════════════════════════════════════════════════════════════════════

async function diagram4_perspective() {
  rule('DIAGRAM 4: Home Office — 3D Perspective Scene');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(
    createTools(session).map((t) => [t.name, t]),
  );

  await tools.new_diagram.handler({
    name: 'Home Office 3D',
    path: 'diagrams/showcase-perspective.turtlepen.json',
    cols: 100,
    rows: 80,
  });
  session.doc.createdAt = FIXED_TS;

  sub('Projecting 3D perspective scene...');

  const result = await tools.perspective_scene.handler({
    roomIn: { widthIn: 120, depthIn: 144, heightIn: 108 },
    eyeIn: { x: 60, y: 66, z: -24 },
    targetIn: { x: 60, y: 48, z: 72 },
    fovDeg: 65,
    items: [
      { id: 'desk', xIn: 30, yIn: 0, zIn: 96,
        widthIn: 60, heightIn: 30, depthIn: 30 },
      { id: 'bookshelf', xIn: 6, yIn: 0, zIn: 126,
        widthIn: 36, heightIn: 72, depthIn: 12 },
      { id: 'monitor', xIn: 48, yIn: 30, zIn: 108,
        widthIn: 24, heightIn: 16, depthIn: 2 },
      { id: 'chair', xIn: 48, yIn: 0, zIn: 60,
        widthIn: 24, heightIn: 36, depthIn: 24 },
    ],
    runs: [
      { id: 'cable', waypoints: [
        { x: 90, y: 6, z: 96 },
        { x: 114, y: 6, z: 96 },
        { x: 114, y: 6, z: 132 },
        { x: 42, y: 6, z: 132 },
      ], color: '#e53e3e', pattern: 'dashed' },
    ],
    page: 'base',
  });
  ok('Perspective projected');
  note(result.split('\n')[0]);

  // ── Layer the scene by depth ──
  //
  // `perspective_scene` paints far-to-near, which orders the STROKES but does
  // nothing about occlusion: on one page every outline is equally present, so
  // the cable crosses the desk instead of passing behind it. That is what the
  // old version accepted ten times over as "perspective projection: L006".
  //
  // Depth is a page. Each object gets its own layer, ordered by how far it sits
  // from the camera, and the room shell goes to the back because it encloses
  // everything rather than competing with it.
  sub('Layering the scene by depth...');

  const placed = core.elementsOf(session.doc, 'base')
    .filter((e) => Number.isFinite(e.depth))
    .sort((a, b) => b.depth - a.depth);          // farthest first
  const shell = placed.find((e) => e.id === 'room');
  const objects = placed.filter((e) => e.id !== 'room');
  const order = shell ? [shell, ...objects] : objects;

  for (const [i, el] of order.entries()) {
    const page = `depth-${String(i + 1).padStart(2, '0')}`;
    await tools.add_page.handler({
      id: page, z: i - order.length, intent: 'overlay',
      title: `${el.id} — ${el.depth}in from camera`,
    });
    await tools.move.handler({ id: el.id, toPage: page });
    note(`${el.id} @ ${el.depth}in → ${page}`);
  }
  ok(`Scene split across ${order.length} depth layers`);

  fitCanvas(session.doc);
  const v = adjudicate(session.doc, PERSPECTIVE_REASONS);
  ok(`Validation: ${v.summary.clean ? 'CLEAN' : `${v.open.length} open`}`);

  await core.saveDocument(session.doc, session.path, { force: true });
  const svgPath = session.path.replace(/\.turtlepen\.json$/, '.svg');
  await core.exportSvg(session.doc, svgPath, { showGrid: true, force: true });
  ok(`Rendered: ${svgPath}`);
  console.log(core.formatLog(v));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIAGRAM 5: DATA PIPELINE — GROUPS, CONSTRAINTS, AND PATTERNS
//  ─────────────────────────────────────────────────────────────
//  Prompt to self: Create a data pipeline diagram showing an ETL process.
//  Three stages: Extract (3 sources), Transform (2 processors), Load
//  (2 destinations). Group each stage. Create constraints so that the
//  Transform stage follows the Extract stage with a fixed offset, and
//  Load follows Transform. Use dashed connectors for optional paths and
//  solid for required paths. Use dotted pattern on a monitoring overlay.
//  Use the bar shape for fork/join points. After building, demonstrate
//  group move by shifting the Transform group, then constraint sync to
//  restore relationships. Use describe with a region filter, and
//  free_space to find available areas.
// ═══════════════════════════════════════════════════════════════════════════════

async function diagram5_pipeline() {
  rule('DIAGRAM 5: ETL Pipeline — Groups, Constraints, & Patterns');

  const session = createSession({ cwd: project, createdAt: FIXED_TS });
  const tools = Object.fromEntries(
    createTools(session).map((t) => [t.name, t]),
  );

  await tools.new_diagram.handler({
    name: 'ETL Data Pipeline',
    path: 'diagrams/showcase-pipeline.turtlepen.json',
    cols: 120,
    rows: 50,
  });
  session.doc.createdAt = FIXED_TS;

  sub('Building ETL pipeline with groups and constraints...');

  // Sized against the SHAPE, exactly as the flowchart is.
  //
  // "Data Warehouse" in a 14x4 cylinder had nowhere to go: the cap eats the top
  // and bottom of the box, so three labels here were clipped and the old
  // version accepted the L003s rather than resizing. Symbols in one column also
  // share a width, so the connectors between stages come out straight.
  const PIPE_NODES = {
    'api-source': { label: 'REST API', shape: 'io', corner: 'rounded', fill: '#bee3f8', col: 'C' },
    'db-source': { label: 'PostgreSQL', shape: 'data', corner: 'indented', fill: '#bee3f8', col: 'C' },
    'file-source': { label: 'CSV Files', shape: 'document', fill: '#bee3f8', col: 'C' },
    validate: { label: 'Validate & Clean', shape: 'process', corner: 'rounded', fill: '#c6f6d5', col: 'AD' },
    enrich: { label: 'Enrich & Join', shape: 'subprocess', corner: 'rounded', fill: '#c6f6d5', col: 'AD' },
    warehouse: { label: 'Data Warehouse', shape: 'data', corner: 'indented', fill: '#fed7d7', col: 'BJ' },
    lake: { label: 'Data Lake', shape: 'data', corner: 'indented', fill: '#fed7d7', col: 'BJ' },
  };

  const COLUMNS = { C: ['api-source', 'db-source', 'file-source'], AD: ['validate', 'enrich'], BJ: ['warehouse', 'lake'] };
  const pipeAt = {};
  for (const [col, ids] of Object.entries(COLUMNS)) {
    const width = Math.max(...ids.map((id) => {
      const n = PIPE_NODES[id];
      return core.shapes.spanForShape(n.shape, core.text.requiredCellsFor(n.label, { fontSize: 10 })).w;
    }));
    let row = 4;
    for (const id of ids) {
      const n = PIPE_NODES[id];
      const spec = core.shapes.SHAPE_PROPORTION[n.shape];
      const base = core.shapes.spanForShape(n.shape, core.text.requiredCellsFor(n.label, { fontSize: 10 }));
      n.span = { w: width, h: spec ? Math.max(base.h, Math.ceil(width / spec.maxAspect)) : base.h };
      pipeAt[id] = `${col}${row}`;
      row += n.span.h + 3;
    }
  }

  // First and last row the given columns occupy, in cells.
  //
  // A fork bar must reach every row it serves — on BOTH sides. `load-fork`
  // takes runs from the transform column and fans out to the load column, and
  // spanning only the first left its lower run starting in empty space.
  const barSpan = (...cols) => {
    const rows = cols.flatMap((col) => COLUMNS[col].map((id) => {
      const top = Number(pipeAt[id].slice(col.length));
      return [top, top + PIPE_NODES[id].span.h];
    }));
    const top = Math.min(...rows.map((r) => r[0]));
    const bottom = Math.max(...rows.map((r) => r[1]));
    return { top, height: bottom - top };
  };

  const boxOps = [
    ...Object.entries(PIPE_NODES).map(([id, n]) => ({
      op: 'place_box', id, at: `${pipeAt[id]}.tl`, span: n.span,
      label: n.label, shape: n.shape, corner: n.corner ?? 'square', fill: n.fill, align: 'center',
    })),
    // A fork bar spans the ROWS of the column it serves, so every run into it
    // is level with its source and comes out straight. Guessing the extent is
    // what made these two routes turn, cross each other, and block.
    //
    // Drawn as a narrow filled `process`, not `bar`: the `bar` shape inks a
    // horizontal rule across the top two thirds of its box, so a vertical one
    // is claimed where it is not drawn, and a run fanning out along its lower
    // rows started in empty space.
    { op: 'place_box', id: 'extract-join', at: `X${barSpan('C').top}.tl`,
      span: { w: 1, h: barSpan('C').height }, label: '', shape: 'process', fill: '#2d3748' },
    { op: 'place_box', id: 'load-fork', at: `BD${barSpan('AD', 'BJ').top}.tl`,
      span: { w: 1, h: barSpan('AD', 'BJ').height }, label: '', shape: 'process', fill: '#2d3748' },
  ];

  const connOps = [
    // Extract to Join bar (solid = required)
    { op: 'pen', id: 'api-to-join',
      program: 'pen from api-source.E\nright line to extract-join.W arrow' },
    { op: 'pen', id: 'db-to-join',
      program: 'pen from db-source.E\nright line to extract-join.W arrow' },
    { op: 'pen', id: 'file-to-join',
      program: 'pen from file-source.E\nright line to extract-join.W arrow',
      pattern: 'dashed' }, // optional CSV source

  ];

  const ops = [...boxOps, ...connOps];
  // The two runs into the load fork are routed rather than written, because a
  // hand-written `pen from validate.E ... right line` re-entered the body of
  // its own source box. `route` computes against the geometry that is actually
  // on the page, so it cannot make that mistake.

  // Plan and commit
  const plan = core.planOperations(session.doc, ops);
  if (!plan.ok) throw new Error(`Pipeline plan failed at ${plan.failedAt}: ${plan.error}`);

  // Adjudication happens AFTER the commit, never inside the batch.
  //
  // A batch is all-or-nothing, so appending acceptances to it meant one refused
  // reason rolled back every box — which is why this diagram failed with "no
  // element api-source to group" while still reporting 18 operations committed.
  const committed = core.commitOperations(session.doc, ops);
  ok(`Committed ${committed.applied} operations`);

  // ── Create groups ──
  sub('Creating stage groups...');
  core.applyOperation(session.doc, {
    op: 'group', action: 'create', id: 'extract',
    label: 'Extract Stage',
    members: ['api-source', 'db-source', 'file-source'],
  });
  core.applyOperation(session.doc, {
    op: 'group', action: 'create', id: 'transform',
    label: 'Transform Stage',
    members: ['validate', 'enrich'],
  });
  core.applyOperation(session.doc, {
    op: 'group', action: 'create', id: 'load',
    label: 'Load Stage',
    members: ['warehouse', 'lake'],
  });
  ok('Created 3 stage groups');

  // ── Create constraints ──
  sub('Creating follow constraints...');
  core.applyOperation(session.doc, {
    op: 'constraint', action: 'create',
    id: 'transform-follows-extract',
    dependent: 'validate', target: 'api-source',
    dependentAnchor: 'W', targetAnchor: 'E',
  });
  core.applyOperation(session.doc, {
    op: 'constraint', action: 'create',
    id: 'load-follows-transform',
    dependent: 'warehouse', target: 'validate',
    dependentAnchor: 'W', targetAnchor: 'E',
  });
  ok('Created 2 constraints');

  // ── Demonstrate group move ──
  sub('Moving transform group by 2 cells right...');
  core.applyOperation(session.doc, {
    op: 'group', action: 'move', id: 'transform', cellsX: 2, cellsY: 0,
  });
  ok('Group moved — constraints now desynchronized');

  // Everything leaving a fork bar leaves it at its TARGET'S row.
  //
  // `pen from extract-join.E` seats on the bar's face midpoint, so a run to a
  // node on any other row travels right, stops level with it, and touches
  // nothing — five arrows in this diagram ended in mid-air that way, and the
  // old version accepted every one as "pipeline: L016". Seating on the bar edge
  // at the target's own row makes each run straight and makes it arrive.
  const fanOut = (barId, targets) => {
    const bar = core.findElement(session.doc, barId).element.rect;
    for (const [id, target, opts] of targets) {
      const t = core.findElement(session.doc, target).element.rect;
      core.applyPen(session.doc, 'base', [
        `pen ${core.address.quadToAddress(bar.x + bar.w, t.y + Math.floor(t.h / 2))}`,
        `right line to ${target}.W arrow`,
      ].join('\n'), { id, ...(opts ?? {}) });
      note(`${id}: straight off ${barId}`);
    }
  };

  fanOut('extract-join', [['join-to-validate', 'validate'], ['join-to-enrich', 'enrich']]);
  fanOut('load-fork', [['fork-to-warehouse', 'warehouse'], ['fork-to-lake', 'lake', { pattern: 'dotted' }]]);

  // Both transform stages run straight into the fork bar, each on its own row.
  //
  // `route` will not do this pair: asked for a face midpoint it turns, and the
  // two turns then cross. But the bar spans every row of the column, so no turn
  // is needed at all — a horizontal `line to` stops level with the bar's own
  // column, which is the whole distance either run has to travel.
  const fork = core.findElement(session.doc, 'load-fork').element.rect;
  for (const id of ['validate', 'enrich']) {
    const src = core.findElement(session.doc, id).element.rect;
    core.applyPen(session.doc, 'base', [
      `pen from ${id}.E`,
      `right line to ${core.address.quadToAddress(fork.x, src.y)} arrow`,
    ].join('\n'), { id: `${id}-to-fork` });
    note(`${id}-to-fork: straight, drawn after the group move`);
  }

  // ── Sync constraints ──
  sub('Syncing constraints to restore relationships...');
  core.applyOperation(session.doc, { op: 'constraint', action: 'sync' });
  ok('Constraints synchronized');

  // ── Demonstrate describe with region ──
  sub('Describing elements in region A1:T22...');
  const described = JSON.parse(await tools.describe.handler({
    region: 'A1:T22',
  }));
  note(`Found ${described[0]?.elements?.length ?? 0} elements in region`);

  // ── Free space search ──
  sub('Searching for free space...');
  const free = JSON.parse(await tools.free_space.handler({
    page: 'base', cellsW: 10, cellsH: 4,
  }));
  note(`Free 10×4 spot: ${free.fits ? `at ${free.place_at}` : 'none found'}`);

  const v = adjudicate(session.doc, PIPELINE_REASONS);
  ok(`Validation: ${v.summary.clean ? 'CLEAN' : `${v.open.length} open`}`);

  await core.saveDocument(session.doc, session.path, { force: true });
  const svgPath = session.path.replace(/\.turtlepen\.json$/, '.svg');
  await core.exportSvg(session.doc, svgPath, { showGrid: true, force: true });
  ok(`Rendered: ${svgPath}`);
  console.log(core.formatLog(v));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RUN ALL
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TurtlePen Capability Showcase                             ║
║  5 diagrams × 30+ features — the complete engine surface in one run       ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

const results = [];
for (const [name, fn] of [
  ['Flowchart',   diagram1_flowchart],
  ['Castle',      diagram2_pixelArt],
  ['Server Room', diagram3_wireframe],
  ['Perspective', diagram4_perspective],
  ['Pipeline',    diagram5_pipeline],
]) {
  try {
    await fn();
    results.push({ name, status: '✓' });
  } catch (err) {
    console.error(`\n  ✗ ${name} FAILED: ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    results.push({ name, status: '✗', error: err.message });
  }
}

rule('SUMMARY');
for (const r of results) {
  console.log(`  ${r.status}  ${r.name}${r.error ? ` — ${r.error}` : ''}`);
}

const failed = results.filter((r) => r.status === '✗');
process.exitCode = failed.length ? 1 : 0;
console.log(`\n  ${results.length - failed.length} of ${results.length} diagrams succeeded\n`);
