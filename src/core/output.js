/** Deterministic zero-dependency PNG and PDF output. */

import { deflateSync } from 'node:zlib';

import { PX_PER_QUAD, toPx } from './geometry.js';
import { contentBounds, elementsOf, microMasksOf } from './document.js';
import { decode as decodePng } from './png.js';
import { PALETTE } from './svg.js';
import { capQuads, containerBand, isContainer, shapeTextRect, visualQuads } from './shapes.js';
import { layoutTextRuns } from './text.js';
import { generatedKey, resolveView, styleForElement } from './workspace.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let crcTable = null;

function table() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  return crcTable;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table()[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}

export function encodePng({ width, height, pixels }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('PNG dimensions must be positive integers');
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) throw new RangeError('PNG pixels must be width x height RGBA bytes');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const destination = y * (width * 4 + 1);
    scanlines[destination] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(scanlines, destination + 1);
  }
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function rgba(value) {
  const source = String(value);
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(source)) throw new SyntaxError(`cannot rasterize invalid colour ${JSON.stringify(value)}`);
  const hex = source.length === 4
    ? source.slice(1).split('').map((ch) => ch + ch).join('')
    : source.slice(1);
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
}

function withAlpha(color, opacity) {
  const out = [...color];
  out[3] = Math.round(out[3] * Math.max(0, Math.min(1, opacity)));
  return out;
}

function mix(a, b, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

function paintAt(paint, x, y, width, height) {
  if (typeof paint === 'string') return rgba(paint);
  const from = rgba(paint.from);
  const to = rgba(paint.to);
  const angle = (paint.angle * Math.PI) / 180;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const nx = width <= 1 ? 0 : x / (width - 1) - 0.5;
  const ny = height <= 1 ? 0 : y / (height - 1) - 0.5;
  const radius = Math.max(0.000001, (Math.abs(dx) + Math.abs(dy)) / 2);
  return mix(from, to, (nx * dx + ny * dy + radius) / (radius * 2));
}

function put(pixels, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  for (let i = 0; i < 4; i++) pixels[index + i] = color[i];
}

function rect(pixels, width, height, x, y, w, h, color) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) put(pixels, width, height, px, py, color);
  }
}

function paintedRect(pixels, width, height, x, y, w, h, paint, originX = x, originY = y, paintW = w, paintH = h) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      put(pixels, width, height, px, py, paintAt(paint, px - originX, py - originY, paintW, paintH));
    }
  }
}

function composite(base, layer, opacity = 1) {
  for (let i = 0; i < base.length; i += 4) {
    const alpha = (layer[i + 3] / 255) * opacity;
    if (!alpha) continue;
    base[i] = Math.round(layer[i] * alpha + base[i] * (1 - alpha));
    base[i + 1] = Math.round(layer[i + 1] * alpha + base[i + 1] * (1 - alpha));
    base[i + 2] = Math.round(layer[i + 2] * alpha + base[i + 2] * (1 - alpha));
    base[i + 3] = 255;
  }
}

const FONT = Object.freeze({
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'], J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'], X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'], '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'], '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'], '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'], '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'], '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'], '"': ['01010','01010','01010','00000','00000','00000','00000'],
  '#': ['01010','11111','01010','01010','11111','01010','00000'], '$': ['00100','01111','10100','01110','00101','11110','00100'],
  '%': ['11001','11010','00100','01000','10110','00110','00000'], '&': ['01100','10010','10100','01000','10101','10010','01101'],
  "'": ['00100','00100','01000','00000','00000','00000','00000'], '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'], '*': ['00000','10101','01110','11111','01110','10101','00000'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'], ',': ['00000','00000','00000','00000','00110','00100','01000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'], '.': ['00000','00000','00000','00000','00000','00110','00110'],
  '/': ['00001','00010','00100','01000','10000','00000','00000'], ':': ['00000','00110','00110','00000','00110','00110','00000'],
  ';': ['00000','00110','00110','00000','00110','00100','01000'], '<': ['00010','00100','01000','10000','01000','00100','00010'],
  '=': ['00000','00000','11111','00000','11111','00000','00000'], '>': ['01000','00100','00010','00001','00010','00100','01000'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'], '@': ['01110','10001','10111','10101','10111','10000','01110'],
  '[': ['01110','01000','01000','01000','01000','01000','01110'], '\\': ['10000','01000','00100','00010','00001','00000','00000'],
  ']': ['01110','00010','00010','00010','00010','00010','01110'], '^': ['00100','01010','10001','00000','00000','00000','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'], '`': ['01000','00100','00010','00000','00000','00000','00000'],
  '{': ['00010','00100','00100','01000','00100','00100','00010'], '|': ['00100','00100','00100','00100','00100','00100','00100'],
  '}': ['01000','00100','00100','00010','00100','00100','01000'], '~': ['00000','00000','01001','10110','00000','00000','00000'],
});

function normalizeRasterText(value) {
  return String(value)
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2192/g, '>')
    .replace(/\u2190/g, '<')
    .replace(/\u2194/g, '=')
    .replace(/\u2022/g, '*')
    .replace(/\u00b0/g, 'O')
    .toUpperCase();
}

function bitmapRun(layer, width, height, value, x, y, advance, fontSize, color, weight = 400) {
  const text = normalizeRasterText(value);
  const glyphWidth = Math.max(1, advance - 1);
  const glyphHeight = Math.max(1, Math.round(fontSize));
  const embolden = Math.max(0, Math.min(2, Math.floor((weight - 400) / 200)));
  for (let index = 0; index < text.length; index++) {
    const glyph = FONT[text[index]] ?? (text[index] === ' ' ? null : FONT['?']);
    if (!glyph) continue;
    glyph.forEach((bits, gy) => [...bits].forEach((bit, gx) => {
      if (bit !== '1') return;
      const left = Math.floor((gx * glyphWidth) / 5);
      const right = Math.max(left + 1, Math.floor(((gx + 1) * glyphWidth) / 5));
      const top = Math.floor((gy * glyphHeight) / 7);
      const bottom = Math.max(top + 1, Math.floor(((gy + 1) * glyphHeight) / 7));
      const cellX = x + index * advance;
      rect(layer, width, height, cellX + left, y + top, Math.min(glyphWidth - left, right - left + embolden), bottom - top, color);
    }));
  }
}

function paintTextLayout(layer, width, height, value, boxRect, { fontSize, paddingQuads = 0, align = 'left', verticalAlign = 'top', color, weight = 400, ox, oy }) {
  const layout = layoutTextRuns(value, boxRect, { fontSize, paddingQuads, align, verticalAlign });
  for (const run of layout.runs) {
    const advance = run.text.length ? Math.max(1, Math.round(run.width / run.text.length)) : 1;
    bitmapRun(layer, width, height, run.text, run.x + ox, run.y + oy, advance, fontSize, color, weight);
  }
}

function linePoints(a, b) {
  const points = [];
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), sx = a.x < b.x ? 1 : -1;
  const dy = -Math.abs(b.y - a.y), sy = a.y < b.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === b.x && y === b.y) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

function thickLine(pixels, width, height, a, b, color, thickness = 1) {
  const size = Math.max(1, Math.round(thickness));
  const offset = Math.floor(size / 2);
  for (const point of linePoints(a, b)) rect(pixels, width, height, point.x - offset, point.y - offset, size, size, color);
}

function fillPolygon(pixels, width, height, points, color) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((point) => point.y))));
  for (let y = minY; y <= maxY; y++) {
    const crossings = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      rect(pixels, width, height, Math.ceil(crossings[i]), y, Math.max(1, Math.floor(crossings[i + 1]) - Math.ceil(crossings[i]) + 1), 1, color);
    }
  }
}

function drawCellShape(layer, width, height, element, ox, oy, fill, stroke) {
  const r = element.rect;
  const x = r.x * PX_PER_QUAD + ox, y = r.y * PX_PER_QUAD + oy;
  const w = r.w * PX_PER_QUAD, h = r.h * PX_PER_QUAD;
  const shape = element.shape ?? 'process';

  if (isContainer(shape)) {
    paintedRect(layer, width, height, x, y, w, h, fill);
    rect(layer, width, height, x, y, w, 1, stroke);
    rect(layer, width, height, x, y + h - 1, w, 1, stroke);
    rect(layer, width, height, x, y, 1, h, stroke);
    rect(layer, width, height, x + w - 1, y, 1, h, stroke);
    const bandY = y + containerBand(r) * PX_PER_QUAD;
    rect(layer, width, height, x, bandY, w, 1, stroke);
    return;
  }

  const ink = visualQuads(r, element.corner ?? 'square', shape);
  const has = (qx, qy) => ink.has(`${qx},${qy}`);
  for (let qy = r.y; qy < r.y + r.h; qy++) {
    for (let qx = r.x; qx < r.x + r.w; qx++) {
      if (!has(qx, qy)) continue;
      const px = qx * PX_PER_QUAD + ox, py = qy * PX_PER_QUAD + oy;
      paintedRect(layer, width, height, px, py, PX_PER_QUAD, PX_PER_QUAD, fill, x, y, w, h);
      if (!has(qx, qy - 1)) rect(layer, width, height, px, py, PX_PER_QUAD, 1, stroke);
      if (!has(qx, qy + 1)) rect(layer, width, height, px, py + PX_PER_QUAD - 1, PX_PER_QUAD, 1, stroke);
      if (!has(qx - 1, qy)) rect(layer, width, height, px, py, 1, PX_PER_QUAD, stroke);
      if (!has(qx + 1, qy)) rect(layer, width, height, px + PX_PER_QUAD - 1, py, 1, PX_PER_QUAD, stroke);
    }
  }

  if (shape === 'subprocess') {
    rect(layer, width, height, x + 10, y, 1, h, stroke);
    rect(layer, width, height, x + w - 10, y, 1, h, stroke);
  }
  if (shape === 'data') {
    // Same whole-quadrant cap the SVG and the aperture use. This rounded where they
    // did not, so the PNG drew a different shape from the SVG of the same document.
    // `h` here is already pixels, so the quadrant count is taken from the rect.
    const cap = Math.max(1, capQuads(r.h) * PX_PER_QUAD);
    let previous = null;
    for (let i = 0; i <= w; i++) {
      // The back edge is the FAR side of the top ellipse, so it bulges DOWN into the
      // body. This was `- sin`, which bulged up and traced the silhouette instead:
      // two stacked upward curves, which is what made every cylinder look melted.
      // The SVG had it right all along — its arc carries sweep flag 0.
      const point = { x: x + i, y: Math.round(y + cap + Math.sin((i / Math.max(1, w)) * Math.PI) * cap) };
      if (previous) thickLine(layer, width, height, previous, point, stroke);
      previous = point;
    }
  }
}

function drawArrow(layer, width, height, piece, ox, oy, color) {
  const x = piece.x * PX_PER_QUAD + ox, y = piece.y * PX_PER_QUAD + oy, s = PX_PER_QUAD;
  const points = {
    right: [{ x, y }, { x: x + s, y: y + Math.floor(s / 2) }, { x, y: y + s }],
    left: [{ x: x + s, y }, { x, y: y + Math.floor(s / 2) }, { x: x + s, y: y + s }],
    down: [{ x, y }, { x: x + Math.floor(s / 2), y: y + s }, { x: x + s, y }],
    up: [{ x, y: y + s }, { x: x + Math.floor(s / 2), y }, { x: x + s, y: y + s }],
  }[piece.dir] ?? [{ x, y }, { x: x + s, y: y + Math.floor(s / 2) }, { x, y: y + s }];
  fillPolygon(layer, width, height, points, color);
}

function paintPath(element, layer, width, height, ox, oy, themed) {
  const stroke = element.stroke;
  const defaultColor = rgba(themed.stroke ?? stroke?.color ?? PALETTE.ink);
  if (!stroke || stroke.paint === 'cells') {
    for (const piece of element.pieces) {
      const color = rgba(themed.stroke ?? piece.color ?? stroke?.color ?? PALETTE.ink);
      if (piece.type === 'arrow') drawArrow(layer, width, height, piece, ox, oy, color);
      else rect(layer, width, height, piece.x * PX_PER_QUAD + ox, piece.y * PX_PER_QUAD + oy, PX_PER_QUAD, PX_PER_QUAD, piece.opacity == null ? color : withAlpha(color, piece.opacity));
    }
  } else {
    const groups = [];
    let group = [];
    for (const piece of element.pieces) {
      const previous = group.at(-1);
      if (previous && (Math.abs(piece.x - previous.x) > 1 || Math.abs(piece.y - previous.y) > 1)) {
        groups.push(group);
        group = [];
      }
      group.push(piece);
    }
    if (group.length) groups.push(group);
    for (const pieces of groups) {
      if (pieces.length === 1) {
        const p = pieces[0];
        rect(layer, width, height, p.x * PX_PER_QUAD + ox, p.y * PX_PER_QUAD + oy, PX_PER_QUAD, PX_PER_QUAD, defaultColor);
      } else {
        for (let i = 1; i < pieces.length; i++) {
          const a = pieces[i - 1], b = pieces[i];
          thickLine(layer, width, height,
            { x: a.x * PX_PER_QUAD + ox + 2, y: a.y * PX_PER_QUAD + oy + 2 },
            { x: b.x * PX_PER_QUAD + ox + 2, y: b.y * PX_PER_QUAD + oy + 2 },
            defaultColor, stroke.width);
        }
      }
    }
    for (const piece of element.pieces.filter((entry) => entry.type === 'arrow')) drawArrow(layer, width, height, piece, ox, oy, rgba(piece.color ?? themed.stroke ?? stroke.color));
  }

  if (element.relationshipLabel && element.pieces.length) {
    const point = element.pieces[Math.floor(element.pieces.length / 2)];
    const label = String(element.relationshipLabel);
    const textColor = rgba(themed.text ?? PALETTE.ink);
    const x = point.x * PX_PER_QUAD + ox + 2 - Math.floor(label.length * 3);
    const y = point.y * PX_PER_QUAD + oy - 14;
    rect(layer, width, height, x - 2, y, label.length * 6 + 4, 14, rgba(PALETTE.paper));
    bitmapRun(layer, width, height, label, x, y + 2, 6, 10, textColor);
  }
}

function paintEmbeddedImage(layer, width, height, source, x, y, w, h, fit) {
  const scale = fit === 'cover' ? Math.max(w / source.width, h / source.height) : Math.min(w / source.width, h / source.height);
  const drawW = Math.max(1, Math.round(source.width * scale));
  const drawH = Math.max(1, Math.round(source.height * scale));
  const left = x + Math.floor((w - drawW) / 2);
  const top = y + Math.floor((h - drawH) / 2);
  for (let py = Math.max(y, top); py < Math.min(y + h, top + drawH); py++) {
    for (let px = Math.max(x, left); px < Math.min(x + w, left + drawW); px++) {
      const sx = Math.min(source.width - 1, Math.max(0, Math.floor(((px - left) / drawW) * source.width)));
      const sy = Math.min(source.height - 1, Math.max(0, Math.floor(((py - top) / drawH) * source.height)));
      const index = (sy * source.width + sx) * 4;
      put(layer, width, height, px, py, source.pixels.subarray(index, index + 4));
    }
  }
}

function eraseMasks(layer, width, height, masks, ox, oy) {
  const clear = (point) => {
    const x = point.x + ox, y = point.y + oy;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    layer[(y * width + x) * 4 + 3] = 0;
  };
  for (const mask of masks) {
    if (mask.points.length === 1) clear(mask.points[0]);
    for (let i = 1; i < mask.points.length; i++) for (const point of linePoints(mask.points[i - 1], mask.points[i])) clear(point);
  }
}

function paintElement(doc, element, layer, width, height, ox, oy, perspective) {
  const themed = styleForElement(doc, element, perspective);
  const ink = rgba(themed.stroke ?? PALETTE.ink);
  if (element.kind === 'path') {
    paintPath(element, layer, width, height, ox, oy, themed);
    return themed.opacity ?? 1;
  }
  const x = element.rect.x * PX_PER_QUAD + ox, y = element.rect.y * PX_PER_QUAD + oy;
  const w = element.rect.w * PX_PER_QUAD, h = element.rect.h * PX_PER_QUAD;
  if (element.kind === 'box') {
    drawCellShape(layer, width, height, element, ox, oy, element.fill ?? themed.fill ?? PALETTE.paperAlt, ink);
    if (element.label) {
      paintTextLayout(layer, width, height, element.label, shapeTextRect(element.rect, element.shape ?? 'process'), {
        fontSize: element.fontSize,
        paddingQuads: doc.font.paddingQuads,
        align: element.align,
        verticalAlign: 'center',
        color: rgba(themed.text ?? PALETTE.ink),
        ox,
        oy,
      });
    }
    return element.opacity ?? themed.opacity ?? 1;
  } else if (element.kind === 'text') {
    paintTextLayout(layer, width, height, element.text, element.rect, {
      fontSize: element.fontSize,
      align: element.align,
      color: rgba(element.color ?? themed.text ?? PALETTE.inkSoft),
      weight: element.weight ?? 400,
      ox,
      oy,
    });
    return 1;
  } else if (element.kind === 'image' && element.mode !== 'embed') {
    for (const run of element.runs ?? []) {
      rect(layer, width, height, x + run.x * PX_PER_QUAD, y + run.y * PX_PER_QUAD, run.w * PX_PER_QUAD, PX_PER_QUAD, run.opacity == null ? ink : withAlpha(ink, run.opacity));
    }
    return element.opacity ?? 1;
  } else if (element.kind === 'image' && element.source?.startsWith('data:image/png;base64,')) {
    const source = decodePng(Buffer.from(element.source.slice('data:image/png;base64,'.length), 'base64'));
    paintEmbeddedImage(layer, width, height, source, x, y, w, h, element.fit ?? 'contain');
    return element.opacity ?? 1;
  } else if (element.kind === 'image') {
    rect(layer, width, height, x, y, w, h, rgba(PALETTE.paperAlt));
    for (const point of linePoints({ x, y }, { x: x + w - 1, y: y + h - 1 })) put(layer, width, height, point.x, point.y, ink);
    for (const point of linePoints({ x: x + w - 1, y }, { x, y: y + h - 1 })) put(layer, width, height, point.x, point.y, ink);
    return element.opacity ?? 1;
  }
  return 1;
}

export function rasterizeDocument(doc, { view = null, pages = null, showGrid = true, margin = 20, bounds = 'content' } = {}) {
  if (!['content', 'canvas'].includes(bounds)) throw new SyntaxError('PNG bounds must be content or canvas');
  const resolved = resolveView(doc, view);
  const selectedPages = pages ?? (resolved.view?.pages.length ? resolved.view.pages : null);
  const visible = (selectedPages ? doc.pages.filter((page) => selectedPages.includes(page.id)) : doc.pages)
    .filter((page) => page.visible !== false).sort((a, b) => a.z - b.z);
  const projected = view == null ? doc : {
    ...doc,
    elements: Object.fromEntries(doc.pages.map((page) => [page.id, elementsOf(doc, page.id).filter((element) => resolved.elementIds.has(element.id))])),
  };
  const b = bounds === 'canvas'
    ? { x: 0, y: 0, w: doc.canvas.cols * 2, h: doc.canvas.rows * 2 }
    : contentBounds(projected) ?? { x: 0, y: 0, w: 40, h: 24 };
  const px = toPx(b);
  const key = resolved.view?.showKey ? generatedKey(doc, view) : null;
  const keyWidth = key?.entries.length ? 180 : 0;
  const width = px.w + margin * 2 + keyWidth, height = px.h + margin * 2;
  const ox = margin - px.x, oy = margin - px.y;
  const pixels = new Uint8Array(width * height * 4);
  rect(pixels, width, height, 0, 0, width, height, rgba(doc.background ?? doc.theme?.tokens?.paper ?? PALETTE.paper));
  if (showGrid) {
    const minor = rgba(doc.theme?.tokens?.grid ?? PALETTE.grid);
    const major = rgba(doc.theme?.tokens?.gridMajor ?? PALETTE.gridMajor);
    for (let x = Math.floor(px.x / 10) * 10; x <= px.x + px.w; x += 10) rect(pixels, width, height, x + ox, 0, 1, height, x % 100 === 0 ? major : minor);
    for (let y = Math.floor(px.y / 10) * 10; y <= px.y + px.h; y += 10) rect(pixels, width, height, 0, y + oy, width, 1, y % 100 === 0 ? major : minor);
  }
  for (const page of visible) {
    for (const element of elementsOf(doc, page.id).filter((entry) => resolved.elementIds.has(entry.id))) {
      const layer = new Uint8Array(pixels.length);
      const opacity = paintElement(doc, element, layer, width, height, ox, oy, resolved.view?.perspective ?? null);
      eraseMasks(layer, width, height, microMasksOf(doc).filter((mask) => mask.target === element.id), ox, oy);
      composite(pixels, layer, (page.opacity ?? 1) * opacity);
    }
  }
  if (key?.entries.length) {
    const x = px.w + margin * 2 + 12;
    bitmapRun(pixels, width, height, key.title, x, margin, 6, 10, rgba(PALETTE.ink), 700);
    key.entries.forEach((entry, index) => {
      const y = margin + 18 + index * 18;
      rect(pixels, width, height, x, y, 12, 12, rgba(entry.fill ?? PALETTE.paperAlt));
      rect(pixels, width, height, x, y, 12, 1, rgba(entry.stroke ?? PALETTE.ink));
      rect(pixels, width, height, x, y + 11, 12, 1, rgba(entry.stroke ?? PALETTE.ink));
      rect(pixels, width, height, x, y, 1, 12, rgba(entry.stroke ?? PALETTE.ink));
      rect(pixels, width, height, x + 11, y, 1, 12, rgba(entry.stroke ?? PALETTE.ink));
      bitmapRun(pixels, width, height, entry.label, x + 18, y + 1, 6, 10, rgba(entry.text ?? PALETTE.ink));
    });
  }
  return { width, height, pixels };
}

export function renderPng(doc, options = {}) {
  return encodePng(rasterizeDocument(doc, options));
}

function pdfObject(number, body) {
  return Buffer.from(number + ' 0 obj\n' + body + '\nendobj\n', 'binary');
}

export function renderPdf(doc, options = {}) {
  const raster = rasterizeDocument(doc, options);
  const rgb = Buffer.alloc(raster.width * raster.height * 3);
  for (let source = 0, destination = 0; source < raster.pixels.length; source += 4) {
    rgb[destination++] = raster.pixels[source];
    rgb[destination++] = raster.pixels[source + 1];
    rgb[destination++] = raster.pixels[source + 2];
  }
  const compressed = deflateSync(rgb, { level: 9 });
  const pageW = Number((raster.width * 0.75).toFixed(2));
  const pageH = Number((raster.height * 0.75).toFixed(2));
  const content = Buffer.from('q\n' + pageW + ' 0 0 ' + pageH + ' 0 0 cm\n/Im0 Do\nQ\n', 'ascii');
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from('4 0 obj\n<< /Length ' + content.length + ' >>\nstream\n', 'ascii'), content, Buffer.from('endstream\nendobj\n', 'ascii')]),
    Buffer.concat([Buffer.from('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + raster.width + ' /Height ' + raster.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ' + compressed.length + ' >>\nstream\n', 'ascii'), compressed, Buffer.from('\nendstream\nendobj\n', 'ascii')]),
  ];
  const header = Buffer.from('%PDF-1.4\n%TurtlePen\n', 'binary');
  const offsets = [0];
  let cursor = header.length;
  for (const object of objects) { offsets.push(cursor); cursor += object.length; }
  const xrefAt = cursor;
  const xref = ['xref', '0 6', '0000000000 65535 f '];
  for (let i = 1; i <= 5; i++) xref.push(String(offsets[i]).padStart(10, '0') + ' 00000 n ');
  const trailer = Buffer.from(xref.join('\n') + '\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n', 'ascii');
  return Buffer.concat([header, ...objects, trailer]);
}
