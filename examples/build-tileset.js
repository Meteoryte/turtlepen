#!/usr/bin/env node
/**
 * A 16x16 game tileset, drawn on the lattice.
 *
 * The mapping that makes this work: ONE CELL IS ONE GAME PIXEL. A tile is
 * therefore 16x16 cells, and the sheet is exact by construction — no tile can
 * drift half a pixel from its neighbour, because half a pixel is not a
 * position the engine can express.
 *
 * Two details were found by trying it rather than by reading:
 *
 *   1. `place_box` cannot draw pixels. Two adjacent boxes report L007 (no
 *      separating gutter) — correct for boxes in a diagram, fatal for a
 *      tileset, where every pixel touches its neighbour on purpose.
 *
 *   2. A pen stroke inks ONE QUADRANT across its thickness, so a single
 *      horizontal run fills 5px of a 10px cell and leaves a gap. Each run is
 *      therefore drawn twice, `align top` and `align bottom`, which fills the
 *      cell exactly and reports nothing.
 *
 * Runs are merged along each row before drawing, so a 16px row of one colour
 * is two strokes rather than thirty-two.
 *
 *   node examples/build-tileset.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import * as core from '../src/core/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const PAL = {
  g: '#5ab552', G: '#3d8b3d',            // grass
  d: '#9c6644', D: '#6b4423',            // dirt
  s: '#8d99ae', S: '#5c6672', h: '#b8c1cf', // stone
  w: '#3a7ca5', W: '#5fa8d3',            // water
  b: '#a9743f', B: '#7a5230',            // wood
  l: '#4f9d3a', L: '#2f6b23',            // leaf
  t: '#6b4423',                          // trunk
  r: '#9aa0a6', R: '#666b70',            // rock
  y: '#f2c14e', Y: '#c9982f',            // gold
  k: '#241a10',                          // outline
  n: '#e8e8e8',                          // highlight
};

/** 16 rows of 16. '.' leaves the cell untouched. */
const TILES = [
  ['grass top', [
    'gggggggggggggggg', 'gGggGgggGggGgggG', 'gGgGGgGggGgGGggG', 'dDdddDdddddDdddd',
    'dddddddddddddddd', 'ddDdddddDddddddD', 'dddddddddddddddd', 'dddDdddddddDdddd',
    'dddddddddddddddd', 'dDddddDddddddddd', 'dddddddddddddddd', 'ddddddDdddddDddd',
    'dddddddddddddddd', 'dDdddddddDdddddd', 'dddddddddddddddd', 'DDDDDDDDDDDDDDDD',
  ]],
  ['dirt', [
    'DDDDDDDDDDDDDDDD', 'dddddddddddddddd', 'ddDddddddddDdddd', 'dddddddddddddddd',
    'dddddDddddddddDd', 'dddddddddddddddd', 'dDdddddddDdddddd', 'dddddddddddddddd',
    'ddddddDddddddddd', 'dddddddddddddddd', 'dddDdddddddDdddd', 'dddddddddddddddd',
    'dddddddDddddddDd', 'dddddddddddddddd', 'dDddddddddddDddd', 'DDDDDDDDDDDDDDDD',
  ]],
  ['stone brick', [
    'SSSSSSSSSSSSSSSS', 'shhhhhhSshhhhhhS', 'ssssssSSssssssSS', 'ssssssSSssssssSS',
    'ssssssSSssssssSS', 'SSSSSSSSSSSSSSSS', 'hhhSshhhhhhSshhh', 'sssSSssssssSSsss',
    'sssSSssssssSSsss', 'sssSSssssssSSsss', 'SSSSSSSSSSSSSSSS', 'shhhhhhSshhhhhhS',
    'ssssssSSssssssSS', 'ssssssSSssssssSS', 'ssssssSSssssssSS', 'SSSSSSSSSSSSSSSS',
  ]],
  ['water', [
    'WWwwWWWwwWWWwwWW', 'wwWWwwwWWwwwWWww', 'wwwwwwwwwwwwwwww', 'wwwwWwwwwwwWwwww',
    'wwwwwwwwwwwwwwww', 'wwWwwwwwWwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwWwwwwwwWw',
    'wwwwwwwwwwwwwwww', 'wWwwwwwwwwWwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwWwwwwwwwWww',
    'wwwwwwwwwwwwwwww', 'wwwWwwwwwWwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww',
  ]],
  ['wood platform', [
    'kkkkkkkkkkkkkkkk', 'bbbbbbbbbbbbbbbb', 'bBbbbbbBbbbbbbBb', 'bbbbbbbbbbbbbbbb',
    'kkkkkkkkkkkkkkkk', 'bbbbbbbbbbbbbbbb', 'bbbBbbbbbbbBbbbb', 'bbbbbbbbbbbbbbbb',
    'kkkkkkkkkkkkkkkk', '................', '................', '................',
    '................', '................', '................', '................',
  ]],
  ['ladder', [
    '...BB......BB...', '...BB......BB...', '...BBBBBBBBBB...', '...BB......BB...',
    '...BB......BB...', '...BBBBBBBBBB...', '...BB......BB...', '...BB......BB...',
    '...BBBBBBBBBB...', '...BB......BB...', '...BB......BB...', '...BBBBBBBBBB...',
    '...BB......BB...', '...BB......BB...', '...BBBBBBBBBB...', '...BB......BB...',
  ]],
  ['crate', [
    'kkkkkkkkkkkkkkkk', 'kbbbbbbbbbbbbbbk', 'kbBbbbbbbbbbbBbk', 'kbbBbbbbbbbbBbbk',
    'kbbbBbbbbbbBbbbk', 'kbbbbBbbbbBbbbbk', 'kbbbbbBbbBbbbbbk', 'kbbbbbbBBbbbbbbk',
    'kbbbbbbBBbbbbbbk', 'kbbbbbBbbBbbbbbk', 'kbbbbBbbbbBbbbbk', 'kbbbBbbbbbbBbbbk',
    'kbbBbbbbbbbbBbbk', 'kbBbbbbbbbbbbBbk', 'kbbbbbbbbbbbbbbk', 'kkkkkkkkkkkkkkkk',
  ]],
  ['coin', [
    '................', '................', '.....yyyyyy.....', '...yyyyyyyyyy...',
    '..yyyyYYYYyyyy..', '..yyyYYnnYYyyyy.', '.yyyyYYnnYYyyyy.', '.yyyyYYnnYYyyyy.',
    '.yyyyYYnnYYyyyy.', '.yyyyYYnnYYyyyy.', '..yyyYYnnYYyyyy.', '..yyyyYYYYyyyy..',
    '...yyyyyyyyyy...', '.....yyyyyy.....', '................', '................',
  ]],
  ['bush', [
    '................', '................', '.....llll.......', '...llllllll.....',
    '..llllllllll....', '.llllLLllllll...', '.lllLLllllllll..', 'llllllllllLLlll.',
    'lllllllllllllll.', 'llLLlllllllllll.', '.lllllllllLLll..', '.llllllllllll...',
    '..llllllllll....', '....llllll......', '................', '................',
  ]],
  ['tree canopy', [
    '.....llllll.....', '...llllllllll...', '..llllllllllll..', '.llllLLLllllLll.',
    'llllllllllllllll', 'lllLLllllllLllll', 'llllllllllllllll', 'llllllLLLlllllll',
    'lllllllllllllLll', '.llLLllllllllll.', '..llllllllllll..', '...llllllllll...',
    '......tttt......', '......tttt......', '......tttt......', '......tttt......',
  ]],
  ['rock', [
    '................', '................', '......rrrr......', '....rrrrrrrr....',
    '...rrrrrrrrrr...', '..rrrRRrrrrrrr..', '..rrrrrrrrRRrr..', '.rrrrrrrrrrrrrr.',
    '.rrRRrrrrrrrrrr.', '.rrrrrrrrrrRRrr.', 'rrrrrrrrrrrrrrrr', 'rrrrRRrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR', '................', '................', '................',
  ]],
  ['spikes', [
    '................', '................', '................', '................',
    '.......kk.......', '.k....knnk....k.', '.kk...knnk...kk.', 'kknk..knnk..knnk',
    'knnk.kknnkk.knnk', 'knnkkknnnnkkknnk', 'knnnnknnnnknnnnk', 'knnnnnnnnnnnnnnk',
    'knnnnnnnnnnnnnnk', 'kknnnnnnnnnnnnkk', 'kkkkkkkkkkkkkkkk', 'DDDDDDDDDDDDDDDD',
  ]],
];

const TILE = 16;
const GUTTER = 3;          // cells between tiles, so a sheet reads as a sheet
const COLS = 4;
const MARGIN = 2;

for (const [name, rows] of TILES) {
  if (rows.length !== TILE) throw new Error(`${name}: ${rows.length} rows, expected ${TILE}`);
  for (const [i, row] of rows.entries()) {
    if (row.length !== TILE) throw new Error(`${name} row ${i}: ${row.length} chars, expected ${TILE}`);
    for (const ch of row) if (ch !== '.' && !PAL[ch]) throw new Error(`${name} row ${i}: unknown palette key "${ch}"`);
  }
}

const sheetRows = Math.ceil(TILES.length / COLS);
const cols = MARGIN * 2 + COLS * TILE + (COLS - 1) * GUTTER;
const rowsTotal = MARGIN * 2 + sheetRows * TILE + (sheetRows - 1) * GUTTER;

const doc = core.createDocument({
  name: '16x16 tileset', canvas: { cols, rows: rowsTotal }, createdAt: '2026-08-31T00:00:00.000Z',
});
core.OPERATIONS.set_background(doc, { color: '#171a1f' });

/** 0 -> A, 26 -> AA. Excel columns, which is how the lattice is addressed. */
function colName(n) {
  let s = '', x = n;
  do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return s;
}

let strokes = 0;
TILES.forEach(([name, rows], index) => {
  const tx = MARGIN + (index % COLS) * (TILE + GUTTER);
  const ty = MARGIN + Math.floor(index / COLS) * (TILE + GUTTER);
  const slug = name.replace(/\s+/g, '-');

  rows.forEach((row, y) => {
    let x = 0;
    while (x < TILE) {
      const ch = row[x];
      if (ch === '.') { x += 1; continue; }
      let len = 1;
      while (x + len < TILE && row[x + len] === ch) len += 1;

      // Both quadrant bands, or the row inks 5px of a 10px cell and stripes.
      const at = `${colName(tx + x + 1)}${ty + y + 1}`;
      for (const band of ['top', 'bottom']) {
        core.applyPen(doc, 'base', `pen ${at} align ${band} right ${len} line`, {
          id: `${slug}-${y}-${x}-${band}`, role: 'artwork', paint: 'cells', color: PAL[ch],
        });
        strokes += 1;
      }
      x += len;
    }
  });
});

const out = resolve(project, 'diagrams/game-tileset-16.turtlepen.json');
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);

const log = core.validate(doc);
const open = log.open.filter((f) => f.severity !== 'S3');
console.log(`${TILES.length} tiles · ${strokes} strokes · ${cols}x${rowsTotal} cells`);
console.log(`findings: ${log.open.length} (${open.length} above S3)`);
for (const f of log.open.slice(0, 6)) console.log('  ', f.rule, f.severity, (f.message || '').slice(0, 100));
