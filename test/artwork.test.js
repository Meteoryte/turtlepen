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

// ---------------------------------------------------------------------------
// A stroke may change colour along its length.
//
// Colour lived on the ELEMENT, so a path was one colour end to end. That was
// never a property of the lattice — the collision engine has never seen a
// colour — it was just where the field happened to be stored. Moving it onto
// the piece makes a gradient stroke ordinary, and is the same storage a colour
// field over a region will need.
// ---------------------------------------------------------------------------

test('a stroke given two colours interpolates along its own length', () => {
  const d = core.createDocument({ name: 'ramp' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 20 line', {
    id: 'ramp', role: 'artwork', color: { from: '#000000', to: '#ffffff' },
  });
  const { pieces } = core.findElement(d, 'ramp').element;

  assert.equal(pieces[0].color, '#000000', 'the first quadrant is the start colour');
  assert.equal(pieces[pieces.length - 1].color, '#ffffff', 'and the last is the end colour');
  assert.ok(
    new Set(pieces.map((p) => p.color)).size > 4,
    'a ramp that only ever emits two colours is not a ramp',
  );

  // Monotonic: every step moves toward the end colour, never back.
  const lum = (hex) => parseInt(hex.slice(1, 3), 16);
  for (let i = 1; i < pieces.length; i += 1) {
    assert.ok(lum(pieces[i].color) >= lum(pieces[i - 1].color), `step ${i} went backwards`);
  }
});

test('a ramped stroke renders its own colours rather than one flat fill', () => {
  const d = core.createDocument({ name: 'ramp' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 20 line', {
    id: 'ramp', role: 'artwork', paint: 'cells', color: { from: '#112233', to: '#ccddee' },
  });
  const svg = core.renderSvg(d);
  assert.match(svg, /fill="#112233"/, 'the start colour reaches the page');
  assert.match(svg, /fill="#ccddee"/, 'and so does the end colour');
});

test('a single colour still stores nothing per piece', () => {
  const d = core.createDocument({ name: 'flat' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 6 line', { id: 'flat', role: 'artwork', color: '#c2410c' });
  const { pieces, stroke } = core.findElement(d, 'flat').element;
  assert.equal(stroke.color, '#c2410c');
  assert.ok(pieces.every((p) => p.color === undefined), 'a flat stroke must not bloat every quadrant');
});

test('a ramp survives save and reopen', () => {
  const d = core.createDocument({ name: 'ramp' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 10 line', {
    id: 'ramp', role: 'artwork', color: { from: '#000000', to: '#ff0000' },
  });
  const back = core.deserialize(core.serialize(d));
  const pieces = core.findElement(back, 'ramp').element.pieces;
  assert.equal(pieces[0].color, '#000000');
  assert.equal(pieces[pieces.length - 1].color, '#ff0000');
});

test('a ramp with a bad stop is refused by name', () => {
  const d = core.createDocument({ name: 'ramp' });
  assert.throws(
    () => core.applyPen(d, 'base', 'pen C4.q1\nright 4 line', { id: 'x', color: { from: 'red', to: '#fff' } }),
    /hex colour/,
  );
});

// ---------------------------------------------------------------------------
// Filled regions
//
// A filled shape CLAIMS its interior. That is not a side effect — it is the
// point. Until now "behind" could only be expressed by putting a mark on a
// lower Z-page or by not drawing the hidden part at all; a shape that occupies
// its inside makes occlusion ordinary.
// ---------------------------------------------------------------------------

test('a filled shape claims its interior, not just its outline', () => {
  const d = core.createDocument({ name: 'fill' });
  core.applyPen(d, 'base', 'pen T20\ncircle 10', { id: 'ring', role: 'artwork' });
  const ringQuads = core.findElement(d, 'ring').element.pieces.length;

  const e = core.createDocument({ name: 'fill' });
  core.applyPen(e, 'base', 'pen T20\ncircle 10 fill', { id: 'disc', role: 'artwork' });
  const discPieces = core.findElement(e, 'disc').element.pieces.length;

  assert.ok(discPieces > ringQuads * 4, `a filled circle should dwarf its ring: ${discPieces} vs ${ringQuads}`);
  assert.equal(core.elementsOf(e, 'base').length, 1, 'and it is ONE element, not a pile of hatch runs');
});

test('a filled shape hides what is behind it, which is the whole point', () => {
  const d = core.createDocument({ name: 'occlude' });
  core.applyPen(d, 'base', 'pen T20\ncircle 10 fill', { id: 'blob', role: 'artwork' });
  const claimed = core.elementClaimed(core.findElement(d, 'blob').element);
  // A quadrant well inside the circle is claimed, so anything drawn there
  // collides — which is how the engine knows something is covered.
  assert.ok(claimed.has('40,40'), 'the centre of a filled circle is occupied');
});

test('a fill can carry its own colour, independent of the outline', () => {
  const d = core.createDocument({ name: 'fill' });
  core.applyPen(d, 'base', 'pen T20\ncircle 10 fill', {
    id: 'blob', role: 'artwork', paint: 'cells', color: '#2b2a26', fillColor: '#c2410c',
  });
  const { pieces } = core.findElement(d, 'blob').element;
  const colours = new Set(pieces.map((p) => p.color).filter(Boolean));
  assert.ok(colours.has('#c2410c'), 'the interior takes the fill colour');
});

test('a fill can gradate across the region — tone without hatching', () => {
  const d = core.createDocument({ name: 'grad' });
  core.applyPen(d, 'base', 'pen T20\ncircle 14 fill', {
    id: 'blob', role: 'artwork', paint: 'cells', fillColor: { from: '#000000', to: '#ffffff' },
  });
  const { pieces } = core.findElement(d, 'blob').element;
  const colours = new Set(pieces.map((p) => p.color).filter(Boolean));
  assert.ok(colours.size > 6, `a graded fill needs many values, got ${colours.size}`);
});

test('filling an open shape is refused rather than leaking across the sheet', () => {
  // A half-arc has no inside. Flooding would escape through the ends and reach
  // the whole sheet, so this has to refuse rather than invent an interior.
  const d = core.createDocument({ name: 'open' });
  assert.throws(
    () => core.applyPen(d, 'base', 'pen T20' + String.fromCharCode(10) + 'arc 10 0 180 fill', { id: 'x', role: 'artwork' }),
    /not closed/,
  );
});
