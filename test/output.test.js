import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as core from '../src/core/index.js';

function sample() {
  const doc = core.createDocument({ name: 'native output', canvas: { cols: 30, rows: 20 } });
  core.placeBox(doc, 'base', { id: 'node', at: 'C4.tl', span: '8x4', label: 'API 2' });
  core.applyPen(doc, 'base', 'pen C12.q1\nright 5 line', { id: 'ink', role: 'artwork' });
  return doc;
}

function pixel(image, x, y) {
  const index = (y * image.width + x) * 4;
  return [...image.pixels.slice(index, index + 4)];
}

test('native PNG output is deterministic, decodable, and dimensionally exact', () => {
  const doc = sample();
  const first = core.renderPng(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  const second = core.renderPng(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  assert.deepEqual(first, second);
  const decoded = core.png.decode(first);
  assert.equal(decoded.width, 300);
  assert.equal(decoded.height, 200);
});

test('native PNG applies the same 1px eraser coordinates as SVG', () => {
  const doc = sample();
  const piece = core.findElement(doc, 'ink').element.pieces[0];
  const point = { x: piece.x * 5, y: piece.y * 5 };
  const before = core.png.decode(core.renderPng(doc, { bounds: 'canvas', margin: 0, showGrid: false }));
  core.addMicroMask(doc, { id: 'one', target: 'ink', points: [point] });
  const after = core.png.decode(core.renderPng(doc, { bounds: 'canvas', margin: 0, showGrid: false }));
  const index = (point.y * after.width + point.x) * 4;
  assert.notDeepEqual([...before.pixels.slice(index, index + 4)], [...after.pixels.slice(index, index + 4)]);
});

test('native PNG preserves flowchart silhouettes instead of flattening every node to a rectangle', () => {
  const doc = core.createDocument({ name: 'diamond output', canvas: { cols: 20, rows: 20 } });
  const box = core.addBox(doc, 'base', {
    id: 'choice', rect: { x: 4, y: 4, w: 16, h: 8 }, label: '', shape: 'decision', fill: '#33aa88',
  });
  const image = core.rasterizeDocument(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  const x = box.rect.x * 5, y = box.rect.y * 5, w = box.rect.w * 5, h = box.rect.h * 5;
  assert.deepEqual(pixel(image, x + 1, y + 1), [244, 243, 239, 255], 'the diamond corner must remain paper');
  assert.deepEqual(pixel(image, x + Math.floor(w / 2), y + Math.floor(h / 2)), [51, 170, 136, 255], 'the diamond centre must retain its fill');
});

test('native PNG honors measured font size and alignment', () => {
  const doc = core.createDocument({ name: 'text output', canvas: { cols: 24, rows: 14 } });
  core.addText(doc, 'base', {
    id: 'title', rect: { x: 2, y: 2, w: 36, h: 16 }, text: 'A', fontSize: 40, align: 'center', color: '#001b35', weight: 800,
  });
  const image = core.rasterizeDocument(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  const matches = [];
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (pixel(image, x, y).slice(0, 3).join(',') === '0,27,53') matches.push({ x, y });
  }
  assert.ok(matches.length > 100, 'a 40px glyph must occupy materially more than the old fixed 5x7 bitmap');
  assert.ok(Math.min(...matches.map((point) => point.x)) > 70, 'center alignment must move the glyph into the middle of its declared span');
  assert.ok(Math.max(...matches.map((point) => point.y)) - Math.min(...matches.map((point) => point.y)) >= 35, 'fontSize controls rendered height');
});

test('native PNG rasterizes authored gradients instead of substituting a flat fill', () => {
  const doc = core.createDocument({ name: 'gradient output', canvas: { cols: 20, rows: 12 } });
  const box = core.addBox(doc, 'base', {
    id: 'sky', rect: { x: 4, y: 4, w: 24, h: 8 }, fill: { from: '#000000', to: '#ffffff', angle: 0 },
  });
  const image = core.rasterizeDocument(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  const y = box.rect.y * 5 + 10;
  const left = pixel(image, box.rect.x * 5 + 5, y)[0];
  const right = pixel(image, (box.rect.x + box.rect.w) * 5 - 6, y)[0];
  assert.ok(left < 32 && right > 220, `expected a black-to-white ramp, got ${left} to ${right}`);
});

test('native PNG contain mode preserves embedded-image aspect ratio', () => {
  const pixels = new Uint8Array(4 * 2 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([200, 20, 10, 255], i);
  const source = `data:image/png;base64,${core.encodePng({ width: 4, height: 2, pixels }).toString('base64')}`;
  const doc = core.createDocument({ name: 'image fit', canvas: { cols: 12, rows: 12 } });
  const imageElement = core.addImage(doc, 'base', { id: 'wide', rect: { x: 4, y: 4, w: 8, h: 8 }, source, fit: 'contain' });
  const image = core.rasterizeDocument(doc, { bounds: 'canvas', margin: 0, showGrid: false });
  const x = imageElement.rect.x * 5, y = imageElement.rect.y * 5;
  assert.deepEqual(pixel(image, x + 20, y + 2), [244, 243, 239, 255], 'letterbox area remains paper');
  assert.deepEqual(pixel(image, x + 20, y + 20), [200, 20, 10, 255], 'source pixels remain aspect-correct in the middle');
});

test('native PDF is deterministic and has a valid single-page object graph', () => {
  const first = core.renderPdf(sample(), { showGrid: false });
  const second = core.renderPdf(sample(), { showGrid: false });
  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, 8).toString('ascii'), '%PDF-1.4');
  assert.match(first.toString('latin1'), /\/Type \/Page/);
  assert.match(first.toString('latin1'), /startxref/);
});

test('file exporters write gated PNG and PDF artifacts atomically', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const doc = sample();
  const png = join(root, 'diagram.png');
  const pdf = join(root, 'diagram.pdf');
  await core.exportPng(doc, png, { force: true });
  await core.exportPdf(doc, pdf, { force: true });
  assert.deepEqual((await readFile(png)).subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal((await readFile(pdf)).subarray(0, 8).toString('ascii'), '%PDF-1.4');
});
