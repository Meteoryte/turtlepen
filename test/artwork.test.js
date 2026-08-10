import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';

test('open artwork is not judged as a dangling connector or a retraced connector', () => {
  const d = core.createDocument({ name: 'tree' });
  core.applyPen(
    d,
    'base',
    'pen C10.q1\nray to C4.q1\npen C7.q1\nray to A5.q1\npen C7.q1\nray to E5.q1',
    { id: 'branches', role: 'artwork' },
  );
  const rules = core.validate(d).open.map((f) => f.rule);
  assert.ok(!rules.includes('L008'), 'an open illustration is not a connector');
  assert.ok(!rules.includes('L015'), 'a deliberate branch junction is not connector self-overlap');
});

test('styled artwork renders as a coloured round line while claiming exact quadrants', () => {
  const d = core.createDocument({ name: 'tree' });
  const { path } = core.applyPen(d, 'base', 'pen C4.q1\nray to H8.q1', {
    id: 'branch', role: 'artwork', color: '#84635b', width: 2, cap: 'round',
  });
  assert.equal(core.elementClaimed(path).size, path.pieces.length, 'presentation styling does not change collision geometry');
  const svg = core.renderSvg(d, { showGrid: false });
  assert.match(svg, /stroke="#84635b"/);
  assert.match(svg, /stroke-width="2"/);
  assert.match(svg, /stroke-linecap="round"/);
  const points = svg.match(/<polyline points="([^"]+)"/)?.[1].split(' ');
  assert.equal(points?.length, 2, 'a straight Bresenham ray paints as a straight vector line');
  const ink = svg.match(/<g data-id="branch"[^>]*>.*?<\/g>/s)?.[0] ?? '';
  assert.doesNotMatch(ink, /\d+\.\d+/, 'presentation styling preserves integer SVG coordinates');
});

test('path styling refuses CSS injection and out-of-range widths by name', () => {
  const d = core.createDocument({ name: 'safe-style' });
  assert.throws(
    () => core.applyPen(d, 'base', 'pen C4.q1\ndot', { id: 'bad', role: 'artwork', color: 'url(javascript:alert(1))' }),
    /hex colour/,
  );
  assert.throws(
    () => core.applyPen(d, 'base', 'pen C4.q1\ndot', { id: 'bad', role: 'artwork', width: 9 }),
    /between 1 and 5/,
  );
});

test('box presentation accepts safe hex colour and refuses CSS injection', () => {
  const d = core.createDocument({ name: 'safe-box-style' });
  const good = core.placeBox(d, 'base', { id: 'good', at: 'C4.tl', span: '4x2', fill: '#ABC' });
  assert.equal(good.fill, '#abc');
  assert.throws(
    () => core.placeBox(d, 'base', { id: 'bad', at: 'C8.tl', span: '4x2', fill: 'url(https://example.invalid/pixel)' }),
    /hex colour/,
  );
});

test('cell paint colours every claimed quadrant without changing its footprint', () => {
  const d = core.createDocument({ name: 'solid-artwork' });
  const { path } = core.applyPen(d, 'base', 'disc 4 at H8.q1', {
    id: 'shell-fill', role: 'artwork', color: '#a8c95f', paint: 'cells',
  });
  const claimed = core.elementClaimed(path);
  const svg = core.renderSvg(d, { showGrid: false });
  assert.equal(path.stroke.paint, 'cells');
  assert.match(svg, /data-paint="cells"/);
  assert.match(svg, /fill="#a8c95f"/);
  assert.equal(core.elementClaimed(path).size, claimed.size);
  assert.doesNotMatch(svg.match(/data-id="shell-fill".*?<\/g>/s)?.[0] ?? '', /polyline/);
});
