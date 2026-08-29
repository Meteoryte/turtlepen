#!/usr/bin/env node
/**
 * How small can TurtleFont go before it stops being a face?
 *
 * The glyphs are drawn at one cap height and rendered at any other, which means
 * small sizes round. Rounding is fine until it is not: two different letters
 * land on the same quadrants, or a glyph disappears entirely. Either one is a
 * hole in a sentence that nothing downstream can detect, which is the same
 * failure a missing glyph would be — so the floor is refused rather than
 * rendered badly.
 *
 * This measures where that happens instead of guessing at it. `MIN_CAP` in
 * `core/turtlefont.js` is whatever this says, and if the glyph data changes,
 * run it again — the answer moves.
 *
 *   node examples/turtlefont-floor.js
 */

import * as font from '../src/core/turtlefont.js';

// Characters that are SUPPOSED to share a drawing: Greek Alpha is Latin A.
// Counting those as collisions would put the floor in the wrong place.
const sameByDesign = new Map();
for (const ch of font.coverage()) {
  const g = font.glyph(ch);
  if (!g) continue;
  const key = JSON.stringify(g.strokes);
  sameByDesign.set(key, [...(sameByDesign.get(key) ?? []), ch]);
}
const alias = new Map();
for (const group of sameByDesign.values()) {
  for (const ch of group) alias.set(ch, group[0]);
}

const rows = [];
for (let cap = 4; cap <= 16; cap++) {
  const seen = new Map();
  const collisions = [];
  const vanished = [];
  let skipped = false;

  for (const ch of font.coverage()) {
    if (ch === ' ') continue;
    let ink;
    try {
      ink = font.renderStrokeText(ch, { size: cap, weight: 1 });
    } catch {
      // The engine refuses below its own floor. Swallowing that and carrying on
      // would report a size as usable having measured nothing at all — which is
      // how the first run of this said cap 4 was fine.
      skipped = true;
      break;
    }
    if (!ink.pieces.length) { vanished.push(ch); continue; }
    const key = ink.pieces.map((p) => `${p.x},${p.y}`).sort().join('|');
    const other = seen.get(key);
    if (other && alias.get(other) !== alias.get(ch)) collisions.push(`${other}/${ch}`);
    else if (!other) seen.set(key, ch);
  }
  rows.push({ cap, collisions, vanished, skipped });
}

const bar = '═'.repeat(70);
console.log(bar);
console.log('  cap   px   collisions  vanished   verdict');
console.log('─'.repeat(70));
let floor = null;
for (const r of [...rows].reverse()) {
  const ok = !r.skipped && r.collisions.length === 0 && r.vanished.length === 0;
  if (ok) floor = r.cap;
  console.log(
    `  ${String(r.cap).padStart(3)} ${String(r.cap * 5).padStart(4)}  `
    + `${String(r.collisions.length).padStart(10)}  ${String(r.vanished.length).padStart(8)}   `
    + (r.skipped ? 'not measured — below the engine floor'
      : ok ? 'usable' : `NO — ${[...r.collisions.slice(0, 4), ...r.vanished.slice(0, 4)].join(' ')}`),
  );
}
console.log(bar);
console.log(`  smallest usable cap height: ${floor} quadrants (${floor * 5}px)`);
console.log(`  MIN_CAP in core/turtlefont.js is ${font.MIN_CAP}`);
console.log(bar);
if (font.MIN_CAP !== floor) {
  console.error(`  MISMATCH: MIN_CAP says ${font.MIN_CAP}, the glyphs say ${floor}. One of them is wrong.`);
  process.exitCode = 1;
}
