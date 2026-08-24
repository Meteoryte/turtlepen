/**
 * TurtleFont.
 *
 * A font is the one artifact a test cannot fully judge — nothing here proves
 * the `g` looks like a `g`, and `examples/turtlefont-specimen.js` exists to be
 * looked at for that. What these DO prove is everything a drawing must be to
 * live on this lattice: whole quadrants, fixed metrics, no glyph escaping the
 * line box, composition that cannot drift from its base, and measurement that
 * is the same call as rendering rather than a second guess at it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as font from '../src/core/turtlefont.js';
import { GLYPHS, MARKS, COMPOSED } from '../src/core/turtlefont-glyphs.js';
import { createDocument, OPERATIONS, validate, findElement } from '../src/core/index.js';

const quadSet = (text, opts = {}) =>
  new Set(font.renderStrokeText(text, opts).pieces.map((p) => `${p.x},${p.y}`));

test('the metrics are whole quadrants and hold together', () => {
  const m = font.METRICS;
  for (const [name, value] of Object.entries(m)) {
    assert.ok(Number.isInteger(value), `${name} must be a whole quadrant, got ${value}`);
  }
  assert.ok(m.xHeight < m.capHeight, 'x-height sits below cap height');
  assert.ok(m.capHeight <= m.accentCeiling, 'an accent has room above the cap');
  assert.equal(font.LINE_HEIGHT, m.ascent + m.descent);
  assert.equal(font.LINE_ADVANCE, font.LINE_HEIGHT + m.lineGap);
});

test('every glyph is whole quadrants and stays inside the line box', () => {
  const m = font.METRICS;
  for (const ch of font.coverage()) {
    const g = font.glyph(ch);
    assert.ok(g, `${JSON.stringify(ch)} resolves to a drawing`);
    assert.ok(Number.isInteger(g.width) && g.width >= 0, `${ch} has a whole width`);
    assert.equal(g.advance, g.width + m.sideBearing, `${ch} advance follows from its width`);
    for (const stroke of g.strokes) {
      assert.ok(stroke.length >= 1, `${ch} has no empty stroke`);
      for (const p of stroke) {
        assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), `${ch} point ${p.x},${p.y} is whole`);
        // The line box is what every caller sizes against. A glyph that pokes
        // out of it would overlap the line above or below and no measurement
        // would ever predict it.
        assert.ok(p.y <= m.ascent, `${ch} rises to ${p.y}, above the ascent of ${m.ascent}`);
        assert.ok(p.y >= -m.descent, `${ch} drops to ${p.y}, below the descent of ${-m.descent}`);
        assert.ok(p.x >= 0 && p.x <= g.width, `${ch} draws at x=${p.x}, outside its width of ${g.width}`);
      }
    }
  }
});

test('an accented letter is its letter plus a mark, never a second drawing', () => {
  const plain = font.glyph('A');
  const accented = font.glyph('Ä');
  assert.equal(accented.width, plain.width, 'the accent does not change the advance');
  assert.equal(accented.strokes.length, plain.strokes.length + MARKS.diaeresis.length - 1);
  // The letter's own strokes are carried through untouched.
  assert.deepEqual(accented.strokes.slice(0, plain.strokes.length), plain.strokes);
  // And every added stroke is above the cap.
  for (const stroke of accented.strokes.slice(plain.strokes.length)) {
    for (const p of stroke) assert.ok(p.y > font.METRICS.capHeight, 'the mark sits above the cap');
  }
});

test('the mark is centred over the letter it sits on', () => {
  // Ä: a 4-wide A under a 2-wide diaeresis leaves 1 quadrant either side.
  const dots = font.glyph('Ä').strokes.slice(font.glyph('A').strokes.length);
  assert.deepEqual(dots.map((s) => s[0].x), [1, 3]);
});

test('every composed glyph names a base that is actually drawn', () => {
  for (const [ch, { base }] of Object.entries(COMPOSED)) {
    assert.ok(font.glyph(base), `${ch} is composed from ${base}, which must exist`);
  }
});

test('an aliased letter IS its counterpart, quadrant for quadrant', () => {
  // Greek Alpha and Latin A are the same shape; drawing them twice would let
  // one copy drift from the other.
  assert.deepEqual(quadSet('Α'), quadSet('A'));
  assert.deepEqual(quadSet('О'), quadSet('O'), 'Cyrillic O is Latin O');
  // But a letter that only LOOKS similar is its own drawing.
  assert.notDeepEqual(quadSet('Δ'), quadSet('A'));
});

test('scale must be a whole number, because there is no half quadrant', () => {
  for (const bad of [1.5, 0, -1, '2', null]) {
    assert.throws(() => font.renderStrokeText('A', { scale: bad }), /whole number/);
  }
  assert.doesNotThrow(() => font.renderStrokeText('A', { scale: 3 }));
});

test('scaling multiplies the block exactly', () => {
  const one = font.measureStrokeText('Wg');
  const three = font.measureStrokeText('Wg', { scale: 3 });
  assert.equal(three.width, one.width * 3);
  assert.equal(three.height, one.height * 3);
});

test('a missing glyph is refused, not silently dropped', () => {
  assert.throws(() => font.renderStrokeText('A字B'), /cannot draw/);
  assert.deepEqual(font.missingFrom('A字B字'), ['字'], 'reported once, in order');
  assert.deepEqual(font.missingFrom('Voix ambiguë — Δx ≤ 5μm ✓'), []);
});

test('measuring and drawing are the same numbers', () => {
  const text = 'Measure me\ntwice';
  const drawn = font.renderStrokeText(text, { scale: 2 });
  const measured = font.measureStrokeText(text, { scale: 2 });
  assert.equal(measured.width, drawn.width);
  assert.equal(measured.height, drawn.height);
  assert.equal(measured.lines, drawn.lines);
  assert.equal(measured.quadrants, drawn.pieces.length);
});

test('the reserved height does not depend on which letters turned up', () => {
  // Two labels at one scale must occupy one height, or a row built from
  // measurements comes out ragged.
  assert.equal(font.measureStrokeText('oo').height, font.measureStrokeText('Ägy').height);
});

test('a newline starts a line and the block grows by exactly one advance', () => {
  const one = font.measureStrokeText('one');
  const two = font.measureStrokeText('one\ntwo');
  assert.equal(two.lines, 2);
  assert.equal(two.height, one.height + font.LINE_ADVANCE);
});

test('wrapping breaks between words and admits when a word will not fit', () => {
  const wrapped = font.measureStrokeText('alpha beta gamma delta', { maxWidth: 60 });
  assert.ok(wrapped.lines > 1, 'it wrapped');
  assert.ok(wrapped.lineWidths.every((w) => w <= 60), `no line exceeds the limit: ${wrapped.lineWidths}`);
  assert.equal(wrapped.overflowed, false);

  // A single word longer than the limit overhangs and SAYS so, rather than
  // being hyphenated somewhere meaningless.
  const long = font.measureStrokeText('supercalifragilistic', { maxWidth: 20 });
  assert.equal(long.overflowed, true);
});

test('centring shifts a short line by exactly half the slack', () => {
  const left = font.renderStrokeText('i\niiii', { align: 'left' });
  const centred = font.renderStrokeText('i\niiii', { align: 'center' });
  const topRow = (r) => Math.min(...r.pieces.filter((p) => p.y < font.LINE_HEIGHT).map((p) => p.x));
  const slack = left.lineWidths[1] - left.lineWidths[0];
  assert.equal(topRow(centred) - topRow(left), Math.floor(slack / 2));
});

test('a dot keeps its weight when the text is scaled', () => {
  // A full stop is a one-point stroke. At scale 3 it must be a 3x3 block, or
  // punctuation thins out while the letters get heavier.
  const one = font.renderStrokeText('.', { scale: 1 });
  const three = font.renderStrokeText('.', { scale: 3 });
  assert.equal(one.pieces.length, 1);
  assert.equal(three.pieces.length, 9);
});

test('space draws nothing but still advances', () => {
  assert.equal(font.glyph(' ').strokes.length, 0);
  const gap = font.measureStrokeText('i i').width - font.measureStrokeText('ii').width;
  assert.equal(gap, font.glyph(' ').advance);
});

test('the face covers more than letters and digits', () => {
  const have = new Set(font.coverage());
  for (const ch of '!@#$%^&*()[]{}<>?/\\|~`"\'') assert.ok(have.has(ch), `punctuation: ${ch}`);
  for (const ch of '←→↑↓⇒⇔') assert.ok(have.has(ch), `arrow: ${ch}`);
  for (const ch of '≤≥≠≈∞√∑∫∂∈∪∩∀∃⊕∅') assert.ok(have.has(ch), `maths: ${ch}`);
  for (const ch of 'ΓΔΘΛΞΠΣΦΨΩαβγδεθλμπστφψω') assert.ok(have.has(ch), `greek: ${ch}`);
  for (const ch of 'БГДЖЗИЛПУФЦЧШЩЪЫЬЭЮЯ') assert.ok(have.has(ch), `cyrillic: ${ch}`);
  for (const ch of 'ÀÄÇÉÑÖØÆŒßµ°±×÷©®™€£¥§¶†‡•…–—“”') assert.ok(have.has(ch), `sign: ${ch}`);
  for (const ch of '✓✗★☆●○■□▲▼◆') assert.ok(have.has(ch), `mark: ${ch}`);
  assert.ok(font.coverage().length > 350, `a full face, got ${font.coverage().length}`);
});

test('two glyphs that must be told apart are not the same drawing', () => {
  // Each pair was actually confusable in a render at some point, or is the
  // classic trap for a stroke face at this size.
  for (const [a, b] of [['a', 'o'], ['O', '0'], ['l', '1'], ['★', '☆'], ['●', '○'], ['■', '□'],
    ['∞', '8'], ['✓', '√'], ['!', '|'], ['Δ', 'A'], ['μ', 'u']]) {
    assert.notDeepEqual(quadSet(a), quadSet(b), `${a} must not draw the same as ${b}`);
  }
});

test('stroke text lands in a document as ink the collision engine can see', () => {
  const doc = createDocument({ name: 'ink', cols: 60, rows: 20 });
  const r = OPERATIONS.stroke_text(doc, { id: 'title', at: 'C3.tl', text: 'Ship it', scale: 2 });
  const el = findElement(doc, 'title').element;
  assert.equal(el.kind, 'path', 'it is ink, not an SVG text run');
  assert.equal(el.text, 'Ship it', 'the element remembers what it says');
  assert.equal(el.font.face, 'turtlefont');
  assert.equal(el.pieces.length, r.pieces);
  for (const p of el.pieces) {
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), 'every quadrant is whole');
  }
  assert.equal(validate(doc).open.filter((f) => f.severity <= 1).length, 0, 'a clean placement is clean');
});

test('stroke text refuses to place a string it cannot spell', () => {
  const doc = createDocument({ name: 'ink', cols: 60, rows: 20 });
  assert.throws(
    () => OPERATIONS.stroke_text(doc, { id: 't', at: 'C3.tl', text: 'ok 字' }),
    /cannot draw/,
  );
  assert.equal(findElement(doc, 't'), null, 'and leaves nothing behind when it does');
});

test('the glyph table has no duplicate or empty entry', () => {
  for (const [ch, data] of Object.entries(GLYPHS)) {
    assert.ok(Array.isArray(data) && data.length >= 1, `${ch} has a width`);
    assert.ok(Number.isInteger(data[0]), `${ch} width is whole`);
    const strokes = data.slice(1);
    assert.equal(new Set(strokes).size, strokes.length, `${ch} repeats a stroke`);
  }
});
