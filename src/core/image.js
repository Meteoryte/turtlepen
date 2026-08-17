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
 * Whole cells mean an image almost never lands on its exact source aspect. That
 * rounding is real, so it is reported as `aspectDriftPct` rather than absorbed —
 * the engine measures and reports; the author decides whether 1.4% of squash
 * matters for this picture.
 *
 * No decoding happens here beyond the header. `embed` needs none, and the
 * project's zero-dependency stance means the pixel-level `dither` mode is built
 * separately, on node:zlib, for PNG only.
 */

import { PX_PER_CELL } from './geometry.js';

export const MODES = Object.freeze(['embed', 'dither']);
export const MIME_BY_FORMAT = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
});
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;

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
