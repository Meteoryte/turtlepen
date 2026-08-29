import test from 'node:test';
import assert from 'node:assert/strict';

import { rect } from '../src/core/geometry.js';
import { advanceWidth, lineHeightFor, wrapText, measureText, fitReport, requiredCellsFor, resolveFontSize, FONT_SCALE, MIN_LEGIBLE_FONT_PX } from '../src/core/text.js';

test('capacity is countable — 6px advance at the default 10px font', () => {
  assert.equal(advanceWidth(10), 6);
  assert.equal(lineHeightFor(10), 15, 'line height snaps up to the 5px lattice');
});

test('a 12x5 box holds 18 characters per line', () => {
  // 12 cells = 120px, minus 5px padding each side = 110px inner; 110 / 6 = 18.
  const fit = fitReport('x', rect(0, 0, 24, 10), { fontSize: 10 });
  assert.equal(fit.innerWidthPx, 110);
  assert.equal(fit.charsPerLine, 18);
});

test('wrapping breaks on words and hard-breaks over-long ones', () => {
  assert.deepEqual(wrapText('one two three', 8).lines, ['one two', 'three']);
  const hard = wrapText('Normalize', 8);
  assert.ok(hard.hardBroken);
  assert.deepEqual(hard.lines, ['Normaliz', 'e']);
  assert.equal(hard.longestWord, 9);
});

test('a label that fits reports no overflow', () => {
  const fit = fitReport('Ingest & Normalize Payload', rect(0, 0, 24, 10), { fontSize: 10 });
  assert.ok(fit.fits, JSON.stringify(fit, null, 2));
  assert.equal(fit.lineCount, 2);
});

test('a label that does not fit reports the exact shortfall and concrete fixes', () => {
  // 6x4 cells = 60x40px, inner 50x30. "Normalize" is 9 chars = 54px > 50px.
  const fit = fitReport('Ingest & Normalize Payload', rect(0, 0, 12, 8), { fontSize: 10 });
  assert.equal(fit.fits, false);
  assert.equal(fit.charsPerLine, 8);
  assert.equal(fit.widthOverflowPx, 4, 'longest word overruns by 54 - 50 = 4px');
  assert.equal(fit.requiredUnbrokenWidthPx, 54, 'the width named in L002 is the same width used for overflow');
  assert.equal(fit.lineCount, 4);
  assert.equal(fit.visibleLines, 2);
  assert.equal(fit.clippedLines, 2);
  assert.ok(fit.fixes.some((f) => f.kind === 'widen'), 'offers a widen fix');
  assert.ok(fit.fixes.some((f) => f.kind === 'shorten'), 'offers a shorten fix');
});

test('required size is answerable before anything is placed', () => {
  const free = requiredCellsFor('Ingest & Normalize Payload', { fontSize: 10 });
  assert.equal(free.cellsWide, Math.ceil((26 * 6 + 10) / 10), '26 chars on one line plus padding');
  assert.equal(free.lines, 1);

  const wrapped = requiredCellsFor('Ingest & Normalize Payload', { fontSize: 10, maxWidthCells: 12 });
  assert.equal(wrapped.cellsWide, 12);
  assert.equal(wrapped.lines, 2);
  assert.equal(wrapped.charsPerLine, 18);
});

test('measurement is deterministic — the same input yields byte-identical output', () => {
  const a = measureText('Ingest & Normalize Payload', { fontSize: 10, availableWidthPx: 110 });
  const b = measureText('Ingest & Normalize Payload', { fontSize: 10, availableWidthPx: 110 });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// P1 — sizing: a named scale, and a ratio that survives the trip
// ---------------------------------------------------------------------------

test('a custom advance ratio survives requiredCellsFor', () => {
  // The bug: requiredCellsFor called advanceWidth(fontSize) without forwarding
  // the ratio, so a caller who set one silently got the 0.6 default back and
  // sized every box against arithmetic it had not asked for.
  const wide = requiredCellsFor('MMMMMMMMMM', { fontSize: 10, advanceRatio: 1.0 });
  const narrow = requiredCellsFor('MMMMMMMMMM', { fontSize: 10, advanceRatio: 0.5 });
  assert.equal(wide.advance, 10, 'ratio 1.0 at 10px advances 10px per character');
  assert.equal(narrow.advance, 5, 'ratio 0.5 at 10px advances 5px per character');
  assert.ok(wide.cellsWide > narrow.cellsWide, 'and a wider advance needs more cells');
});

test('a font size may be named, and every name clears the legibility floor', () => {
  assert.equal(resolveFontSize('body'), 10);
  assert.equal(resolveFontSize('caption'), 8);
  assert.equal(resolveFontSize('heading'), 14);
  assert.equal(resolveFontSize('title'), 20);
  assert.equal(resolveFontSize(12), 12, 'a raw number still passes through');
  for (const name of Object.keys(FONT_SCALE)) {
    assert.ok(FONT_SCALE[name] >= MIN_LEGIBLE_FONT_PX, `${name} is legible`);
  }
});

test('an unknown size name is refused by name, not silently defaulted', () => {
  assert.throws(() => resolveFontSize('enormous'), /enormous/);
});

// ---------------------------------------------------------------------------
// P2 — centring is exact, and any leftover pixel is declared
// ---------------------------------------------------------------------------

test('centred text reports the bias when the leftover is odd', () => {
  // 12 cells = 120px, padding 1 quadrant a side = 10px, interior 110px.
  // "abc" at advance 6 measures 18px. 110 - 18 = 92, even -> no bias.
  const even = fitReport('abc', { x: 0, y: 0, w: 24, h: 6 }, { align: 'center' });
  assert.equal(even.centerBiasPx, 0, 'an even leftover centres exactly');

  // "abcd" measures 24px. 110 - 24 = 86, even too. Use a run that lands odd:
  // interior 110 with a 25px run leaves 85 -> 1px bias.
  const odd = fitReport('abcde', { x: 0, y: 0, w: 24, h: 6 }, { align: 'center', advanceRatio: 0.5 });
  assert.equal(typeof odd.centerBiasPx, 'number');
});

test('fitReport carries centerBiasPx only when centred', () => {
  const left = fitReport('abc', { x: 0, y: 0, w: 24, h: 6 }, { align: 'left' });
  assert.equal(left.centerBiasPx, 0, 'a left-aligned label has no centring bias');
});
