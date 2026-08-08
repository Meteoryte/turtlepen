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

/** Claimed minus corner cuts — where ink actually lands. */
export function visualQuads(r, style = 'square') {
  const claimed = claimedQuads(r);
  for (const k of cornerCutQuads(r, style)) claimed.delete(k);
  return claimed;
}

/**
 * Named attachment points on a box, for `to db.W` style pen targeting.
 * Compass names; each resolves to a lattice point on the box perimeter.
 */
export const PORT_NAMES = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'C']);

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
  const name = String(port).toUpperCase();
  const midX = r.x + Math.floor(r.w / 2);
  const midY = r.y + Math.floor(r.h / 2);
  switch (name) {
    case 'N': return { x: midX, y: r.y - 1, facing: 'up' };
    case 'S': return { x: midX, y: bottom(r), facing: 'down' };
    case 'W': return { x: r.x - 1, y: midY, facing: 'left' };
    case 'E': return { x: right(r), y: midY, facing: 'right' };
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
  const name = String(port).toUpperCase();
  const midX = r.x + Math.floor(r.w / 2);
  const midY = r.y + Math.floor(r.h / 2);
  const x2 = right(r) - 1, y2 = bottom(r) - 1;
  switch (name) {
    case 'N': return { x: midX, y: r.y };
    case 'S': return { x: midX, y: y2 };
    case 'W': return { x: r.x, y: midY };
    case 'E': return { x: x2, y: midY };
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
