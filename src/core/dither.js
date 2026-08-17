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

/** Rec. 709 luminance — the weighting that matches how a viewer reads brightness. */
function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Quantise a decoded image onto a quadrant grid.
 *
 * Each destination quadrant averages every source pixel that falls inside it,
 * rather than point-sampling, so downscaling a photo does not throw away most of
 * it. Alpha composites against white, because the page ground is light and a
 * transparent region should read as empty rather than as solid ink.
 *
 * @param {{width:number,height:number,pixels:Uint8Array}} img  RGBA
 * @param {number} qw  destination width in quadrants
 * @param {number} qh  destination height in quadrants
 * @returns {{width:number, height:number, on:Uint8Array}}
 */
export function ditherToQuadrants(img, qw, qh) {
  if (!Number.isInteger(qw) || !Number.isInteger(qh) || qw <= 0 || qh <= 0) {
    throw new RangeError(`a dithered image needs a positive whole-quadrant footprint — got ${qw}x${qh} quadrants`);
  }
  if (qw * qh > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`dither footprint ${qw}x${qh} exceeds the ${MAX_DITHER_QUADRANTS}-quadrant safety limit`);
  }
  const { width, height, pixels } = img;
  const on = new Uint8Array(qw * qh);

  for (let qy = 0; qy < qh; qy++) {
    // Source band covering this quadrant row, clamped so the last row still has
    // at least one pixel even when the image is smaller than the footprint.
    const y0 = Math.floor((qy * height) / qh);
    const y1 = Math.max(y0 + 1, Math.floor(((qy + 1) * height) / qh));

    for (let qx = 0; qx < qw; qx++) {
      const x0 = Math.floor((qx * width) / qw);
      const x1 = Math.max(x0 + 1, Math.floor(((qx + 1) * width) / qw));

      let sum = 0, n = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const i = (y * width + x) * 4;
          const a = pixels[i + 3] / 255;
          // Composite over white: an unset pixel is ground, not ink.
          sum += luminance(
            pixels[i] * a + 255 * (1 - a),
            pixels[i + 1] * a + 255 * (1 - a),
            pixels[i + 2] * a + 255 * (1 - a),
          );
          n += 1;
        }
      }

      const mean = n ? sum / n / 255 : 1;
      // Ink when the tone is darker than this cell's threshold. The +0.5 centres
      // each rank in its band, so a flat mid grey splits exactly in half.
      const threshold = (BAYER_4[qy % BAYER_N][qx % BAYER_N] + 0.5) / BAYER_LEVELS;
      on[qy * qw + qx] = mean < threshold ? 1 : 0;
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
