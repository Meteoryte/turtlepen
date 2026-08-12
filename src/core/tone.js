/**
 * Tone — density for artwork you DRAW, as opposed to an image you place.
 *
 * `dither.js` already turns a photograph into quadrants through an ordered
 * matrix, but it is reachable only from `place_image`. A drawn path had exactly
 * two densities: inked, or not. Authors needing a half tone hand-rolled a
 * checkerboard in a generator script instead, which is how the same matrix ends
 * up implemented twice, worse the second time.
 *
 * The two knobs are deliberately NOT the same knob:
 *
 *   tone     changes what is INKED — a 50% shape inks half its quadrants, so it
 *            claims half, and collision stays honest about what is really there.
 *   opacity  changes how the SAME geometry is painted; the element still claims
 *            every quadrant it did at full strength, which is exactly what L019
 *            exists to catch.
 *
 * Merging them would make L019 unenforceable: a caller could dodge it simply by
 * spelling the fade the other way.
 */
import { BAYER_4 } from './dither.js';

const BAYER_N = 4;
const BAYER_LEVELS = BAYER_N * BAYER_N;

/**
 * The lowest density the 4x4 matrix can express. Below it NOTHING inks, so the
 * value does not describe a faint element — it describes an invisible one that
 * still claims its quadrants. Rejecting that is cheaper than detecting it, and
 * mirrors how `assertOpacity` rejects below MIN_OPACITY rather than letting a
 * document be built in a state a rule then has to complain about.
 */
export const MIN_TONE = 1 / BAYER_LEVELS;

export const TONE_STEPS = Object.freeze({
  quarter: 0.25,
  half: 0.5,
  'three-quarter': 0.75,
  solid: 1,
});

export const TEXTURES = Object.freeze(['eroded']);

/**
 * Accepts a number or a named step, because an operation must mean the same
 * thing called directly, invoked as a tool, or rehearsed inside a plan.
 */
export function normalizeTone(value, what = 'tone') {
  if (value == null) return 1;
  if (typeof value === 'string') {
    const step = TONE_STEPS[value.toLowerCase()];
    if (step == null) {
      throw new SyntaxError(
        `${what} must be a number or one of ${Object.keys(TONE_STEPS).join(', ')} — got ${JSON.stringify(value)}`,
      );
    }
    return step;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_TONE || value > 1) {
    throw new RangeError(
      `${what} must be a number between ${MIN_TONE} and 1, or one of `
      + `${Object.keys(TONE_STEPS).join(', ')} — got ${JSON.stringify(value)}. `
      + `Below ${MIN_TONE} the ordered matrix inks nothing at all, so the element `
      + `would be invisible while still claiming its quadrants.`,
    );
  }
  return value;
}

export function normalizeFeather(value, what = 'feather') {
  if (value == null) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole number of quadrants, 0 or more — got ${JSON.stringify(value)}`);
  }
  return value;
}

export function normalizeTexture(value, what = 'texture') {
  if (value == null) return null;
  if (!TEXTURES.includes(value)) {
    throw new SyntaxError(`${what} must be one of ${TEXTURES.join(', ')} — got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Inking test, keyed to ABSOLUTE lattice position rather than position within
 * the shape. Two adjacent toned shapes therefore tile seamlessly instead of
 * showing a seam where they meet, and the same command always covers the same
 * quadrants. `ditherToQuadrants` keys the same way, so a dithered image and a
 * toned path show a matching texture.
 */
export function inksAt(x, y, tone) {
  const threshold = (BAYER_4[((y % BAYER_N) + BAYER_N) % BAYER_N][((x % BAYER_N) + BAYER_N) % BAYER_N] + 0.5) / BAYER_LEVELS;
  return tone > threshold;
}

/**
 * Distance from each quadrant to the nearest quadrant NOT in the set, by
 * 4-neighbour BFS. A quadrant on the boundary is 1; one step in is 2.
 *
 * This is the interior-distance test the brand-mark work hand-rolled to keep
 * cortical folds off a silhouette's outline, promoted into the engine.
 */
function boundaryDistance(keys) {
  const dist = new Map();
  const queue = [];
  for (const key of keys) {
    const [x, y] = key.split(',').map(Number);
    const edge = !keys.has(`${x + 1},${y}`) || !keys.has(`${x - 1},${y}`)
      || !keys.has(`${x},${y + 1}`) || !keys.has(`${x},${y - 1}`);
    if (edge) {
      dist.set(key, 1);
      queue.push([x, y]);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    const d = dist.get(`${x},${y}`);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nk = `${nx},${ny}`;
      if (keys.has(nk) && !dist.has(nk)) {
        dist.set(nk, d + 1);
        queue.push([nx, ny]);
      }
    }
  }
  return dist;
}

/** Deterministic 32-bit hash. Never Math.random: an unrepeatable document is a bug. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededBit(seed, x, y) {
  return (hash(`${seed}:${x}:${y}`) % 1000) / 1000;
}

/**
 * Filter a quadrant list down to the ones a given tone actually inks.
 *
 * Quadrants arrive as objects carrying at least {x, y}; whatever else they hold
 * rides along untouched, so a piece keeps its kind and styling.
 */
export function toneMask(quads, { tone = 1, feather = 0, texture = null, seed = '' } = {}) {
  const t = normalizeTone(tone);
  const f = normalizeFeather(feather);
  const tex = normalizeTexture(texture);
  if (t >= 1 && !f && !tex) return quads;          // the no-op guarantee

  const keys = new Set(quads.map((q) => `${q.x},${q.y}`));
  const dist = f > 0 ? boundaryDistance(keys) : null;

  return quads.filter((q) => {
    let effective = t;
    if (dist) effective *= Math.min(1, (dist.get(`${q.x},${q.y}`) ?? 1) / (f + 1));
    if (!inksAt(q.x, q.y, effective)) return false;
    // Erosion runs last so it thins an already-toned edge rather than fighting it.
    if (tex === 'eroded') {
      const d = dist ? dist.get(`${q.x},${q.y}`) ?? 1 : null;
      const onEdge = d != null ? d === 1 : isEdge(keys, q.x, q.y);
      if (onEdge && seededBit(seed, q.x, q.y) < 0.4) return false;
    }
    return true;
  });
}

function isEdge(keys, x, y) {
  return !keys.has(`${x + 1},${y}`) || !keys.has(`${x - 1},${y}`)
    || !keys.has(`${x},${y + 1}`) || !keys.has(`${x},${y - 1}`);
}
