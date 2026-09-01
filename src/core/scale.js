/**
 * Scales — the missing primitive under every quantitative diagram.
 *
 * A bar chart, a Sankey, a treemap and a scatter plot all rest on one idea the
 * lattice had no word for: a mapping from a NUMBER to a DISTANCE. Without it an
 * author computes each bar's height by hand, the arithmetic is nowhere in the
 * document, and the engine cannot tell a correct chart from one that contradicts
 * its own data. That is the worst failure a chart has, and it was the one thing
 * here nothing could see.
 *
 * A declared scale changes what is knowable. The value is authored fact, the
 * geometry is authored fact, and the mapping between them is authored fact — so
 * "this bar is the wrong height for its number" becomes decidable, which is the
 * bar every rule in this engine has to clear.
 *
 * ROUNDING IS REPORTED, NEVER ABSORBED. A domain rarely divides evenly into
 * whole quadrants, so `project` returns the exact quadrant it landed on AND the
 * error it could not represent. The engine never quietly moves a mark to make
 * the numbers work; that is the same commitment `rect()` makes by throwing on a
 * fraction rather than rounding one.
 */

/** Scale kinds. `magnitude` is length-encoded, so its baseline is load-bearing. */
export const SCALE_KINDS = Object.freeze(['magnitude', 'position']);
export const VALUE_AXES = Object.freeze(['x', 'y']);

export function assertScaleId(id) {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(String(id))) {
    throw new SyntaxError(`scale id ${JSON.stringify(id)} must be non-empty and alphanumeric (dashes and underscores allowed)`);
  }
  return String(id);
}

export function assertScaleKind(kind) {
  if (!SCALE_KINDS.includes(kind)) {
    throw new SyntaxError(`unknown scale kind "${kind}" — expected one of ${SCALE_KINDS.join(', ')}`);
  }
  return kind;
}

/**
 * Declare a scale.
 *
 * @param {string} id
 * @param {{ domain: [number, number], quads: number, kind?: string }} spec
 *        `domain` is the data range; `quads` is how many whole quadrants the
 *        full domain is allowed to occupy.
 */
export function defineScale(id, { domain, quads, kind = 'magnitude' }) {
  id = assertScaleId(id);
  if (!Array.isArray(domain) || domain.length !== 2 || !domain.every(Number.isFinite)) {
    throw new SyntaxError(`scale "${id}": domain must be two finite numbers`);
  }
  const [lo, hi] = domain;
  if (hi === lo) throw new RangeError(`scale "${id}": domain has no extent (${lo}..${hi})`);
  if (!Number.isInteger(quads) || quads < 1) {
    throw new RangeError(`scale "${id}": quads must be a positive whole number of quadrants`);
  }
  return { id, domain: [lo, hi], quads, kind: assertScaleKind(kind) };
}

/**
 * A value binding currently means one exact thing: the length of a rectangular
 * mark along x or y. Position, area and ribbon-width encodings need different
 * geometry and are deliberately not smuggled through this shape.
 */
export function normalizeValueBinding(binding, what = 'value binding') {
  if (binding == null) return null;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new TypeError(`${what} must be { scale, value, axis } or null`);
  }
  const unknown = Object.keys(binding).filter((key) => !['scale', 'value', 'axis'].includes(key));
  if (unknown.length) throw new SyntaxError(`${what} has unknown field${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}`);
  const scale = assertScaleId(binding.scale);
  if (!Number.isFinite(binding.value)) throw new TypeError(`${what} value must be a finite number`);
  if (!VALUE_AXES.includes(binding.axis)) {
    throw new SyntaxError(`${what} axis must be ${VALUE_AXES.join(' or ')} — got ${JSON.stringify(binding.axis)}`);
  }
  return { scale, value: binding.value, axis: binding.axis };
}

/**
 * Project a value onto the lattice.
 *
 * Returns the whole quadrant the value lands on, and `residual` — the fraction
 * of a quadrant that could not be represented. A caller that wants an exact
 * chart raises `quads` until the residuals reach zero; a caller that does not
 * care still cannot pretend the error is absent, because it is in the result.
 */
export function project(scale, value) {
  if (!Number.isFinite(value)) throw new SyntaxError(`scale "${scale.id}": value must be finite`);
  const [lo, hi] = scale.domain;
  const t = (value - lo) / (hi - lo);
  const exact = t * scale.quads;
  const quads = Math.round(exact);
  return {
    quads,
    exact,
    residual: Math.abs(exact - quads),
    // Outside the declared domain the mapping is an extrapolation, not a
    // reading. Said plainly rather than clamped, because a clamped bar is a
    // wrong bar that looks right.
    inDomain: value >= Math.min(lo, hi) && value <= Math.max(lo, hi),
  };
}

/**
 * The value a given extent claims — `project` run backwards.
 *
 * This is what makes a mark checkable. The engine reads the geometry the author
 * drew, converts it back through the same scale, and compares it with the value
 * the author declared. Two independent statements about the same thing, which
 * is the only arrangement in which one can be found to be wrong.
 */
export function readBack(scale, quads) {
  const [lo, hi] = scale.domain;
  return lo + (quads / scale.quads) * (hi - lo);
}

/**
 * A magnitude scale that does not start at zero encodes a difference as a
 * ratio it does not have.
 *
 * The classic misleading chart: bars from 90 to 100 make 91 look ten times 90.
 * It is decidable from authored fact — the domain is written down — so it is a
 * finding rather than advice. Position scales are exempt: a scatter axis has no
 * obligation to include zero, and demanding it would be wrong.
 */
export function baselineIsTruncated(scale) {
  // Length is measured from the first domain value. Zero therefore has to be
  // that endpoint; merely appearing elsewhere in the domain is not enough.
  return scale.kind === 'magnitude' && scale.domain[0] !== 0;
}
