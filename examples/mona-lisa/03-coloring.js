#!/usr/bin/env node
/**
 * Mona Lisa 3 of 5 — a colouring-book page.
 *
 * Pure outline, nothing filled, every line the same weight. A colouring page
 * is the strictest test of the figure: with no tone to carry the form, the
 * contour has to do all of it. If she does not read here, she does not read.
 *
 * Drawn at a large radius on purpose — the curves are polylines through
 * sampled control points, so smoothness is bought with quadrants.
 */
import { driver, q, polygonOf, polylineOf, clipOutside, finish, col } from './_lib.js';
import { figure } from './_figure.js';

export default async function build() {
  const { call, asJson } = driver();
  await call('new_diagram', {
    name: 'Mona Lisa — Colouring Page',
    path: 'diagrams/mona/mona-03-coloring.turtlepen.json',
    cols: 210, rows: 260,
  });

  const F = figure({ cx: 208, top: 56, bottom: 496, turn: 0.34 });
  const INK = { role: 'artwork', color: '#1b1b1b', width: 3, cap: 'round' };

  const stroke = (id, program, opts = {}) => call('pen', { id, program, ...INK, ...opts });
  const line = (id, pts, opts) => stroke(id, polylineOf(pts), opts);

  // ── Landscape, clipped to what she does not cover ───────────────────────
  // There are no fills here, so "behind" cannot be achieved by drawing first
  // and hoping. The first version ran the horizon straight across her face.
  // Every distant line is cut against her silhouette and the pieces drawn
  // separately, which is what makes her stand in front of the view.
  const horizon = [];
  for (let x = 20; x <= 396; x += 2) horizon.push({ x, y: F.horizonY + 10 });
  const far = [['horizon', horizon], ['ridge-left', F.ridgeL], ['ridge-right', F.ridgeR], ['river', F.river]];
  for (const [id, pts] of far) {
    for (const [i, run] of clipOutside(pts, F.inside).entries()) {
      await line(`${id}-${i}`, run, { width: 2 });
    }
  }

  // ── The figure ──────────────────────────────────────────────────────────
  await stroke('head', polygonOf(F.head));
  await line('hair-left', F.hairL);
  await line('hair-right', F.hairR);
  await line('veil', F.veil, { width: 2 });

  // Lids, not rings. The upper lid is the heavy line and does the work; two
  // concentric ovals with a circle inside read as goggles, which is what the
  // first version drew.
  for (const [side, e] of [['l', F.eyeL], ['r', F.eyeR]]) {
    await line(`lid-upper-${side}`, e.upper, { width: 3 });
    await line(`lid-lower-${side}`, e.lower, { width: 2 });
    await stroke(`iris-${side}`, `pen ${q(e.iris.x, e.iris.y)}` + String.fromCharCode(10) + `circle ${e.iris.r}`, { width: 2 });
  }
  await line('brow-left', F.browL, { width: 2 });
  await line('brow-right', F.browR, { width: 2 });
  await line('nose', F.nose, { width: 2 });
  await line('mouth-upper', F.mouthUpper, { width: 3 });
  await line('mouth-lower', F.mouthLower, { width: 2 });

  await line('neck-left', F.neck, { width: 2 });
  await line('neck-right', F.neckR, { width: 2 });
  await line('shoulders', F.shoulders);
  await line('neckline', F.neckline, { width: 2 });

  // Hands, chair, drapery — the things that were missing entirely.
  // Clipped to the gown: an arm, a sleeve seam and a chair rail that run past
  // her silhouette are three marks hanging in open air.
  await line('chair-arm', F.withinBody(F.chairArm), { width: 3 });
  await line('forearm', F.withinBody(F.forearm));
  await line('sleeve', F.withinBody(F.sleeve), { width: 2 });
  await line('hand-far', F.handFar, { width: 2 });
  await line('hand-near', F.handNear, { width: 3 });
  for (const [i, f] of F.fingers.entries()) await line(`finger-${i}`, f, { width: 2 });
  for (const [i, f] of F.folds.entries()) await line(`fold-${i}`, f, { width: 2 });

  // ── Frame and caption, on an overlay so they never fight the drawing ────
  await call('add_page', { id: 'sheet', z: 1, intent: 'overlay', title: 'Page furniture' });
  await call('pen', {
    page: 'sheet', id: 'frame', role: 'artwork', color: '#1b1b1b', width: 2,
    program: polygonOf([
      { x: 12, y: 12 }, { x: 404, y: 12 }, { x: 404, y: 500 }, { x: 12, y: 500 },
    ]),
  });
  await call('pen', {
    page: 'sheet', id: 'title',
    program: `text "COLOUR ME" at ${col(10)}9 span 46x3 font 20 weight 700`,
  });

  return finish(call, asJson, 'mona-03-coloring', 'Mona Lisa III — Colouring Page', {
    L006: 'the contours of a face meet: jaw touches hair, hair touches veil, a finger touches '
      + 'the hand it belongs to. Sharing those quadrants is what makes it one figure rather than '
      + 'a pile of separate curves.',
    L008: 'every line here is a contour, not a connector — an outline is meant to end at the '
      + 'edge of the form it describes and nowhere else.',
    L015: 'a closed contour returns to where it started, so the last quadrant is the first one; '
      + 'that is what closing a shape means.',
    L011: 'the frame is drawn to the edge of the sheet deliberately, the way a colouring book '
      + 'page is printed to its own border.',
    C001: 'a colouring page is mostly empty by design — the white is where the reader works, '
      + 'and filling it would leave them nothing to do.',
    L004: 'the figure stands in front of the landscape, so her contour crosses the ridge line '
      + 'behind her. That crossing is the depth of the picture.',
    L013: 'a contour clipping the corner of another form is two edges of one body meeting.',
    L016: 'these curves name no target: a contour is not a connector and has nothing to arrive at.',
  });
}
