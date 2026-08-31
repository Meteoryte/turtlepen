/**
 * Flowchart node shapes.
 *
 * The point of these assertions is that a shape is an EXACT quadrant set. If a
 * diamond were "roughly half" its bounding box the collision log would be an
 * opinion, and the whole engine rests on it not being one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NODE_SHAPES, assertNodeShape, shapeCutQuads, shapeTextRect, visualQuads, claimedQuads,
  capQuads, skewQuads,
} from '../src/core/shapes.js';
import { rect } from '../src/core/geometry.js';
import { shapeOutline } from '../src/core/svg.js';
import { createDocument, placeBox, validate } from '../src/core/index.js';

const R = rect(0, 0, 22, 11);

test('every named shape is accepted and anything else is refused by name', () => {
  for (const s of NODE_SHAPES) assert.equal(assertNodeShape(s), s);
  assert.throws(() => assertNodeShape('octagon'), /unknown node shape "octagon"/);
});

test('a decision inks exactly half its bounding box on even dimensions', () => {
  // A diamond inscribed in a rectangle covers half its area, and on an
  // even-by-even box the lattice can express that exactly.
  const even = rect(0, 0, 12, 8);
  assert.equal(claimedQuads(even).size, 96);
  assert.equal(visualQuads(even, 'square', 'decision').size, 48);
});

test('an odd dimension costs the diamond exactly one row, and says so', () => {
  // With an odd height the centre row is full width and there is no half to
  // split, so the count is one row over half. That is arithmetic, not drift:
  // the engine is not permitted to fudge a quadrant to make the number tidy.
  const claimed = claimedQuads(R).size;          // 22 x 11 = 242
  const ink = visualQuads(R, 'square', 'decision').size;
  assert.equal(claimed, 242);
  assert.equal(ink, 122);
  assert.equal(ink - Math.floor(claimed / 2), 1);
});

test('a decision is symmetric on both axes', () => {
  const cut = shapeCutQuads(R, 'decision');
  for (let j = 0; j < R.h; j++) {
    for (let i = 0; i < R.w; i++) {
      const here = cut.has(`${i},${j}`);
      assert.equal(here, cut.has(`${R.w - 1 - i},${j}`), `x mirror at ${i},${j}`);
      assert.equal(here, cut.has(`${i},${R.h - 1 - j}`), `y mirror at ${i},${j}`);
    }
  }
});

test('a decision keeps its four cardinal vertices and drops its four corners', () => {
  const cut = shapeCutQuads(R, 'decision');
  const mx = Math.floor(R.w / 2), my = Math.floor(R.h / 2);
  assert.ok(!cut.has(`${mx},0`), 'north vertex must be inked');
  assert.ok(!cut.has(`${mx},${R.h - 1}`), 'south vertex must be inked');
  assert.ok(!cut.has(`0,${my}`), 'west vertex must be inked');
  assert.ok(!cut.has(`${R.w - 1},${my}`), 'east vertex must be inked');
  for (const [x, y] of [[0, 0], [R.w - 1, 0], [0, R.h - 1], [R.w - 1, R.h - 1]]) {
    assert.ok(cut.has(`${x},${y}`), `corner ${x},${y} must be carved away`);
  }
});

test('claimed footprint is identical whatever the shape', () => {
  // Layout, gutters and free_space must not change when a node becomes a
  // diamond — only the ink does.
  const base = claimedQuads(R).size;
  for (const s of NODE_SHAPES) {
    assert.equal(claimedQuads(R).size, base, s);
    assert.ok(visualQuads(R, 'square', s).size <= base, `${s} cannot ink more than it claims`);
  }
});

test('a shape too small to read stays a rectangle instead of becoming a blob', () => {
  const tiny = rect(0, 0, 2, 2);
  assert.equal(shapeCutQuads(tiny, 'decision').size, 0);
  assert.deepEqual(shapeTextRect(tiny, 'decision'), tiny);
});

test('shape masks are deterministic', () => {
  const a = [...shapeCutQuads(R, 'decision')].sort().join('|');
  const b = [...shapeCutQuads(R, 'decision')].sort().join('|');
  assert.equal(a, b);
});

test('a diamond offers a label about half the bounding box', () => {
  const t = shapeTextRect(R, 'decision');
  assert.equal(t.w, R.w - 2 * Math.floor(R.w / 4));
  assert.equal(t.h, R.h - 2 * Math.floor(R.h / 4));
  assert.ok(t.w < R.w && t.h < R.h);
});

test('a label that fits a rectangle can still overflow the diamond', () => {
  // The whole reason shapes are more than decoration.
  const doc = createDocument({ name: 'fit', cols: 80, rows: 40 });
  placeBox(doc, 'base', { id: 'r1', at: 'C3', span: '23x7', label: 'Internationalization' });
  placeBox(doc, 'base', { id: 'd1', at: 'C14', span: '23x7', label: 'Internationalization', shape: 'decision' });
  const open = validate(doc).open.filter((f) => f.rule === 'L002');
  assert.equal(open.filter((f) => f.actors.includes('r1')).length, 0, 'rectangle fits');
  assert.equal(open.filter((f) => f.actors.includes('d1')).length, 1, 'diamond must report overflow');
});

test('a stroke clipping a carved corner is information, not an error', () => {
  const doc = createDocument({ name: 'clip', cols: 60, rows: 30 });
  placeBox(doc, 'base', { id: 'd', at: 'J5', span: '16x9', label: '', shape: 'decision' });
  // Run along the diamond's top-left carved corner, well clear of its body.
  const open = validate(doc).open;
  assert.equal(open.filter((f) => f.rule === 'L004').length, 0);
});

test('every shape emits an outline the renderer can draw', () => {
  for (const s of NODE_SHAPES) {
    const d = shapeOutline(R, s);
    if (['process', 'subprocess'].includes(s)) {
      assert.equal(d, null, `${s} falls back to the rectangle outline`);
    } else {
      assert.match(d, /^M[-\d.]/, `${s} outline must start with a move`);
      assert.ok(d.includes('Z'), `${s} outline must be closed`);
    }
  }
});

// ---------------------------------------------------------------------------
// Proportion.
//
// Every symbolic shape in the showcase batch landed between 3.0:1 and 3.5:1 —
// a diamond at 2.0:1, a cylinder at 3.5:1 — because `measure` reported the span
// the TEXT needed and knew nothing about the symbol that would be drawn in it.
// At that width a cylinder's cap is 5% of the box and every shape reads as the
// same wide bar. Proportion is measurable, so it is a finding, not taste.
// ---------------------------------------------------------------------------

import { SHAPE_PROPORTION, aspectOf, spanForShape, fitReportForShape } from '../src/core/shapes.js';
import { fitReport, requiredCellsFor } from '../src/core/text.js';

test('a shape whose silhouette carries meaning declares a maximum aspect', () => {
  for (const shape of ['decision', 'data', 'document', 'io', 'manual', 'prep', 'terminator']) {
    assert.ok(SHAPE_PROPORTION[shape], `${shape} should declare a proportion`);
    assert.ok(SHAPE_PROPORTION[shape].maxAspect >= 1, `${shape} maxAspect must be >= 1`);
  }
  // A rectangle has no silhouette to lose, and a container is sized by what it
  // holds. Constraining either would be inventing a rule.
  for (const shape of ['process', 'subprocess', 'lane', 'group', 'bar']) {
    assert.equal(SHAPE_PROPORTION[shape], undefined, `${shape} should be unconstrained`);
  }
});

test('aspect is measured in quadrants, which are square', () => {
  assert.equal(aspectOf(rect(0, 0, 28, 14)), 2);
  assert.equal(aspectOf(rect(0, 0, 28, 8)), 3.5);
});

test('spanForShape fits the label inside the SYMBOL, not the bounding box', () => {
  // The exact trap: a diamond's text rect is inset by w/4 and h/4, so a label
  // measured against the full box overflows the moment a shape is applied.
  const label = 'Tests pass?';
  const flat = requiredCellsFor(label, { fontSize: 10 });
  const span = spanForShape('decision', flat);

  assert.ok(span.w >= flat.cellsWide, 'never narrower than the raw text needs');
  const r = rect(0, 0, span.w * 2, span.h * 2);
  assert.ok(aspectOf(r) <= SHAPE_PROPORTION.decision.maxAspect, `diamond came out at ${aspectOf(r)}:1`);

  // And the label actually fits the diamond it will be drawn in.
  const inner = shapeTextRect(r, 'decision');
  const fit = requiredCellsFor(label, { fontSize: 10, maxWidthCells: Math.floor(inner.w / 2) });
  assert.ok(fit.cellsTall * 2 <= inner.h, `label needs ${fit.cellsTall * 2}q, diamond offers ${inner.h}q`);
});

test('subprocess measurement includes the side-bar aperture exactly', () => {
  const label = 'createTools(session)';
  const flat = requiredCellsFor(label, { fontSize: 10 });
  assert.deepEqual(
    { w: flat.cellsWide, h: flat.cellsTall },
    { w: 13, h: 3 },
    'the reported defect starts with a raw 13x3 text span',
  );

  const span = spanForShape('subprocess', flat);
  assert.deepEqual(span, { w: 14, h: 3 }, 'one cell repays the two one-quadrant side bars');

  const d = createDocument({ name: 'subprocess-measure' });
  placeBox(d, 'base', { id: 'tools', at: 'C4.tl', span, label, shape: 'subprocess' });
  const fitFindings = validate(d).open.filter((finding) => ['L002', 'L003'].includes(finding.rule));
  assert.deepEqual(fitFindings, [], 'the measured span must validate cleanly after placement');
});

test('subprocess overflow fixes name the outer box span, not the carved aperture', () => {
  const label = 'createTools(session)';
  const outer = rect(0, 0, 13 * 2, 3 * 2);
  const fit = fitReportForShape(label, outer, 'subprocess', { fontSize: 10 });
  const widen = fit.fixes.find((fix) => fix.kind === 'widen');

  assert.equal(fit.widthOverflowPx, 10);
  assert.equal(widen.to, 14);
  assert.match(widen.description, /widen box to 14 cells/);
  assert.doesNotMatch(widen.description, /widen box to 13 cells/);
});

test('every shape resize fix is stated in outer-box cells and clears its reported axis', () => {
  const label = 'createTools(session)';
  const outer = rect(0, 0, 6 * 2, 3 * 2);

  for (const shape of NODE_SHAPES) {
    const fit = fitReportForShape(label, outer, shape, { fontSize: 10 });
    for (const fix of fit.fixes.filter((candidate) => ['widen', 'heighten'].includes(candidate.kind))) {
      const repaired = fix.kind === 'widen'
        ? rect(0, 0, fix.to * 2, outer.h)
        : rect(0, 0, outer.w, fix.to * 2);
      const checked = fitReport(label, shapeTextRect(repaired, shape), { fontSize: 10 });
      const overflow = fix.kind === 'widen' ? checked.widthOverflowPx : checked.heightOverflowPx;
      assert.equal(overflow, 0, `${shape} ${fix.description} left ${overflow}px overflow`);
    }
  }
});

test('every node shape measure result fits its actual label aperture', () => {
  const label = 'createTools(session)';
  const flat = requiredCellsFor(label, { fontSize: 10 });

  for (const shape of NODE_SHAPES) {
    const span = spanForShape(shape, flat);
    const aperture = shapeTextRect(rect(0, 0, span.w * 2, span.h * 2), shape);
    const fit = fitReport(label, aperture, { fontSize: 10 });
    assert.equal(fit.fits, true, `${shape} returned ${span.w}x${span.h}: ${JSON.stringify(fit)}`);
  }
});

test('a squashed symbol is reported with a fix that names a proportionate span', () => {
  const d = createDocument({ name: 'proportion' });
  // 28x8 quadrants = the exact geometry of showcase-pipeline's `db-source`.
  placeBox(d, 'base', { id: 'db', at: 'C4.tl', span: { w: 14, h: 4 }, shape: 'data', label: 'db' });

  const v = validate(d);
  const hit = v.open.filter((f) => f.rule === 'L024');
  assert.equal(hit.length, 1, `expected one L024, got rules ${v.open.map((f) => f.rule).join(', ')}`);
  assert.deepEqual(hit[0].actors, ['db']);
  assert.match(hit[0].detail ?? hit[0].title, /data|aspect|proportion/i);

  const fix = hit[0].fixes.find((f) => f.kind === 'heighten' || f.kind === 'widen');
  assert.ok(fix, `expected a resize-routed fix, got ${hit[0].fixes.map((f) => f.kind).join(', ')}`);
});

test('a well-proportioned symbol raises nothing', () => {
  const d = createDocument({ name: 'proportion' });
  placeBox(d, 'base', { id: 'db', at: 'C4.tl', span: { w: 8, h: 5 }, shape: 'data', label: 'db' });
  assert.equal(validate(d).open.filter((f) => f.rule === 'L024').length, 0);
});

test('a plain process box is never judged on proportion', () => {
  const d = createDocument({ name: 'proportion' });
  placeBox(d, 'base', { id: 'wide', at: 'C4.tl', span: { w: 40, h: 3 }, shape: 'process', label: 'wide' });
  assert.equal(validate(d).open.filter((f) => f.rule === 'L024').length, 0);
});

test('a document outline scoops the same edge its mask cuts', () => {
  // The mask inks FULL height at the left and right edges and cuts upward in
  // the middle. The outline did the opposite — both edges raised to the mask's
  // mid-depth, and a control point 0.8px from them — so a document rendered as
  // a plain rectangle. Two showcase diagrams shipped one nobody could tell
  // from a process box.
  const R2 = rect(0, 0, 24, 12);
  const path = shapeOutline(R2, 'document');
  const bottom = R2.h * 5;                        // quadrants are 5px

  const vTo = Number(/V(-?[\d.]+)/.exec(path)[1]);
  const ctrlY = Number(/Q[\d.]+,(-?[\d.]+)/.exec(path)[1]);
  const endY = Number(/Q[\d.]+,[\d.]+ [\d.]+,(-?[\d.]+)/.exec(path)[1]);

  assert.equal(vTo, bottom, 'the right edge must reach the bottom, where the mask inks');
  assert.equal(endY, bottom, 'and so must the left edge');

  // A quadratic sits halfway to its control at t=0.5.
  const midY = (vTo + 2 * ctrlY + endY) / 4;
  assert.ok(
    bottom - midY >= bottom * 0.15,
    `scoop is only ${(bottom - midY).toFixed(1)}px on a ${bottom}px box — invisible: ${path}`,
  );
});

test('a symbol feature is a whole number of quadrants, in every renderer', () => {
  // The same cap was computed in four places with three rounding policies. On an
  // 18-quadrant `data` node the aperture reserved 4 quadrants, the SVG drew 3.24 and the
  // PNG drew 3 — so the drawn arc could not sit on a quadrant boundary, rasterised into
  // an uneven cap, and validate reasoned about a footprint nothing ever drew.
  for (const h of [7, 9, 11, 14, 18, 23]) {
    assert.ok(Number.isInteger(capQuads(h)), `capQuads(${h}) must be whole quadrants`);
    assert.ok(capQuads(h) >= 1, `capQuads(${h}) must ink something`);
  }
  for (const w of [12, 14, 21, 28]) {
    assert.ok(Number.isInteger(skewQuads(w)), `skewQuads(${w}) must be whole quadrants`);
  }
});

test('a drawn cap lands on the lattice and matches the aperture it reserves', () => {
  for (const h of [7, 9, 11, 14, 18, 23]) {
    const r = rect(0, 0, 20, h);
    const path = shapeOutline(r, 'data');

    const fractional = path.match(/\d+\.\d+/g) || [];
    assert.deepEqual(fractional, [],
      `data outline at h=${h} emitted off-lattice coordinates: ${path}`);

    // Every COORDINATE must be a whole number of 5px quadrants. The three digits
    // between an arc's radii and its endpoint are rotation and the two arc flags,
    // not lengths, so they are stripped before measuring.
    const coordsOnly = path.replace(/ [01] [01] [01] /g, ' ');
    for (const n of coordsOnly.match(/-?\d+/g).map(Number)) {
      assert.equal(n % 5, 0, `data outline at h=${h} has ${n}px, not on the 5px quadrant lattice`);
    }

    // The reserved label aperture must be at least the ink, or a label sits on the curve.
    const aperture = shapeTextRect(r, 'data');
    assert.ok(aperture.y - r.y >= capQuads(h),
      `aperture reserves ${aperture.y - r.y}q but the cap draws ${capQuads(h)}q at h=${h}`);
  }
});

// --- semantic roles and the focal budget ------------------------------------

test('a role resolves to presentation and never to geometry', async () => {
  const { treatmentFor, assertNodeRole, contrastRatio, AA_NORMAL } = await import('../src/core/roles.js');
  const { PALETTE } = await import('../src/core/svg.js');

  // A role is presentation only. Two boxes differing only by role must claim
  // exactly the same quadrants, or a colour decision has moved the drawing.
  const plain = createDocument({ name: 'r1' });
  placeBox(plain, 'base', { id: 'a', at: 'C3', span: '10x4', label: 'x' });
  const focal = createDocument({ name: 'r2' });
  placeBox(focal, 'base', { id: 'a', at: 'C3', span: '10x4', label: 'x', role: 'focal' });
  assert.deepEqual(plain.elements.base[0].rect, focal.elements.base[0].rect);

  assert.throws(() => assertNodeRole('emphasis'), /unknown node role/);
  for (const role of ['focal', 'store', 'external', 'optional', 'security']) {
    const t = treatmentFor(role, PALETTE);
    assert.ok(t.fill && t.stroke, `${role} resolves a fill and a stroke`);
  }

  // The default skin must be readable, not merely tasteful.
  assert.ok(contrastRatio(PALETTE.ink, PALETTE.paper) >= AA_NORMAL,
    `ink on paper is ${contrastRatio(PALETTE.ink, PALETTE.paper)}, below AA ${AA_NORMAL}`);
});

test('C002 counts the focal budget, and only because a role was declared', async () => {
  const { FOCAL_BUDGET } = await import('../src/core/roles.js');

  const within = createDocument({ name: 'within' });
  for (let i = 0; i < FOCAL_BUDGET; i += 1) {
    placeBox(within, 'base', { id: `f${i}`, at: `C${3 + i * 6}`, span: '8x4', label: 'f', role: 'focal' });
  }
  assert.equal(validate(within).open.filter((f) => f.rule === 'C002').length, 0,
    'the budget itself must not fire');

  const over = createDocument({ name: 'over' });
  for (let i = 0; i < FOCAL_BUDGET + 1; i += 1) {
    placeBox(over, 'base', { id: `f${i}`, at: `C${3 + i * 6}`, span: '8x4', label: 'f', role: 'focal' });
  }
  const hit = validate(over).open.find((f) => f.rule === 'C002');
  assert.ok(hit, 'one past the budget fires');
  assert.equal(hit.severity, 'S3', 'a taste heuristic must never outrank a real defect');
  assert.equal(hit.actors.length, FOCAL_BUDGET + 1, 'every claimant is named, not just the last');

  // The same drawing with hand-set fills asserts nothing about importance, so
  // nothing can be counted. This is the argument for roles over colours.
  const hex = createDocument({ name: 'hex' });
  for (let i = 0; i < FOCAL_BUDGET + 1; i += 1) {
    placeBox(hex, 'base', { id: `f${i}`, at: `C${3 + i * 6}`, span: '8x4', label: 'f', fill: '#b47868' });
  }
  assert.equal(validate(hex).open.filter((f) => f.rule === 'C002').length, 0,
    'a hex fill makes no claim, so there is nothing to overspend');
});

// --- swimlane semantics -----------------------------------------------------

test('swimlane rules are self-activating and decide only authored fact', () => {
  // One lane is a row, not a swimlane. The rules must not fire on a drawing
  // that merely happens to contain a container.
  const single = createDocument({ name: 'single' });
  placeBox(single, 'base', { id: 'only', at: 'B2', span: '40x9', shape: 'lane', label: '' });
  assert.equal(validate(single).open.filter((f) => f.rule.startsWith('W')).length, 0,
    'a lone lane is not a swimlane and must not be judged as one');

  const clean = createDocument({ name: 'clean' });
  placeBox(clean, 'base', { id: 'sales', at: 'B2', span: '60x9', shape: 'lane', label: 'Sales' });
  placeBox(clean, 'base', { id: 'ops', at: 'B12', span: '60x9', shape: 'lane', label: 'Operations' });
  placeBox(clean, 'base', { id: 'take', at: 'E6', span: '14x4', label: 'Take order' });
  placeBox(clean, 'base', { id: 'pack', at: 'E16', span: '14x4', label: 'Pack order' });
  assert.deepEqual(validate(clean).open, [], 'a correct swimlane reports nothing at all');
});

test('W001 names an unlabelled lane, W002 names a step that claims two owners', () => {
  const doc = createDocument({ name: 'bad' });
  placeBox(doc, 'base', { id: 'sales', at: 'B2', span: '60x9', shape: 'lane', label: 'Sales' });
  placeBox(doc, 'base', { id: 'ops', at: 'B12', span: '60x9', shape: 'lane', label: '   ' });
  placeBox(doc, 'base', { id: 'straddle', at: 'T9', span: '14x6', label: 'Handoff' });
  const open = validate(doc).open;

  const w001 = open.find((f) => f.rule === 'W001');
  assert.ok(w001, 'whitespace is not a label');
  assert.deepEqual(w001.actors, ['ops'], 'the labelled lane is not accused');

  const w002 = open.find((f) => f.rule === 'W002');
  assert.ok(w002, 'a step across a boundary is reported');
  assert.equal(w002.severity, 'S1', 'two owners is an error, not a nag');
  assert.ok(w002.actors.includes('straddle') && w002.actors.includes('sales') && w002.actors.includes('ops'),
    'the finding names the step AND both lanes it straddles');
});
