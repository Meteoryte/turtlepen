/**
 * Drawing an image INTO the lattice.
 *
 * `embed` mode puts a picture on top of the grid; this puts it in. Every
 * quadrant is already a 5px bitmap cell, so quantising an image to quadrants is
 * exact by construction — no rounding, no half-pixels, nothing to report as
 * drift. It is also the aesthetic the project settled on: early Macintosh
 * displays had no grey at all, and every tone was earned by a pattern of pixels.
 *
 * Ordered (Bayer) dithering is the default because it is DETERMINISTIC. The same
 * image yields byte-identical output on every run, on every machine, which is
 * the property this whole engine rests on. Error-diffusion methods like
 * Floyd–Steinberg are also deterministic but serial and much harder to reason
 * about at this resolution; if one is ever added it must be named explicitly at
 * the call site, never substituted for this.
 */

/**
 * The 4x4 ordered dither matrix. Each cell holds a rank 0..15; a pixel inks when
 * its brightness falls below that rank's share of the range. Ranks are spread so
 * that neighbouring cells are far apart in value, which is what stops the output
 * looking like banding.
 */
export const BAYER_4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

const BAYER_N = 4;
const BAYER_LEVELS = BAYER_N * BAYER_N;
export const MAX_DITHER_QUADRANTS = 1_000_000;
export const MAX_READABLE_TRANSITION_RATIO = 0.45;

/** Rec. 709 luminance — the weighting that matches how a viewer reads brightness. */
function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sourceTone(pixels, width, x, y) {
  const i = (y * width + x) * 4;
  const a = pixels[i + 3] / 255;
  return luminance(
    pixels[i] * a + 255 * (1 - a),
    pixels[i + 1] * a + 255 * (1 - a),
    pixels[i + 2] * a + 255 * (1 - a),
  ) / 255;
}

function orderedInk(mean, x, y) {
  // The +0.5 centres each rank in its band, so flat mid grey splits in half.
  const threshold = (BAYER_4[y % BAYER_N][x % BAYER_N] + 0.5) / BAYER_LEVELS;
  return mean < threshold ? 1 : 0;
}

/**
 * Quantise a decoded image onto a quadrant grid.
 *
 * A downscaled destination quadrant area-weights every source pixel that
 * contributes to it, so a reduction does not throw away most of the source. An
 * upscaled quadrant repeats its nearest source sample. Alpha composites against
 * white, because transparent page ground should not become solid ink.
 *
 * @param {{width:number,height:number,pixels:Uint8Array}} img  RGBA
 * @param {number} qw  destination width in quadrants
 * @param {number} qh  destination height in quadrants
 * @returns {{width:number, height:number, on:Uint8Array}}
 */
export function ditherToQuadrants(img, qw, qh, { fit = 'contain' } = {}) {
  if (!Number.isInteger(qw) || !Number.isInteger(qh) || qw <= 0 || qh <= 0) {
    throw new RangeError(`a dithered image needs a positive whole-quadrant footprint — got ${qw}x${qh} quadrants`);
  }
  if (!['contain', 'cover'].includes(fit)) throw new SyntaxError(`image fit must be contain or cover — got ${JSON.stringify(fit)}`);
  if (qw * qh > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`dither footprint ${qw}x${qh} exceeds the ${MAX_DITHER_QUADRANTS}-quadrant safety limit`);
  }
  const { width, height, pixels } = img;
  const on = new Uint8Array(qw * qh);
  const scale = fit === 'cover' ? Math.max(qw / width, qh / height) : Math.min(qw / width, qh / height);
  const offsetX = (qw - width * scale) / 2;
  const offsetY = (qh - height * scale) / 2;

  if (scale >= 1) {
    for (let qy = 0; qy < qh; qy++) {
      const y = Math.floor((qy + 0.5 - offsetY) / scale);
      if (y < 0 || y >= height) continue;
      for (let qx = 0; qx < qw; qx++) {
        const x = Math.floor((qx + 0.5 - offsetX) / scale);
        if (x < 0 || x >= width) continue;
        on[qy * qw + qx] = orderedInk(sourceTone(pixels, width, x, y), qx, qy);
      }
    }
    return { width: qw, height: qh, on };
  }

  for (let qy = 0; qy < qh; qy++) {
    const sy0 = Math.max(0, (qy - offsetY) / scale);
    const sy1 = Math.min(height, (qy + 1 - offsetY) / scale);
    if (sy0 >= sy1) continue; // contain padding is page ground
    const y0 = Math.floor(sy0);
    const y1 = Math.max(y0 + 1, Math.ceil(sy1));

    for (let qx = 0; qx < qw; qx++) {
      const sx0 = Math.max(0, (qx - offsetX) / scale);
      const sx1 = Math.min(width, (qx + 1 - offsetX) / scale);
      if (sx0 >= sx1) continue;
      const x0 = Math.floor(sx0);
      const x1 = Math.max(x0 + 1, Math.ceil(sx1));

      let sum = 0, covered = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        const yWeight = Math.max(0, Math.min(y + 1, sy1) - Math.max(y, sy0)) * scale;
        for (let x = x0; x < x1 && x < width; x++) {
          const xWeight = Math.max(0, Math.min(x + 1, sx1) - Math.max(x, sx0)) * scale;
          const weight = xWeight * yWeight;
          sum += sourceTone(pixels, width, x, y) * weight;
          covered += weight;
        }
      }

      // Any uncovered fraction is `contain` padding and therefore page ground.
      const mean = sum + Math.max(0, 1 - covered);
      on[qy * qw + qx] = orderedInk(mean, qx, qy);
    }
  }

  return { width: qw, height: qh, on };
}

/**
 * Collapse a quadrant grid into horizontal runs.
 *
 * A 400x300 photo is 4800 quadrants; emitting a rect each would make the SVG
 * megabytes and unopenable. Merging consecutive set quadrants on a row turns a
 * solid area into one rect and leaves dithered texture as short runs, which is
 * both smaller and closer to how the shape actually reads.
 *
 * @returns {Array<{x:number,y:number,w:number}>} in quadrant units
 */
export function runsOf({ width, height, on }) {
  const runs = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const set = x < width && on[y * width + x];
      if (set && start < 0) start = x;
      else if (!set && start >= 0) {
        runs.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  }
  return runs;
}

/** Quantify whether a 1-bit result reads as structure or checkerboard noise. */
export function analyse({ width, height, on }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`dither analysis needs a positive grid within ${MAX_DITHER_QUADRANTS} quadrants`);
  }
  if (!on || on.length !== width * height) throw new RangeError(`dither analysis expected ${width * height} samples`);
  let ink = 0, transitions = 0, neighbourPairs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = on[y * width + x];
      ink += value ? 1 : 0;
      if (x + 1 < width) {
        neighbourPairs += 1;
        if (value !== on[y * width + x + 1]) transitions += 1;
      }
      if (y + 1 < height) {
        neighbourPairs += 1;
        if (value !== on[(y + 1) * width + x]) transitions += 1;
      }
    }
  }
  const coverageRatio = ink / (width * height);
  const transitionRatio = neighbourPairs ? transitions / neighbourPairs : 0;
  return {
    samples: width * height,
    ink,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    transitionRatio: Number(transitionRatio.toFixed(4)),
    runCount: runsOf({ width, height, on }).length,
    readability: transitionRatio > MAX_READABLE_TRANSITION_RATIO ? 'busy' : 'pass',
  };
}

export function analyseRuns(runs, width, height) {
  if (!Array.isArray(runs)) throw new TypeError('dither runs must be an array');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`dither analysis needs a positive grid within ${MAX_DITHER_QUADRANTS} quadrants`);
  }
  const on = new Uint8Array(width * height);
  for (const run of runs) {
    if (!Number.isInteger(run.x) || !Number.isInteger(run.y) || !Number.isInteger(run.w) || run.w < 1 ||
        run.x < 0 || run.y < 0 || run.y >= height || run.x + run.w > width) {
      throw new RangeError(`dither run is outside its ${width}x${height} quadrant grid`);
    }
    for (let x = run.x; x < run.x + run.w; x++) {
      const index = run.y * width + x;
      if (on[index]) throw new RangeError(`dither runs overlap at ${x},${run.y}`);
      on[index] = 1;
    }
  }
  return analyse({ width, height, on });
}
