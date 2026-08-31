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
import { fitReport as textFitReport } from './text.js';
export { right, bottom };

export const BOX_CORNER_STYLES = Object.freeze(['square', 'rounded', 'indented', 'chamfered']);
export const JUNCTION_STYLES = Object.freeze(['square', 'rounded', 'indented', 'chamfered']);

/** Corner cuts are exactly one quadrant — 5px — for every non-square style. */
export const CORNER_CUT_QUADS = 1;

/**
 * The cap depth and slant width of a symbol, in WHOLE QUADRANTS.
 *
 * These exist because the same two measurements were being computed in four places with
 * three different rounding policies. For a 18-quadrant-tall `data` node the label aperture
 * said 4 quadrants (ceil), the SVG outline drew 3.24 (no rounding at all), and the native
 * PNG/PDF renderer drew 3 (round). Three answers for one shape, and two of them off the
 * lattice — so the drawn arc could not land on quadrant boundaries and rasterised into
 * lumpy, asymmetric caps, while `validate` reasoned about a footprint the renderer never
 * drew.
 *
 * `Math.ceil` is the policy, chosen to match the aperture: a label is never allowed to
 * spill into ink, so the reserved cap must be at least the drawn one. Every caller uses
 * these; nobody re-derives `h * 0.18`.
 */
export function capQuads(heightQuads) {
  return Math.ceil(heightQuads * CAP);
}

export function skewQuads(widthQuads) {
  return Math.ceil(widthQuads * SKEW);
}

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
/** How much of a bar's height the bar itself occupies. */
const BAR_THICKNESS = 0.34;

/**
 * How wide a symbol may get before its silhouette stops carrying meaning.
 *
 * A shape is only worth drawing if it can be told apart from a plain process
 * box at a glance, and what distinguishes it is a fixed FRACTION of its
 * bounding box: a cylinder's cap is `CAP * h`, a parallelogram's slant is
 * `SKEW * w`, a diamond tapers to its own midpoints. Stretch the box wide and
 * that feature shrinks against the width until every shape reads as the same
 * bar. In the showcase batch a cylinder came out 28x8 quadrants, putting its
 * cap at 5% of the width — drawn correctly, and unrecognisable.
 *
 * The cap-bearing shapes derive their limit: `CAP * h >= FEATURE_FLOOR * w`
 * gives `w/h <= CAP / FEATURE_FLOOR`. The rest are craft defaults chosen so a
 * conventional flowchart passes unchanged — a stadium is legitimately long, a
 * diamond legitimately is not. Tune them here; they are not measurements of
 * anything external.
 *
 * `process` and `subprocess` are absent on purpose: a rectangle has no
 * silhouette to lose. Containers are absent because their size is dictated by
 * what they hold, and `bar` because a bar is a bar.
 */
const FEATURE_FLOOR = 0.08;

export const SHAPE_PROPORTION = Object.freeze({
  decision: { ideal: 1.4, maxAspect: 2 },
  data: { ideal: 1.2, maxAspect: round2(CAP / FEATURE_FLOOR) },
  document: { ideal: 1.6, maxAspect: round2(CAP / FEATURE_FLOOR) },
  io: { ideal: 2, maxAspect: 3 },
  manual: { ideal: 2, maxAspect: 3 },
  prep: { ideal: 2, maxAspect: 3 },
  terminator: { ideal: 2.5, maxAspect: 4 },
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Visual aspect of a rect. Quadrants are square, so this is w:h as drawn. */
export function aspectOf(r) {
  return r.h === 0 ? Infinity : round2(r.w / r.h);
}

/**
 * The cell span a labelled symbol needs: wide enough for the text once the
 * SHAPE has taken its inset, and tall enough to stay in proportion.
 *
 * This exists because `measure` alone is a trap for symbolic shapes. It reports
 * what the text needs in a plain box; `shapeTextRect` then hands a diamond only
 * half of that. An author who measures, places, sees `L003`, and widens is
 * chasing the overflow in the one direction that makes the symbol worse.
 */
export function spanForShape(shape, measured) {
  assertNodeShape(shape);
  const w = Math.max(1, measured.cellsWide);
  const h = Math.max(1, measured.cellsTall);
  const spec = SHAPE_PROPORTION[shape];
  if (isContainer(shape) && h * 2 > TITLE_BAND) {
    throw new RangeError(
      `${shape} labels have a ${TITLE_BAND / 2}-cell title band and cannot hold a ${h}-cell text block — `
      + 'measure it without maxWidthCells or shorten the label to one line',
    );
  }

  // Start with the raw text span, then grow the actual shape until the exact
  // aperture returned by shapeTextRect can hold that span. This intentionally
  // uses the same geometry as validate and render. Formulae based only on
  // proportions missed fixed insets such as the subprocess side bars: measure
  // returned 13x3 for createTools(session), while validate correctly found that
  // a 13x3 subprocess had only 110px of usable width.
  let outW = w;
  let outH = h;
  for (let attempts = 0; attempts < 10_000; attempts++) {
    const aperture = shapeTextRect(rect(0, 0, outW * 2, outH * 2), shape);
    const needsWidth = aperture.w < w * 2;
    const needsHeight = aperture.h < h * 2;
    const needsProportion = Boolean(spec && outW / outH > spec.maxAspect);
    if (!needsWidth && !needsHeight && !needsProportion) return { w: outW, h: outH };

    if (needsWidth) outW += 1;
    if (needsHeight || needsProportion) outH += 1;
  }
  throw new RangeError(`could not find a finite ${shape} span for ${w}x${h} cells of text`);
}

/**
 * Measure a label against a shape and express every resize fix in terms of the
 * OUTER box, not the carved text aperture. A raw text report can correctly say
 * that a subprocess needs a 13-cell aperture while still giving the caller the
 * wrong repair: the subprocess side bars mean that aperture needs a 14-cell
 * box. The same translation is required for every proportional or inset shape.
 */
export function fitReportForShape(text, outerRect, shape = 'process', options = {}) {
  assertNodeShape(shape);
  const aperture = shapeTextRect(outerRect, shape);
  const fit = textFitReport(text, aperture, options);
  const outerWidthCells = Math.ceil(outerRect.w / 2);
  const outerHeightCells = Math.ceil(outerRect.h / 2);

  const fixes = fit.fixes.flatMap((fix) => {
    if (fix.kind === 'widen') {
      const to = outerCellsForFit(text, shape, 'width', outerWidthCells, outerHeightCells, options, {
        alsoClearHeight: /wraps into/.test(fix.description),
      });
      if (to == null) return [];
      return [{
        ...fix,
        to,
        description: fix.description.replace(/(widen box to ~?)\d+ cells/, `$1${to} cells`),
      }];
    }
    if (fix.kind === 'heighten') {
      const to = outerCellsForFit(text, shape, 'height', outerHeightCells, outerWidthCells, options);
      if (to == null) return [];
      return [{
        ...fix,
        to,
        description: fix.description.replace(/(heighten box to )\d+ cells/, `$1${to} cells`),
      }];
    }
    return [fix];
  });

  return { ...fit, fixes };
}

function outerCellsForFit(text, shape, axis, currentAxisCells, fixedAxisCells, options, { alsoClearHeight = false } = {}) {
  // Container title bands do not grow with the outer box. If the current band
  // is too short, heightening the container can never repair the label.
  if (axis === 'height' && isContainer(shape)) return null;

  for (let candidate = Math.max(1, Math.ceil(currentAxisCells)); candidate < 10_000; candidate++) {
    const r = axis === 'width'
      ? rect(0, 0, candidate * 2, fixedAxisCells * 2)
      : rect(0, 0, fixedAxisCells * 2, candidate * 2);
    const aperture = shapeTextRect(r, shape);
    const checked = textFitReport(text, aperture, options);
    if (axis === 'width' && checked.widthOverflowPx === 0 && (!alsoClearHeight || checked.heightOverflowPx === 0)) return candidate;
    if (axis === 'height' && checked.heightOverflowPx === 0) return candidate;
  }
  return null;
}

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
    case 'bar':
      // A fork/join bar is a THIN solid bar, not a box. Drawn as a full
      // rectangle it was indistinguishable from `process` — a shape that looks
      // like another shape carries no meaning, which is the one job it has.
      return dv <= BAR_THICKNESS;
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
  if (shape === 'process' || shape === 'subprocess') {
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
    case 'bar':
      return rect(r.x, r.y, r.w, Math.max(1, Math.round(r.h * BAR_THICKNESS * 2)));
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
/**
 * Walk in from a bounding-box face until the SHAPE is actually there.
 *
 * A port used to be a property of the claimed rectangle, so a connector into a
 * diamond or a parallelogram was sent to a place the symbol does not reach.
 * Measured on a 20x8 box, `io` and `manual` left three empty quadrants and
 * `decision` and `prep` one — and because the skew is a fraction of the width,
 * the gap grows with the node rather than staying a rounding error.
 *
 * The extra length lands in claimed-but-uninked space, which the engine already
 * treats as information rather than error: that is the same ground a corner cut
 * occupies, and `L004` tests the inked body precisely so this distinction can
 * exist. A shape that fills its box is unchanged, so every connector already
 * drawn against a rectangle stays exactly where it is.
 */
function inkwardOffset(r, shape, style, name, along) {
  if (!shape || shape === 'process') return 0;
  const ink = visualQuads(r, style ?? 'square', shape);
  const limit = name === 'N' || name === 'S' ? r.h : r.w;
  for (let i = 0; i < limit; i++) {
    const x = name === 'W' ? r.x + i : name === 'E' ? right(r) - 1 - i : along;
    const y = name === 'N' ? r.y + i : name === 'S' ? bottom(r) - 1 - i : along;
    if (ink.has(`${x},${y}`)) return i;
  }
  return 0;
}

export function approachPoint(r, port, shape = null, style = 'square') {
  const { name, slot } = parsePortSpec(port);
  const slotX = () => slottedAxisPoint(r.x, r.w, slot, port);
  const slotY = () => slottedAxisPoint(r.y, r.h, slot, port);
  const inset = (along) => inkwardOffset(r, shape, style, name, along);
  switch (name) {
    case 'N': { const x = slotX(); return { x, y: r.y - 1 + inset(x), facing: 'up' }; }
    case 'S': { const x = slotX(); return { x, y: bottom(r) - inset(x), facing: 'down' }; }
    case 'W': { const y = slotY(); return { x: r.x - 1 + inset(y), y, facing: 'left' }; }
    case 'E': { const y = slotY(); return { x: right(r) - inset(y), y, facing: 'right' }; }
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
export function portPoint(r, port, shape = null, style = 'square') {
  const { name, slot } = parsePortSpec(port);
  const midX = r.x + Math.floor(r.w / 2);
  const midY = r.y + Math.floor(r.h / 2);
  const x2 = right(r) - 1, y2 = bottom(r) - 1;
  const slotX = () => slottedAxisPoint(r.x, r.w, slot, port);
  const slotY = () => slottedAxisPoint(r.y, r.h, slot, port);
  // The arrival half of the same problem: a path aimed `to db.W` measures its
  // distance to this point, so a bounding-box answer stops the arrowhead short
  // of a diamond by exactly the amount the symbol is inset there.
  const inset = (along) => inkwardOffset(r, shape, style, name, along);
  switch (name) {
    case 'N': { const x = slotX(); return { x, y: r.y + inset(x) }; }
    case 'S': { const x = slotX(); return { x, y: y2 - inset(x) }; }
    case 'W': { const y = slotY(); return { x: r.x + inset(y), y }; }
    case 'E': { const y = slotY(); return { x: x2 - inset(y), y }; }
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
