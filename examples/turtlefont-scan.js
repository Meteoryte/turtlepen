#!/usr/bin/env node
/**
 * TurtleFont legibility scan — every glyph, against the character it claims.
 *
 * The specimen sheet proves the face works as text. This proves each glyph is
 * the RIGHT glyph, which is a different question and a much more tedious one.
 *
 * Every cell holds the TurtleFont drawing at scale 2 with the real character
 * underneath it as ordinary SVG text, set in whatever font the viewer has. So
 * a wrong drawing is not something to be remembered and spotted — it is a
 * mismatch sitting directly under its own answer key. That is how `e` was
 * caught drawing a theta and `з` an `s`.
 *
 * Sorted by code point, so any defect can be named by its number rather than
 * by "the third one on the fourth row".
 *
 *   node examples/turtlefont-scan.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import * as font from '../src/core/turtlefont.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const SCALE = 2;
const COLS = 16;
const CELL_W = 18;   // quadrants
const CELL_H = 32;   // quadrants: glyph block, caption, breathing room
const LEFT = 3;
const TOP = 3;

/** The pen's text command is quoted, so these two need a written name. */
const CAPTION = { '"': 'dq', '\\': 'bs' };

const doc = core.createDocument({
  name: 'turtlefont scan', cols: COLS * CELL_W, rows: 40, createdAt: '2026-08-24T12:00:00.000Z',
});
core.OPERATIONS.set_background(doc, { color: '#fbf9f4' });

const glyphs = font.coverage().filter((ch) => ch !== ' ');
let n = 0;

for (const [i, ch] of glyphs.entries()) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = LEFT + col * CELL_W;
  const y = TOP + row * CELL_H;

  // The drawing.
  core.OPERATIONS.stroke_text(doc, {
    id: `g${n++}`,
    at: core.address.quadToAddress(x, y),
    text: ch,
    scale: SCALE,
    color: '#12202c',
  });

  // The answer key, in the viewer's own font, directly underneath.
  const caption = CAPTION[ch] ?? ch;
  const code = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  core.OPERATIONS.pen(doc, {
    id: `c${n++}`,
    program: `text "${caption}   ${code}" at ${core.address.quadToAddress(x, y + font.LINE_HEIGHT * SCALE + 2)} span 8x2 align left font 8`,
    role: 'artwork',
  });
}

const rows = Math.ceil(glyphs.length / COLS);
core.OPERATIONS.set_canvas(doc, {
  cols: COLS * CELL_W, rows: Math.ceil((TOP + rows * CELL_H) / 2) + 2,
});

const findings = core.validate(doc);
await core.exportSvg(doc, resolve(project, 'diagrams/turtlefont-scan.svg'), { force: true, margin: 12 });

const bar = '═'.repeat(70);
console.log(bar);
console.log(`  ${glyphs.length} glyphs at scale ${SCALE}, ${COLS} per row, ${rows} rows`);
console.log(`  ${core.formatLog(findings).split('\n')[0]}`);
console.log(bar);
console.log('  diagrams/turtlefont-scan.svg — each drawing sits above the character it claims');
console.log(bar);
