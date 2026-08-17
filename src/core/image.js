/**
 * Images on the lattice.
 *
 * The same argument as text, applied to pictures. A picture has an intrinsic
 * size, and the ordinary failure is to choose a box first and let the renderer
 * squeeze the image into it afterwards — which is how diagrams end up with
 * stretched logos and screenshots nobody can read. So dimensions are read from
 * the file's own header BEFORE placement, and the footprint is computed from
 * them.
 *
 * Whole cells mean the measured viewport almost never lands on the exact source
 * aspect. That rounding is reported as `aspectDriftPct`; contain or cover then
 * preserves the source aspect through visible padding or cropping rather than
 * silently squashing the picture.
 *
 * No decoding happens here beyond the header. `embed` needs none, and the
 * project's zero-dependency stance means the pixel-level `dither` mode is built
 * separately, on node:zlib, for PNG only.
 */

import { PX_PER_CELL } from './geometry.js';

export const MODES = Object.freeze(['embed', 'dither', 'simplify']);
export const MIME_BY_FORMAT = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
});
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;

const rounded = (value) => Number(value.toFixed(4));

function axisScale(source, target) {
  const ratio = target / source;
  return {
    source,
    target,
    ratio: rounded(ratio),
    percent: rounded(ratio * 100),
    direction: ratio < 1 ? 'downscale' : ratio > 1 ? 'upscale' : 'exact',
  };
}

function combinedDirection(x, y) {
  return x.direction === y.direction ? x.direction : 'mixed';
}

function samplingProcedure(mode, x, y) {
  if (mode === 'embed') {
    return 'preserve source aspect in the SVG footprint and let the renderer resample the embedded pixels';
  }
  const directions = new Set([x.direction, y.direction]);
  const steps = [];
  if (directions.has('downscale')) steps.push('area-average every contributing source pixel on downscaled axes');
  if (directions.has('upscale')) steps.push('repeat the nearest source sample on upscaled axes');
  if (directions.has('exact')) steps.push('map source pixels one-to-one on exact axes');
  if (mode === 'simplify') {
    return `${steps.join('; ')}, then discard low-salience texture through adaptive smoothing, edge/contrast ranking, an ink budget, and fragment cleanup`;
  }
  return `${steps.join('; ')}, then apply the ordered threshold`;
}

/** Exact source-to-footprint scaling contract for embed and dither modes. */
export function scaleReport({ width, height }, { cellsWide, cellsTall, mode = 'embed', fit = 'contain' }) {
  assertMode(mode);
  assertDimensions('source', width, height);
  if (!['contain', 'cover'].includes(fit)) throw new SyntaxError(`image fit must be contain or cover — got ${JSON.stringify(fit)}`);
  if (![cellsWide, cellsTall].every((value) => Number.isInteger(value) && value > 0)) {
    throw new RangeError(`image scale report needs positive whole-cell dimensions — got ${cellsWide}x${cellsTall}`);
  }
  const viewport = { width: cellsWide * PX_PER_CELL, height: cellsTall * PX_PER_CELL };
  const rasterized = mode !== 'embed';
  const semanticViewport = rasterized
    ? { width: cellsWide * 2, height: cellsTall * 2, unit: 'quadrants' }
    : { ...viewport, unit: 'pixels' };
  const uniformRatio = fit === 'cover'
    ? Math.max(semanticViewport.width / width, semanticViewport.height / height)
    : Math.min(semanticViewport.width / width, semanticViewport.height / height);
  const semanticContent = {
    width: rounded(width * uniformRatio),
    height: rounded(height * uniformRatio),
    unit: semanticViewport.unit,
  };
  const sampleX = axisScale(width, semanticContent.width);
  const sampleY = axisScale(height, semanticContent.height);
  const sampleDirection = combinedDirection(sampleX, sampleY);
  const renderRatio = rasterized ? uniformRatio * (PX_PER_CELL / 2) : uniformRatio;
  const renderContent = { width: rounded(width * renderRatio), height: rounded(height * renderRatio) };
  const renderX = axisScale(width, renderContent.width);
  const renderY = axisScale(height, renderContent.height);

  return {
    sourcePx: { width, height },
    footprintCells: { width: cellsWide, height: cellsTall },
    renderedPx: viewport,
    fit,
    render: {
      direction: combinedDirection(renderX, renderY),
      contentPx: renderContent,
      x: renderX,
      y: renderY,
      cropExpected: fit === 'cover' && (renderContent.width > viewport.width || renderContent.height > viewport.height),
      paddingExpected: fit === 'contain' && (renderContent.width < viewport.width || renderContent.height < viewport.height),
    },
    sampling: {
      direction: sampleDirection,
      target: semanticViewport,
      content: semanticContent,
      x: sampleX,
      y: sampleY,
      sourcePixelsPerSample: {
        x: rounded(1 / sampleX.ratio),
        y: rounded(1 / sampleY.ratio),
      },
      procedure: samplingProcedure(mode, sampleX, sampleY),
    },
  };
}

function assertDimensions(format, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`${format.toUpperCase()} dimensions must be positive whole pixels — got ${width}x${height}`);
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new RangeError(
      `${format.toUpperCase()} ${width}x${height} exceeds TurtlePen's image safety limit ` +
      `(${MAX_IMAGE_DIMENSION}px per side, ${MAX_IMAGE_PIXELS} pixels total)`,
    );
  }
  return { format, width, height };
}

export function assertByteLength(bytes) {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new RangeError(`image is ${bytes.length} bytes; the embedded-image limit is ${MAX_IMAGE_BYTES} bytes`);
  }
  return bytes;
}

/** Read width, height and format from the file's own header bytes. */
export function probe(bytes) {
  const b = assertByteLength(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));

  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') {
    return assertDimensions('png', b.readUInt32BE(16), b.readUInt32BE(20));
  }
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') {
    return assertDimensions('gif', b.readUInt16LE(6), b.readUInt16LE(8));
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG carries its size in a SOF segment, which sits after a variable run of
    // other markers, so it has to be walked rather than indexed.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return assertDimensions('jpeg', b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
      }
      // SOI, EOI, restart and padding markers carry no length field.
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        i += 2;
        continue;
      }
      if (i + 4 > b.length) break;
      const length = b.readUInt16BE(i + 2);
      if (length < 2 || i + 2 + length > b.length) break;
      i += 2 + length;
    }
    throw new Error('this JPEG has no size marker the header walk could find');
  }
  throw new Error(
    'unrecognised image format — the header matches no PNG, JPEG or GIF signature. ' +
      'TurtlePen reads sizes from headers rather than decoding, so the file must be one of those three.',
  );
}

/**
 * The whole-cell footprint for an image, and how much aspect it costs.
 *
 * Give `maxWidthCells` and the height follows from the source ratio; give
 * `maxHeightCells` instead and the width does.
 */
export function measure({ width, height }, { maxWidthCells = null, maxHeightCells = null } = {}) {
  if (!width || !height) throw new RangeError('an image needs a non-zero width and height to be measured');
  if (maxWidthCells == null && maxHeightCells == null) {
    throw new SyntaxError('measuring an image needs either maxWidthCells or maxHeightCells — otherwise there is no scale to fit to');
  }
  if (maxWidthCells != null && maxHeightCells != null) {
    throw new SyntaxError('measuring an image needs one scale limit, not both maxWidthCells and maxHeightCells');
  }
  const limit = maxWidthCells ?? maxHeightCells;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`image scale limit must be a positive whole-cell count — got ${JSON.stringify(limit)}`);
  }

  const cellsWide = maxWidthCells ?? Math.max(1, Math.round((width / height) * maxHeightCells));
  const cellsTall = maxHeightCells ?? Math.max(1, Math.ceil((height / width) * cellsWide * PX_PER_CELL) / PX_PER_CELL);
  const wholeTall = Math.max(1, Math.ceil(cellsTall));
  const wholeWide = Math.max(1, Math.ceil(cellsWide));

  const sourceAspect = width / height;
  const drawnAspect = (wholeWide * PX_PER_CELL) / (wholeTall * PX_PER_CELL);
  const aspectDriftPct = Math.abs(drawnAspect - sourceAspect) / sourceAspect * 100;

  return {
    cellsWide: wholeWide,
    cellsTall: wholeTall,
    widthPx: wholeWide * PX_PER_CELL,
    heightPx: wholeTall * PX_PER_CELL,
    sourceAspect: Number(sourceAspect.toFixed(4)),
    drawnAspect: Number(drawnAspect.toFixed(4)),
    aspectDriftPct: Number(aspectDriftPct.toFixed(2)),
  };
}

/** Bytes for a `data:` URI or a file already read into memory. */
export function bytesOfDataUri(source) {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(String(source));
  if (!m) return null;
  if (m[2].length % 4 !== 0) throw new SyntaxError('image data URI must contain canonical padded base64');
  const bytes = assertByteLength(Buffer.from(m[2], 'base64'));
  if (bytes.toString('base64') !== m[2]) throw new SyntaxError('image data URI contains malformed base64');
  return { mime: m[1].toLowerCase(), bytes };
}

/** Validate an embedded source against its bytes rather than trusting its label. */
export function assertEmbeddedSource(source) {
  const inline = bytesOfDataUri(source);
  if (!inline) {
    throw new SyntaxError('an image source reaching core must be a base64 data URI; resolve file paths in the tool layer first');
  }
  const info = probe(inline.bytes);
  const expected = MIME_BY_FORMAT[info.format];
  if (inline.mime !== expected) {
    throw new SyntaxError(`image data URI declares ${inline.mime}, but its bytes are ${expected}`);
  }
  return { ...inline, ...info };
}

/**
 * Modes recognised but not yet built. Empty, and it should stay that way:
 * accepting a mode and quietly doing something else is the silent substitution
 * this engine exists to prevent. Add an entry here the moment a mode is named
 * before it works, and remove it in the same change that makes it work.
 */
export const UNIMPLEMENTED = Object.freeze({});

export function assertMode(mode) {
  if (!MODES.includes(mode)) {
    throw new SyntaxError(`unknown image mode "${mode}" — expected ${MODES.join(' or ')}`);
  }
  if (mode in UNIMPLEMENTED) throw new Error(`image mode "${mode}" is not built yet: ${UNIMPLEMENTED[mode]}`);
  return mode;
}
