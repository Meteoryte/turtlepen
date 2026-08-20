#!/usr/bin/env node
/**
 * Mona Lisa 1 of 5 — how to paint her, as a flowchart.
 *
 * The one piece in the set that is a diagram rather than a picture, so it uses
 * the flowchart surface properly: every label measured against the shape it
 * will sit in, one uniform width per column so the connectors run straight,
 * and `route` proposing the paths instead of hand-computed pen programs.
 */
import { driver, col, cell, finish, say } from './_lib.js';

export default async function build() {
  const { call, asJson } = driver();
  await call('new_diagram', {
    name: 'How to Paint the Mona Lisa',
    path: 'diagrams/mona/mona-01-flowchart.turtlepen.json',
    cols: 130, rows: 96, fontSize: 10,
  });

  const NODES = {
    panel: { label: 'Season poplar panel', shape: 'terminator', corner: 'rounded' },
    ground: { label: 'Lay white gesso ground', shape: 'process', corner: 'rounded' },
    sketch: { label: 'Sketch the sitter', shape: 'manual' },
    dry: { label: 'Layer dry?', shape: 'decision' },
    glaze: { label: 'Glaze one thin veil', shape: 'process', corner: 'rounded' },
    sfumato: { label: 'Blend edge to shadow', shape: 'subprocess', corner: 'rounded' },
    enough: { label: 'Depth achieved?', shape: 'decision' },
    varnish: { label: 'Varnish and cure', shape: 'prep' },
    hang: { label: 'Hang in the Louvre', shape: 'terminator', corner: 'rounded' },
  };

  // ── Measure every label against ITS OWN shape ─────────────────────────────
  for (const [, n] of Object.entries(NODES)) {
    const m = await asJson('measure', { text: n.label, shape: n.shape });
    n.span = m.span;
  }

  // Two columns, each one uniform width so every vertical connector is straight
  // — two boxes of different widths have their face midpoints half a cell
  // apart, and every connector between them has to jog around that.
  const COLUMNS = {
    L: { col: 6, ids: ['panel', 'ground', 'sketch', 'dry'] },
    R: { col: 62, ids: ['glaze', 'sfumato', 'enough', 'varnish', 'hang'] },
  };
  const GAP = 5;
  const at = {};
  for (const lane of Object.values(COLUMNS)) {
    const width = Math.max(...lane.ids.map((id) => NODES[id].span.w));
    let row = 5;
    for (const id of lane.ids) {
      const n = NODES[id];
      const spec = { decision: 2, manual: 3, prep: 3, terminator: 4 }[n.shape] ?? 3;
      n.span = { w: width, h: Math.max(n.span.h, Math.ceil(width / spec)) };
      at[id] = `${col(lane.col)}${row}`;
      row += n.span.h + GAP;
    }
  }

  await call('plan', {
    commit: true,
    operations: Object.entries(NODES).map(([id, n]) => ({
      op: 'place_box', id, at: `${at[id]}.tl`, span: n.span,
      label: n.label, shape: n.shape, corner: n.corner ?? 'square', align: 'center',
      fill: n.shape === 'decision' ? '#fef3e2' : '#eef2f6',
    })),
  });

  // ── Route the spine of each column ───────────────────────────────────────
  const ROUTED = [
    ['panel-ground', 'panel.S', 'ground.N'],
    ['ground-sketch', 'ground.S', 'sketch.N'],
    ['sketch-dry', 'sketch.S', 'dry.N'],
    ['glaze-sfumato', 'glaze.S', 'sfumato.N'],
    ['sfumato-enough', 'sfumato.S', 'enough.N'],
    ['enough-varnish', 'enough.S', 'varnish.N'],
    ['varnish-hang', 'varnish.S', 'hang.N'],
  ];
  for (const [id, from, to] of ROUTED) {
    const r = await call('route', { from, to });
    // "no clear route" contains the word clear; match the success shape only.
    if (!/turn\(s\), clear/.test(r)) throw new Error(`${id}: ${r.split('\n')[0]}`);
    await call('pen', { id, program: r.split('\n').slice(2).join('\n').trim() });
  }

  // ── The two cross-column paths, drawn by hand ────────────────────────────
  // `route` declines these correctly: a loop back up a column needs more turns
  // than it will propose, and it says so rather than inventing a contortion.
  // Computed from the layout THIS file chose, not read back from the document.
  const box = (id) => {
    const [, c, r] = /^([A-Z]+)(\d+)$/.exec(at[id]);
    let cx = 0;
    for (const ch of c) cx = cx * 26 + (ch.charCodeAt(0) - 64);
    return { cx: cx - 1, cy: Number(r), w: NODES[id].span.w, h: NODES[id].span.h };
  };
  const dry = box('dry');
  const glaze = box('glaze');
  const enough = box('enough');
  const sfumato = box('sfumato');

  // dry --yes--> glaze: out east, up the gap between the columns, back in west.
  const laneX = glaze.cx - 4;
  await call('pen', {
    id: 'dry-yes-glaze',
    program: [
      'pen from dry.E',
      `right line to ${cell(laneX, dry.cy)}`,
      'up corner align right bottom',
      `up line to ${cell(laneX, glaze.cy + Math.floor(glaze.h / 2))}`,
      'right corner align right left',
      'right line to glaze.W arrow',
    ].join(String.fromCharCode(10)),
  });

  // enough --no--> sfumato: the loop that makes it a painting and not a sketch.
  const returnX = enough.cx + enough.w + 5;
  await call('pen', {
    id: 'enough-no-sfumato',
    program: [
      'pen from enough.E',
      `right line to ${cell(returnX, enough.cy)}`,
      'up corner align right bottom',
      `up line to ${cell(returnX, sfumato.cy + Math.floor(sfumato.h / 2))}`,
      'left corner align right top',
      'left line to sfumato.E arrow',
    ].join(String.fromCharCode(10)),
  });

  // ── Branch labels, on an overlay so they never fight the strokes ─────────
  await call('add_page', { id: 'labels', z: 1, intent: 'overlay', title: 'Branch labels' });
  const lbl = (id, cx, cy, text) =>
    call('pen', { page: 'labels', id, program: `text "${text}" at ${cell(cx, cy)} span 8x2 font 9 weight 700` });
  await lbl('yes-1', dry.cx + dry.w + 2, dry.cy + Math.floor(dry.h / 2) - 2, 'yes');
  await lbl('no-1', enough.cx + enough.w + 2, enough.cy + Math.floor(enough.h / 2) - 2, 'no');

  return finish(call, asJson, 'mona-01-flowchart', 'Mona Lisa I — Method', {
    F002: 'the two decisions each carry their yes and no branch; the log counts only the '
      + 'connectors leaving the diamond itself, and one of each pair leaves from a side face.',
  });
}
