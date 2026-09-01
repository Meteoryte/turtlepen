import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { createSession, createTools } from '../src/mcp/tools.js';

test('roles, scales, and length bindings survive deterministic serialization', () => {
  const doc = core.createDocument({ name: 'quantitative architecture' });
  core.addScale(doc, 'capacity', { domain: [0, 100], quads: 40, kind: 'magnitude' });
  core.placeBox(doc, 'base', {
    id: 'queue', at: 'C4.tl', span: '8x10', label: 'Queue', role: 'focal',
    value: { scale: 'capacity', value: 50, axis: 'y' },
  });

  const serialized = core.serialize(doc);
  const reopened = core.deserialize(serialized);
  assert.deepEqual(reopened.scales.capacity, doc.scales.capacity);
  assert.equal(core.findElement(reopened, 'queue').element.role, 'focal');
  assert.deepEqual(core.findElement(reopened, 'queue').element.value, { scale: 'capacity', value: 50, axis: 'y' });
  assert.equal(core.serialize(reopened), serialized);
});

test('scale ids do not collide with object prototype names', () => {
  const doc = core.createDocument({ name: 'prototype-safe scales' });
  core.addScale(doc, 'constructor', { domain: [0, 10], quads: 20, kind: 'magnitude' });
  core.addScale(doc, '__proto__', { domain: [0, 5], quads: 10, kind: 'magnitude' });
  core.placeBox(doc, 'base', {
    id: 'bar', at: 'A1.tl', span: '4x10', value: { scale: 'constructor', value: 10, axis: 'y' },
  });
  core.placeBox(doc, 'base', {
    id: 'other-bar', at: 'D1.tl', span: '4x5', value: { scale: '__proto__', value: 5, axis: 'y' },
  });
  const reopened = core.deserialize(core.serialize(doc));
  assert.deepEqual(reopened.scales.constructor, { id: 'constructor', domain: [0, 10], quads: 20, kind: 'magnitude' });
  assert.ok(Object.hasOwn(reopened.scales, '__proto__'));
  assert.deepEqual(reopened.scales.__proto__, { id: '__proto__', domain: [0, 5], quads: 10, kind: 'magnitude' });
  assert.throws(() => core.removeScale(reopened, 'constructor'), /still bound by "bar"/);
  assert.throws(() => core.removeScale(reopened, '__proto__'), /still bound by "other-bar"/);
});

test('loaded and direct bindings refuse malformed, dangling, or position-scale claims', () => {
  const doc = core.createDocument({ name: 'binding guards' });
  assert.throws(
    () => core.placeBox(doc, 'base', { id: 'dangling', at: 'C4', span: '4x2', value: { scale: 'missing', value: 1, axis: 'y' } }),
    /scale "missing".*not declared/,
  );
  core.addScale(doc, 'temperature', { domain: [40, 80], quads: 40, kind: 'position' });
  assert.throws(
    () => core.placeBox(doc, 'base', { id: 'point', at: 'C4', span: '4x2', value: { scale: 'temperature', value: 60, axis: 'x' } }),
    /Position, area, and ribbon-width encodings/,
  );

  const raw = JSON.parse(core.serialize(core.createDocument({ name: 'bad load' })));
  raw.elements.base.push({
    id: 'bad', kind: 'box', rect: { x: 0, y: 0, w: 4, h: 4 }, label: '', fontSize: 10,
    corner: 'square', shape: 'process', align: 'left', fill: null, opacity: null, state: null,
    role: 'rainbow', value: null,
  });
  assert.throws(() => core.deserialize(raw), /unknown node role "rainbow"/);
});

test('scale mutations rehearse, diff, commit, and remain removable only when unbound', async () => {
  const session = createSession();
  session.doc = core.createDocument({ name: 'scale plan' });
  const tools = new Map(createTools(session).map((tool) => [tool.name, tool]));

  const rehearsal = JSON.parse(await tools.get('plan').handler({
    operations: [{ op: 'scale', action: 'define', id: 'load', domain: [0, 100], quads: 40, kind: 'magnitude' }],
    format: 'json',
  }));
  assert.deepEqual(rehearsal.diff.scales.added, ['load']);
  assert.equal(session.doc.scales.load, undefined, 'rehearsal leaves the live document untouched');

  await tools.get('plan').handler({
    operations: [{ op: 'scale', action: 'define', id: 'load', domain: [0, 100], quads: 40, kind: 'magnitude' }],
    commit: true,
    format: 'json',
  });
  await tools.get('place_box').handler({
    id: 'worker', at: 'C4.tl', span: '8x10', role: 'backend',
    value: { scale: 'load', value: 50, axis: 'y' },
  });
  assert.throws(() => core.removeScale(session.doc, 'load'), /still bound by "worker"/);

  await tools.get('restyle').handler({ id: 'worker', role: 'external', value: null });
  assert.equal(core.findElement(session.doc, 'worker').element.role, 'external');
  assert.equal(core.findElement(session.doc, 'worker').element.value, undefined);
  await tools.get('scale').handler({ action: 'remove', id: 'load' });
  assert.equal(session.doc.scales.load, undefined);
});

test('quantitative validation permits no hidden quadrant tolerance', () => {
  const doc = core.createDocument({ name: 'exact means exact' });
  core.addScale(doc, 'rev', { domain: [0, 100], quads: 40, kind: 'magnitude' });
  core.placeBox(doc, 'base', {
    id: 'bar', at: 'C4.tl', span: '4x10', value: { scale: 'rev', value: 50, axis: 'y' },
  });
  assert.equal(core.validate(doc).open.some((finding) => finding.rule === 'V001'), false);
  core.findElement(doc, 'bar').element.rect.h += 1;
  const finding = core.validate(doc).open.find((entry) => entry.rule === 'V001');
  assert.ok(finding, 'one quadrant of disagreement is no longer accepted as clean');
  assert.equal(finding.metrics.expectedQuads, 20);
  assert.equal(finding.metrics.drawnQuads, 21);
});

test('optional and security role dashes survive SVG, PNG, and PDF rendering paths', () => {
  const doc = core.createDocument({ name: 'role parity' });
  core.placeBox(doc, 'base', { id: 'optional', at: 'A1.tl', span: '8x4', role: 'optional' });
  assert.match(core.renderSvg(doc, { showGrid: false, margin: 0 }), /stroke-dasharray:\s*4,3/);

  const raster = core.rasterizeDocument(doc, { showGrid: false, margin: 0 });
  const top = [];
  for (let x = 0; x < raster.width; x++) {
    const index = x * 4;
    top.push([...raster.pixels.subarray(index, index + 3)].join(','));
  }
  assert.ok(new Set(top).size > 1, 'native raster outline contains both dash ink and gaps');
  assert.ok(core.renderPdf(doc, { showGrid: false, margin: 0 }).length > 100, 'PDF consumes the same dashed raster path');
});

test('semantic roles resolve through custom and dark renderer skins', () => {
  const doc = core.createDocument({ name: 'role skin' });
  core.placeBox(doc, 'base', { id: 'focus', at: 'A1.tl', span: '8x4', role: 'focal' });
  core.configureTheme(doc, {
    name: 'Custom',
    tokens: {
      paper: '#ffffff', paperAlt: '#eeeeee', ink: '#111111', inkSoft: '#555555', accent: '#123456',
    },
  });

  const customSvg = core.renderSvg(doc, { showGrid: false, margin: 0 });
  assert.match(customSvg, /\.box\.role-focal \{[^}]*stroke: #123456/);
  assert.doesNotMatch(customSvg, /prefers-color-scheme: dark/);
  assert.match(customSvg, /class="box role-focal"/);

  const raster = core.rasterizeDocument(doc, { showGrid: false, margin: 0 });
  let customAccentPixels = 0;
  for (let index = 0; index < raster.pixels.length; index += 4) {
    if (raster.pixels[index] === 0x12 && raster.pixels[index + 1] === 0x34 && raster.pixels[index + 2] === 0x56) {
      customAccentPixels++;
    }
  }
  assert.ok(customAccentPixels > 0, 'native raster resolves the focal outline from the custom accent token');

  const defaultDoc = core.createDocument({ name: 'automatic dark role skin' });
  core.placeBox(defaultDoc, 'base', { id: 'focus', at: 'A1.tl', span: '8x4', role: 'focal' });
  const adaptiveSvg = core.renderSvg(defaultDoc, { showGrid: false, margin: 0 });
  assert.match(adaptiveSvg, /@media \(prefers-color-scheme: dark\)[\s\S]*\.box\.role-focal \{[^}]*stroke: #d19a86/);
});
