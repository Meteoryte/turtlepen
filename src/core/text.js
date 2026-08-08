/**
 * Text measurement — the reason this project exists.
 *
 * The failure this engine is built to eliminate: an AI chooses a box size,
 * then text is measured later, in the renderer, and overflows. Here measurement
 * happens BEFORE placement and is owned by the engine, so "does this label fit"
 * is a computed fact the AI can act on rather than a visual accident.
 *
 * The model is monospace: every glyph advances by the same width, so capacity
 * is countable. At the default 10px font the advance is 6px, which means a
 * 12-cell-wide box holds floor((120 - 10) / 6) = 18 characters per line. That
 * is arithmetic an AI can do reliably in its head, which is the whole point.
 *
 * Parity with the renderer is enforced structurally, not by convention: the SVG
 * renderer emits textLength + lengthAdjust on every run, so the browser is
 * REQUIRED to fit the glyphs into exactly the width measured here. If a font
 * substitutes, spacing goes slightly loose or tight — but the text can never
 * overflow the box the engine measured, which is the guarantee that matters.
 */

import { PX_PER_QUAD, PX_PER_CELL } from './geometry.js';

export const DEFAULT_FONT = Object.freeze({
  family: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace',
  size: 10,
  advanceRatio: 0.6,
  /** Padding inside a box, in quadrants, on every side. */
  paddingQuads: 1,
});

/** Legibility floor. Below this, a label is flagged rather than silently drawn. */
export const MIN_LEGIBLE_FONT_PX = 8;

/**
 * A named size scale, so an AI picks a role rather than inventing a pixel value.
 *
 * Every entry sits at or above the legibility floor, and every one produces a
 * line height that snaps cleanly onto the 5px lattice through `lineHeightFor`.
 * Naming the sizes is what keeps a diagram internally consistent: "heading"
 * means the same thing in two documents written a month apart, where 13px and
 * 14px do not.
 */
export const FONT_SCALE = Object.freeze({ caption: 8, body: 10, heading: 14, title: 20 });

/**
 * Accept either a number or a scale name. Normalised HERE, in core, so the same
 * value means the same thing as a tool argument, as a plan operation, and as a
 * direct call — the lesson `normalizeSpan` already learned the hard way.
 *
 * An unknown name throws rather than falling back to the default: silently
 * sizing text to something the caller did not ask for is the class of bug this
 * whole engine exists to eliminate.
 */
export function resolveFontSize(value) {
  if (value == null) return DEFAULT_FONT.size;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`font size ${value} is not a positive number`);
    return value;
  }
  const name = String(value).toLowerCase();
  if (name in FONT_SCALE) return FONT_SCALE[name];
  if (/^\d+$/.test(name)) return Number(name);
  throw new SyntaxError(
    `unknown font size "${value}" — expected a number or one of ${Object.keys(FONT_SCALE).join(', ')} (${Object.entries(FONT_SCALE).map(([k, v]) => `${k}=${v}px`).join(', ')})`,
  );
}

/** Advance width of one character, in whole pixels. */
export function advanceWidth(fontSize, ratio = DEFAULT_FONT.advanceRatio) {
  return Math.round(fontSize * ratio);
}

/** Line height, rounded up to the 5px lattice so multi-line text stays exact. */
export function lineHeightFor(fontSize) {
  return Math.ceil((fontSize * 1.4) / PX_PER_QUAD) * PX_PER_QUAD;
}

/**
 * Greedy word wrap at a character budget. Words longer than the budget are hard
 * broken rather than silently overflowing — an over-long word is reported as a
 * separate finding by the collision engine.
 * @returns {{lines:string[], hardBroken:boolean, longestWord:number}}
 */
export function wrapText(text, maxChars) {
  const source = String(text ?? '');
  if (maxChars <= 0) return { lines: source ? [source] : [], hardBroken: true, longestWord: source.length };
  const lines = [];
  let hardBroken = false;
  let longestWord = 0;

  for (const paragraph of source.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let current = '';
    for (let word of words) {
      longestWord = Math.max(longestWord, word.length);
      while (word.length > maxChars) {
        hardBroken = true;
        if (current) { lines.push(current); current = ''; }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!current) current = word;
      else if (current.length + 1 + word.length <= maxChars) current += ' ' + word;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return { lines: lines.length ? lines : [''], hardBroken, longestWord };
}

/**
 * Measure text against an available width in pixels.
 * @returns {{advance:number,lineHeight:number,maxChars:number,lines:string[],
 *            widthPx:number,heightPx:number,hardBroken:boolean,longestWord:number}}
 */
export function measureText(text, { fontSize = DEFAULT_FONT.size, availableWidthPx = Infinity, advanceRatio } = {}) {
  const advance = advanceWidth(fontSize, advanceRatio ?? DEFAULT_FONT.advanceRatio);
  const lineHeight = lineHeightFor(fontSize);
  const maxChars = Number.isFinite(availableWidthPx) ? Math.floor(availableWidthPx / advance) : Infinity;
  const { lines, hardBroken, longestWord } = wrapText(text, maxChars);
  const widest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return {
    advance,
    lineHeight,
    maxChars: Number.isFinite(maxChars) ? maxChars : widest,
    lines,
    widthPx: widest * advance,
    heightPx: lines.length * lineHeight,
    hardBroken,
    longestWord,
  };
}

/**
 * How many cells wide/tall a label needs — the number the AI actually wants
 * when it is deciding a box size before placing anything.
 */
export function requiredCellsFor(text, { fontSize = DEFAULT_FONT.size, maxWidthCells = null, paddingQuads = DEFAULT_FONT.paddingQuads, advanceRatio } = {}) {
  // The ratio has to travel with the size. It used to be dropped here, so a
  // caller that set one sized every box against the 0.6 default instead — the
  // measurement was wrong before placement, which is the one thing this module
  // exists to prevent.
  const advance = advanceWidth(fontSize, advanceRatio ?? DEFAULT_FONT.advanceRatio);
  const padPx = paddingQuads * PX_PER_QUAD * 2;
  if (maxWidthCells == null) {
    const m = measureText(text, { fontSize, advanceRatio });
    return {
      cellsWide: Math.ceil((m.widthPx + padPx) / PX_PER_CELL),
      cellsTall: Math.ceil((m.heightPx + padPx) / PX_PER_CELL),
      lines: m.lines.length,
      charsPerLine: m.maxChars,
      advance,
    };
  }
  const inner = maxWidthCells * PX_PER_CELL - padPx;
  const m = measureText(text, { fontSize, availableWidthPx: inner, advanceRatio });
  return {
    cellsWide: maxWidthCells,
    cellsTall: Math.ceil((m.heightPx + padPx) / PX_PER_CELL),
    lines: m.lines.length,
    charsPerLine: m.maxChars,
    advance,
  };
}

/**
 * Does this label fit this box? Returns the shortfall in both axes plus
 * concrete, numeric fixes. Nothing here mutates anything — per the design,
 * the engine measures and reports, and the AI decides.
 *
 * @param {string} text
 * @param {{w:number,h:number}} boxRect  in quadrants
 */
export function fitReport(text, boxRect, { fontSize = DEFAULT_FONT.size, paddingQuads = DEFAULT_FONT.paddingQuads, align = 'left', advanceRatio } = {}) {
  const padPx = paddingQuads * PX_PER_QUAD * 2;
  const innerW = boxRect.w * PX_PER_QUAD - padPx;
  const innerH = boxRect.h * PX_PER_QUAD - padPx;
  const m = measureText(text, { fontSize, availableWidthPx: Math.max(innerW, 0), advanceRatio });

  const widthOverflowPx = Math.max(0, m.longestWord * m.advance - innerW);
  const heightOverflowPx = Math.max(0, m.heightPx - innerH);
  const visibleLines = Math.max(0, Math.floor(innerH / m.lineHeight));

  const fixes = [];
  if (widthOverflowPx > 0) {
    const needCells = Math.ceil((m.longestWord * m.advance + padPx) / PX_PER_CELL);
    fixes.push({ kind: 'widen', to: needCells, description: `widen box to ${needCells} cells so the longest word "${longestWordOf(text)}" fits` });
  }
  if (heightOverflowPx > 0) {
    const needCells = Math.ceil((m.heightPx + padPx) / PX_PER_CELL);
    fixes.push({ kind: 'heighten', to: needCells, description: `heighten box to ${needCells} cells to hold ${m.lines.length} lines` });
    const widerCells = Math.ceil(((m.lines.join(' ').length * m.advance) / Math.max(1, visibleLines) + padPx) / PX_PER_CELL);
    fixes.push({ kind: 'widen', to: widerCells, description: `or widen box to ~${widerCells} cells so the text wraps into ${visibleLines || 1} line(s)` });
  }
  if (widthOverflowPx > 0 || heightOverflowPx > 0) {
    const budget = Math.max(0, visibleLines) * Math.max(0, m.maxChars);
    if (budget > 0) fixes.push({ kind: 'shorten', to: budget, description: `or shorten the label to ${budget} characters` });
  }

  // Centring leaves a leftover pixel whenever the interior and the measured run
  // differ by an odd amount. It has to go on one side, so it goes on the left —
  // deterministically, and reported. The renderer used to Math.round its way
  // through this, which meant the drawing could disagree with this report by a
  // pixel and neither of them said so.
  const leftover = Math.max(0, innerW - m.widthPx);
  const centerBiasPx = align === 'center' ? leftover % 2 : 0;

  return {
    fits: widthOverflowPx === 0 && heightOverflowPx === 0,
    fontSize,
    align,
    centerBiasPx,
    advance: m.advance,
    lineHeight: m.lineHeight,
    charsPerLine: m.maxChars,
    lines: m.lines,
    lineCount: m.lines.length,
    visibleLines,
    clippedLines: Math.max(0, m.lines.length - visibleLines),
    innerWidthPx: innerW,
    innerHeightPx: innerH,
    measuredWidthPx: m.widthPx,
    measuredHeightPx: m.heightPx,
    widthOverflowPx,
    heightOverflowPx,
    hardBroken: m.hardBroken,
    fixes,
  };
}

function longestWordOf(text) {
  return String(text ?? '').split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
}
