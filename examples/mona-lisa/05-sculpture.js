#!/usr/bin/env node
/**
 * Mona Lisa 5 of 5 — as a sculpture, in projection.
 *
 * The only sheet in the set with real three-dimensional geometry behind it.
 * The bust is authored in ROOM INCHES — a plinth, a torso block, the shoulders,
 * the head, the coiled hair — and put through a camera, so the perspective is
 * computed rather than drawn.
 *
 * Which means the whole depth problem arrives with it. A projected scene lands
 * on a lattice with no z-buffer, so every block is equally present and the far
 * ones show straight through the near ones. Each mass therefore gets its own
 * Z-page, ordered by how far it sits from the camera, and the occlusion becomes
 * real. `L025` is the rule that refuses to let that be forgotten.
 */
import { driver, q, polygonOf, hatchFill, finish, col } from './_lib.js';

export default async function build() {
  const { call, asJson, session } = driver();
  await call('new_diagram', {
    name: 'Mona Lisa — Sculpture',
    path: 'diagrams/mona/mona-05-sculpture.turtlepen.json',
    cols: 150, rows: 170,
  });

  // ── The bust, in inches ─────────────────────────────────────────────────
  // X rightward, Y up from the floor, Z away from the camera. Marble-ish
  // proportions: a wide plinth, a tapering torso, the head set back a little.
  const scene = await call('perspective_scene', {
    page: 'base',
    roomIn: { widthIn: 96, depthIn: 96, heightIn: 108 },
    // Outside the room looking in. The first attempt put the eye four inches
    // inside a ninety-six inch room, so the shell filled the frame and the
    // bust it exists to hold was cropped off the edges.
    eyeIn: { x: 48, y: 50, z: -46 },
    targetIn: { x: 48, y: 38, z: 53 },
    fovDeg: 40,
    // Bust proportions, not architecture. The first stack gave the plinth a
    // wider footprint than the shoulders and a head barely taller than the cap,
    // which reads as a wedding cake. A bust is mostly figure.
    items: [
      { id: 'plinth', xIn: 40, yIn: 0, zIn: 46, widthIn: 20, heightIn: 14, depthIn: 16 },
      { id: 'plinth-top', xIn: 37, yIn: 14, zIn: 44, widthIn: 26, heightIn: 3, depthIn: 20 },
      { id: 'torso', xIn: 36, yIn: 17, zIn: 45, widthIn: 28, heightIn: 24, depthIn: 18 },
      { id: 'shoulders', xIn: 32, yIn: 38, zIn: 43, widthIn: 36, heightIn: 9, depthIn: 22 },
      { id: 'head', xIn: 42, yIn: 47, zIn: 47, widthIn: 15, heightIn: 24, depthIn: 16 },
      { id: 'hair', xIn: 39, yIn: 53, zIn: 45, widthIn: 21, heightIn: 19, depthIn: 20 },
    ],
  });
  const depths = Object.fromEntries(
    [...scene.matchAll(/^\s+(\S+)\s+depth (\d+)"/gm)].map((m) => [m[1], Number(m[2])]),
  );

  // The room is scaffolding for the projection, not part of the sculpture. With
  // the eye outside it the near face falls behind the lens and the projection
  // drops the shell on its own, so this only has to clean up when it does not.
  if (depths.room) {
    await call('remove', { id: 'room' });
    delete depths.room;
  }

  const flat = (await asJson('validate', { format: 'json' })).open ?? [];
  const before = flat.filter((f) => f.rule === 'L025').length;

  // ── One layer per mass, ordered by distance ─────────────────────────────
  // Depth comes from the projection's own receipt, not from `describe` —
  // `describe` reports geometry for boxes and does not carry `depth` on a
  // projected PATH, so reading it back that way silently produced an empty
  // ordering and moved nothing.
  //
  // The room shell goes furthest back: it encloses the subject rather than
  // competing with it.
  const order = Object.entries(depths)
    .sort((a, b) => b[1] - a[1])
    .sort((a, b) => (a[0] === 'room' ? -1 : b[0] === 'room' ? 1 : 0));

  for (const [i, [id, depth]] of order.entries()) {
    const page = `depth-${String(i + 1).padStart(2, '0')}`;
    await call('add_page', {
      id: page, z: i - order.length, intent: 'overlay',
      title: `${id} — ${depth}in from the camera`,
    });
    await call('move', { id, toPage: page });
  }

  const after = ((await asJson('validate', { format: 'json' })).open ?? [])
    .filter((f) => f.rule === 'L025').length;

  // ── Shading: hatching down the shadow side of each mass ─────────────────
  // Marble has no outline, so the only thing that says "solid" here is tone on
  // one side. The lattice has no closed-path fill, so the tone is strokes.
  await call('add_page', { id: 'shade', z: 1, intent: 'overlay', title: 'Shadow side' });
  // Derived from where each mass ACTUALLY landed. A projected path reports no
  // rectangle through `describe`, but its quadrants are right there in the
  // document, and the extent of the ink is the only honest place to hang a
  // shadow — hand-placed patches floated free of the blocks entirely.
  const extentOf = (id) => {
    for (const els of Object.values(session.doc.elements)) {
      const el = els.find((e) => e.id === id);
      if (!el?.pieces?.length) continue;
      const xs = el.pieces.map((pc) => pc.x);
      const ys = el.pieces.map((pc) => pc.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    return null;
  };

  const ops = [];
  for (const id of Object.keys(depths)) {
    const e = extentOf(id);
    if (!e) continue;
    // Right third only: one light source, from the left, held for every block.
    // A wedge, not a stripe: light from the upper left leaves the shadow
    // deepest at the lower right, and a full-height rectangle says nothing
    // about the shape of the block it sits on.
    const w = e.x1 - e.x0;
    const h = e.y1 - e.y0;
    const poly = [
      { x: Math.round(e.x0 + w * 0.52), y: e.y0 + 2 },
      { x: e.x1 - 1, y: Math.round(e.y0 + h * 0.18) },
      { x: e.x1 - 1, y: e.y1 - 2 },
      { x: Math.round(e.x0 + w * 0.30), y: e.y1 - 2 },
    ];
    for (const [k, program] of hatchFill(poly, { spacing: 5 }).entries()) {
      ops.push({ op: 'pen', page: 'shade', id: `shade-${id}-${k}`, program, role: 'artwork', color: '#8a837a', width: 1, cap: 'butt' });
    }
  }
  await call('plan', { operations: ops, commit: true });

  await call('pen', {
    page: 'shade', id: 'title',
    program: `text "LA GIOCONDA — MARBLE, PROJECTED" at ${col(6)}6 span 100x3 font 15 weight 700`,
  });
  await call('pen', {
    page: 'shade', id: 'note',
    program: `text "${before} depth conflicts flat; ${after} after layering" at ${col(6)}10 span 96x2 font 9`,
  });

  return finish(call, asJson, 'mona-05-sculpture', 'Mona Lisa V — Sculpture', {
    L010: 'each mass sits on its own depth layer, so a nearer block covers a further one. That '
      + 'covering IS the occlusion the sheet exists to show.',
    L006: 'the blocks of a carved bust meet along shared edges — plinth to plinth top, shoulders '
      + 'to torso. A stone that met nothing would be a stone standing on its own.',
    L008: 'these are projected edges, not connectors; a silhouette is meant to end where the form '
      + 'ends.',
    L016: 'no projected edge names a target, so none of them can fall short of one.',
    L015: 'a closed face returns to the corner it started from, which is what closing means.',
    L011: 'the plinth runs to the bottom edge, the way a bust is photographed on its base.',
    L013: 'an edge clipping the corner of another block is two faces of one carving meeting.',
    C001: 'a sculpture is photographed with air around it; filling the ground would turn a bust '
      + 'into a relief.',
  });
}
