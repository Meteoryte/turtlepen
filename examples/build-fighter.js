#!/usr/bin/env node
/**
 * Fighting-game sprite sheets, drawn on the lattice.
 *
 * One cell is one game pixel, so a frame is 56x64 cells and a sheet is frames
 * laid out in a row. Every frame of an action sits in the same document, which
 * is the point: the sheet validates as one composition, so no frame can drift
 * off the pixel grid relative to its neighbours.
 *
 *   node examples/build-fighter.js            # all actions
 *   node examples/build-fighter.js punch      # one action
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as core from '../src/core/index.js';
import { paintSprite } from './brainn-mascots/paint.js';
import { draw, PAL } from './fighter/pose.js';
import { ACTIONS } from './fighter/actions.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const PAD = 2;
const GUTTER = 4;

/**
 * The tightest box that holds EVERY frame of EVERY action.
 *
 * Cropping each frame to its own content would size frames differently and the
 * animation would swim, because the crop would move instead of the fighter. One
 * shared box crops the dead space while keeping every frame registered to the
 * same origin — the sprite-sheet equivalent of a stable camera.
 */
export const BOX = (() => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
  for (const poses of Object.values(ACTIONS)) {
    for (const p of poses) {
      draw(p).forEach((row, y) => row.forEach((c, x) => {
        if (c === '.') return;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }));
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
})();

const crop = (g) => g.slice(BOX.y0, BOX.y0 + BOX.h).map((row) => row.slice(BOX.x0, BOX.x0 + BOX.w));

export function buildAction(name, poses) {
  const doc = core.createDocument({
    name: `fighter ${name}`,
    canvas: {
      cols: PAD * 2 + poses.length * BOX.w + (poses.length - 1) * GUTTER,
      rows: PAD * 2 + BOX.h,
    },
  });
  core.OPERATIONS.set_background(doc, { color: '#151320' });

  let strokes = 0;
  poses.forEach((p, i) => {
    const ox = PAD + i * (BOX.w + GUTTER);
    strokes += paintSprite(doc, 'base', crop(draw(p)), ox, PAD, `${name}${i}`, PAL);
  });
  return { doc, strokes };
}

/** One frame alone, for the animation assembler. */
export function buildFrame(name, index, p) {
  const doc = core.createDocument({
    name: `fighter ${name} ${index}`,
    canvas: { cols: BOX.w + PAD * 2, rows: BOX.h + PAD * 2 },
  });
  core.OPERATIONS.set_background(doc, { color: '#151320' });
  const strokes = paintSprite(doc, 'base', crop(draw(p)), PAD, PAD, `f${index}`, PAL);
  return { doc, strokes };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(ACTIONS);
  mkdirSync(resolve(project, 'scratch/fighter'), { recursive: true });

  for (const name of names) {
    const poses = ACTIONS[name];
    if (!poses) throw new Error(`no action "${name}" — have ${Object.keys(ACTIONS).join(', ')}`);
    const started = Date.now();
    const { doc, strokes } = buildAction(name, poses);
    const log = core.validate(doc);

    const stem = resolve(project, `scratch/fighter/${name}`);
    writeFileSync(`${stem}.turtlepen.json`, JSON.stringify(doc));
    await core.exportPng(doc, `${stem}.png`, { scale: 4, showGrid: false });

    console.log(
      `${name.padEnd(6)} ${poses.length} frames · ${String(strokes).padStart(5)} strokes · `
      + `${doc.canvas.cols}x${doc.canvas.rows} · ${Date.now() - started}ms · `
      + (log.open.map((f) => `${f.rule}:${f.severity}`).join(', ') || 'clean'),
    );
  }
}
