/**
 * What the renderer actually draws.
 *
 * Every one of these was found by rendering a shape catalogue and LOOKING at
 * it, after unit tests asserting exact quadrant sets had passed. A mask can be
 * provably correct while the thing on screen is wrong or invisible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDocument, placeBox, applyPen, renderSvg } from '../src/core/index.js';
import { shapeOutline } from '../src/core/svg.js';
import { capQuads } from '../src/core/shapes.js';
import { rect } from '../src/core/geometry.js';

const R = rect(0, 0, 24, 11);

test('a dotted pattern is visible', () => {
  // It emitted zero-length lines with a butt cap, which by SVG spec render
  // NOTHING. A documented feature drew an empty row and validated perfectly.
  const doc = createDocument({ name: 'd', canvas: { cols: 40, rows: 20 } });
  applyPen(doc, 'base', 'pen C5\nright 12 line', { id: 'dots', role: 'artwork', pattern: 'dotted', width: 3 });
  const svg = renderSvg(doc, {});
  const zeroLengthButt = /<line x1="(\d+)" y1="(\d+)" x2="\1" y2="\2"[^>]*stroke-linecap="butt"/.test(svg);
  assert.equal(zeroLengthButt, false, 'a dot with a butt cap has no area and draws nothing');
  assert.match(svg, /<line[^>]*stroke-linecap="round"/, 'dots need a cap with area');
});

test('bar does not render as a plain rectangle', () => {
  // It fell through to the rectangle outline, so a fork/join bar was
  // indistinguishable from a process step — the one job the symbol has.
  const bar = shapeOutline(R, 'bar');
  assert.ok(bar, 'bar must emit its own outline');
  assert.notEqual(bar, shapeOutline(R, 'process'));
  // A bar is thin: its drawn height must be well under the box it sits in.
  const ys = [...bar.matchAll(/[ ,](\d+(?:\.\d+)?)(?=[ ZHVL]|$)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) - Math.min(...ys) < R.h * 5, 'a bar should not fill its bounding box');
});

test('every shape that claims a distinct symbol emits a distinct outline', () => {
  const drawn = new Map();
  for (const s of ['process', 'decision', 'terminator', 'io', 'prep', 'manual', 'data', 'document', 'bar']) {
    const d = shapeOutline(R, s) ?? 'RECTANGLE-FALLBACK';
    assert.ok(!drawn.has(d), `${s} draws the same outline as ${drawn.get(d)}`);
    drawn.set(d, s);
  }
});

test('data is drawn with its top ellipse, not as a drum', () => {
  const doc = createDocument({ name: 'c', canvas: { cols: 40, rows: 20 } });
  placeBox(doc, 'base', { id: 'db', at: 'C3', span: '14x7', label: 'store', shape: 'data' });
  const svg = renderSvg(doc, {});
  // Outline plus a second arc for the back edge of the cap.
  const arcs = (svg.match(/A\d+(?:\.\d+)?,\d+(?:\.\d+)?/g) ?? []).length;
  assert.ok(arcs >= 3, `a cylinder needs its cap arc as well as its body — found ${arcs}`);
});

test('the document foot matches the depth of its own mask', () => {
  // The control point was 2.4x the cap, drawing a bite far deeper than the
  // quadrants actually carved.
  const d = shapeOutline(R, 'document');
  const q = /Q[\d.]+,([\d.]+)/.exec(d);
  assert.ok(q, 'document uses a quadratic foot');
  // The cap comes from the one authority rather than being re-derived here. This
  // assertion used to recompute `h * 0.18` itself, so when the renderers were snapped to
  // whole quadrants the test failed by 0.2px against its own stale copy of the constant.
  const capPx = capQuads(R.h) * 5;
  const bottomPx = R.h * 5;
  const control = Number(q[1]);
  assert.ok(bottomPx - control <= capPx * 2, 'the curve must not overshoot the mask it depicts');
});
