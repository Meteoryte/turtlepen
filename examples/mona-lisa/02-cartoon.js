#!/usr/bin/env node
/**
 * Mona Lisa 2 of 5 — the cartoon.
 *
 * Same construction as the colouring page, drawn with a completely different
 * hand: heavy contour, exaggerated features, and mass built from HATCHING.
 *
 * The lattice has no closed-path fill. `polygon` claims the quadrants of its
 * outline and nothing inside, so `paint: "cells"` has no interior to flood —
 * the first version of this sheet asked for filled hair and got an outline
 * with two stray diagonals where the concatenated contour crossed itself.
 * Hatching is not a workaround for that so much as the correct idiom: an ink
 * cartoon builds tone from strokes, and strokes are what this engine is.
 */
import { driver, q, polygonOf, polylineOf, clipOutside, curveOf, ellipse, finish, col } from './_lib.js';
import { figure } from './_figure.js';

export default async function build() {
  const { call, asJson } = driver();
  await call('new_diagram', {
    name: 'Mona Lisa — Cartoon',
    path: 'diagrams/mona/mona-02-cartoon.turtlepen.json',
    cols: 210, rows: 250,
  });
  await call('add_page', { id: 'ink', z: 1, intent: 'overlay', title: 'Line over hatching' });

  const F = figure({ cx: 208, top: 60, bottom: 470, turn: 0.34 });
  const LINE = { role: 'artwork', color: '#1b1b1b', width: 4, cap: 'round' };

  const hatch = (id, program, opts = {}) =>
    call('pen', { id, program, role: 'artwork', color: '#2f2a26', width: 2, cap: 'butt', ...opts });
  const ink = (id, program, opts = {}) => call('pen', { page: 'ink', id, program, ...LINE, ...opts });
  const line = (id, pts, opts) => ink(id, polylineOf(pts), opts);

  // ── Distant landscape, clipped so she stands in front of it ─────────────
  const horizon = [];
  for (let x = 22; x <= 394; x += 2) horizon.push({ x, y: F.horizonY + 10 });
  for (const [id, pts] of [['horizon', horizon], ['ridge-l', F.ridgeL], ['ridge-r', F.ridgeR]]) {
    for (const [i, run] of clipOutside(pts, F.inside).entries()) {
      await ink(`${id}-${i}`, polylineOf(run), { width: 2, color: '#9a9388' });
    }
  }

  // ── Hair: a fan of strokes from the parting down past the jaw ───────────
  // Mass out of line. Each stroke follows the fall of the hair, so the density
  // reads as volume rather than as texture laid over a shape.
  const STRANDS = 11;   // spaced so no two strands share a quadrant: merged hatching is muddy hatching
  for (let i = 0; i <= STRANDS; i += 1) {
    const t = i / STRANDS;                      // 0 at the parting, 1 at the outside
    for (const side of [-1, 1]) {
      const pts = curveOf([
        // Spread along the hairline rather than converging on one parting
        // point. Strands that all start from the same quadrant overlap each
        // other for their whole first third, which is hundreds of real
        // findings and — more to the point — muddy ink.
        { x: F.headCx + side * Math.round(6 + t * 46), y: F.headCy - F.headRy + Math.round(t * t * 40) },
        { x: F.headCx + side * Math.round(20 + t * 32), y: F.headCy - Math.round(58 - t * 16) },
        { x: F.headCx + side * Math.round(46 + t * 26), y: F.headCy - Math.round(6 - t * 8) },
        { x: F.headCx + side * Math.round(52 + t * 26), y: F.headCy + Math.round(70 + t * 10) },
        { x: F.headCx + side * Math.round(46 + t * 22), y: F.headCy + Math.round(126 + t * 8) },
      ]);
      await hatch(`hair-${side < 0 ? 'l' : 'r'}-${i}`, polylineOf(pts));
    }
  }

  // ── Dress: horizontal hatching that follows the shoulder line ───────────
  // Each row is cut to the BODY at that height, read off the shoulder contour
  // itself. A linear ramp was close but not the same curve, so every row near
  // the shoulders overshot the edge and the gown grew spines.
  const halfWidthAt = (y) => {
    let best = 0;
    for (const p of F.shoulders) {
      if (Math.abs(p.y - y) <= 6) best = Math.max(best, Math.abs(p.x - F.headCx));
    }
    return best;
  };

  const dressTop = F.shoulderY + 30;
  for (let y = dressTop; y < 468; y += 7) {
    const half = halfWidthAt(y) - 6;
    if (half < 12) continue;
    await hatch(`dress-${y}`, polylineOf(curveOf([
      { x: F.headCx - half, y: y + 3 },
      { x: F.headCx, y },
      { x: F.headCx + half, y: y + 3 },
    ])), { color: '#4a3f34' });
  }

  // ── Features, exaggerated ───────────────────────────────────────────────
  await ink('head', polygonOf(F.head), { width: 5 });
  await line('hairline', F.veil, { width: 3 });

  const bigEye = (cx2) => ellipse(cx2, F.eyeY, 22, 14, 22);
  await ink('eye-l', polygonOf(bigEye(F.headCx - 28)), { width: 3 });
  await ink('eye-r', polygonOf(bigEye(F.headCx + 28)), { width: 3 });
  // `disc` genuinely fills — it is a computed set of quadrants, not an outline.
  await call('pen', { page: 'ink', id: 'pupil-l', role: 'artwork', color: '#1b1b1b', paint: 'cells', program: `pen ${q(F.headCx - 28, F.eyeY + 2)}\ndisc 7` });
  await call('pen', { page: 'ink', id: 'pupil-r', role: 'artwork', color: '#1b1b1b', paint: 'cells', program: `pen ${q(F.headCx + 28, F.eyeY + 2)}\ndisc 7` });

  await line('brow-l', curveOf([
    { x: F.headCx - 46, y: F.eyeY - 28 },
    { x: F.headCx - 26, y: F.eyeY - 37 },
    { x: F.headCx - 8, y: F.eyeY - 28 },
  ]), { width: 5 });
  await line('brow-r', curveOf([
    { x: F.headCx + 8, y: F.eyeY - 28 },
    { x: F.headCx + 26, y: F.eyeY - 37 },
    { x: F.headCx + 46, y: F.eyeY - 28 },
  ]), { width: 5 });
  await line('nose', F.nose, { width: 3 });

  // A cartoon needs the smile legible from across a room, so the famous
  // ambiguity is spent here on purpose.
  await line('smile', curveOf([
    { x: F.headCx - 42, y: F.mouthY - 10 },
    { x: F.headCx - 18, y: F.mouthY + 16 },
    { x: F.headCx, y: F.mouthY + 19 },
    { x: F.headCx + 18, y: F.mouthY + 16 },
    { x: F.headCx + 42, y: F.mouthY - 10 },
  ]), { width: 5, cap: 'round' });

  // ── Hands ───────────────────────────────────────────────────────────────
  // The first cartoon had none, which loses the second most recognisable thing
  // in the painting after the smile.
  await line('chair-arm', F.withinBody(F.chairArm), { width: 4 });
  await line('hand-far', F.withinBody(F.handFar), { width: 3 });
  await line('hand-near', F.withinBody(F.handNear), { width: 4 });
  for (const [i, f] of F.fingers.entries()) await line(`finger-${i}`, F.withinBody(f), { width: 3 });

  // ── Cheek and jaw modelling ─────────────────────────────────────────────
  // A blank white face beside heavily hatched hair reads as a hole. A few
  // strokes on the shadow side put the head back in the same drawing.
  for (let i = 0; i < 7; i += 1) {
    await hatch(`cheek-${i}`, polylineOf(curveOf([
      { x: F.headCx + 26 + i * 4, y: F.headCy - 6 + i * 3 },
      { x: F.headCx + 34 + i * 4, y: F.headCy + 28 + i * 2 },
      { x: F.headCx + 26 + i * 3, y: F.headCy + 58 - i * 4 },
    ])), { color: '#6b6259', width: 1 });
  }

  await line('neck-l', F.neck, { width: 3 });
  await line('neck-r', F.neckR, { width: 3 });
  await line('shoulders', F.shoulders, { width: 5 });
  await line('neckline', F.neckline, { width: 4 });
  await line('forearm', F.forearm, { width: 4 });

  await call('pen', {
    page: 'ink', id: 'title',
    program: `text "LA GIOCONDA" at ${col(10)}9 span 60x3 font 22 weight 800`,
  });

  return finish(call, asJson, 'mona-02-cartoon', 'Mona Lisa II — Cartoon', {
    // Ten, not forty-three: the strands were respaced until only the few that
    // genuinely converge at the crown still touch. Merged hatching is muddy
    // hatching, so the log was pointing at a drawing problem, not a paperwork one.
    L006: 'these strands converge at the crown, where hair actually does gather — the merge is '
      + 'the parting reading as a parting.',
    L008: 'these are contours and hatch strokes, not connectors; none of them travels to anything.',
    L015: 'a closed contour ends on the quadrant it began from, which is what closing means.',
    L016: 'no stroke here names a target, so none of them can fall short of one.',
    L004: 'the ink layer is drawn over the hatching deliberately — that is what an ink line does '
      + 'to the tone beneath it.',
    L011: 'the dress runs off the bottom edge, the way a portrait is cropped at the chest.',
    L013: 'one contour clipping the corner of another is two edges of the same body meeting.',
    C001: 'a caricature needs air around the head; crowding it would lose the silhouette that '
      + 'makes it readable at a glance.',
    L021: 'the caption sits in open sky at the top left, clear of everything beneath it.',
  });
}
