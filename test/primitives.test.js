import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { runPen } from '../src/core/pen.js';
import { quadToAddress } from '../src/core/address.js';

const doc = () => core.createDocument({ name: 'primitives' });
const byRule = (v, rule) => v.open.filter((f) => f.rule === rule);

test('an arrowhead occupies one quadrant and points where the path travels', () => {
  const r = runPen('pen C4.q1\nright 2 align top line\nright arrow');
  const head = r.pieces.at(-1);
  assert.equal(head.type, 'arrow');
  assert.equal(head.dir, 'right');
  assert.equal(quadToAddress(head.x, head.y), 'E4.q1', 'it sits one quadrant past the stroke');
  assert.equal(r.pieces.filter((p) => p.type === 'arrow').length, 1);
});

test('"line … arrow" makes the run END in the arrowhead rather than extend past it', () => {
  const plain = runPen('pen C4.q1\nright 3 align top line');
  const tipped = runPen('pen C4.q1\nright 3 align top line arrow');

  assert.equal(tipped.pieces.length, plain.pieces.length, 'the arrow consumes a quadrant, it does not add one');
  assert.equal(tipped.pieces.at(-1).type, 'arrow');
  assert.equal(tipped.pieces.at(-2).type, 'line');
  assert.deepEqual(
    { x: tipped.pieces.at(-1).x, y: tipped.pieces.at(-1).y },
    { x: plain.pieces.at(-1).x, y: plain.pieces.at(-1).y },
    'and it lands exactly where the run would have ended',
  );
});

test('an arrow terminating a "to" run points at the box without overlapping it', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'src', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.placeBox(d, 'base', { id: 'dst', at: 'M4.tl', span: { w: 4, h: 2 } });
  core.applyPen(d, 'base', 'pen G4.q1\nright align top line to dst.W arrow', { id: 'wire' });

  const v = core.validate(d);
  assert.equal(byRule(v, 'L004').length, 0, 'the arrowhead does not enter the box');
  assert.equal(byRule(v, 'L008').length, 0, 'but it is adjacent, so nothing dangles');
  assert.equal(core.findElement(d, 'wire').element.pieces.at(-1).type, 'arrow');
});

test('an arrowhead renders as a triangle pointing the right way', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'dst', at: 'G4.tl', span: { w: 4, h: 2 } });
  core.applyPen(d, 'base', 'pen C4.q1\nright 3 align top line\nright arrow', { id: 'wire' });
  const svg = core.renderSvg(d);
  // A rightward arrow's apex is on its right edge, at the vertical midpoint.
  assert.match(svg, /M20,6 L25,8\.5 L20,11 Z|M\d+,\d+ L\d+,\d+\.5 L\d+,\d+ Z/, svg.slice(0, 400));
  assert.ok(svg.includes('Z"/>'), 'the arrow is a closed path');
});

test('arrows and hops appear in the ascii view', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line\nright hop\nright 2 align top line\nright arrow', { id: 'wire' });
  const { text } = core.renderAscii(d);
  assert.ok(text.includes('▶'), 'arrowhead glyph');
  assert.ok(text.includes('╪'), 'hop glyph');
});

test('a hop marks a crossing as deliberate and silences the overlap warning', () => {
  // The vertical runs down column G on its left track, i.e. quadrant x=12.
  // The horizontal starts at x=4, so the crossing is 4 cells along — the hop
  // has to land exactly there to count.
  const crossing = (withHop) => {
    const d = doc();
    core.applyPen(d, 'base', 'pen G2.q1\ndown 6 align left line', { id: 'vertical' });
    core.applyPen(
      d,
      'base',
      withHop
        ? 'pen C5.q1\nright 4 align top line\nright hop\nright 1 align top line'
        : 'pen C5.q1\nright 6 align top line',
      { id: 'horizontal' },
    );
    return core.validate(d);
  };

  const plain = crossing(false);
  assert.equal(byRule(plain, 'L006').length, 1, 'an unmarked crossing is reported');
  assert.ok(plain.open.find((f) => f.rule === 'L006').fixes.some((f) => f.kind === 'hop'), 'and offers the hop fix');

  const hopped = crossing(true);
  assert.equal(byRule(hopped, 'L006').length, 0, 'a marked crossing is accepted silently');
});

test('a hop renders as a bridge arc rather than a filled square', () => {
  const d = doc();
  core.applyPen(d, 'base', 'pen C4.q1\nright 1 align top line\nright hop\nright 1 align top line', { id: 'wire' });
  const svg = core.renderSvg(d);
  assert.match(svg, /class="hop"/);
  assert.match(svg, /A2\.5,2\.5/, 'drawn as an arc of half-quadrant radius');
});

test('the hop still claims its quadrant, so it collides with boxes normally', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'box', at: 'E4.tl', span: { w: 4, h: 2 }, corner: 'square' });
  core.applyPen(d, 'base', 'pen C4.q1\nright 2 align top line\nright hop', { id: 'wire' });
  assert.equal(byRule(core.validate(d), 'L004').length, 1, 'a hop through a box is still an error');
});

test('finding marks carry their fingerprint so the log links to the drawing', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.placeBox(d, 'base', { id: 'b', at: 'F4.tl', span: { w: 6, h: 3 } });
  const findings = core.validate(d).open;
  const svg = core.renderSvg(d, { findings });
  for (const f of findings) {
    if (!f.cells.length) continue;
    assert.ok(svg.includes(`data-fp="${f.fingerprint}"`), `no mark for finding ${f.rule} #${f.fingerprint}`);
  }
});

test('pages are rendered in their own groups so the viewer can toggle them', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 4, h: 2 } });
  core.addPage(d, { id: 'notes', z: 1, intent: 'overlay' });
  core.placeBox(d, 'notes', { id: 'n', at: 'M4.tl', span: { w: 4, h: 2 } });
  const svg = core.renderSvg(d);
  assert.match(svg, /data-page="base"/);
  assert.match(svg, /data-page="notes"/);
});

test('a hidden page is left out of the render but still collision-checked', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  core.addPage(d, { id: 'ghost', z: 1, intent: 'exclusive' });
  core.placeBox(d, 'ghost', { id: 'g', at: 'C4.tl', span: { w: 2, h: 1 } });
  core.updatePage(d, 'ghost', { visible: false });

  assert.ok(!core.renderSvg(d).includes('data-page="ghost"'), 'not drawn');
  assert.equal(byRule(core.validate(d), 'L005').length, 1, 'but still validated — hiding is not deleting');
});

test('free space can be searched in an explicit region far from the content', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'a', at: 'C4.tl', span: { w: 6, h: 3 } });
  const near = core.occupancy.firstFitting(d, 'base', 4, 2);
  assert.ok(near, 'finds a spot near the content by default');

  const far = core.occupancy.firstFitting(d, 'base', 4, 2, { region: core.geometry.rect(120, 120, 40, 20) });
  assert.ok(far, 'and finds one in a distant region when asked');
  assert.ok(far.rect.x >= 120 && far.rect.y >= 120, `expected the distant region, got ${far.at}`);
});

test('describe reports live fit status alongside geometry', () => {
  const d = doc();
  core.placeBox(d, 'base', { id: 'tight', at: 'C4.tl', span: { w: 4, h: 2 }, label: 'Immutable Audit Trail' });
  const fit = core.text.fitReport('Immutable Audit Trail', core.findElement(d, 'tight').element.rect, { fontSize: 10 });
  assert.equal(fit.fits, false, 'the sample really does overflow');
  assert.ok(fit.charsPerLine > 0 && fit.visibleLines >= 0);
});
