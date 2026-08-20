#!/usr/bin/env node
/**
 * Mona Lisa 4 of 5 — abstract.
 *
 * The same sitter taken apart: the head becomes a stack of transparent planes,
 * the gaze becomes two arcs, the smile becomes one long curve escaping the
 * frame, and the landscape becomes bands of tone.
 *
 * This is the sheet that uses `tone` hardest, and tone here is GEOMETRY — a
 * toned mark claims exactly the fraction of its quadrants that the density
 * says, so a 25% plane really is a quarter of the ink. Overlapping planes at
 * different densities therefore read as transparency without any alpha
 * compositing existing anywhere in the engine.
 */
import { driver, q, polygonOf, polylineOf, ellipse, curveOf, hatchFill, finish, col } from './_lib.js';

export default async function build() {
  const { call, asJson } = driver();
  await call('new_diagram', {
    name: 'Mona Lisa — Abstract',
    path: 'diagrams/mona/mona-04-abstract.turtlepen.json',
    cols: 200, rows: 200,
  });
  await call('add_page', { id: 'over', z: 1, intent: 'overlay', title: 'Line over plane' });

  const CX = 200;
  const CY = 190;

  // A "plane" is a hatched region, not a filled polygon: nothing here fills a
  // closed path, so density is spacing. Wide rows read light, tight rows read
  // heavy, and that IS the tone.
  // Collected, not applied one at a time: a hatch is ~90 separate paths, and
  // each `pen` call persists and revalidates a document that is getting longer
  // every time. One `plan` commit is the same work in a single pass.
  const ops = [];
  const plane = (id, poly, spacing, color) => {
    for (const [i, program] of hatchFill(poly, { spacing }).entries()) {
      ops.push({ op: 'pen', id: `${id}-${i}`, program, role: 'artwork', color, width: 1, cap: 'butt' });
    }
  };
  const mark = (id, program, tone, color, opts = {}) =>
    call('pen', { id, program, role: 'artwork', paint: 'cells', tone, color, ...opts });
  const edge = (id, program, opts = {}) =>
    call('pen', { page: 'over', id, program, role: 'artwork', width: 2, cap: 'butt', ...opts });

  // ── Ground: three bands of tone standing in for the landscape ───────────
  const BANDS = [
    [40, 96, 10, '#6b7f8f'],
    [318, 380, 12, '#7a6f5f'],
  ];
  for (const [top, bot, spacing, color] of BANDS) {
    plane(`band-${top}`, [
      { x: 16, y: top }, { x: 384, y: top - 12 }, { x: 384, y: bot }, { x: 16, y: bot + 10 },
    ], spacing, color);
  }

  // ── The head, as four planes rotated off each other ─────────────────────
  // Cubism's actual claim: a form seen from several angles at once. Four
  // ellipses of the same face at four rotations, each at a different density,
  // so where they cross the ink accumulates the way overlapping glass does.
  // Spread wide enough to actually read as four viewpoints. At nine quadrants
  // apart and sixteen degrees they sat almost concentric, which looks like one
  // slightly blurred head rather than a form seen from several sides at once.
  for (const [i, rot] of [-34, -12, 12, 34].entries()) {
    const poly = ellipse(CX + (i - 1.5) * 30, CY - 20 + (i - 1.5) * 12, 60, 82, 30, rot);
    plane(`head-${i}`, poly, [16, 9, 9, 16][i], ['#2f3b47', '#4a3f34', '#6b4f3f', '#2f3b47'][i]);
    await edge(`head-edge-${i}`, polygonOf(poly), { color: '#1b1b1b', width: 1 });
  }

  // ── Gaze: two arcs where the eyes were ──────────────────────────────────
  for (const [i, dx] of [-30, 30].entries()) {
    await edge(`gaze-${i}`, `pen ${q(CX + dx, CY - 44)}\narc 26 ${i ? 200 : 300} ${i ? 340 : 80}`,
      { color: '#c2410c', width: 3 });
    await mark(`iris-${i}`, `pen ${q(CX + dx, CY - 44)}\ndisc 9`, 0.75, '#1b1b1b');
  }

  // ── The smile, as one long curve that leaves the frame ──────────────────
  await edge('smile', polylineOf(curveOf([
    { x: 40, y: CY + 150 },
    { x: 150, y: CY + 40 },
    { x: CX, y: CY + 28 },
    { x: 250, y: CY + 40 },
    { x: 368, y: CY + 150 },
  ])), { color: '#c2410c', width: 4, cap: 'round' });

  // ── Shoulders: two hard triangles, the only straight edges on the sheet ─
  plane('shoulder-l', [{ x: 96, y: 300 }, { x: 200, y: 268 }, { x: 120, y: 396 }], 6, '#3b3027');
  plane('shoulder-r', [{ x: 304, y: 300 }, { x: 200, y: 268 }, { x: 280, y: 396 }], 6, '#3b3027');

  await call('plan', { operations: ops, commit: true });

  // ── A few rays: the sitter's own vanishing lines, made explicit ─────────
  for (const [i, a] of [22, 46, 70, 112, 136, 158].entries()) {
    const r = 190;
    const x2 = Math.round(CX + r * Math.cos((a * Math.PI) / 180));
    const y2 = Math.round(CY - 20 + r * Math.sin((a * Math.PI) / 180));
    await edge(`ray-${i}`, `pen ${q(CX, CY - 20)}\nray to ${q(Math.max(8, Math.min(392, x2)), Math.max(8, Math.min(392, y2)))}`,
      { color: '#1b1b1b', width: 1 });
  }

  await call('pen', {
    page: 'over', id: 'title',
    program: `text "LA GIOCONDA, DISASSEMBLED" at ${col(8)}8 span 96x3 font 16 weight 700`,
  });

  return finish(call, asJson, 'mona-04-abstract', 'Mona Lisa IV — Abstract', {
    L006: 'transparency here IS overlap: a toned plane claims a fraction of its quadrants, so two '
      + 'planes crossing accumulate ink exactly where the picture wants them to.',
    L015: 'a closed plane ends on the quadrant it began from, which is what closing a shape means.',
    L008: 'nothing on this sheet is a connector; the rays are the sitter\'s own vanishing lines '
      + 'and are meant to run off into open ground.',
    L016: 'no mark here names a target, so none of them can fall short of one.',
    L011: 'the bands and the smile run past the canvas edge deliberately — the crop is the point, '
      + 'and a frame that contained everything would make it a diagram again.',
    C001: 'the empty ground between the planes is the subject as much as the planes are; an '
      + 'abstract that fills its sheet has nothing left to be abstract about.',
    L013: 'a ray clipping the corner of a plane crosses a quadrant that plane claims but does not '
      + 'ink at that density.',
  });
}
