/**
 * Turn an implicit shape into a TurtlePen pen program.
 *
 * The lattice has no curves, so a curve is a staircase: rasterise the shape at
 * cell resolution, walk its boundary, compress each straight run into one
 * `<dir> N line`, and put a corner at every turn. The pen literally walks the
 * outline — which is what the tool is for.
 */

const DIRS = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
const ARRIVES_ON = { right: 'left', down: 'top', left: 'right', up: 'bottom' };
const LEAVES_BY = { right: 'right', down: 'bottom', left: 'left', up: 'top' };

/** Excel column name from a 1-based index. */
export function col(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
export const addr = (c, r) => `${col(c)}${r}`;

/**
 * Trace the boundary of a filled cell set and emit a pen program.
 * `inside(x, y)` decides membership; the region is scanned over the given box.
 */
export function traceProgram(inside, x0, y0, x1, y1) {
  const has = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && inside(x, y);

  // Start at the topmost-leftmost filled cell and walk clockwise, keeping the
  // outside on our left. Moves are one cell at a time; runs get merged after.
  let sx = null, sy = null;
  for (let y = y0; y <= y1 && sx === null; y++) for (let x = x0; x <= x1; x++) if (has(x, y)) { sx = x; sy = y; break; }
  if (sx === null) return null;

  const order = ['right', 'down', 'left', 'up'];
  let dir = 'right', x = sx, y = sy;
  const moves = [];
  const guard = (x1 - x0 + 2) * (y1 - y0 + 2) * 4;

  for (let step = 0; step < guard; step++) {
    // Prefer turning left (outward), then straight, then right, then back —
    // the standard boundary walk that hugs the edge without cutting corners.
    const i = order.indexOf(dir);
    const candidates = [order[(i + 3) % 4], dir, order[(i + 1) % 4], order[(i + 2) % 4]];
    let moved = false;
    for (const d of candidates) {
      const [dx, dy] = DIRS[d];
      if (has(x + dx, y + dy)) {
        x += dx; y += dy; dir = d; moves.push(d); moved = true; break;
      }
    }
    if (!moved) break;
    if (x === sx && y === sy) break;
  }
  if (!moves.length) return null;

  // Compress into runs.
  let runs = [];
  for (const m of moves) {
    const last = runs[runs.length - 1];
    if (last && last.dir === m) last.n += 1;
    else runs.push({ dir: m, n: 1 });
  }

  // Cancel spurs. At the extreme tips of an ellipse the boundary walk goes out
  // one cell and straight back, which would retrace its own quadrants (L015) and
  // ask for a corner joining a side to itself — which is not a corner at all.
  // Removing the doubled-back pair leaves the same visible outline.
  const OPPOSITE = { right: 'left', left: 'right', up: 'down', down: 'up' };
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    const out = [];
    for (const run of runs) {
      const prev = out[out.length - 1];
      if (prev && OPPOSITE[prev.dir] === run.dir) {
        const cancel = Math.min(prev.n, run.n);
        prev.n -= cancel;
        run.n -= cancel;
        if (prev.n === 0) out.pop();
        if (run.n > 0) out.push(run);
        changed = true;
        continue;
      }
      if (prev && prev.dir === run.dir) { prev.n += run.n; changed = true; continue; }
      out.push({ ...run });
    }
    runs = out.filter((r) => r.n > 0);
    if (!changed) break;
  }
  if (!runs.length) return null;

  const lines = [`pen ${addr(sx, sy)}.q1`];
  runs.forEach((run, i) => {
    lines.push(`${run.dir} ${run.n} line`);
    const next = runs[i + 1];
    if (next) lines.push(`${run.dir} corner align ${ARRIVES_ON[run.dir]} ${LEAVES_BY[next.dir]}`);
  });
  return { program: lines.join('\n'), runs: runs.length, start: addr(sx, sy) };
}

/** An axis-aligned ellipse membership test, in cell coordinates. */
export const ellipseAt = (cx, cy, rx, ry) => (x, y) => {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
};

/** A ring: inside the outer ellipse but outside the inner one. */
export const ringAt = (cx, cy, rx, ry, t) => (x, y) => {
  const a = ellipseAt(cx, cy, rx, ry)(x, y);
  const b = ellipseAt(cx, cy, rx - t, ry - t)(x, y);
  return a && !b;
};
