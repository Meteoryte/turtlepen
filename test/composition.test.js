import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOf, validate } from '../src/core/collide.js';
import { createDocument, addPage, addBox, PAGE_INTENTS } from '../src/core/document.js';
import { pageDensity, pageInk, compositionFindings, SPARSE_DENSITY } from '../src/core/composition.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIAGRAMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../diagrams');

function addInk(doc) {
  // The point is only that the page's ink set changes, so the fingerprint must change.
  addBox(doc, 'base', { id: 'seed', rect: { x: 2, y: 2, w: 6, h: 4 }, label: 'x' });
}

test('extra material changes the fingerprint', () => {
  const base = fingerprintOf('C001', 'base', [], []);
  const withInk = fingerprintOf('C001', 'base', [], [], 'ink:120');
  const otherInk = fingerprintOf('C001', 'base', [], [], 'ink:340');

  assert.notEqual(base, withInk, 'extra must participate in the hash');
  assert.notEqual(withInk, otherInk, 'different ink must produce a different fingerprint');
});

test('omitting extra preserves existing fingerprints', () => {
  // Existing acceptances on disk were hashed without `extra`; adding the parameter
  // must not invalidate every acceptance in every saved document.
  assert.equal(
    fingerprintOf('L001', 'base', ['a', 'b'], ['A1', 'A2']),
    fingerprintOf('L001', 'base', ['a', 'b'], ['A1', 'A2'], ''),
  );
});

test('schematic is a declarable page intent', () => {
  assert.ok(PAGE_INTENTS.includes('schematic'));

  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });
  assert.doesNotThrow(() => addPage(doc, { id: 'sketch', intent: 'schematic' }));

  const page = doc.pages.find((p) => p.id === 'sketch');
  assert.equal(page.intent, 'schematic');
  assert.equal(page.opacity, 1, 'schematic pages are fully opaque like exclusive ones');
});

test('an unknown intent is still rejected', () => {
  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });
  assert.throws(() => addPage(doc, { id: 'nope', intent: 'freeform' }), SyntaxError);
});

test('density is ink over canvas quadrants, using the engine ink definition', () => {
  // 40x20 cells = 80x40 quadrants = 3200 quadrants.
  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });
  const page = doc.pages[0];

  assert.equal(pageDensity(doc, page).ink, 0, 'an empty page has no ink');
  assert.equal(pageDensity(doc, page).canvas, 3200);
  assert.equal(pageDensity(doc, page).density, 0);
});

test('the sparse threshold is the calibrated value', () => {
  assert.equal(SPARSE_DENSITY, 0.012);
});

test('a near-empty page produces one S3 finding with no fixes', () => {
  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });
  const findings = compositionFindings(doc, doc.pages);

  assert.equal(findings.length, 1);
  const [f] = findings;
  assert.equal(f.rule, 'C001');
  assert.equal(f.severity, 'S3');
  assert.equal(f.severityLabel, 'INFO');
  assert.deepEqual(f.fixes, [], 'there is no mechanical repair for a bland diagram');
  assert.equal(f.cells.length, 0, 'composition findings do not enumerate quadrants');
  assert.ok(f.metrics.density < SPARSE_DENSITY);
});

test('a schematic page opts out entirely', () => {
  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });
  addPage(doc, { id: 'sketch', intent: 'schematic' });
  const sketch = doc.pages.find((p) => p.id === 'sketch');

  assert.deepEqual(compositionFindings(doc, [sketch]), []);
});

test('a sparse overlay does not drag down a composed base page', () => {
  // The failure the per-page version produced against the real corpus: an annotation
  // overlay is legitimately sparse and must not condemn the document.
  const doc = createDocument({ canvas: { cols: 20, rows: 10 } });
  addPage(doc, { id: 'notes', intent: 'overlay' });

  // Ink the base page well past the floor: 20x10 cells = 800 quadrants, floor is 9.6.
  addBox(doc, 'base', { id: 'body', rect: { x: 1, y: 1, w: 20, h: 12 }, label: 'composed' });
  addBox(doc, 'notes', { id: 'tag', rect: { x: 0, y: 0, w: 2, h: 2 }, label: '' });

  assert.deepEqual(compositionFindings(doc, doc.pages), [], 'the densest page carries the document');
});

test('composition findings are S3 and do not affect summary.clean', () => {
  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });
  const result = validate(doc);

  assert.ok(result.open.some((f) => f.rule === 'C001'), 'validate surfaces composition findings');
  assert.equal(result.summary.clean, true, 'an INFO finding must not make a document unclean');
  assert.equal(result.summary.state, 'structurally-clear');
  assert.ok(result.summary.S3 >= 1);
});

test('no shipped diagram trips a composition finding', () => {
  const files = fs.readdirSync(DIAGRAMS).filter((f) => f.endsWith('.turtlepen.json'));
  assert.ok(files.length >= 7, 'the calibration corpus should not have shrunk');

  const tripped = [];
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DIAGRAMS, file), 'utf8'));
    const composition = validate(doc).open.filter((f) => f.rule.startsWith('C'));
    if (composition.length) tripped.push(`${file}: ${composition.map((f) => f.rule).join(', ')}`);
  }

  assert.deepEqual(tripped, [], 'the fidelity bar must pass — if it trips, the threshold is wrong');
});

test('accepting a composition finding lapses once the drawing changes', () => {
  const doc = createDocument({ canvas: { cols: 40, rows: 20 } });

  const before = validate(doc).open.find((f) => f.rule === 'C001');
  assert.ok(before, 'an empty document trips C001');

  // Accept it, exactly as the gate would.
  doc.acceptances.push({ fingerprint: before.fingerprint, reason: 'deliberately minimal', acceptedAt: new Date().toISOString() });

  const accepted = validate(doc);
  assert.ok(accepted.accepted.some((f) => f.rule === 'C001'), 'the acceptance applies while the drawing is unchanged');
  assert.ok(!accepted.open.some((f) => f.rule === 'C001'));

  // Now change the drawing. The ink digest changes, so the fingerprint must change too.
  addInk(doc);
  assert.ok(pageInk(doc, 'base').size > 0, 'the helper must actually add ink');

  const after = validate(doc);
  const stillOpen = after.open.find((f) => f.rule === 'C001');
  if (stillOpen) {
    assert.notEqual(stillOpen.fingerprint, before.fingerprint, 'a changed drawing must produce a new fingerprint');
  }
  assert.ok(after.staleAcceptances.some((a) => a.fingerprint === before.fingerprint), 'the old acceptance goes stale');
});
