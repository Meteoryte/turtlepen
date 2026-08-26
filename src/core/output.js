/** Deterministic zero-dependency PNG and PDF output. */

import { deflateSync } from 'node:zlib';

import { PX_PER_QUAD, toPx } from './geometry.js';
import { contentBounds, elementsOf, microMasksOf } from './document.js';
import { decode as decodePng } from './png.js';
import { PALETTE } from './svg.js';
import { resolveView, styleForElement } from './workspace.js';

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
  const hex = source.length === 4
    ? source.slice(1).split('').map((ch) => ch + ch).join('')
    : source.slice(1);
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
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
  '-': ['00000','00000','00000','11111','00000','00000','00000'], '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ':': ['00000','00110','00110','00000','00110','00110','00000'], '?': ['01110','10001','00001','00010','00100','00000','00100'],
});

function bitmapText(layer, width, height, value, x, y, maxWidth, color) {
  const text = String(value).toUpperCase();
  const scale = 1;
  const advance = 6 * scale;
  const chars = Math.max(1, Math.floor(maxWidth / advance));
  let line = 0;
  for (let index = 0; index < text.length; index++) {
    const column = index % chars;
    if (column === 0 && index > 0) line += 1;
    const glyph = FONT[text[index]] ?? (text[index] === ' ' ? null : FONT['?']);
    if (!glyph) continue;
    glyph.forEach((bits, gy) => [...bits].forEach((bit, gx) => {
      if (bit === '1') rect(layer, width, height, x + column * advance + gx * scale, y + line * 8 + gy * scale, scale, scale, color);
    }));
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
    const paint = rgba(themed.stroke ?? element.stroke?.color ?? PALETTE.ink);
    for (const piece of element.pieces) rect(layer, width, height, piece.x * PX_PER_QUAD + ox, piece.y * PX_PER_QUAD + oy, PX_PER_QUAD, PX_PER_QUAD, paint);
    if (element.relationshipLabel) {
      const point = element.pieces[Math.floor(element.pieces.length / 2)];
      bitmapText(layer, width, height, element.relationshipLabel, point.x * PX_PER_QUAD + ox, point.y * PX_PER_QUAD + oy - 9, element.relationshipLabel.length * 6, rgba(themed.text ?? PALETTE.ink));
    }
    return;
  }
  const x = element.rect.x * PX_PER_QUAD + ox, y = element.rect.y * PX_PER_QUAD + oy;
  const w = element.rect.w * PX_PER_QUAD, h = element.rect.h * PX_PER_QUAD;
  if (element.kind === 'box') {
    rect(layer, width, height, x, y, w, h, rgba(themed.fill ?? (typeof element.fill === 'string' ? element.fill : PALETTE.paperAlt)));
    rect(layer, width, height, x, y, w, 1, ink); rect(layer, width, height, x, y + h - 1, w, 1, ink);
    rect(layer, width, height, x, y, 1, h, ink); rect(layer, width, height, x + w - 1, y, 1, h, ink);
    if (element.label) bitmapText(layer, width, height, element.label, x + 4, y + Math.max(2, Math.floor((h - 7) / 2)), Math.max(1, w - 8), rgba(themed.text ?? PALETTE.ink));
  } else if (element.kind === 'text') {
    bitmapText(layer, width, height, element.text, x, y, w, rgba(element.color ?? themed.text ?? PALETTE.inkSoft));
  } else if (element.kind === 'image' && element.mode !== 'embed') {
    for (const run of element.runs ?? []) rect(layer, width, height, x + run.x * PX_PER_QUAD, y + run.y * PX_PER_QUAD, run.w * PX_PER_QUAD, PX_PER_QUAD, ink);
  } else if (element.kind === 'image' && element.source?.startsWith('data:image/png;base64,')) {
    const source = decodePng(Buffer.from(element.source.slice('data:image/png;base64,'.length), 'base64'));
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const sx = Math.min(source.width - 1, Math.floor((px / w) * source.width));
      const sy = Math.min(source.height - 1, Math.floor((py / h) * source.height));
      const index = (sy * source.width + sx) * 4;
      put(layer, width, height, x + px, y + py, source.pixels.subarray(index, index + 4));
    }
  } else if (element.kind === 'image') {
    rect(layer, width, height, x, y, w, h, rgba(PALETTE.paperAlt));
    for (const point of linePoints({ x, y }, { x: x + w - 1, y: y + h - 1 })) put(layer, width, height, point.x, point.y, ink);
    for (const point of linePoints({ x: x + w - 1, y }, { x, y: y + h - 1 })) put(layer, width, height, point.x, point.y, ink);
  }
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
  const width = px.w + margin * 2, height = px.h + margin * 2;
  const ox = margin - px.x, oy = margin - px.y;
  const pixels = new Uint8Array(width * height * 4);
  rect(pixels, width, height, 0, 0, width, height, rgba(doc.background ?? doc.theme?.tokens?.paper ?? PALETTE.paper));
  if (showGrid) {
    const grid = rgba(doc.theme?.tokens?.grid ?? PALETTE.grid);
    for (let x = Math.floor(px.x / 10) * 10; x <= px.x + px.w; x += 10) rect(pixels, width, height, x + ox, 0, 1, height, grid);
    for (let y = Math.floor(px.y / 10) * 10; y <= px.y + px.h; y += 10) rect(pixels, width, height, 0, y + oy, width, 1, grid);
  }
  for (const page of visible) {
    for (const element of elementsOf(doc, page.id).filter((entry) => resolved.elementIds.has(entry.id))) {
      const layer = new Uint8Array(pixels.length);
      paintElement(doc, element, layer, width, height, ox, oy, resolved.view?.perspective ?? null);
      eraseMasks(layer, width, height, microMasksOf(doc).filter((mask) => mask.target === element.id), ox, oy);
      composite(pixels, layer, page.opacity ?? 1);
    }
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
