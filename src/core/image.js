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

/** Read width, height and format from the file's own header bytes. */
export function probe(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') {
    return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') {
    return { format: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG carries its size in a SOF segment, which sits after a variable run of
    // other markers, so it has to be walked rather than indexed.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
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
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(source));
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
}

/**
 * Modes that are recognised but not yet built.
 *
 * Accepting `dither` and quietly drawing an ordinary embed would be exactly the
 * silent substitution this engine exists to prevent — the author would ask for
 * one thing, get another, and nothing would say so. So it refuses, by name, and
 * points at where the work is specified.
 */
export const UNIMPLEMENTED = Object.freeze({
  dither: 'drawing an image into the lattice as stipple needs a PNG decoder (node:zlib, no dependencies). '
    + 'It is specified in prompts/06_IMAGE_DITHER.md of the TurtlePen improvements prompt pack. Use mode "embed" until it is built.',
});

export function assertMode(mode) {
  if (!MODES.includes(mode)) {
    throw new SyntaxError(`unknown image mode "${mode}" — expected ${MODES.join(' or ')}`);
  }
  if (mode in UNIMPLEMENTED) throw new Error(`image mode "${mode}" is not built yet: ${UNIMPLEMENTED[mode]}`);
  return mode;
}
