/**
 * Perceptual review.
 *
 * The tests that matter here are the refusals. A critique surface that accepts
 * anything is a place to put opinions, not a control.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERCEPTUAL_CATEGORIES, PERCEPTUAL_SEVERITIES,
  normalizePerceptualFinding, attachPerceptualReview, verdicts, renderHash,
} from '../src/core/perceptual.js';
import { createDocument, placeBox, validate, renderSvg } from '../src/core/index.js';

const good = {
  id: 'p1',
  severity: 'P1',
  category: 'semantic-identity-mismatch',
  elements: ['sheep'],
  symptom: 'the back reads as a row of hard spikes',
  consequence: 'a reader identifies the animal as a stegosaurus, not a sheep',
  repair: 'redraw',
};

function docWithSheep() {
  const doc = createDocument({ name: 'p', canvas: { cols: 40, rows: 20 } });
  placeBox(doc, 'base', { id: 'sheep', at: 'D4', span: '14x6', label: 'sheep' });
  return doc;
}

test('a well-formed finding round-trips', () => {
  const f = normalizePerceptualFinding(good);
  assert.equal(f.category, 'semantic-identity-mismatch');
  assert.equal(f.confidence, 1);
  assert.equal(f.repair, 'redraw');
});

test('an invented category is refused by name', () => {
  assert.throws(
    () => normalizePerceptualFinding({ ...good, category: 'looks-a-bit-odd' }),
    /unknown category "looks-a-bit-odd"/,
  );
});

test('an invented severity is refused by name', () => {
  assert.throws(() => normalizePerceptualFinding({ ...good, severity: 'BAD' }), /unknown severity/);
});

test('a finding must say what it looks like AND what it costs the reader', () => {
  assert.throws(() => normalizePerceptualFinding({ ...good, symptom: '' }), /observed symptom/);
  assert.throws(() => normalizePerceptualFinding({ ...good, consequence: '' }), /likely consequence/);
});

test('a finding naming an element that does not exist is refused', () => {
  const doc = docWithSheep();
  assert.throws(
    () => attachPerceptualReview(doc, {
      renderHash: 'abc123', reviewer: 'test',
      findings: [{ ...good, elements: ['goat'] }],
    }),
    /names element "goat"/,
  );
});

test('a review must name the render it describes and its reviewer', () => {
  const doc = docWithSheep();
  assert.throws(() => attachPerceptualReview(doc, { reviewer: 'r', findings: [] }), /renderHash/);
  assert.throws(() => attachPerceptualReview(doc, { renderHash: 'h', findings: [] }), /reviewer/);
});

test('duplicate finding ids are refused', () => {
  const doc = docWithSheep();
  assert.throws(
    () => attachPerceptualReview(doc, {
      renderHash: 'h', reviewer: 'r', findings: [good, { ...good }],
    }),
    /duplicate finding id/,
  );
});

test('a perceptual review never changes the collision log', () => {
  // The whole containment argument in one assertion.
  const doc = docWithSheep();
  const before = JSON.stringify(validate(doc));
  attachPerceptualReview(doc, { renderHash: 'h', reviewer: 'critic', findings: [good] });
  assert.equal(JSON.stringify(validate(doc)), before);
});

test('the two verdicts are reported separately and never merged', () => {
  const doc = docWithSheep();
  const svg = renderSvg(doc, {});
  const hash = renderHash(svg);
  attachPerceptualReview(doc, { renderHash: hash, reviewer: 'critic', findings: [good] });

  const v = verdicts(doc, { structural: validate(doc), currentRenderHash: hash });
  assert.equal(v.structural.clean, true, 'geometry is fine');
  assert.equal(v.perceptual.clean, false, 'the picture is not');
  assert.equal(v.perceptual.blocking, 1);
  assert.equal(v.perceptual.stale, false);
  // There must be no single boolean that hides the disagreement.
  assert.ok(!('clean' in v), 'a combined verdict would lose the case that matters');
});

test('editing the drawing makes an existing review visibly stale', () => {
  const doc = docWithSheep();
  const hash = renderHash(renderSvg(doc, {}));
  attachPerceptualReview(doc, { renderHash: hash, reviewer: 'critic', findings: [good] });

  placeBox(doc, 'base', { id: 'extra', at: 'X4', span: '6x4', label: 'new' });
  const after = renderHash(renderSvg(doc, {}));
  const v = verdicts(doc, { structural: validate(doc), currentRenderHash: after });

  assert.notEqual(after, hash);
  assert.equal(v.perceptual.stale, true, 'the critic reviewed bytes nobody is looking at now');
});

test('an unreviewed document is not clean — it is unreviewed', () => {
  const doc = docWithSheep();
  const v = verdicts(doc, { structural: validate(doc) });
  assert.equal(v.perceptual.reviewed, false);
  assert.equal(v.perceptual.clean, false, 'absence of review must never read as a pass');
});

test('every category and severity is usable', () => {
  for (const category of PERCEPTUAL_CATEGORIES) {
    assert.doesNotThrow(() => normalizePerceptualFinding({ ...good, category }));
  }
  for (const severity of PERCEPTUAL_SEVERITIES) {
    assert.doesNotThrow(() => normalizePerceptualFinding({ ...good, severity }));
  }
});
