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
export const SIMPLIFY_DETAILS = Object.freeze(['auto', 'low', 'medium', 'high']);
export const MIN_SIMPLIFY_SHORT_SIDE = 24;
export const MAX_SIMPLIFY_QUADRANTS = 250_000;

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

function sourceColor(pixels, width, x, y) {
  const i = (y * width + x) * 4;
  const a = pixels[i + 3] / 255;
  return [
    (pixels[i] * a + 255 * (1 - a)) / 255,
    (pixels[i + 1] * a + 255 * (1 - a)) / 255,
    (pixels[i + 2] * a + 255 * (1 - a)) / 255,
  ];
}

function orderedInk(mean, x, y) {
  // The +0.5 centres each rank in its band, so flat mid grey splits in half.
  const threshold = (BAYER_4[y % BAYER_N][x % BAYER_N] + 0.5) / BAYER_LEVELS;
  return mean < threshold ? 1 : 0;
}

function assertGrid(qw, qh) {
  if (!Number.isInteger(qw) || !Number.isInteger(qh) || qw <= 0 || qh <= 0) {
    throw new RangeError(`a rasterized image needs a positive whole-quadrant footprint — got ${qw}x${qh} quadrants`);
  }
  if (qw * qh > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`image footprint ${qw}x${qh} exceeds the ${MAX_DITHER_QUADRANTS}-quadrant safety limit`);
  }
}

function assertFit(fit) {
  if (!['contain', 'cover'].includes(fit)) throw new SyntaxError(`image fit must be contain or cover — got ${JSON.stringify(fit)}`);
}

/**
 * Sample an image onto the semantic quadrant grid without choosing how those
 * tones become ink. Downscaling area-averages every contributing source pixel;
 * upscaling repeats the nearest sample. `content` distinguishes real source
 * coverage from contain padding so simplification does not learn from padding.
 */
function sampleTones(img, qw, qh, fit, withColor = false) {
  assertGrid(qw, qh);
  assertFit(fit);
  const { width, height, pixels } = img;
  const tones = new Float64Array(qw * qh).fill(1);
  const colors = withColor ? new Float32Array(qw * qh * 3).fill(1) : null;
  const content = new Uint8Array(qw * qh);
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
        const index = qy * qw + qx;
        tones[index] = sourceTone(pixels, width, x, y);
        if (colors) colors.set(sourceColor(pixels, width, x, y), index * 3);
        content[index] = 1;
      }
    }
    return { tones, colors, content, scale };
  }

  for (let qy = 0; qy < qh; qy++) {
    const sy0 = Math.max(0, (qy - offsetY) / scale);
    const sy1 = Math.min(height, (qy + 1 - offsetY) / scale);
    if (sy0 >= sy1) continue;
    const y0 = Math.floor(sy0);
    const y1 = Math.max(y0 + 1, Math.ceil(sy1));

    for (let qx = 0; qx < qw; qx++) {
      const sx0 = Math.max(0, (qx - offsetX) / scale);
      const sx1 = Math.min(width, (qx + 1 - offsetX) / scale);
      if (sx0 >= sx1) continue;
      const x0 = Math.floor(sx0);
      const x1 = Math.max(x0 + 1, Math.ceil(sx1));

      let sum = 0, covered = 0;
      let sumR = 0, sumG = 0, sumB = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        const yWeight = Math.max(0, Math.min(y + 1, sy1) - Math.max(y, sy0)) * scale;
        for (let x = x0; x < x1 && x < width; x++) {
          const xWeight = Math.max(0, Math.min(x + 1, sx1) - Math.max(x, sx0)) * scale;
          const weight = xWeight * yWeight;
          sum += sourceTone(pixels, width, x, y) * weight;
          if (colors) {
            const [red, green, blue] = sourceColor(pixels, width, x, y);
            sumR += red * weight; sumG += green * weight; sumB += blue * weight;
          }
          covered += weight;
        }
      }

      const index = qy * qw + qx;
      tones[index] = sum + Math.max(0, 1 - covered);
      if (colors) {
        const ground = Math.max(0, 1 - covered);
        colors[index * 3] = sumR + ground;
        colors[index * 3 + 1] = sumG + ground;
        colors[index * 3 + 2] = sumB + ground;
      }
      content[index] = 1;
    }
  }
  return { tones, colors, content, scale };
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
  const { tones } = sampleTones(img, qw, qh, fit);
  const on = new Uint8Array(qw * qh);
  for (let qy = 0; qy < qh; qy++) {
    for (let qx = 0; qx < qw; qx++) {
      const index = qy * qw + qx;
      on[index] = orderedInk(tones[index], qx, qy);
    }
  }
  return { width: qw, height: qh, on };
}

function percentile(values, portion) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * portion)))];
}

function blur(values, content, width, height, radius) {
  if (!radius) return Float64Array.from(values);
  const out = new Float64Array(values.length).fill(1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!content[index]) continue;
      let sum = 0, count = 0;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
          const neighbour = yy * width + xx;
          if (!content[neighbour]) continue;
          sum += values[neighbour];
          count += 1;
        }
      }
      out[index] = count ? sum / count : 1;
    }
  }
  return out;
}

function blurColors(values, content, width, height, radius) {
  if (!radius) return Float32Array.from(values);
  const out = new Float32Array(values.length).fill(1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!content[index]) continue;
      const sums = [0, 0, 0];
      let count = 0;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
          const neighbour = yy * width + xx;
          if (!content[neighbour]) continue;
          sums[0] += values[neighbour * 3];
          sums[1] += values[neighbour * 3 + 1];
          sums[2] += values[neighbour * 3 + 2];
          count += 1;
        }
      }
      if (count) {
        out[index * 3] = sums[0] / count;
        out[index * 3 + 1] = sums[1] / count;
        out[index * 3 + 2] = sums[2] / count;
      }
    }
  }
  return out;
}

function borderTone(values, content, width, height) {
  const border = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const index = y * width + x;
      if (content[index]) border.push(values[index]);
    }
  }
  if (border.length) return percentile(border, 0.5);
  return percentile([...values], 0.5);
}

function borderColor(values, content, width, height) {
  const channels = [[], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const index = y * width + x;
      if (!content[index]) continue;
      channels[0].push(values[index * 3]);
      channels[1].push(values[index * 3 + 1]);
      channels[2].push(values[index * 3 + 2]);
    }
  }
  return channels.map((channel) => percentile(channel, 0.5));
}

function neighbours8(on, width, height, x, y) {
  let count = 0;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
      if (xx === x && yy === y) continue;
      count += on[yy * width + xx] ? 1 : 0;
    }
  }
  return count;
}

function cleanIslands(on, width, height, minimumSize) {
  const seen = new Uint8Array(on.length);
  let removedComponents = 0, removedSamples = 0;
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || seen[start]) continue;
    const component = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const index = queue.pop();
      component.push(index);
      const x = index % width, y = Math.floor(index / width);
      for (const next of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ]) {
        if (next >= 0 && on[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    if (component.length >= minimumSize) continue;
    removedComponents += 1;
    removedSamples += component.length;
    for (const index of component) on[index] = 0;
  }
  return { removedComponents, removedSamples };
}

function simplifyPass(on, width, height) {
  const next = Uint8Array.from(on);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const neighbours = neighbours8(on, width, height, x, y);
      if (on[index] && neighbours <= 1) next[index] = 0;
      else if (!on[index] && neighbours >= 7) next[index] = 1;
    }
  }
  return next;
}

const DETAIL = Object.freeze({
  low: { coverage: 0.08, blur: 2, componentDivisor: 700 },
  medium: { coverage: 0.13, blur: 1, componentDivisor: 1100 },
  high: { coverage: 0.20, blur: 0, componentDivisor: 1800 },
});

function resolveDetail(detail, width, height, scale) {
  if (!SIMPLIFY_DETAILS.includes(detail)) {
    throw new SyntaxError(`simplify detail must be ${SIMPLIFY_DETAILS.join(', ')} — got ${JSON.stringify(detail)}`);
  }
  if (detail !== 'auto') return detail;
  const shortSide = Math.min(width, height);
  if (shortSide <= 32 || scale < 0.04) return 'low';
  if (shortSide <= 96 || scale < 0.2) return 'medium';
  return 'high';
}

/**
 * Produce a sparse, perceptual approximation instead of a tonal facsimile.
 * The source is aspect-sampled first, then low-value texture is deliberately
 * discarded through scale-aware smoothing, border-relative contrast, edge
 * salience, an explicit ink budget, and connected-component cleanup.
 */
export function simplifyToQuadrants(img, qw, qh, { fit = 'contain', detail = 'auto' } = {}) {
  assertGrid(qw, qh);
  if (qw * qh > MAX_SIMPLIFY_QUADRANTS) {
    throw new RangeError(
      `simplify footprint ${qw}x${qh} exceeds the ${MAX_SIMPLIFY_QUADRANTS}-quadrant analysis limit; ` +
      'use embed for high-resolution evidence or simplify at a smaller semantic size',
    );
  }
  if (Math.min(qw, qh) < MIN_SIMPLIFY_SHORT_SIDE) {
    throw new RangeError(
      `simplify needs at least ${MIN_SIMPLIFY_SHORT_SIDE} quadrants on its short side to preserve recognizable structure; ` +
      `got ${qw}x${qh}. Enlarge the span or use purpose-built icon artwork.`,
    );
  }
  const sampled = sampleTones(img, qw, qh, fit, true);
  const resolvedDetail = resolveDetail(detail, qw, qh, sampled.scale);
  const preset = DETAIL[resolvedDetail];
  const contentTones = [...sampled.tones].filter((_, index) => sampled.content[index]);
  const rawBackground = borderTone(sampled.tones, sampled.content, qw, qh);
  const lowTone = percentile(contentTones, 0.05);
  const highTone = percentile(contentTones, 0.95);
  const nearBinary = (rawBackground >= 0.85 && lowTone <= 0.55)
    || (rawBackground <= 0.15 && highTone >= 0.45);

  if (nearBinary) {
    const contrastFloor = { low: 0.16, medium: 0.1, high: 0.05 }[resolvedDetail];
    let on = new Uint8Array(qw * qh);
    for (let index = 0; index < on.length; index++) {
      if (sampled.content[index] && Math.abs(sampled.tones[index] - rawBackground) >= contrastFloor) on[index] = 1;
    }
    on = simplifyPass(on, qw, qh);
    const contentSamples = sampled.content.filter(Boolean).length;
    const minimumComponent = Math.max(2, Math.floor(contentSamples / (preset.componentDivisor * 1.5)));
    const cleanup = cleanIslands(on, qw, qh, minimumComponent);
    const stats = analyse({ width: qw, height: qh, on });
    if (stats.ink < 4) {
      throw new Error('adaptive simplification removed all stable features; use embed mode, choose higher detail, or provide a clearer source');
    }
    return {
      width: qw,
      height: qh,
      on,
      processing: {
        strategy: 'threshold-simplify',
        requestedDetail: detail,
        resolvedDetail,
        scaleDirection: sampled.scale < 1 ? 'downscale' : sampled.scale > 1 ? 'upscale' : 'exact',
        sourcePixelsPerSample: Number((1 / sampled.scale).toFixed(4)),
        nearBinary: true,
        backgroundTone: Number(rawBackground.toFixed(4)),
        contrastFloor,
        minimumComponent,
        removedComponents: cleanup.removedComponents,
        removedSamples: cleanup.removedSamples,
      },
    };
  }

  const tones = blur(sampled.tones, sampled.content, qw, qh, preset.blur);
  const colors = blurColors(sampled.colors, sampled.content, qw, qh, preset.blur);
  const background = borderTone(tones, sampled.content, qw, qh);
  const backgroundRgb = borderColor(colors, sampled.content, qw, qh);
  const scores = new Float64Array(tones.length);
  const candidates = [];

  const toneAt = (x, y) => {
    if (x < 0 || y < 0 || x >= qw || y >= qh) return background;
    const index = y * qw + x;
    return sampled.content[index] ? tones[index] : background;
  };
  const colorAt = (x, y, channel) => {
    if (x < 0 || y < 0 || x >= qw || y >= qh) return backgroundRgb[channel];
    const index = y * qw + x;
    return sampled.content[index] ? colors[index * 3 + channel] : backgroundRgb[channel];
  };
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      const index = y * qw + x;
      if (!sampled.content[index]) continue;
      const gx = -toneAt(x - 1, y - 1) - 2 * toneAt(x - 1, y) - toneAt(x - 1, y + 1)
        + toneAt(x + 1, y - 1) + 2 * toneAt(x + 1, y) + toneAt(x + 1, y + 1);
      const gy = -toneAt(x - 1, y - 1) - 2 * toneAt(x, y - 1) - toneAt(x + 1, y - 1)
        + toneAt(x - 1, y + 1) + 2 * toneAt(x, y + 1) + toneAt(x + 1, y + 1);
      const edge = Math.min(1, Math.hypot(gx, gy) / 4);
      let colorEnergy = 0;
      for (let channel = 0; channel < 3; channel++) {
        const cgx = -colorAt(x - 1, y - 1, channel) - 2 * colorAt(x - 1, y, channel) - colorAt(x - 1, y + 1, channel)
          + colorAt(x + 1, y - 1, channel) + 2 * colorAt(x + 1, y, channel) + colorAt(x + 1, y + 1, channel);
        const cgy = -colorAt(x - 1, y - 1, channel) - 2 * colorAt(x, y - 1, channel) - colorAt(x + 1, y - 1, channel)
          + colorAt(x - 1, y + 1, channel) + 2 * colorAt(x, y + 1, channel) + colorAt(x + 1, y + 1, channel);
        colorEnergy += cgx * cgx + cgy * cgy;
      }
      const colorEdge = Math.min(1, Math.sqrt(colorEnergy) / (4 * Math.sqrt(3)));
      let colorDistance = 0;
      for (let channel = 0; channel < 3; channel++) {
        const difference = colors[index * 3 + channel] - backgroundRgb[channel];
        colorDistance += difference * difference;
      }
      const contrast = Math.max(Math.abs(tones[index] - background), Math.sqrt(colorDistance / 3));
      const score = Math.max(edge, colorEdge) * 0.72 + contrast * 0.28;
      scores[index] = score;
      if (score >= 0.02) candidates.push({ index, score });
    }
  }

  if (!candidates.length) {
    throw new Error('adaptive simplification found no stable subject contrast; use embed mode or a source with a clearer subject/background separation');
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const contentSamples = sampled.content.filter(Boolean).length;
  const inkBudget = Math.max(4, Math.round(contentSamples * preset.coverage));
  const selected = candidates.slice(0, Math.min(inkBudget, candidates.length));
  let on = new Uint8Array(qw * qh);
  for (const { index } of selected) on[index] = 1;

  // Canny-style hysteresis in lattice terms: high-salience samples seed the
  // drawing, then a weaker sample survives only when it extends an existing
  // contour. This keeps long, low-contrast cabinet edges while rejecting
  // equally weak but isolated grass, grain, or compression texture.
  const strongFloor = selected.at(-1)?.score ?? 1;
  const weakFloor = Math.max(0.02, strongFloor * 0.38);
  const expandedLimit = Math.min(candidates.length, Math.round(inkBudget * 1.8));
  let expandedSamples = 0;
  const frontier = selected.map(({ index }) => index);
  for (let cursor = 0; cursor < frontier.length && selected.length + expandedSamples < expandedLimit; cursor++) {
    const index = frontier[cursor];
    const x = index % qw, y = Math.floor(index / qw);
    for (let yy = Math.max(0, y - 1); yy <= Math.min(qh - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(qw - 1, x + 1); xx++) {
        if (xx === x && yy === y) continue;
        const neighbour = yy * qw + xx;
        if (on[neighbour] || scores[neighbour] < weakFloor) continue;
        on[neighbour] = 1;
        frontier.push(neighbour);
        expandedSamples += 1;
        if (selected.length + expandedSamples >= expandedLimit) break;
      }
      if (selected.length + expandedSamples >= expandedLimit) break;
    }
  }

  on = simplifyPass(on, qw, qh);
  const minimumComponent = Math.max(2, Math.floor(contentSamples / preset.componentDivisor));
  const cleanup = cleanIslands(on, qw, qh, minimumComponent);
  const stats = analyse({ width: qw, height: qh, on });
  if (stats.ink < 4) {
    throw new Error('adaptive simplification removed all stable features; use embed mode, choose higher detail, or provide a clearer source');
  }

  return {
    width: qw,
    height: qh,
    on,
    processing: {
      strategy: 'adaptive-simplify',
      requestedDetail: detail,
      resolvedDetail,
      scaleDirection: sampled.scale < 1 ? 'downscale' : sampled.scale > 1 ? 'upscale' : 'exact',
      sourcePixelsPerSample: Number((1 / sampled.scale).toFixed(4)),
      blurRadius: preset.blur,
      inkBudget,
      strongFloor: Number(strongFloor.toFixed(4)),
      weakFloor: Number(weakFloor.toFixed(4)),
      expandedSamples,
      backgroundTone: Number(background.toFixed(4)),
      backgroundRgb: backgroundRgb.map((value) => Number(value.toFixed(4))),
      colorAware: true,
      nearBinary: false,
      salienceFloor: 0.02,
      minimumComponent,
      removedComponents: cleanup.removedComponents,
      removedSamples: cleanup.removedSamples,
    },
  };
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
