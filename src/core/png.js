/**
 * A PNG decoder, written on node:zlib alone.
 *
 * Zero runtime dependencies is a design choice in this project, not an
 * accident — it removes install risk and SDK drift from a tool an agent is
 * supposed to be able to pick up and run. Decoding PNG is small enough to own:
 * inflate one stream, reverse five scanline filters, normalise to RGBA.
 *
 * Only what the dither path actually needs is supported: 8-bit samples,
 * non-interlaced, colour types 0, 2, 3, 4 and 6. Everything else is refused BY
 * NAME. A decoder that half-handles a format produces plausible-looking garbage,
 * and plausible-looking garbage is worse here than a clear refusal — the whole
 * engine rests on what is drawn being what was measured.
 */

import { inflateSync } from 'node:zlib';
import { MAX_IMAGE_PIXELS, probe } from './image.js';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channels carried per pixel, by PNG colour type. */
const CHANNELS = Object.freeze({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });

const COLOUR_NAME = Object.freeze({
  0: 'greyscale', 2: 'truecolour', 3: 'palette', 4: 'greyscale+alpha', 6: 'truecolour+alpha',
});

/**
 * The Paeth predictor, from the PNG specification. Picks whichever of the left,
 * above, or upper-left neighbour is closest to their linear estimate.
 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Walk the chunk stream, collecting what we need and ignoring the rest. */
function readChunks(b) {
  const out = { idat: [], plte: null, trns: null, ihdr: null };
  let i = 8;
  while (i + 12 <= b.length) {
    const length = b.readUInt32BE(i);
    if (length > b.length - i - 12) {
      throw new Error(`PNG chunk at byte ${i} declares ${length} data bytes beyond the end of the file`);
    }
    const type = b.toString('ascii', i + 4, i + 8);
    const data = b.subarray(i + 8, i + 8 + length);
    if (type === 'IHDR') out.ihdr = data;
    else if (type === 'IDAT') out.idat.push(data);
    else if (type === 'PLTE') out.plte = data;
    else if (type === 'tRNS') out.trns = data;
    else if (type === 'IEND') break;
    i += 12 + length; // length + type + data + crc
  }
  return out;
}

/**
 * @param {Buffer|Uint8Array} bytes
 * @returns {{width:number, height:number, pixels:Uint8Array}} pixels are RGBA
 */
export function decode(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (b.length < 8 || !b.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG — the eight-byte signature does not match. Dithering decodes PNG only; other formats can still be placed with mode "embed".');
  }

  const { ihdr, idat, plte } = readChunks(b);
  if (!ihdr) throw new Error('this PNG has no IHDR chunk');
  if (ihdr.length !== 13) throw new Error(`this PNG has an ${ihdr.length}-byte IHDR chunk; the PNG format requires 13`);

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  probe(b); // Applies byte, dimension and pixel-count safety limits.
  const bitDepth = ihdr[8];
  const colourType = ihdr[9];
  const interlace = ihdr[12];

  if (interlace !== 0) {
    throw new Error('this PNG is interlaced (Adam7). Only non-interlaced PNGs are decoded — re-save it without interlacing, or place it with mode "embed".');
  }
  if (bitDepth !== 8) {
    throw new Error(`this PNG is ${bitDepth}-bit. Only 8-bit samples are decoded — re-save it at 8 bits, or place it with mode "embed".`);
  }
  const channels = CHANNELS[colourType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colourType}`);
  if (colourType === 3 && !plte) throw new Error('this PNG declares a palette but carries no PLTE chunk');
  if (!idat.length) throw new Error('this PNG has no IDAT data');

  const stride = width * channels;
  const expected = height * (stride + 1);
  if (width * height > MAX_IMAGE_PIXELS || !Number.isSafeInteger(expected)) {
    throw new RangeError(`PNG ${width}x${height} is too large to decode safely`);
  }
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  } catch (error) {
    throw new Error(`PNG pixel stream could not be decoded within its declared ${width}x${height} extent: ${error.message}`);
  }
  if (raw.length !== expected) {
    throw new Error(`this PNG decompressed to ${raw.length} bytes but exactly ${expected} were required for ${width}x${height} ${COLOUR_NAME[colourType]}`);
  }

  // Un-filter in place, row by row. Each scanline is prefixed by its filter type
  // and predicts from the already-reconstructed bytes to its left and above.
  const lines = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? lines[dst + i - channels] : 0;
      const bb = y > 0 ? lines[up + i] : 0;
      const c = y > 0 && i >= channels ? lines[up + i - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + bb; break;
        case 3: v = x + ((a + bb) >> 1); break;
        case 4: v = x + paeth(a, bb, c); break;
        default: throw new Error(`PNG scanline ${y} uses filter type ${filter}, which is not one of the five defined by the specification`);
      }
      lines[dst + i] = v & 0xff;
    }
  }

  // Normalise every colour type to RGBA, so nothing downstream branches on it.
  const pixels = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const s = p * channels;
    const d = p * 4;
    switch (colourType) {
      case 0:
        pixels[d] = pixels[d + 1] = pixels[d + 2] = lines[s];
        pixels[d + 3] = 255;
        break;
      case 2:
        pixels[d] = lines[s]; pixels[d + 1] = lines[s + 1]; pixels[d + 2] = lines[s + 2];
        pixels[d + 3] = 255;
        break;
      case 3: {
        const idx = lines[s] * 3;
        pixels[d] = plte[idx]; pixels[d + 1] = plte[idx + 1]; pixels[d + 2] = plte[idx + 2];
        pixels[d + 3] = 255;
        break;
      }
      case 4:
        pixels[d] = pixels[d + 1] = pixels[d + 2] = lines[s];
        pixels[d + 3] = lines[s + 1];
        break;
      default: // 6
        pixels[d] = lines[s]; pixels[d + 1] = lines[s + 1];
        pixels[d + 2] = lines[s + 2]; pixels[d + 3] = lines[s + 3];
    }
  }

  return { width, height, pixels };
}
