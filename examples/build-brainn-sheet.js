#!/usr/bin/env node
/**
 * Every pose of one mascot version on a single canvas.
 *
 * This was not worth building until `applyPen` stopped cloning the document per
 * stroke: a five-pose sheet is roughly 14,000 strokes, which cost about forty
 * minutes under the old quadratic path. Append-only pen commits and bounded
 * collision prefilters make the same honest paths practical to build and
 * validate routinely.
 *
 * The sheet is a real TurtlePen document, not five PNGs pasted together, so it
 * validates as one composition and the poses are guaranteed to sit on the same
 * lattice — no pose can drift half a cell from its neighbour, because half a
 * cell is not a position the engine can express.
 *
 *   node examples/build-brainn-sheet.js            # newest version
 *   node examples/build-brainn-sheet.js v2
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as core from '../src/core/index.js';
import { paintSprite } from './brainn-mascots/paint.js';
import { VERSIONS, NEWEST, PAD, loadVersion } from './build-brainn-mascots.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const COLS = 3;
const GUTTER = 8;

export async function buildSheet(v) {
  const { W, H, PAL, POSES } = await loadVersion(v);
  const names = Object.keys(POSES);
  const rows = Math.ceil(names.length / COLS);

  const doc = core.createDocument({
    name: `brainn mascots ${v}`,
    canvas: {
      cols: PAD * 2 + COLS * W + (COLS - 1) * GUTTER,
      rows: PAD * 2 + rows * H + (rows - 1) * GUTTER,
    },
  });
  core.OPERATIONS.set_background(doc, { color: PAL.K });

  let strokes = 0;
  names.forEach((pose, i) => {
    const ox = PAD + (i % COLS) * (W + GUTTER);
    const oy = PAD + Math.floor(i / COLS) * (H + GUTTER);
    strokes += paintSprite(doc, 'base', POSES[pose](), ox, oy, pose, PAL);
  });
  return { doc, strokes, poses: names };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const v = VERSIONS.includes(process.argv[2]) ? process.argv[2] : NEWEST;
  const started = Date.now();
  const { doc, strokes, poses } = await buildSheet(v);
  const log = core.validate(doc);
  if (log.open.length) {
    throw new Error(`${v} sheet has ${log.open.length} open finding(s); refusing to publish`);
  }

  mkdirSync(resolve(project, `scratch/brainn/${v}`), { recursive: true });
  const stem = resolve(project, `scratch/brainn/${v}/sheet`);
  writeFileSync(`${stem}.turtlepen.json`, JSON.stringify(doc));
  await core.exportPng(doc, `${stem}.png`, { scale: 1, showGrid: false });

  console.log(
    `${v} sheet · ${poses.length} poses · ${strokes} strokes · `
    + `${doc.canvas.cols}x${doc.canvas.rows} cells · ${Date.now() - started} ms`,
  );
  console.log('findings: clean');
}
