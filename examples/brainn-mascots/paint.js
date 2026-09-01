/**
 * Shared painter for every mascot version.
 *
 * One cell is one pixel. A pen stroke inks ONE QUADRANT across its thickness,
 * so each run is drawn twice — `align top` and `align bottom` — or the sprite
 * comes out striped. Runs are merged along the row first, so a 60px band of one
 * colour costs two strokes rather than a hundred and twenty. Each band remains
 * its own path: combining disconnected runs would falsely describe them as one
 * continuous trace and correctly trigger TurtlePen's L014 finding.
 */

import * as core from '../../src/core/index.js';

export const colName = (n) => {
  let s = '', x = n;
  do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return s;
};

export function paintSprite(doc, page, grid, ox, oy, prefix, palette) {
  let strokes = 0;
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x += 1; continue; }
      if (!palette[ch]) throw new Error(`${prefix} row ${y}: unknown palette key "${ch}"`);
      let len = 1;
      while (x + len < row.length && row[x + len] === ch) len += 1;
      const cell = `${colName(ox + x + 1)}${oy + y + 1}`;
      for (const band of ['top', 'bottom']) {
        core.applyPen(doc, page, `pen ${cell} align ${band} right ${len} line`, {
          id: `${prefix}-${y}-${x}-${band}`, role: 'artwork', paint: 'cells', color: palette[ch],
        });
        strokes += 1;
      }
      x += len;
    }
  });

  return strokes;
}
