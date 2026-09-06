#!/usr/bin/env node
/**
 * Animate the fighter.
 *
 * Every frame is a real TurtlePen document, validated on the lattice and
 * rasterised by TurtlePen's own rasteriser; the GIF is only the container. That
 * ordering matters — the animation is not a separate drawing that happens to
 * resemble the sprite sheet, it is the same documents played in sequence.
 *
 * bounds:"canvas" is mandatory here. Content-cropped frames each get their own
 * dimensions, and an animation of differently-cropped frames swims: the sprite
 * appears to slide because the crop, not the fighter, is moving.
 *
 *   node examples/build-fighter-gifs.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as core from '../src/core/index.js';
import { buildFrame } from './build-fighter.js';
import { ACTIONS, TIMING } from './fighter/actions.js';
import { encodeGif } from './fighter/gif.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const SCALE = 4;

const out = resolve(project, 'scratch/fighter');
mkdirSync(out, { recursive: true });

for (const [name, poses] of Object.entries(ACTIONS)) {
  const timing = TIMING[name] ?? poses.map(() => 100);
  const frames = [];
  let size = null;
  let findings = 0;

  for (const [i, p] of poses.entries()) {
    const { doc } = buildFrame(name, i, p);
    findings += core.validate(doc).open.length;
    const raster = core.rasterizeDocument(doc, { scale: SCALE, showGrid: false, bounds: 'canvas' });
    if (!size) size = { width: raster.width, height: raster.height };
    if (raster.width !== size.width || raster.height !== size.height) {
      throw new Error(`${name} frame ${i}: ${raster.width}x${raster.height} != ${size.width}x${size.height}`);
    }
    frames.push({ pixels: raster.pixels, delayMs: timing[i] ?? 100 });
  }

  const gif = encodeGif({ ...size, frames });
  writeFileSync(resolve(out, `${name}.gif`), gif);
  const total = timing.reduce((a, b) => a + b, 0);
  console.log(
    `${name.padEnd(6)} ${poses.length} frames · ${size.width}x${size.height} · `
    + `${total}ms loop · ${(gif.length / 1024).toFixed(1)}KB · `
    + (findings === 0 ? 'clean' : `${findings} findings`),
  );
}
