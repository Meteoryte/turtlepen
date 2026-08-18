/**
 * Shape vocabulary — corner styles for boxes and junction pieces for pen paths.
 *
 * Corner style is not cosmetic here. A rounded, chamfered, or indented box does
 * not visually occupy its four corner quadrants, so its CLAIMED footprint (what
 * it reserves) is larger than its VISUAL footprint (what ink actually covers).
 * The collision engine uses both: a stroke through a corner cut is reported as
 * information, while a stroke through the body is an error. Without this
 * distinction the engine would report collisions a human eye would not see,
 * which trains an AI to ignore the log — the exact failure being designed out.
 */

import { rect, quadKey, right, bottom } from './geometry.js';
export { right, bottom };

export const BOX_CORNER_STYLES = Object.freeze(['square', 'rounded', 'indented', 'chamfered']);
export const JUNCTION_STYLES = Object.freeze(['square', 'rounded', 'indented', 'chamfered']);

/** Corner cuts are exactly one quadrant — 5px — for every non-square style. */
export const CORNER_CUT_QUADS = 1;

export function assertCornerStyle(style) {
  if (!BOX_CORNER_STYLES.includes(style)) {
    throw new SyntaxError(`unknown corner style "${style}" — expected one of ${BOX_CORNER_STYLES.join(', ')}`);
  }
  return style;
}

/** Everything a box reserves. Nothing else may occupy these quadrants. */
export function claimedQuads(r) {
  const out = new Set();
  for (let y = r.y; y < bottom(r); y++) for (let x = r.x; x < right(r); x++) out.add(quadKey(x, y));
  return out;
}

/**
 * The quadrants a box's corner style carves away — empty for 'square'.
 * A box smaller than 2x2 quadrants has no room for cuts and keeps its corners.
 */
export function cornerCutQuads(r, style = 'square') {
  const out = new Set();
  if (style === 'square' || r.w < 2 || r.h < 2) return out;
  const x1 = r.x, x2 = right(r) - 1, y1 = r.y, y2 = bottom(r) - 1;
  out.add(quadKey(x1, y1));
  out.add(quadKey(x2, y1));
  out.add(quadKey(x1, y2));
  out.add(quadKey(x2, y2));
  return out;
}

/**
 * Flowchart node shapes.
 *
 * A shape is the SAME idea as a corner style, scaled up. A decision diamond is
 * a box whose corners are carved away in bulk: it still CLAIMS its bounding box,
 * so layout, gutters and free-space reasoning are unchanged, but it only INKS
 * the diamond. The collision engine already distinguishes the two, so a stroke
 * clipping a diamond's empty corner is reported as information (L013) while one
 * through its body stays an error (L004) — with no special case anywhere.
 *
 * Meanings follow the standard flowchart vocabulary, because a reader who knows
 * flowcharts should not have to learn ours:
 *   process      the basic step, named with a verb phrase        rectangle
 *   decision     branches the process on a test                  diamond
 *   terminator   start or end of the process                     stadium
 *   subprocess   enters another process and returns              double side bars
 *   io           input or output                                 parallelogram
 *   prep         preparation or setup                            hexagon
 *   manual       a step a person performs                        trapezoid
 *   data         stored data                                     cylinder
 *   document     a printed or written artifact                   wavy foot
 *   bar          fork or join                                    solid bar
 */
export const NODE_SHAPES = Object.freeze([
  'process', 'decision', 'terminator', 'subprocess',
  'io', 'prep', 'manual', 'data', 'document', 'bar',
  'lane', 'group',
]);

/**
 * Containers hold other nodes, so unlike every other shape they do NOT reserve
 * their interior — only a titled band across the top and a border ring around
 * the hole. A member sitting inside therefore collides with nothing, while a
 * node straddling the border still reports `L001`, which is correct: it really
 * does cross the frame.
 *
 * This is not a weakening of `L001`. The rule still compares claimed sets; a
 * container simply claims a ring instead of a slab. That is the same kind of
 * per-element fact that a corner cut already is, one level up.
 */
export const CONTAINER_SHAPES = Object.freeze(['lane', 'group']);

/** Quadrants of title band, sized so a 10px label fits with padding. */
const TITLE_BAND = 6;

export function isContainer(shape) {
  return CONTAINER_SHAPES.includes(shape);
}

/** The band height a container actually gets, given the room it has. */
export function containerBand(r) {
  return Math.min(TITLE_BAND, Math.max(1, r.h - 2));
}

/** A container reserves its title band and its border ring — never its hole. */
export function containerClaimQuads(r) {
  const out = new Set();
  const band = containerBand(r);
  for (let y = r.y; y < r.y + band; y++) {
    for (let x = r.x; x < right(r); x++) out.add(quadKey(x, y));
  }
  for (let y = r.y + band; y < bottom(r); y++) {
    for (let x = r.x; x < right(r); x++) {
      if (x === r.x || x === right(r) - 1 || y === bottom(r) - 1) out.add(quadKey(x, y));
    }
  }
  return out;
}

/** Shapes whose slant or curve is a fixed fraction of the bounding box. */
const SKEW = 0.25;
const CAP = 0.18;

export function assertNodeShape(shape) {
  if (!NODE_SHAPES.includes(shape)) {
    throw new SyntaxError(`unknown node shape "${shape}" — expected one of ${NODE_SHAPES.join(', ')}`);
  }
  return shape;
}

/**
 * Is this quadrant inside the shape's outline?
 *
 * Quadrant centres are tested, so the result is an exact integer set: the same
 * rect and shape always ink the same quadrants, which is what lets tests assert
 * cell sets rather than approximate coverage.
 */
function insideShape(i, j, w, h, shape) {
  const r_h_small = h < 6;
  const u = (i + 0.5) / w;          // 0..1 across
  const v = (j + 0.5) / h;          // 0..1 down
  const du = Math.abs(2 * u - 1);   // 0 at centre, 1 at either edge
  const dv = Math.abs(2 * v - 1);
  switch (shape) {
    case 'decision':
      return du + dv <= 1;
    case 'terminator': {
      const rad = Math.min(0.5, (h / 2) / w);   // cap radius as a fraction of width
      if (u >= rad && u <= 1 - rad) return true;
      const cu = u < 0.5 ? rad : 1 - rad;
      return ((u - cu) / rad) ** 2 + dv ** 2 <= 1;
    }
    case 'io':
      return u >= SKEW * (1 - v) && u <= 1 - SKEW * v;
    case 'prep':
      // Flat through the middle, slanted only at the two ends — a hexagon,
      // not a diamond that happens to have been clipped.
      return u >= SKEW * dv && u <= 1 - SKEW * dv;
    case 'manual':
      return u >= SKEW * v && u <= 1 - SKEW * v;
    case 'data': {
      if (v > CAP && v < 1 - CAP) return true;
      const cv = v <= CAP ? CAP : 1 - CAP;
      return du ** 2 + ((v - cv) / CAP) ** 2 <= 1;
    }
    case 'document': {
      // A symmetric foot rather than a true S-wave. At the amplitude a lattice
      // actually affords — two quadrants on a typical node — an S reads as a
      // chewed edge, because one half of the cycle cuts and the other does not.
      // A symmetric dip stays legible at every size the engine can draw.
      if (r_h_small) return true;
      return v <= 1 - CAP * (0.5 - 0.5 * Math.cos(u * Math.PI * 2));
    }
    default:
      return true;
  }
}

/**
 * Everything a shape carves out of its claimed rectangle.
 *
 * Below 3x3 quadrants a shape has no room to read as itself, so it keeps its
 * rectangle and its corner style rather than degrading into an unrecognisable
 * blob — the engine refuses to pretend, the same way it refuses elsewhere.
 */
export function shapeCutQuads(r, shape = 'process', style = 'square') {
  if (shape === 'process' || shape === 'subprocess' || shape === 'bar') {
    return cornerCutQuads(r, style);
  }
  assertNodeShape(shape);
  if (r.w < 3 || r.h < 3) return cornerCutQuads(r, style);
  if (isContainer(shape)) {
    // The hole is everything the container does not claim.
    const claimed = containerClaimQuads(r);
    const out = new Set();
    for (let y = r.y; y < bottom(r); y++) {
      for (let x = r.x; x < right(r); x++) {
        const k = quadKey(x, y);
        if (!claimed.has(k)) out.add(k);
      }
    }
    return out;
  }
  const out = new Set();
  for (let j = 0; j < r.h; j++) {
    for (let i = 0; i < r.w; i++) {
      if (!insideShape(i, j, r.w, r.h, shape)) out.add(quadKey(r.x + i, r.y + j));
    }
  }
  return out;
}

/**
 * The rectangle a label may actually use inside a shape.
 *
 * This is the whole reason shapes are more than decoration. A diamond's
 * bounding box is twice the width its text can use at the vertical centre;
 * reporting a label as fitting because the BOUNDING BOX was wide enough would
 * reintroduce the precise overflow bug this project exists to eliminate.
 */
export function shapeTextRect(r, shape = 'process') {
  if (r.w < 3 || r.h < 3) return r;
  const inset = (dx, dy) => rect(
    r.x + dx, r.y + dy,
    Math.max(1, r.w - dx * 2), Math.max(1, r.h - dy * 2),
  );
  switch (shape) {
    case 'lane':
    case 'group':
      // A container's label belongs in its title band, not floating in the
      // middle of the hole where its members live.
      return rect(r.x + 1, r.y, Math.max(1, r.w - 2), containerBand(r));
    case 'decision':
      return inset(Math.floor(r.w / 4), Math.floor(r.h / 4));
    case 'terminator':
      return inset(Math.min(Math.floor(r.w / 4), Math.floor(r.h / 4)), 0);
    case 'io':
    case 'manual':
    case 'prep':
      return inset(Math.ceil(r.w * SKEW), 0);
    case 'data':
      return inset(0, Math.ceil(r.h * CAP));
    case 'document':
      return rect(r.x, r.y, r.w, Math.max(1, r.h - Math.ceil(r.h * CAP)));
    case 'subprocess':
      return inset(1, 0);
    default:
      return r;
  }
}

/** Claimed minus whatever the shape and corner style carve away. */
export function visualQuads(r, style = 'square', shape = 'process') {
  const claimed = claimedQuads(r);
  for (const k of shapeCutQuads(r, shape, style)) claimed.delete(k);
  return claimed;
}

/**
 * Named attachment points on a box, for `to db.W` style pen targeting.
 * Compass names; each resolves to a lattice point on the box perimeter.
 */
export const PORT_NAMES = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'C']);
const CARDINAL_PORTS = Object.freeze(['N', 'E', 'S', 'W']);

/**
 * Parse a named port, optionally followed by a one-based face slot (`S#2`).
 *
 * Slot 1 is the existing midpoint. Further slots alternate one whole cell
 * toward the negative and positive axis: on N/S, #2 is left and #3 is right;
 * on E/W, #2 is up and #3 is down. A whole-cell stride keeps adjacent
 * connectors on separate lattice tracks instead of merely changing which half
 * of one cell they occupy.
 */
export function parsePortSpec(port) {
  const source = String(port);
  const match = /^([A-Za-z]{1,2})(?:#(\d+))?$/.exec(source);
  if (!match) {
    throw new SyntaxError(`unknown port "${port}" — expected one of ${PORT_NAMES.join(', ')}, optionally N#2, E#2, S#2 or W#2`);
  }
  const name = match[1].toUpperCase();
  if (!PORT_NAMES.includes(name)) {
    throw new SyntaxError(`unknown port "${port}" — expected one of ${PORT_NAMES.join(', ')}`);
  }
  const slot = match[2] == null ? 1 : Number(match[2]);
  if (!Number.isSafeInteger(slot) || slot < 1) {
    throw new RangeError(`port slot in "${port}" must be a positive integer starting at #1`);
  }
  if (match[2] != null && !CARDINAL_PORTS.includes(name)) {
    throw new SyntaxError(`"${port}" cannot be indexed — only cardinal faces N, E, S and W have connector slots`);
  }
  return { name, slot, indexed: match[2] != null };
}

/** Number of one-cell-spaced connector tracks available on a cardinal face. */
export function portSlotCapacity(r, port) {
  const { name } = parsePortSpec(port);
  if (!CARDINAL_PORTS.includes(name)) {
    throw new SyntaxError(`"${port}" is not a cardinal face — slot capacity exists only for N, E, S and W`);
  }
  return Math.max(1, Math.floor((name === 'N' || name === 'S' ? r.w : r.h) / 2));
}

function slottedAxisPoint(start, length, slot, port) {
  // A one-quadrant artwork/path footprint still has its historical midpoint
  // anchor. It cannot fan out, but unindexed N/E/S/W must continue to resolve.
  const capacity = Math.max(1, Math.floor(length / 2));
  if (slot > capacity) {
    throw new RangeError(`port "${port}" is outside this face — it supports #1 through #${capacity}`);
  }
  if (slot === 1) return start + Math.floor(length / 2);
  const distance = Math.ceil((slot - 1) / 2) * 2;
  return start + Math.floor(length / 2) + (slot % 2 === 0 ? -distance : distance);
}

/**
 * The quadrant just OUTSIDE a box's cardinal face, and the direction leading
 * away from it. This is where a connector should begin: adjacent to the box, so
 * nothing dangles, but not overlapping it.
 *
 * It exists because computing it by hand is exactly the arithmetic that goes
 * wrong — the north face sits on the box's own top row, so leaving northward
 * means starting one quadrant above it, while the south face is already outside.
 */
export function approachPoint(r, port) {
  const { name, slot } = parsePortSpec(port);
  const slotX = () => slottedAxisPoint(r.x, r.w, slot, port);
  const slotY = () => slottedAxisPoint(r.y, r.h, slot, port);
  switch (name) {
    case 'N': return { x: slotX(), y: r.y - 1, facing: 'up' };
    case 'S': return { x: slotX(), y: bottom(r), facing: 'down' };
    case 'W': return { x: r.x - 1, y: slotY(), facing: 'left' };
    case 'E': return { x: right(r), y: slotY(), facing: 'right' };
    default:
      throw new SyntaxError(
        `"${port}" is not a cardinal face. Starting a path from a box uses N, S, E or W — a corner does not say which way the path should leave.`,
      );
  }
}

/**
 * A quadrant ON the box's own perimeter — the counterpart to `approachPoint`,
 * which is the quadrant one step further out.
 *
 * Every side resolves INCLUSIVELY, to the box's own last row or column, so that
 * `seat === port + outward step` holds on all four faces. That symmetry is what
 * lets arrival share one code path in every direction: a line's last piece lands
 * one quadrant before its resolved target, so aiming at any face puts the tip on
 * that face's seat. When south and east used the exclusive `bottom()`/`right()`
 * instead, runs travelling left or up stopped two quadrants clear of the box
 * while their mirror images landed correctly — an asymmetry no amount of care in
 * the drawing could work around.
 */
export function portPoint(r, port) {
  const { name, slot } = parsePortSpec(port);
  const midX = r.x + Math.floor(r.w / 2);
  const midY = r.y + Math.floor(r.h / 2);
  const x2 = right(r) - 1, y2 = bottom(r) - 1;
  const slotX = () => slottedAxisPoint(r.x, r.w, slot, port);
  const slotY = () => slottedAxisPoint(r.y, r.h, slot, port);
  switch (name) {
    case 'N': return { x: slotX(), y: r.y };
    case 'S': return { x: slotX(), y: y2 };
    case 'W': return { x: r.x, y: slotY() };
    case 'E': return { x: x2, y: slotY() };
    case 'NW': return { x: r.x, y: r.y };
    case 'NE': return { x: x2, y: r.y };
    case 'SW': return { x: r.x, y: y2 };
    case 'SE': return { x: x2, y: y2 };
    case 'C': return { x: midX, y: midY };
    default:
      throw new SyntaxError(`unknown port "${port}" — expected one of ${PORT_NAMES.join(', ')}`);
  }
}

/**
 * Which side of its 10px cell a 5px stroke hugs.
 *
 * Note there is deliberately no 'center': a 5px stroke centred in a 10px cell
 * would start at 2.5px, off the integer lattice. Rejecting it keeps every
 * coordinate exact, and the four sides are the alignments actually needed.
 */
export const VERTICAL_ALIGNMENTS = Object.freeze(['left', 'right']);
export const HORIZONTAL_ALIGNMENTS = Object.freeze(['top', 'bottom']);

export function alignmentFor(axis, align) {
  const legal = axis === 'v' ? VERTICAL_ALIGNMENTS : HORIZONTAL_ALIGNMENTS;
  if (align == null) return legal[1]; // right for vertical, bottom for horizontal
  const a = String(align).toLowerCase();
  if (a === 'center' || a === 'centre') {
    throw new SyntaxError(
      `align center is not available for strokes: a 5px stroke centred in a 10px cell starts at 2.5px, off the lattice. Use ${legal.join(' or ')}.`,
    );
  }
  if (!legal.includes(a)) {
    throw new SyntaxError(`align "${align}" is not valid for a ${axis === 'v' ? 'vertical' : 'horizontal'} stroke — expected ${legal.join(' or ')}`);
  }
  return a;
}

/** Snap a quadrant coordinate onto the aligned track within its own cell. */
export function alignTrack(coord, align) {
  const cellStart = Math.floor(coord / 2) * 2;
  return align === 'left' || align === 'top' ? cellStart : cellStart + 1;
}

/**
 * A junction piece connects exactly two sides of its single quadrant.
 * `sides` are direction names: e.g. ['bottom','right'] for a path arriving from
 * below and leaving to the right.
 */
export function junction(x, y, sides, style = 'square') {
  if (!JUNCTION_STYLES.includes(style)) {
    throw new SyntaxError(`unknown junction style "${style}" — expected one of ${JUNCTION_STYLES.join(', ')}`);
  }
  return { rect: rect(x, y, 1, 1), sides: [...sides].sort(), style };
}
