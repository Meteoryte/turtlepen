#!/usr/bin/env node
/**
 * Build a brainn.dev mascot from any frozen version.
 *
 * Versions are kept rather than overwritten so a later design can be compared
 * against an earlier one, and so `test/brainn-mascots.test.js` has a real
 * corpus to hold: every pose of every version must still validate clean and
 * still paint, which makes the mascots a standing exercise of pen artwork,
 * paint="cells", and run merging.
 *
 *   node examples/build-brainn-mascots.js                 # newest, every pose
 *   node examples/build-brainn-mascots.js v3 scholar      # one version, one pose
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as core from '../src/core/index.js';
import { paintSprite } from './brainn-mascots/paint.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

export const VERSIONS = ['v2', 'v3'];
export const NEWEST = VERSIONS[VERSIONS.length - 1];

export async function loadVersion(v) {
  const mod = await import(`./brainn-mascots/${v}.js`);
  return { W: mod.W, H: mod.H, PAL: mod.PAL, POSES: mod.POSES };
}

/** Sprite margin, in cells, between the artwork and the canvas edge. */
export const PAD = 2;

/**
 * An empty document sized to hold the sprite.
 *
 * Separate from `buildPose` because it is the part that broke: `createDocument`
 * canonically takes `canvas: { cols, rows }`. Older callers may use the now
 * supported top-level aliases, but mixing the two forms is rejected. Before
 * that compatibility check existed, a top-level `cols`/`rows` was silently
 * ignored, leaving the 160x100 default. That fit a small sprite by luck and
 * clipped a large one — v3 reported 704 L011s before this was found.
 */
export async function documentFor(v) {
  const { W, H, PAL } = await loadVersion(v);
  const doc = core.createDocument({ name: `brainn ${v}`, canvas: { cols: W + 2 * PAD, rows: H + 2 * PAD } });
  core.OPERATIONS.set_background(doc, { color: PAL.K });
  return doc;
}

/**
 * One document holding one pose, ready to validate or render.
 *
 * The painter merges horizontal runs. Each disconnected band remains its own
 * honest path, while `applyPen` uses an append checkpoint so thousands of
 * atomic strokes do not clone the growing document thousands of times.
 */
export async function buildPose(v, pose) {
  const { W, H, PAL, POSES } = await loadVersion(v);
  if (!POSES[pose]) throw new Error(`${v} has no pose "${pose}" — have ${Object.keys(POSES).join(', ')}`);
  const doc = await documentFor(v);
  doc.name = `brainn ${v} ${pose}`;
  const strokes = paintSprite(doc, 'base', POSES[pose](), PAD, PAD, pose, PAL);
  return { doc, strokes, W, H };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const version = VERSIONS.includes(args[0]) ? args.shift() : NEWEST;
  const { POSES } = await loadVersion(version);
  const poses = args.length ? args : Object.keys(POSES);

  mkdirSync(resolve(project, `scratch/brainn/${version}`), { recursive: true });
  for (const pose of poses) {
    const { doc, strokes, W, H } = await buildPose(version, pose);
    const base = resolve(project, `scratch/brainn/${version}/${pose}`);
    writeFileSync(`${base}.turtlepen.json`, JSON.stringify(doc));
    const log = core.validate(doc);
    if (log.open.length) {
      throw new Error(`${version}/${pose} has ${log.open.length} open finding(s); refusing to render`);
    }
    await core.exportPng(doc, `${base}.png`, { scale: 2, showGrid: false });
    console.log(`${version}/${pose}  ${W}x${H}  ${strokes} strokes  ${log.open.map((f) => `${f.rule}:${f.severity}`).join(', ') || 'clean'}`);
  }
}
