/**
 * A minimal PNG encoder, for tests only.
 *
 * Fixtures are built here rather than checked in as binaries, so a reader can
 * see exactly what pixels a test is asserting on. It can emit any of the five
 * scanline filter types on demand, which is what makes the decoder's filter
 * reversal testable one case at a time.
 */

import { deflateSync } from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Apply a PNG scanline filter forward (the encoder direction). */
function applyFilter(type, raw, prev, bpp) {
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const a = i >= bpp ? raw[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    let v;
    switch (type) {
      case 0: v = raw[i]; break;
      case 1: v = raw[i] - a; break;
      case 2: v = raw[i] - b; break;
      case 3: v = raw[i] - Math.floor((a + b) / 2); break;
      case 4: v = raw[i] - paeth(a, b, c); break;
      default: throw new Error(`no such filter ${type}`);
    }
    out[i] = v & 0xff;
  }
  return out;
}

/**
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} samples  raw channel bytes, w*h*channels, no filter bytes
 * @param {{colorType?:number, filter?:number|number[], palette?:number[][]}} opts
 */
export function encodePng(w, h, samples, { colorType = 2, filter = 0, palette = null } = {}) {
  const ch = CHANNELS[colorType];
  const stride = w * ch;
  const filters = Array.isArray(filter) ? filter : new Array(h).fill(filter);

  const rows = [];
  let prev = null;
  for (let y = 0; y < h; y++) {
    const raw = Buffer.from(samples.slice(y * stride, (y + 1) * stride));
    rows.push(Buffer.concat([Buffer.from([filters[y]]), applyFilter(filters[y], raw, prev, ch)]));
    prev = raw;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;           // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // deflate, adaptive filtering, no interlace

  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
  ];
  if (palette) parts.push(chunk('PLTE', Buffer.from(palette.flat())));
  parts.push(chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** A solid w*h image of one RGB colour. */
export function solidPng(w, h, [r, g, b]) {
  const s = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { s[i * 3] = r; s[i * 3 + 1] = g; s[i * 3 + 2] = b; }
  return encodePng(w, h, s, { colorType: 2 });
}

export const dataUri = (bytes) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
