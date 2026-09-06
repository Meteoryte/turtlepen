/**
 * A minimal animated GIF89a encoder.
 *
 * Pixel art is already palette art: the fighter uses ten colours, so an indexed
 * format is the honest container for it and costs nothing in fidelity. This
 * exists rather than a dependency because the whole engine has zero runtime
 * deps, and because GIF's one hard constraint — 256 colours — is a constraint
 * the source already satisfies by construction.
 *
 * Frames must all be the same size. The caller rasterises with bounds:"canvas"
 * for exactly that reason: content-cropped frames would each have their own
 * dimensions and the animation would jitter as the crop moved.
 */

/** GIF's LZW: variable code width, restarting at a clear code when the table fills. */
function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();

  const out = [];
  let cur = 0;
  let bits = 0;
  const emit = (code) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>= 8;
      bits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    if (dict.has(key)) {
      prefix = dict.get(key);
      continue;
    }
    emit(prefix);
    dict.set(key, next);
    next += 1;
    if (next > (1 << codeSize) && codeSize < 12) codeSize += 1;
    if (next >= 4096) {
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 0xff);
  return out;
}

function subBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

/**
 * @param {{width:number,height:number,frames:{pixels:Uint8Array,delayMs:number}[],loop?:number}} spec
 * RGBA frames in, one GIF Buffer out.
 */
export function encodeGif({ width, height, frames, loop = 0 }) {
  // One palette for the whole animation. Built from every frame, so a colour
  // that only appears on the impact frame is still present in the table.
  const paletteIndex = new Map();
  const palette = [];
  for (const frame of frames) {
    for (let i = 0; i < frame.pixels.length; i += 4) {
      const key = (frame.pixels[i] << 16) | (frame.pixels[i + 1] << 8) | frame.pixels[i + 2];
      if (!paletteIndex.has(key)) {
        paletteIndex.set(key, palette.length);
        palette.push(key);
      }
    }
  }
  if (palette.length > 256) throw new Error(`${palette.length} colours — GIF allows 256`);

  let bits = 1;
  while ((1 << bits) < palette.length) bits += 1;
  const tableSize = 1 << bits;

  const bytes = [];
  const push = (...v) => bytes.push(...v);
  const short = (n) => push(n & 0xff, (n >> 8) & 0xff);
  const str = (s) => push(...[...s].map((c) => c.charCodeAt(0)));

  str('GIF89a');
  short(width);
  short(height);
  push(0x80 | (bits - 1), 0, 0);           // global table present, its size
  for (let i = 0; i < tableSize; i += 1) {
    const c = palette[i] ?? 0;
    push((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
  }

  // NETSCAPE2.0 — the only way to say "loop" in a format that never planned to.
  push(0x21, 0xff, 11);
  str('NETSCAPE2.0');
  push(3, 1);
  short(loop);
  push(0);

  for (const frame of frames) {
    const delay = Math.max(2, Math.round(frame.delayMs / 10));   // GIF ticks are 10ms
    push(0x21, 0xf9, 4, 0x04, delay & 0xff, (delay >> 8) & 0xff, 0, 0);
    push(0x2c);
    short(0); short(0); short(width); short(height);
    push(0);

    const indices = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < frame.pixels.length; i += 4, p += 1) {
      const key = (frame.pixels[i] << 16) | (frame.pixels[i + 1] << 8) | frame.pixels[i + 2];
      indices[p] = paletteIndex.get(key);
    }
    const minCodeSize = Math.max(2, bits);
    push(minCodeSize, ...subBlocks(lzw(indices, minCodeSize)));
  }

  push(0x3b);
  return Buffer.from(bytes);
}
