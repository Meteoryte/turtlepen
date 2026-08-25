/**
 * TurtleFont — a stroke font that lives on the lattice.
 *
 * WHY THIS EXISTS. Text was the only mark in this engine that escaped the
 * quadrant grid. Everything else — boxes, connectors, artwork, dithered images
 * — is a set of integer quadrants that the collision engine can see, measure
 * and complain about. A label was an SVG `<text>` element: it rendered at
 * whatever the viewer's font stack produced, it could not be inked into a
 * plotter path, and `core/text.js` had to PREDICT its width rather than know
 * it. TurtleFont closes that hole. A glyph drawn here is quadrants, exactly
 * like a line is quadrants, and the collision engine sees it as ink.
 *
 * IT IS A DISPLAY FACE, AND THAT IS NOT A COMPROMISE — it is arithmetic. A
 * quadrant is 5px. A stroke glyph needs about six rows before the difference
 * between `a` and `o` survives rasterisation, so cap height is 6 quadrants =
 * 30px. Anything smaller is a pixel font, not a stroke font, and the honest
 * place for 11px body text remains `<text>`. Use this for titles, callouts,
 * plotter output, and any drawing where the words have to be real ink.
 *
 * SCALING IS BY WHOLE MULTIPLES ONLY. The alternative is interpolating glyph
 * coordinates, which produces fractional quadrants, which is the one thing
 * this engine does not do. `scale: 2` is exact; `scale: 1.5` is refused.
 *
 * MEASUREMENT AND RENDERING ARE THE SAME CALL. `measureStrokeText` runs the
 * same code as `renderStrokeText` and reports the bounds of the quadrants it
 * produced. There is no second implementation that could drift — which is the
 * exact bug `core/text.js` exists to prevent for SVG text, applied to the
 * replacement.
 */

import { rayQuads } from './raster.js';
import {
  GLYPHS, MARKS, COMPOSED, LATIN_EXTRA, GREEK, GREEK_ALIAS, CYRILLIC, CYRILLIC_ALIAS, MATH_ALIAS,
} from './turtlefont-glyphs.js';

/**
 * The vertical design, in quadrants above the baseline.
 *
 * `ascent` and `descent` are FIXED rather than measured from the characters
 * present. Two labels at the same scale must occupy the same height whether or
 * not one of them happens to contain a `y` or an `Ä`, otherwise a row of boxes
 * built from measurements comes out ragged.
 */
export const METRICS = Object.freeze({
  baseline: 0,
  xHeight: 4,
  capHeight: 6,
  ascender: 6,
  descender: -2,
  accentCeiling: 8,
  /** Above and below the baseline that a line of text always reserves. */
  ascent: 8,
  descent: 2,
  /** Blank quadrants between one line's descent and the next line's ascent. */
  lineGap: 2,
  /** Added to each glyph's drawing width to get its advance. */
  sideBearing: 2,
  /** Extra quadrants between glyphs, on top of the advance. */
  tracking: 0,
});

/** Height of one line of stroke text, in quadrants, before any line gap. */
export const LINE_HEIGHT = METRICS.ascent + METRICS.descent;
/** Baseline-to-baseline distance, in quadrants. */
export const LINE_ADVANCE = LINE_HEIGHT + METRICS.lineGap;

/** Every drawn glyph table, merged once. Later tables never shadow earlier ones. */
const DRAWN = new Map();
for (const table of [GLYPHS, LATIN_EXTRA, GREEK, CYRILLIC]) {
  for (const [ch, data] of Object.entries(table)) {
    if (!DRAWN.has(ch)) DRAWN.set(ch, data);
  }
}

/** Characters that ARE another character's drawing. */
const ALIAS = new Map([
  ...Object.entries(GREEK_ALIAS),
  ...Object.entries(CYRILLIC_ALIAS),
  ...Object.entries(MATH_ALIAS),
]);

/** Parse `"0,0 2,6 4,0"` into points. Done once per glyph, then cached. */
function parseStroke(source) {
  return source.split(' ').filter(Boolean).map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new SyntaxError(`turtlefont: "${pair}" is not a whole-quadrant point`);
    }
    return { x, y };
  });
}

const cache = new Map();

/**
 * The drawing for one character: its width, its advance, and its strokes in
 * glyph space (x right from the origin, y UP from the baseline).
 *
 * Returns null for a character the font does not have. Callers decide what to
 * do about that; this does not invent a shape or quietly return a blank, both
 * of which turn a missing glyph into a silent hole in a sentence.
 */
export function glyph(ch) {
  if (cache.has(ch)) return cache.get(ch);

  const resolved = ALIAS.get(ch) ?? ch;
  let built = null;

  if (DRAWN.has(resolved)) {
    const [width, ...strokes] = DRAWN.get(resolved);
    built = { ch, width, advance: width + METRICS.sideBearing, strokes: strokes.map(parseStroke) };
  } else if (COMPOSED[resolved]) {
    const { base, mark } = COMPOSED[resolved];
    const under = glyph(base);
    if (!under) throw new Error(`turtlefont: "${resolved}" is composed from "${base}", which is not drawn`);
    const strokes = [...under.strokes];
    let width = under.width;
    if (mark) {
      const [markWidth, ...markStrokes] = MARKS[mark];
      if (!markStrokes.length) throw new Error(`turtlefont: mark "${mark}" draws nothing`);
      // Centre the mark over the letter, on whole quadrants. A half-quadrant
      // offset is not available, so an even letter under an odd mark leans one
      // quadrant left — which is what a type designer would do by hand anyway.
      const dx = Math.max(0, Math.floor((under.width - markWidth) / 2));
      for (const s of markStrokes) strokes.push(parseStroke(s).map((p) => ({ x: p.x + dx, y: p.y })));
      // A mark WIDER than its letter widens the glyph. Centring a two-quadrant
      // diaeresis over a dotless i is otherwise a negative offset, and the
      // accent hangs off the left of its own advance and onto the letter before.
      width = Math.max(under.width, markWidth + dx);
    }
    built = { ch, width, advance: width + METRICS.sideBearing, strokes };
  }

  cache.set(ch, built);
  return built;
}

/** Is this character drawable? */
export const hasGlyph = (ch) => glyph(ch) !== null;

/** Every character the font can draw, sorted by code point. */
export function coverage() {
  const all = new Set([
    ...DRAWN.keys(), ...ALIAS.keys(), ...Object.keys(COMPOSED),
  ]);
  return [...all].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

/** The characters in `text` this font cannot draw, in order, without repeats. */
export function missingFrom(text) {
  const out = [];
  for (const ch of String(text)) {
    if (ch === '\n' || ch === '\t') continue;
    if (!hasGlyph(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

const assertScale = (scale) => {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError(
      `turtlefont scale must be a whole number of 1 or more — got ${JSON.stringify(scale)}. `
      + 'Fractional scaling would put glyph points between quadrants, and this engine has no '
      + 'coordinate there. Scale the drawing, or use SVG text for a size this face cannot hold.',
    );
  }
  return scale;
};

/** Advance width of one line of text, in quadrants, at a given scale. */
function lineAdvanceWidth(chars, scale, tracking) {
  let w = 0;
  for (const ch of chars) w += glyph(ch).advance * scale + tracking;
  return Math.max(0, w - tracking);
}

/**
 * Break `text` into lines: on every newline always, and on width if asked.
 *
 * Wrapping is greedy and breaks between words. A single word longer than the
 * limit is NOT broken mid-word — it overhangs, and the overhang is reported,
 * because silently hyphenating a part number is worse than a wide label.
 */
function toLines(text, { scale, tracking, maxWidth }) {
  const expanded = String(text).replace(/\t/g, '    ');
  const paragraphs = expanded.split('\n');
  if (!maxWidth) return paragraphs.map((p) => [...p]);

  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let current = [];
    for (const word of words) {
      const candidate = current.length ? [...current, ' ', ...word] : [...word];
      if (current.length && lineAdvanceWidth(candidate, scale, tracking) > maxWidth) {
        lines.push(current);
        current = [...word];
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Draw text as quadrants.
 *
 * `at` is the top-left of the text BLOCK in lattice quadrants — the same corner
 * a box is placed by — so a caller never has to reason about where a baseline
 * ends up. Glyph space is y-up from the baseline; lattice space is y-down from
 * the top. That translation happens here, once.
 *
 * Returns the quadrants plus the block's exact geometry. `measureStrokeText`
 * calls this and throws the quadrants away, so the two can never disagree.
 */
export function renderStrokeText(text, {
  at = { x: 0, y: 0 },
  scale = 1,
  tracking = METRICS.tracking,
  maxWidth = null,
  align = 'left',
  rotate = 0,
  weight = null,
} = {}) {
  assertScale(scale);
  assertRotation(rotate);
  // The pen is as thick as the glyph is big, unless a caller says otherwise.
  // Anything else scales the skeleton without scaling the mark that draws it,
  // which is how a dot came to be a solid block beside a hairline stem.
  const pen = weight ?? scale;
  if (!Number.isInteger(pen) || pen < 1) {
    throw new RangeError(`turtlefont weight must be a whole number of quadrants, 1 or more — got ${JSON.stringify(weight)}`);
  }
  if (!['left', 'center', 'right'].includes(align)) {
    throw new SyntaxError(`turtlefont align must be left, center or right — got ${JSON.stringify(align)}`);
  }
  const missing = missingFrom(text);
  if (missing.length) {
    throw new Error(
      `turtlefont cannot draw ${missing.map((c) => JSON.stringify(c)).join(', ')}. `
      + 'A missing glyph is a hole in a sentence, so it is refused rather than skipped. '
      + 'Check with missingFrom() first, or use SVG text for this string.',
    );
  }

  const lines = toLines(text, { scale, tracking, maxWidth });
  const widths = lines.map((chars) => lineAdvanceWidth(chars, scale, tracking));
  const blockWidth = Math.max(0, ...widths);

  const quads = new Set();
  const lineAdvance = LINE_ADVANCE * scale;
  const ascent = METRICS.ascent * scale;

  lines.forEach((chars, row) => {
    // The baseline for this line, in lattice quadrants, measured DOWN.
    const baseline = row * lineAdvance + ascent;
    const slack = blockWidth - widths[row];
    const indent = align === 'center' ? Math.floor(slack / 2) : align === 'right' ? slack : 0;
    let penX = indent;

    for (const ch of chars) {
      const g = glyph(ch);
      for (const stroke of g.strokes) {
        if (stroke.length === 1) {
          // A one-point stroke is a dot: a tittle, a full stop, a diaeresis.
          // It is one mark of the pen, exactly like the end of any other
          // stroke — it used to be special-cased into a filled square of the
          // scale, which made it heavier than everything around it and hung it
          // down and to the right of where it belonged.
          const p = stroke[0];
          quads.add(`${penX + p.x * scale},${baseline - p.y * scale}`);
          continue;
        }
        for (let i = 0; i + 1 < stroke.length; i++) {
          const a = stroke[i];
          const b = stroke[i + 1];
          for (const q of rayQuads(
            penX + a.x * scale, baseline - a.y * scale,
            penX + b.x * scale, baseline - b.y * scale,
          )) {
            quads.add(`${q.x},${q.y}`);
          }
        }
      }
      penX += g.advance * scale + tracking;
    }
  });

  // Ink the skeleton with a pen `pen` quadrants square. Every mark grows the
  // same way, so a dot lands squarely on the stem it belongs to instead of
  // beside it.
  const inked = pen > 1 ? thicken(quads, pen) : quads;

  // Two different true numbers, kept apart on purpose. The BLOCK is the advance
  // box: where the next character would start, exactly proportional to the
  // scale. The PEN box is what the drawing actually occupies, which is the
  // block plus however far the pen overhangs the last skeleton point. Sizing a
  // container against the advance box alone under-reserves by the pen width.
  const blockHeight = lines.length * LINE_HEIGHT * scale + (lines.length - 1) * METRICS.lineGap * scale;
  const penWidth = blockWidth + pen - 1;
  const penHeight = blockHeight + pen - 1;
  const turned = rotate ? turnQuads(inked, rotate, penWidth, penHeight) : inked;

  const pieces = [...turned].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x: x + at.x, y: y + at.y };
  }).sort((p, q) => p.y - q.y || p.x - q.x);

  // A quarter turn swaps the block's two dimensions, which is the whole reason
  // a caller asked for one.
  const quarter = rotate === 90 || rotate === 270;

  return {
    pieces,
    lines: lines.length,
    lineWidths: widths,
    // The reserved block, which is what a caller should size a box against. It
    // does not shrink because a line happens to have no descender.
    width: quarter ? blockHeight : blockWidth,
    height: quarter ? blockWidth : blockHeight,
    // What the ink needs. Size boxes against these.
    penWidth: quarter ? penHeight : penWidth,
    penHeight: quarter ? penWidth : penHeight,
    rotate,
    // Where the ink actually landed, which is usually smaller.
    inked: pieces.length ? bounds(pieces) : null,
    overflowed: maxWidth ? widths.some((w) => w > maxWidth) : false,
    scale,
    weight: pen,
  };
}

const ROTATIONS = Object.freeze([0, 90, 180, 270]);

/**
 * Only quarter turns.
 *
 * A quarter turn is exact on a square lattice: every quadrant maps onto another
 * quadrant, and nothing has to be rounded. Any other angle sends the corners of
 * a cell to points that are not cells, so it would have to invent coordinates —
 * which is the one thing this engine does not do. Rotate the finished SVG if
 * you need 30 degrees; do not ask the lattice to pretend.
 */
function assertRotation(deg) {
  if (!ROTATIONS.includes(deg)) {
    throw new RangeError(
      `turtlefont rotate must be one of ${ROTATIONS.join(', ')} — got ${JSON.stringify(deg)}. `
      + 'Only quarter turns land back on the lattice; any other angle would need fractional quadrants.',
    );
  }
  return deg;
}

/** Turn a set of quadrant keys about the block's own top-left corner. */
function turnQuads(quads, deg, w, h) {
  const out = new Set();
  for (const key of quads) {
    const [x, y] = key.split(',').map(Number);
    if (deg === 90) out.add(`${h - 1 - y},${x}`);
    else if (deg === 180) out.add(`${w - 1 - x},${h - 1 - y}`);
    else out.add(`${y},${w - 1 - x}`);
  }
  return out;
}

/**
 * Draw the skeleton with a square pen.
 *
 * Every mark grows down and right from its own point, which is the same
 * direction the coordinate mapping already grows: glyph x maps to lattice
 * x * scale, so a glyph cell occupies the quadrants from there. Growing marks
 * consistently is what makes a tittle sit over its stem rather than beside it.
 */
function thicken(quads, pen) {
  const out = new Set();
  for (const key of quads) {
    const [x, y] = key.split(',').map(Number);
    for (let dy = 0; dy < pen; dy++) {
      for (let dx = 0; dx < pen; dx++) out.add(`${x + dx},${y + dy}`);
    }
  }
  return out;
}

function bounds(pieces) {
  const xs = pieces.map((p) => p.x);
  const ys = pieces.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/**
 * Measure stroke text without drawing it.
 *
 * Same call, same numbers — this exists so the intent reads correctly at the
 * call site, not because there is a second implementation.
 */
export function measureStrokeText(text, options = {}) {
  const { pieces, ...rest } = renderStrokeText(text, { ...options, at: { x: 0, y: 0 } });
  return { ...rest, quadrants: pieces.length };
}

/** Cells a stroke-text block needs, for sizing a box around it. */
export function requiredCellsForStrokeText(text, options = {}) {
  const m = measureStrokeText(text, options);
  const padding = 2; // one quadrant of breathing room each side
  return {
    // Sized against the PEN box: the advance box does not include the width of
    // the mark that draws the last stroke.
    cellsWide: Math.ceil((m.penWidth + padding * 2) / 2),
    cellsTall: Math.ceil((m.penHeight + padding * 2) / 2),
    width: m.penWidth,
    height: m.penHeight,
    lines: m.lines,
  };
}

/**
 * Look at ONE glyph, without rendering a sheet of four hundred.
 *
 * This exists because of a mistake. Asked to redraw the lowercase `a`, I wrote
 * a different stroke list, compared it on a variant sheet, picked a winner, and
 * shipped nothing at all: the two lists rasterised to identical quadrants. The
 * only reason it surfaced was that the exported SVG came out byte-for-byte
 * identical to the previous commit.
 *
 * So this returns the INK — a picture of it, and a fingerprint of it. Two
 * drawings with the same fingerprint are the same drawing, whatever the source
 * says. `picture` is deliberately readable in a terminal: an agent editing a
 * glyph can see the result without rendering, opening and screenshotting an
 * SVG, which was the four-step loop this replaces.
 */
export function inspectGlyph(ch) {
  const g = glyph(ch);
  if (!g) return null;

  const resolved = ALIAS.get(ch) ?? ch;
  let source = 'drawn';
  if (ALIAS.has(ch)) source = `alias of ${JSON.stringify(resolved)}`;
  else if (COMPOSED[resolved]) {
    const { base, mark } = COMPOSED[resolved];
    source = `composed: ${JSON.stringify(base)} + ${mark}`;
  }

  // Glyph space is y-up from the baseline; the picture is drawn top-down, from
  // the accent ceiling to the bottom of the descender, so it reads like type.
  const top = METRICS.accentCeiling;
  const bottom = -METRICS.descent;
  const ink = new Set();
  for (const stroke of g.strokes) {
    if (stroke.length === 1) { ink.add(`${stroke[0].x},${stroke[0].y}`); continue; }
    for (let i = 0; i + 1 < stroke.length; i++) {
      for (const q of rayQuads(stroke[i].x, -stroke[i].y, stroke[i + 1].x, -stroke[i + 1].y)) {
        ink.add(`${q.x},${-q.y}`);
      }
    }
  }

  const rows = [];
  for (let y = top; y >= bottom; y--) {
    let row = '';
    for (let x = 0; x <= g.advance; x++) row += ink.has(`${x},${y}`) ? '#' : (x <= g.width ? '.' : ' ');
    const rule = y === 0 ? ' <- baseline'
      : y === METRICS.xHeight ? ' <- x-height'
        : y === METRICS.capHeight ? ' <- cap'
          : '';
    rows.push(`${String(y).padStart(2)} |${row}|${rule}`);
  }

  return {
    char: ch,
    codePoint: `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    source,
    width: g.width,
    advance: g.advance,
    strokes: g.strokes.length,
    quadrants: ink.size,
    // Two glyphs with one fingerprint ARE one drawing. This is the check that
    // tells an edit apart from a no-op.
    fingerprint: fingerprintOfInk(ink),
    picture: rows.join('\n'),
  };
}

/** A short, stable hash of an ink set. Order-independent by construction. */
function fingerprintOfInk(ink) {
  let h = 0x811c9dc5;
  for (const key of [...ink].sort()) {
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}
