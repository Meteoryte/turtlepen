import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { boxOutline } from '../src/core/svg.js';
import { rect } from '../src/core/geometry.js';

function sample() {
  const d = core.createDocument({ name: 'sample' });
  core.placeBox(d, 'base', { id: 'api', at: 'C4.tl', span: { w: 12, h: 4 }, label: 'API Gateway', corner: 'rounded' });
  core.applyPen(d, 'base', 'pen C9.q1\nright 4 align top line', { id: 'wire' });
  return d;
}

test('every text run carries textLength — the renderer cannot disagree with the measurer', () => {
  const svg = core.renderSvg(sample());
  const runs = svg.match(/<text[^>]*>/g) ?? [];
  assert.ok(runs.length > 0, 'the sample has labels');
  for (const run of runs) {
    assert.match(run, /textLength="\d+"/, run);
    assert.match(run, /lengthAdjust="spacingAndGlyphs"/, run);
  }
});

test('the measured width and the emitted textLength are the same number', () => {
  const svg = core.renderSvg(sample());
  const advance = core.text.advanceWidth(10);
  const emitted = Number(/textLength="(\d+)"/.exec(svg)[1]);
  assert.equal(emitted, 'API Gateway'.length * advance);
});

test('corner styles produce different outlines, and square is the plain rectangle', () => {
  const r = rect(0, 0, 8, 4);
  const shapes = Object.fromEntries(core.shapes.BOX_CORNER_STYLES.map((s) => [s, boxOutline(r, s)]));
  assert.equal(shapes.square, 'M0,0 H40 V20 H0 Z');
  assert.match(shapes.rounded, /A5,5/);
  assert.match(shapes.chamfered, /L40,5/);
  assert.notEqual(shapes.indented, shapes.chamfered);
  assert.equal(new Set(Object.values(shapes)).size, 4, 'all four styles are distinct');
});

test('a box too small to carry corner cuts keeps its square outline', () => {
  assert.equal(boxOutline(rect(0, 0, 1, 1), 'rounded'), 'M0,0 H5 V5 H0 Z');
});

test('svg geometry is integer pixels throughout', () => {
  const d = sample();
  // Include an overlay page so the assertion also runs against opacity output,
  // which a looser attribute pattern would wrongly flag as geometry.
  core.addPage(d, { id: 'notes', z: 1, intent: 'overlay' });
  core.placeBox(d, 'notes', { id: 'note', at: 'E5.tl', span: { w: 6, h: 3 }, label: 'p95' });

  const svg = core.renderSvg(d);
  // The leading space anchors on real attribute names, so "opacity=" is not
  // mistaken for a "y=" coordinate.
  const numbers = svg.match(/\s(?:x|y|x1|y1|x2|y2|width|height|textLength)="(-?[\d.]+)"/g) ?? [];
  assert.ok(numbers.length > 20, 'the sample emits plenty of geometry to check');
  const fractional = numbers.filter((n) => /\.\d/.test(n));
  assert.equal(fractional.length, 0, `found non-integer geometry: ${fractional.slice(0, 5).join(' ')}`);
});

test('ascii renders two characters per cell with Excel headers and a legend', () => {
  const d = sample();
  const { text } = core.renderAscii(d, { findings: core.validate(d).open });
  assert.match(text, /legend:/);
  assert.match(text, /api/);
  assert.match(text, /2 chars per cell/);
  assert.ok(/[─│]/.test(text), 'the stroke is drawn');
});

test('ascii marks collisions where the log says they are', () => {
  const d = core.createDocument({ name: 'clash' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const { text } = core.renderAscii(d, { findings: core.validate(d).open });
  assert.ok(text.includes('✗'), 'colliding quadrants are marked');
});

test('lowercase keys mark claimed-but-not-inked corner quadrants', () => {
  const d = core.createDocument({ name: 'cuts' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 4, h: 3 }, corner: 'indented' });
  const { text } = core.renderAscii(d);
  assert.ok(/a/.test(text) && /A/.test(text), 'both inked and cut quadrants are visible');
});

test('documents round-trip through serialisation unchanged', () => {
  const d = sample();
  const back = core.deserialize(core.serialize(d));
  assert.deepEqual(core.validate(back).summary, core.validate(d).summary);
  assert.equal(core.serialize(back), core.serialize(d), 'serialisation is deterministic');
});

test('lattice info gives the AI the arithmetic it needs', () => {
  const info = core.latticeInfo(core.createDocument({ name: 'x' }));
  assert.equal(info.pxPerCell, 10);
  assert.equal(info.strokeWidthPx, 5);
  assert.equal(info.font.advancePx, 6);
  assert.deepEqual(info.strokeAlignments.vertical, ['left', 'right']);
  assert.match(info.capacity.formula, /floor/);
});

// ---------------------------------------------------------------------------
// P4 — opacity is presentation, never geometry
// ---------------------------------------------------------------------------

test('a page carries an author-set opacity instead of a hardcoded one', () => {
  const d = core.createDocument({ name: 'op' });
  core.addPage(d, { id: 'notes', z: 1, intent: 'overlay', opacity: 0.4 });
  assert.equal(d.pages.find((p) => p.id === 'notes').opacity, 0.4);
  const svg = core.renderSvg(d);
  assert.match(svg, /data-page="notes"[^>]*opacity="0\.4"/);
});

test('overlay and exclusive defaults preserve the previous output exactly', () => {
  const d = core.createDocument({ name: 'op' });
  core.addPage(d, { id: 'over', z: 1, intent: 'overlay' });
  assert.equal(d.pages.find((p) => p.id === 'base').opacity, 1);
  assert.equal(d.pages.find((p) => p.id === 'over').opacity, 0.92);
});

test('element opacity composes with its page, and never touches geometry', () => {
  const d = core.createDocument({ name: 'op' });
  core.addPage(d, { id: 'over', z: 1, intent: 'overlay', opacity: 0.5 });
  const element = core.placeBox(d, 'over', { id: 'ghost', at: 'C4.tl', span: { w: 6, h: 3 }, opacity: 0.5 });
  assert.equal(element.opacity, 0.5);
  // 0.5 * 0.5 = 0.25 effective — but the box still claims every quadrant it did.
  assert.equal(core.shapes.claimedQuads(element.rect).size, 6 * 2 * 3 * 2, 'opacity claims nothing away');
});

test('an element faded to invisibility while still claiming space is reported', () => {
  const d = core.createDocument({ name: 'op' });
  core.placeBox(d, 'base', { id: 'ghost', at: 'C4.tl', span: { w: 6, h: 3 }, opacity: 0.05 });
  const hit = core.validate(d).open.filter((f) => f.rule === 'L019')[0];
  assert.ok(hit, 'invisible-but-colliding is a trap worth naming');
  assert.equal(hit.severity, 'S2');
  assert.deepEqual(hit.actors, ['ghost']);
});

test('an opacity outside the legal range is refused, not clamped silently', () => {
  const d = core.createDocument({ name: 'op' });
  assert.throws(() => core.placeBox(d, 'base', { id: 'x', at: 'C4.tl', span: { w: 4, h: 2 }, opacity: 3 }), /opacity/);
});

// ---------------------------------------------------------------------------
// P6 — the muted aesthetic
// ---------------------------------------------------------------------------

test('the palette is muted and hard-edged — no gradients, blurs or soft shadows', () => {
  const d = core.createDocument({ name: 'look' });
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 8, h: 3 }, label: 'Hello' });
  const svg = core.renderSvg(d);
  for (const banned of ['linearGradient', 'radialGradient', 'feGaussianBlur', 'filter:', 'box-shadow', 'drop-shadow']) {
    assert.ok(!svg.includes(banned), `${banned} has no place in a hard-edged 1-bit-descended look`);
  }
  assert.ok(svg.includes(core.PALETTE.paper), 'the muted ground is used');
  assert.ok(!svg.includes('#000000'), 'ink is a soft black, never pure #000');
});

test('every palette colour is genuinely muted — low chroma, not vivid', () => {
  // Saturation is the whole claim of "muted", so it is asserted, not eyeballed.
  for (const [name, hex] of Object.entries(core.PALETTE)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    assert.ok(sat <= 0.45, `${name} (${hex}) has saturation ${sat.toFixed(2)} — too vivid for the muted palette`);
  }
});

test('severity carries a second, non-colour cue so it survives desaturation', () => {
  // The HIG rule: colour must never be the only thing distinguishing two states.
  const cues = new Set(Object.values(core.SEVERITY_CUE));
  assert.equal(cues.size, 4, 'each severity has its own cue');
});
