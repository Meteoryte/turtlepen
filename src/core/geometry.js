/**
 * TurtlePen geometry — every coordinate in this engine is an integer.
 *
 * The unit of the internal coordinate system is the QUADRANT (5px), never the
 * pixel and never the cell. A cell is exactly 2x2 quadrants. Strokes are
 * exactly 1 quadrant thick. Because every legal position is a whole number of
 * quadrants, collision results are byte-identical across runs — there is no
 * rounding, so a collision report is a fact rather than an approximation.
 *
 * Rects are half-open: {x, y, w, h} covers quadrants x .. x+w-1, y .. y+h-1.
 */

export const PX_PER_QUAD = 5;
export const QUADS_PER_CELL = 2;
export const PX_PER_CELL = PX_PER_QUAD * QUADS_PER_CELL; // 10

/** @typedef {{x:number,y:number,w:number,h:number}} Rect quadrant units */

export function rect(x, y, w, h) {
  if (![x, y, w, h].every(Number.isInteger)) {
    throw new TypeError(`rect requires integer quadrant units, got ${x},${y},${w},${h}`);
  }
  if (w <= 0 || h <= 0) throw new RangeError(`rect must have positive extent, got ${w}x${h}`);
  return { x, y, w, h };
}

export const right = (r) => r.x + r.w;
export const bottom = (r) => r.y + r.h;

export function rectsOverlap(a, b) {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

/** Overlapping region of two rects, or null. */
export function intersection(a, b) {
  if (!rectsOverlap(a, b)) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return rect(x, y, Math.min(right(a), right(b)) - x, Math.min(bottom(a), bottom(b)) - y);
}

/** Grow a rect outward by n quadrants on every side. Used for gutter checks. */
export function expand(r, n) {
  return rect(r.x - n, r.y - n, r.w + 2 * n, r.h + 2 * n);
}

export function rectContainsQuad(r, x, y) {
  return x >= r.x && x < right(r) && y >= r.y && y < bottom(r);
}

/** Every quadrant in a rect, as {x,y}. */
export function quadsOf(r) {
  const out = [];
  for (let y = r.y; y < bottom(r); y++) for (let x = r.x; x < right(r); x++) out.push({ x, y });
  return out;
}

export const quadKey = (x, y) => `${x},${y}`;
export const parseQuadKey = (k) => {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
};

/** Set of quadKeys covered by a rect. */
export function quadKeySet(r) {
  const s = new Set();
  for (let y = r.y; y < bottom(r); y++) for (let x = r.x; x < right(r); x++) s.add(quadKey(x, y));
  return s;
}

/** Convert a quadrant rect to pixels. Always exact — no rounding. */
export function toPx(r) {
  return {
    x: r.x * PX_PER_QUAD,
    y: r.y * PX_PER_QUAD,
    w: r.w * PX_PER_QUAD,
    h: r.h * PX_PER_QUAD,
  };
}

/** Bounding rect of many rects, or null when given none. */
export function boundsOf(rects) {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, right(r)); y1 = Math.max(y1, bottom(r));
  }
  return rect(x0, y0, x1 - x0, y1 - y0);
}

export const DIRECTIONS = Object.freeze({
  up: { dx: 0, dy: -1, axis: 'v' },
  down: { dx: 0, dy: 1, axis: 'v' },
  left: { dx: -1, dy: 0, axis: 'h' },
  right: { dx: 1, dy: 0, axis: 'h' },
});

export const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });

export function isDirection(t) {
  return Object.prototype.hasOwnProperty.call(DIRECTIONS, t);
}
