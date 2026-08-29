import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';

function artwork() {
  const doc = core.createDocument({ name: 'mask', canvas: { cols: 30, rows: 20 } });
  core.applyPen(doc, 'base', 'pen C8.q1\nright 5 line', { id: 'ink', role: 'artwork' });
  return doc;
}

test('a 1px micro-mask changes presentation and render hash, never structural validation', () => {
  const doc = artwork();
  const validation = JSON.stringify(core.validate(doc));
  const before = core.renderHash(core.renderSvg(doc));
  core.addMicroMask(doc, { id: 'cleanup', target: 'ink', points: [{ x: 25, y: 70 }] });
  const svg = core.renderSvg(doc);
  const after = core.renderHash(svg);

  assert.equal(JSON.stringify(core.validate(doc)), validation);
  assert.notEqual(after, before);
  assert.match(svg, /data-micro-mask="cleanup" x="25" y="70" width="1" height="1"/);
  assert.match(svg, /data-element="ink"[^>]*mask="url\(#tp-mask-ink\)"/);
});

test('micro-masks persist, move with their target, and can be restored', () => {
  const doc = artwork();
  core.addMicroMask(doc, { id: 'cleanup', target: 'ink', points: [{ x: 25, y: 70 }, { x: 30, y: 70 }] });
  const reopened = core.deserialize(core.serialize(doc));
  assert.deepEqual(core.microMasksOf(reopened), core.microMasksOf(doc));

  core.moveElement(reopened, 'ink', 2, 1);
  assert.deepEqual(reopened.microMasks[0].points, [{ x: 35, y: 75 }, { x: 40, y: 75 }]);
  core.removeMicroMask(reopened, 'cleanup');
  assert.deepEqual(reopened.microMasks, []);
});

test('v1 refuses semantic marks and widths larger than one pixel', () => {
  const doc = artwork();
  core.placeBox(doc, 'base', { id: 'node', at: 'M8.tl', span: '5x3', label: 'Node' });
  assert.throws(() => core.addMicroMask(doc, { id: 'bad', target: 'node', points: [{ x: 1, y: 1 }] }), /artwork paths and images only/);
  assert.throws(() => core.addMicroMask(doc, { id: 'wide', target: 'ink', points: [{ x: 1, y: 1 }], width: 2 }), /exactly 1 design pixel/);
});

test('ASCII states that sub-quadrant masks are not represented', async () => {
  const doc = artwork();
  core.addMicroMask(doc, { id: 'cleanup', target: 'ink', points: [{ x: 25, y: 70 }] });
  const { createSession, createTools } = await import('../src/mcp/tools.js');
  const session = createSession();
  session.doc = doc;
  const output = await createTools(session).find((tool) => tool.name === 'ascii').handler({});
  assert.match(output, /sub-quadrant micro-mask\(s\) are not represented in ASCII/);
});

test('a continuous mask can be extended or replaced and reports full coverage', () => {
  const doc = core.createDocument({ name: 'one-dot' });
  core.applyPen(doc, 'base', 'pen C8.q1\ndot', { id: 'ink', role: 'artwork' });
  const origin = core.findElement(doc, 'ink').element.pieces[0];
  const x = origin.x * 5, y = origin.y * 5;
  const firstRows = [];
  const lastRows = [];
  for (let row = 0; row < 5; row++) {
    const segment = [{ x, y: y + row }, { x: x + 4, y: y + row }];
    (row < 3 ? firstRows : lastRows).push(...segment);
  }
  core.addMicroMask(doc, { id: 'brush', target: 'ink', points: firstRows });
  assert.equal(core.microMaskStatus(doc, 'ink').fullyMasked, false);
  core.updateMicroMask(doc, 'brush', lastRows);
  assert.equal(core.microMaskStatus(doc, 'ink').fullyMasked, true);
  core.updateMicroMask(doc, 'brush', [{ x, y }], { replace: true });
  assert.equal(core.microMaskStatus(doc, 'ink').maskedInkPixels, 1);
});
