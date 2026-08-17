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
export const SIMPLIFY_SUPERSAMPLES = Object.freeze([1, 2, 4]);
export const MIN_SIMPLIFY_SHORT_SIDE = 24;
export const MAX_SIMPLIFY_QUADRANTS = 250_000;
export const MAX_SIMPLIFY_WORKING_QUADRANTS = 1_000_000;

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
 * Resolve the internal simplification canvas without changing final geometry.
 * A 4x linear factor creates sixteen working samples per output quadrant.
 */
export function resolveSupersample(requested, qw, qh) {
  assertGrid(qw, qh);
  if (requested === 'auto') {
    return SIMPLIFY_SUPERSAMPLES.toReversed().find(
      (factor) => qw * qh * factor * factor <= MAX_SIMPLIFY_WORKING_QUADRANTS,
    ) ?? 1;
  }
  if (!SIMPLIFY_SUPERSAMPLES.includes(requested)) {
    throw new SyntaxError(`simplify supersample must be auto, ${SIMPLIFY_SUPERSAMPLES.join(', ')} — got ${JSON.stringify(requested)}`);
  }
  const workingQuadrants = qw * qh * requested * requested;
  if (workingQuadrants > MAX_SIMPLIFY_WORKING_QUADRANTS) {
    throw new RangeError(
      `${requested}x simplify supersampling would create ${workingQuadrants} working quadrants ` +
      `(limit ${MAX_SIMPLIFY_WORKING_QUADRANTS}); use auto, a lower supersample factor, or a smaller final span`,
    );
  }
  return requested;
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

function integral(values, content, width, height, channels = 1, channel = 0, countOnly = false) {
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (content[index]) row += countOnly ? 1 : values[index * channels + channel];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  return sums;
}

function integralRect(sums, stride, x0, y0, x1, y1) {
  return sums[y1 * stride + x1] - sums[y0 * stride + x1]
    - sums[y1 * stride + x0] + sums[y0 * stride + x0];
}

function blurChannels(values, content, width, height, radius, channels, Output) {
  if (!radius) return Output.from(values);
  const out = new Output(values.length).fill(1);
  const stride = width + 1;
  const counts = integral(null, content, width, height, 1, 0, true);
  for (let channel = 0; channel < channels; channel++) {
    const sums = integral(values, content, width, height, channels, channel);
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (!content[index]) continue;
        const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
        const count = integralRect(counts, stride, x0, y0, x1, y1);
        if (count) out[index * channels + channel] = integralRect(sums, stride, x0, y0, x1, y1) / count;
      }
    }
  }
  return out;
}

function blur(values, content, width, height, radius) {
  return blurChannels(values, content, width, height, radius, 1, Float64Array);
}

function blurColors(values, content, width, height, radius) {
  return blurChannels(values, content, width, height, radius, 3, Float32Array);
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

/**
 * Resolve a supersampled binary canvas to weighted final-quadrant coverage.
 *
 * A threshold here would throw away the information supersampling exists to
 * collect. The box resolve instead preserves the exact fraction of working
 * samples covered by ink. Geometry remains on the integer lattice; coverage is
 * presentation data carried by the durable runs.
 */
export function downsampleCoverage(on, outputWidth, outputHeight, factor) {
  if (!Number.isInteger(factor) || factor < 1) throw new RangeError('supersample resolve factor must be a positive whole number');
  const workingWidth = outputWidth * factor;
  const workingHeight = outputHeight * factor;
  if (!on || on.length !== workingWidth * workingHeight) {
    throw new RangeError(`supersample resolve expected ${workingWidth * workingHeight} working samples`);
  }
  const blockArea = factor * factor;
  const coverage = new Float64Array(outputWidth * outputHeight);
  const reduced = new Uint8Array(outputWidth * outputHeight);
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      let ink = 0;
      for (let wy = y * factor; wy < (y + 1) * factor; wy++) {
        const row = wy * workingWidth;
        for (let wx = x * factor; wx < (x + 1) * factor; wx++) ink += on[row + wx];
      }
      const index = y * outputWidth + x;
      coverage[index] = ink / blockArea;
      if (ink > 0) reduced[index] = 1;
    }
  }
  const distinctLevels = new Set(coverage).size;
  return {
    on: reduced,
    coverage,
    method: factor === 1 ? 'identity' : 'box-average',
    workingSamplesPerOutput: blockArea,
    possibleCoverageLevels: blockArea + 1,
    resolvedCoverageLevels: distinctLevels,
    partialCoverageSamples: coverage.filter((value) => value > 0 && value < 1).length,
  };
}

const DETAIL = Object.freeze({
  low: { coverage: 0.08, blur: 2, componentDivisor: 700 },
  medium: { coverage: 0.13, blur: 1, componentDivisor: 1100 },
  high: { coverage: 0.20, blur: 0, componentDivisor: 1800 },
});

function finalizeSimplification(workingOn, qw, qh, factor) {
  const reduced = downsampleCoverage(workingOn, qw, qh, factor);
  const stats = analyse({ width: qw, height: qh, on: reduced.on, coverage: reduced.coverage });
  if (stats.ink < 4) {
    throw new Error('adaptive simplification removed all stable features; use embed mode, choose higher detail, lower supersampling, or provide a clearer source');
  }
  return { ...reduced, stats };
}

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
export function simplifyToQuadrants(img, qw, qh, { fit = 'contain', detail = 'auto', supersample = 'auto' } = {}) {
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
  const workingScale = resolveSupersample(supersample, qw, qh);
  const workingWidth = qw * workingScale;
  const workingHeight = qh * workingScale;
  const sampled = sampleTones(img, workingWidth, workingHeight, fit, true);
  const finalSampleScale = sampled.scale / workingScale;
  const resolvedDetail = resolveDetail(detail, qw, qh, finalSampleScale);
  const preset = DETAIL[resolvedDetail];
  const contentTones = [...sampled.tones].filter((_, index) => sampled.content[index]);
  const rawBackground = borderTone(sampled.tones, sampled.content, workingWidth, workingHeight);
  const lowTone = percentile(contentTones, 0.05);
  const highTone = percentile(contentTones, 0.95);
  const nearBinary = (rawBackground >= 0.85 && lowTone <= 0.55)
    || (rawBackground <= 0.15 && highTone >= 0.45);

  if (nearBinary) {
    const contrastFloor = { low: 0.16, medium: 0.1, high: 0.05 }[resolvedDetail];
    let on = new Uint8Array(workingWidth * workingHeight);
    for (let index = 0; index < on.length; index++) {
      if (sampled.content[index] && Math.abs(sampled.tones[index] - rawBackground) >= contrastFloor) on[index] = 1;
    }
    on = simplifyPass(on, workingWidth, workingHeight);
    const workingContentSamples = sampled.content.filter(Boolean).length;
    const workingMinimumComponent = Math.max(2, Math.floor(workingContentSamples / (preset.componentDivisor * 1.5)));
    const workingCleanup = cleanIslands(on, workingWidth, workingHeight, workingMinimumComponent);
    const final = finalizeSimplification(on, qw, qh, workingScale);
    return {
      width: qw,
      height: qh,
      on: final.on,
      coverage: final.coverage,
      processing: {
        strategy: 'threshold-simplify',
        requestedDetail: detail,
        resolvedDetail,
        requestedSupersample: supersample,
        resolvedSupersample: workingScale,
        workingCanvas: { width: workingWidth, height: workingHeight, unit: 'quadrants' },
        workingSamplesPerOutput: final.workingSamplesPerOutput,
        workingScaleDirection: sampled.scale < 1 ? 'downscale' : sampled.scale > 1 ? 'upscale' : 'exact',
        workingSourcePixelsPerSample: Number((1 / sampled.scale).toFixed(4)),
        downsampleMethod: final.method,
        possibleCoverageLevels: final.possibleCoverageLevels,
        resolvedCoverageLevels: final.resolvedCoverageLevels,
        partialCoverageSamples: final.partialCoverageSamples,
        scaleDirection: finalSampleScale < 1 ? 'downscale' : finalSampleScale > 1 ? 'upscale' : 'exact',
        sourcePixelsPerSample: Number((1 / finalSampleScale).toFixed(4)),
        nearBinary: true,
        backgroundTone: Number(rawBackground.toFixed(4)),
        contrastFloor,
        workingMinimumComponent,
        workingRemovedComponents: workingCleanup.removedComponents,
        workingRemovedSamples: workingCleanup.removedSamples,
        minimumComponent: workingMinimumComponent,
        removedComponents: workingCleanup.removedComponents,
        removedSamples: workingCleanup.removedSamples,
      },
    };
  }

  const workingBlur = preset.blur * workingScale;
  const tones = blur(sampled.tones, sampled.content, workingWidth, workingHeight, workingBlur);
  const colors = blurColors(sampled.colors, sampled.content, workingWidth, workingHeight, workingBlur);
  const background = borderTone(tones, sampled.content, workingWidth, workingHeight);
  const backgroundRgb = borderColor(colors, sampled.content, workingWidth, workingHeight);
  const scores = new Float64Array(tones.length);
  const candidates = [];

  const toneAt = (x, y) => {
    if (x < 0 || y < 0 || x >= workingWidth || y >= workingHeight) return background;
    const index = y * workingWidth + x;
    return sampled.content[index] ? tones[index] : background;
  };
  const colorAt = (x, y, channel) => {
    if (x < 0 || y < 0 || x >= workingWidth || y >= workingHeight) return backgroundRgb[channel];
    const index = y * workingWidth + x;
    return sampled.content[index] ? colors[index * 3 + channel] : backgroundRgb[channel];
  };
  for (let y = 0; y < workingHeight; y++) {
    for (let x = 0; x < workingWidth; x++) {
      const index = y * workingWidth + x;
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
  let on = new Uint8Array(workingWidth * workingHeight);
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
    const x = index % workingWidth, y = Math.floor(index / workingWidth);
    for (let yy = Math.max(0, y - 1); yy <= Math.min(workingHeight - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(workingWidth - 1, x + 1); xx++) {
        if (xx === x && yy === y) continue;
        const neighbour = yy * workingWidth + xx;
        if (on[neighbour] || scores[neighbour] < weakFloor) continue;
        on[neighbour] = 1;
        frontier.push(neighbour);
        expandedSamples += 1;
        if (selected.length + expandedSamples >= expandedLimit) break;
      }
      if (selected.length + expandedSamples >= expandedLimit) break;
    }
  }

  on = simplifyPass(on, workingWidth, workingHeight);
  const workingMinimumComponent = Math.max(2, Math.floor(contentSamples / preset.componentDivisor));
  const workingCleanup = cleanIslands(on, workingWidth, workingHeight, workingMinimumComponent);
  const final = finalizeSimplification(on, qw, qh, workingScale);

  return {
    width: qw,
    height: qh,
    on: final.on,
    coverage: final.coverage,
    processing: {
      strategy: 'adaptive-simplify',
      requestedDetail: detail,
      resolvedDetail,
      requestedSupersample: supersample,
      resolvedSupersample: workingScale,
      workingCanvas: { width: workingWidth, height: workingHeight, unit: 'quadrants' },
      workingSamplesPerOutput: final.workingSamplesPerOutput,
      workingScaleDirection: sampled.scale < 1 ? 'downscale' : sampled.scale > 1 ? 'upscale' : 'exact',
      workingSourcePixelsPerSample: Number((1 / sampled.scale).toFixed(4)),
      downsampleMethod: final.method,
      possibleCoverageLevels: final.possibleCoverageLevels,
      resolvedCoverageLevels: final.resolvedCoverageLevels,
      partialCoverageSamples: final.partialCoverageSamples,
      scaleDirection: finalSampleScale < 1 ? 'downscale' : finalSampleScale > 1 ? 'upscale' : 'exact',
      sourcePixelsPerSample: Number((1 / finalSampleScale).toFixed(4)),
      blurRadius: workingBlur,
      inkBudget,
      strongFloor: Number(strongFloor.toFixed(4)),
      weakFloor: Number(weakFloor.toFixed(4)),
      expandedSamples,
      backgroundTone: Number(background.toFixed(4)),
      backgroundRgb: backgroundRgb.map((value) => Number(value.toFixed(4))),
      colorAware: true,
      nearBinary: false,
      salienceFloor: 0.02,
      workingMinimumComponent,
      workingRemovedComponents: workingCleanup.removedComponents,
      workingRemovedSamples: workingCleanup.removedSamples,
      minimumComponent: workingMinimumComponent,
      removedComponents: workingCleanup.removedComponents,
      removedSamples: workingCleanup.removedSamples,
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
 * Adjacent samples merge only when their coverage is identical. Full-coverage
 * binary runs omit opacity so existing dither documents stay byte-identical.
 *
 * @returns {Array<{x:number,y:number,w:number,opacity?:number}>} in quadrant units
 */
export function runsOf({ width, height, on, coverage = null }) {
  const values = coverage ?? on;
  if (!values || values.length !== width * height) throw new RangeError(`raster runs expected ${width * height} samples`);
  const runs = [];
  for (let y = 0; y < height; y++) {
    let start = -1, active = 0;
    const emit = (end) => {
      const run = { x: start, y, w: end - start };
      if (active < 1) run.opacity = active;
      runs.push(run);
    };
    for (let x = 0; x <= width; x++) {
      const value = x < width ? Number(values[y * width + x]) : 0;
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('raster coverage samples must be finite numbers from 0 through 1');
      if (value > 0 && start < 0) {
        start = x;
        active = value;
      } else if (start >= 0 && value !== active) {
        emit(x);
        start = value > 0 ? x : -1;
        active = value;
      }
    }
  }
  return runs;
}

/** Quantify whether binary or coverage-weighted output reads as structure. */
export function analyse({ width, height, on, coverage = null }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`dither analysis needs a positive grid within ${MAX_DITHER_QUADRANTS} quadrants`);
  }
  const values = coverage ?? on;
  if (!values || values.length !== width * height) throw new RangeError(`dither analysis expected ${width * height} samples`);
  let ink = 0, transitions = 0, neighbourPairs = 0, partialCoverageSamples = 0, solidCoverageSamples = 0;
  const coverageLevels = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Number(values[y * width + x]);
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('dither analysis samples must be finite numbers from 0 through 1');
      ink += value;
      coverageLevels.add(value);
      if (value > 0 && value < 1) partialCoverageSamples += 1;
      else if (value === 1) solidCoverageSamples += 1;
      if (x + 1 < width) {
        neighbourPairs += 1;
        transitions += Math.abs(value - Number(values[y * width + x + 1]));
      }
      if (y + 1 < height) {
        neighbourPairs += 1;
        transitions += Math.abs(value - Number(values[(y + 1) * width + x]));
      }
    }
  }
  const coverageRatio = ink / (width * height);
  const transitionRatio = neighbourPairs ? transitions / neighbourPairs : 0;
  return {
    samples: width * height,
    ink: Number(ink.toFixed(4)),
    coverageRatio: Number(coverageRatio.toFixed(4)),
    transitionRatio: Number(transitionRatio.toFixed(4)),
    runCount: runsOf({ width, height, on, coverage }).length,
    partialCoverageSamples,
    partialCoverageRatio: Number((partialCoverageSamples / (width * height)).toFixed(4)),
    solidCoverageSamples,
    coverageLevels: coverageLevels.size,
    readability: transitionRatio > MAX_READABLE_TRANSITION_RATIO ? 'busy' : 'pass',
  };
}

export function analyseRuns(runs, width, height) {
  if (!Array.isArray(runs)) throw new TypeError('dither runs must be an array');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_DITHER_QUADRANTS) {
    throw new RangeError(`dither analysis needs a positive grid within ${MAX_DITHER_QUADRANTS} quadrants`);
  }
  const on = new Uint8Array(width * height);
  const coverage = new Float64Array(width * height);
  for (const run of runs) {
    if (!Number.isInteger(run.x) || !Number.isInteger(run.y) || !Number.isInteger(run.w) || run.w < 1 ||
        run.x < 0 || run.y < 0 || run.y >= height || run.x + run.w > width) {
      throw new RangeError(`dither run is outside its ${width}x${height} quadrant grid`);
    }
    const opacity = run.opacity ?? 1;
    if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity <= 0 || opacity > 1) {
      throw new RangeError('dither run opacity must be a finite number greater than 0 and no greater than 1');
    }
    for (let x = run.x; x < run.x + run.w; x++) {
      const index = run.y * width + x;
      if (on[index]) throw new RangeError(`dither runs overlap at ${x},${run.y}`);
      on[index] = 1;
      coverage[index] = opacity;
    }
  }
  return analyse({ width, height, on, coverage });
}
