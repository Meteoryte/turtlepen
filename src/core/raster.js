/**
 * Rasterised geometry — diagonals, circles, arcs, polygons and marks.
 *
 * The lattice is orthogonal and integer, so every shape that is not a
 * rectangle is the same kind of thing: a computed set of whole quadrants. These
 * are the classic integer algorithms — Bresenham for lines, midpoint for
 * circles — chosen for the reason they were invented, which is also the reason
 * this project exists: they are exact. No floating-point coordinate is ever
 * handed to the collision engine, so the same shape yields byte-identical
 * output on every run.
 *
 * This is the same arithmetic that drew software logos and interface art on
 * 1-bit displays. A stepped diagonal is not an approximation of a smooth line;
 * on a lattice it IS the line.
 */

/** The eight directions a mark can travel. */
export const DIR8 = Object.freeze({
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1],
  s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1],
});

/** Long-form aliases, so `up` and `n` mean the same thing everywhere. */
export const DIR8_ALIAS = Object.freeze({
  up: 'n', down: 's', left: 'w', right: 'e',
  north: 'n', south: 's', east: 'e', west: 'w',
  'up-right': 'ne', 'up-left': 'nw', 'down-right': 'se', 'down-left': 'sw',
});

export function resolveDir8(name) {
  const k = String(name).toLowerCase();
  const resolved = DIR8_ALIAS[k] ?? k;
  if (!(resolved in DIR8)) {
    throw new SyntaxError(
      `"${name}" is not a direction — expected one of ${Object.keys(DIR8).join(' ')} ` +
        `(or ${Object.keys(DIR8_ALIAS).join(' ')})`,
    );
  }
  return resolved;
}

const key = (x, y) => `${x},${y}`;

/** Drop duplicates while preserving draw order — order is what makes a path a path. */
function unique(quads) {
  const seen = new Set();
  const out = [];
  for (const q of quads) {
    const k = key(q.x, q.y);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

/**
 * Bresenham's line, at any angle.
 *
 * The integer error term is what keeps a shallow line's steps evenly spread
 * instead of bunching, and guarantees consecutive quadrants always touch — a
 * gap would read as a broken line rather than a drawn one.
 */
export function rayQuads(x0, y0, x1, y1) {
  for (const [n, v] of Object.entries({ x0, y0, x1, y1 })) {
    if (!Number.isInteger(v)) throw new RangeError(`ray needs whole quadrants — ${n} is ${v}`);
  }
  const out = [];
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/**
 * The midpoint circle algorithm.
 *
 * One eighth of the circle is computed and mirrored into the other seven, which
 * is why the result is exactly symmetric rather than approximately so. Quadrants
 * are returned in sweep order so an arc can be cut out of it and stay connected.
 */
export function circleQuads(cx, cy, r) {
  if (!Number.isInteger(r) || r < 1) {
    throw new RangeError(`a circle needs a whole radius of at least 1 quadrant — got ${r}. On this lattice a smaller circle has no quadrants to draw.`);
  }
  const octant = [];
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    octant.push([x, y]);
    y += 1;
    if (err < 0) err += 2 * y + 1;
    else { x -= 1; err += 2 * (y - x) + 1; }
  }

  // Mirror into eight octants, then order by angle so the ring is traversable.
  const all = [];
  for (const [px, py] of octant) {
    all.push([px, py], [py, px], [-py, px], [-px, py], [-px, -py], [-py, -px], [py, -px], [px, -py]);
  }
  all.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  return unique(all.map(([px, py]) => ({ x: cx + px, y: cy + py })));
}

/** Normalise any angle onto [0, 360). */
const norm = (deg) => ((deg % 360) + 360) % 360;

/**
 * The part of a circle between two angles, measured clockwise from east —
 * clockwise because y grows downward on this lattice, so it matches what a
 * reader sees.
 */
export function arcQuads(cx, cy, r, startDeg, endDeg) {
  const ring = circleQuads(cx, cy, r);
  const sweep = norm(endDeg - startDeg) || 360;
  const from = norm(startDeg);

  const within = ring.filter((q) => norm((Math.atan2(q.y - cy, q.x - cx) * 180) / Math.PI - from) <= sweep);
  // Re-order along the sweep so consecutive quadrants stay adjacent.
  return within.sort(
    (a, b) =>
      norm((Math.atan2(a.y - cy, a.x - cx) * 180) / Math.PI - from) -
      norm((Math.atan2(b.y - cy, b.x - cx) * 180) / Math.PI - from),
  );
}

/** A closed polygon — three points make a triangle, four a quad, and so on. */
export function polygonQuads(points, { close = true } = {}) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new SyntaxError(`a polygon needs at least three points — got ${points?.length ?? 0}. Two points is a ray; use that instead.`);
  }
  const out = [];
  const last = close ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    out.push(...rayQuads(a.x, a.y, b.x, b.y));
  }
  return unique(out);
}

/**
 * A morse-style mark: a run of `length` quadrants from a point, in one of the
 * eight directions. A length of one is a dot; anything longer is a dash. Both
 * are the same primitive because on a lattice that is all they ever were.
 */
export function dashQuads(x, y, dir, length = 1) {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`a mark needs a whole length of at least 1 quadrant — got ${length}. A dot is length 1.`);
  }
  const [dx, dy] = DIR8[resolveDir8(dir)];
  const out = [];
  for (let i = 0; i < length; i++) out.push({ x: x + dx * i, y: y + dy * i });
  return out;
}

/** Every quadrant inside a circle, for solid forms rather than outlines. */
export function discQuads(cx, cy, r) {
  if (!Number.isInteger(r) || r < 1) throw new RangeError(`a disc needs a whole radius of at least 1 quadrant — got ${r}`);
  const out = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) out.push({ x: cx + x, y: cy + y });
  }
  return out;
}
