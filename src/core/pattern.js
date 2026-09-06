/**
 * Stroke patterns — rhythm along a path, as opposed to density across a region.
 *
 * TurtlePen had no dashed line at all. A projected trendline, a leader, an
 * inferred boundary — anything a reader should understand as "not measured" —
 * had to be faked mark by mark, which meant the intent lived in the author's
 * head rather than in the document.
 *
 * This shares a mechanism with `tone.js` and not a meaning:
 *
 *   tone     removes quadrants by POSITION ON THE LATTICE, so two toned shapes
 *            tile seamlessly and the texture is a property of the surface.
 *   pattern  removes quadrants by POSITION ALONG THE PATH, so a dash keeps its
 *            rhythm around a corner and reads as one broken line.
 *
 * Keying a dash to the lattice instead would restart the rhythm at every turn
 * and produce a line that looks damaged rather than dashed.
 */

export const PATTERNS = Object.freeze(['dashed', 'dotted']);

/** on/off run lengths, in quadrants, along the path. */
const CYCLES = Object.freeze({
  dashed: { on: 3, off: 2 },
  dotted: { on: 1, off: 1 },
});

export function normalizePattern(value, what = 'pattern') {
  if (value == null) return null;
  if (!PATTERNS.includes(value)) {
    throw new SyntaxError(`${what} must be one of ${PATTERNS.join(', ')} — got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Filter a path's pieces into a dashed or dotted rhythm.
 *
 * Pieces arrive in the order the pen drew them, which is what makes this
 * possible at all: the index IS the distance travelled, so the cycle survives
 * corners without any geometry needing to be recomputed.
 */
/**
 * Pieces a pattern must never delete.
 *
 * A dash pattern is a property of the LINE. An arrowhead says which way the
 * path travels and that it arrived; a hop says a crossing was deliberate; a
 * corner is where the path changes track. Dropping any of them does not style
 * the connector, it changes what the connector claims.
 *
 * This was found by two dashed runs in the showcase pipeline that reported
 * `L008` and `L016` — drawn correctly to their targets, then truncated by a
 * style, with whether it happened at all depending on how many quadrants long
 * the run happened to be.
 */
const STRUCTURAL = new Set(['arrow', 'hop', 'corner']);

export function patternMask(quads, pattern, offset = 0) {
  if (!Number.isSafeInteger(offset)) throw new RangeError('pattern offset must be an integer in quadrants');
  const p = normalizePattern(pattern);
  if (!p) return quads;
  const { on, off } = CYCLES[p];
  const period = on + off;
  return quads.filter((q, i) => STRUCTURAL.has(q.type) || ((i + offset) % period + period) % period < on);
}
