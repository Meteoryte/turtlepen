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
