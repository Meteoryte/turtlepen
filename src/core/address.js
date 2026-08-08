/**
 * Excel-style addressing over the quadrant lattice.
 *
 * Columns are bijective base-26: A..Z, AA..AZ, BA.. — exactly Excel's scheme.
 * Rows are 1-based. Origin A1 is top-left; the grid extends without bound to
 * the right and down. There is no negative addressing, so every address parses
 * unambiguously; a diagram that may grow up or left should simply start at an
 * inset origin such as T20.
 *
 * Three precisions are accepted anywhere a location is expected:
 *   C4      the whole cell            10 x 10 px
 *   C4.tl   a pin point (9 per cell)  lattice point, used to pin placements
 *   C4.q2   a quadrant (4 per cell)   5 x 5 px, the collision unit
 */

import { rect, QUADS_PER_CELL } from './geometry.js';

export const PINS = Object.freeze({
  tl: [0, 0], t: [1, 0], tr: [2, 0],
  l: [0, 1], c: [1, 1], r: [2, 1],
  bl: [0, 2], b: [1, 2], br: [2, 2],
});

export const PIN_NAMES = Object.freeze(Object.keys(PINS));

/** Quadrant offsets within a cell. q1 q2 / q3 q4, reading order. */
export const QUADRANTS = Object.freeze({
  q1: [0, 0], q2: [1, 0], q3: [0, 1], q4: [1, 1],
});

const ADDRESS_RE = /^([A-Za-z]+)(\d+)(?:\.([A-Za-z0-9]+))?$/;

/** 'A' -> 0, 'Z' -> 25, 'AA' -> 26. */
export function colToIndex(letters) {
  const s = String(letters).toUpperCase();
  if (!/^[A-Z]+$/.test(s)) throw new SyntaxError(`bad column letters: ${letters}`);
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 -> 'A', 25 -> 'Z', 26 -> 'AA'. */
export function indexToCol(index) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`bad column index: ${index}`);
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Parse an address string into its parts.
 * @returns {{col:number,row:number,part:string|null,kind:'cell'|'pin'|'quad',raw:string}}
 */
export function parseAddress(input) {
  const raw = String(input).trim().replace(/^\(|\)$/g, '');
  const m = ADDRESS_RE.exec(raw);
  if (!m) throw new SyntaxError(`unparseable address: "${input}" (expected forms: C4, C4.tl, C4.q2)`);
  const col = colToIndex(m[1]);
  const row = Number(m[2]) - 1;
  if (row < 0) throw new RangeError(`rows are 1-based; got ${m[2]} in "${input}"`);
  const part = m[3] ? m[3].toLowerCase() : null;
  let kind = 'cell';
  if (part) {
    if (part in PINS) kind = 'pin';
    else if (part in QUADRANTS) kind = 'quad';
    else throw new SyntaxError(`unknown cell part ".${part}" in "${input}" — expected one of ${PIN_NAMES.join(' ')} or q1..q4`);
  }
  return { col, row, part, kind, raw };
}

export function looksLikeAddress(token) {
  return ADDRESS_RE.test(String(token).trim().replace(/^\(|\)$/g, ''));
}

/** Top-left quadrant coordinate of a cell. */
export function cellOrigin(col, row) {
  return { x: col * QUADS_PER_CELL, y: row * QUADS_PER_CELL };
}

/**
 * The lattice POINT an address denotes. Pin points sit on quadrant boundaries
 * (offsets 0, 1, 2 within the cell), so all nine are integers.
 */
export function pinPoint(addr) {
  const a = typeof addr === 'string' ? parseAddress(addr) : addr;
  const o = cellOrigin(a.col, a.row);
  if (a.kind === 'pin') {
    const [dx, dy] = PINS[a.part];
    return { x: o.x + dx, y: o.y + dy };
  }
  if (a.kind === 'quad') {
    const [dx, dy] = QUADRANTS[a.part];
    return { x: o.x + dx, y: o.y + dy };
  }
  return o; // bare cell pins at its top-left
}

/**
 * The quadrant an address selects, as a rect. A bare cell yields its whole
 * 2x2 block; a quadrant address yields one quadrant; a pin point yields the
 * quadrant to its bottom-right, clamped inside the cell.
 */
export function addressRect(addr) {
  const a = typeof addr === 'string' ? parseAddress(addr) : addr;
  const o = cellOrigin(a.col, a.row);
  if (a.kind === 'cell') return rect(o.x, o.y, QUADS_PER_CELL, QUADS_PER_CELL);
  if (a.kind === 'quad') {
    const [dx, dy] = QUADRANTS[a.part];
    return rect(o.x + dx, o.y + dy, 1, 1);
  }
  const [dx, dy] = PINS[a.part];
  return rect(o.x + Math.min(dx, 1), o.y + Math.min(dy, 1), 1, 1);
}

/**
 * Guard a placement against the top-left edge of the grid.
 *
 * The grid has no negative addressing, so a pin that pushes an element off the
 * origin has to fail with an explanation rather than a cryptic index error.
 */
export function assertOnGrid(r, what = 'element') {
  if (r.x < 0 || r.y < 0) {
    throw new RangeError(
      `${what} would start at quadrant ${r.x},${r.y}, off the top-left of the grid. ` +
        'Addresses run from A1 rightward and downward only — there is no negative addressing. ' +
        `Anchor it at least ${Math.ceil(r.w / 2)} column(s) and ${Math.ceil(r.h / 2)} row(s) in from the origin, ` +
        'or start the drawing at an inset origin such as T20 so it has room to grow up and left.',
    );
  }
  return r;
}

/** Quadrant coordinate -> 'C4.q2'. The inverse used in every collision report. */
export function quadToAddress(x, y) {
  // Never throw while formatting a diagnostic — an off-grid coordinate is
  // something to report, not something to crash the report.
  if (x < 0 || y < 0) return `<off-grid ${x},${y}>`;
  const col = Math.floor(x / QUADS_PER_CELL);
  const row = Math.floor(y / QUADS_PER_CELL);
  const qx = x - col * QUADS_PER_CELL;
  const qy = y - row * QUADS_PER_CELL;
  const q = qy === 0 ? (qx === 0 ? 'q1' : 'q2') : (qx === 0 ? 'q3' : 'q4');
  return `${indexToCol(col)}${row + 1}.${q}`;
}

/** Quadrant coordinate -> 'C4' (cell only). */
export function quadToCell(x, y) {
  if (x < 0 || y < 0) return `<off-grid ${x},${y}>`;
  return `${indexToCol(Math.floor(x / QUADS_PER_CELL))}${Math.floor(y / QUADS_PER_CELL) + 1}`;
}

export function formatCell(col, row) {
  return `${indexToCol(col)}${row + 1}`;
}

/** Human-readable list of cells a rect touches, capped so reports stay readable. */
export function describeRegion(r, limit = 12) {
  const cells = new Set();
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) cells.add(quadToCell(x, y));
  }
  const list = [...cells];
  if (list.length <= limit) return list.join(' ');
  return `${list.slice(0, limit).join(' ')} …+${list.length - limit} more`;
}
