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
import {
  GLYPHS, MARKS, COMPOSED, LATIN_EXTRA, GREEK, GREEK_ALIAS, CYRILLIC, CYRILLIC_ALIAS, MATH_ALIAS,
} from '../src/core/turtlefont-glyphs.js';
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

// --- the data-hygiene guards ------------------------------------------------
// Each of these caught a real defect that neither the tests nor the rendered
// specimen would have shown on their own.

test('no shape is drawn twice under two names', () => {
  // Greek Alpha IS Latin A, and that is fine — but it must be an ALIAS, one
  // drawing reached by two code points, not two drawings that happen to agree
  // today. Cyrillic Ge, Pe, Ef and ka, the increment and summation signs, and
  // the micro sign were all second copies until they were aliased.
  const seen = new Map();
  for (const [table, obj] of Object.entries({ GLYPHS, LATIN_EXTRA, GREEK, CYRILLIC })) {
    for (const [ch, data] of Object.entries(obj)) {
      const key = JSON.stringify(data);
      assert.ok(
        !seen.has(key),
        `${table}:${ch} is drawn identically to ${seen.get(key)} — alias one to the other instead`,
      );
      seen.set(key, `${table}:${ch}`);
    }
  }
});

test('no character is drawn in two tables', () => {
  const from = new Map();
  for (const [table, obj] of Object.entries({ GLYPHS, LATIN_EXTRA, GREEK, CYRILLIC })) {
    for (const ch of Object.keys(obj)) {
      assert.ok(!from.has(ch), `${ch} is drawn in both ${from.get(ch)} and ${table}; only the first is reachable`);
      from.set(ch, table);
    }
  }
});

test('an alias never points at a character that is also drawn', () => {
  const drawn = new Set(Object.keys({ ...GLYPHS, ...LATIN_EXTRA, ...GREEK, ...CYRILLIC }));
  for (const table of [GREEK_ALIAS, CYRILLIC_ALIAS, MATH_ALIAS]) {
    for (const [alias, target] of Object.entries(table)) {
      assert.ok(!drawn.has(alias), `${alias} is both aliased and drawn — the drawing is unreachable`);
      assert.ok(font.glyph(target), `${alias} aliases ${target}, which must resolve`);
    }
  }
});

test('every mark is used, and no two marks are the same drawing', () => {
  const used = new Set(Object.values(COMPOSED).map((c) => c.mark).filter(Boolean));
  for (const name of Object.keys(MARKS)) {
    assert.ok(used.has(name), `the "${name}" mark is defined but nothing is composed from it`);
  }
  const shapes = new Map();
  for (const [name, data] of Object.entries(MARKS)) {
    const key = JSON.stringify(data);
    assert.ok(!shapes.has(key), `marks "${name}" and "${shapes.get(key)}" are the same drawing`);
    shapes.set(key, name);
  }
});

test('a composed letter always adds something to its base', () => {
  for (const [ch, spec] of Object.entries(COMPOSED)) {
    assert.ok(spec.mark, `${ch} composes with no mark, so it is just ${spec.base} under another name`);
    assert.ok(MARKS[spec.mark], `${ch} names the mark "${spec.mark}", which does not exist`);
  }
});

test('the pairs a render actually confused stay apart', () => {
  // e was a closed ring plus a full crossbar, which is exactly theta. Cyrillic
  // ze was drawn as an s. L-stroke had no stroke. A hyphen was as long as an
  // en dash. All four looked fine in isolation and wrong in a word.
  for (const [a, b] of [['e', 'θ'], ['s', 'з'], ['L', 'Ł'], ['l', 'ł'],
    ['-', '–'], ['–', '—'], ['ß', 'B'], ['ª', 'º']]) {
    assert.notDeepEqual(
      quadSet(a), quadSet(b),
      `${a} and ${b} render the same ink`,
    );
  }
});

test('the dashes get longer in the right order', () => {
  const w = (ch) => font.glyph(ch).width;
  assert.ok(w('-') < w('–'), 'a hyphen is shorter than an en dash');
  assert.ok(w('–') < w('—'), 'an en dash is shorter than an em dash');
});

// --- quarter turns ----------------------------------------------------------

test('a quarter turn is exact: nothing is gained or lost', () => {
  const flat = font.renderStrokeText('Throughput');
  for (const deg of [90, 180, 270]) {
    const turned = font.renderStrokeText('Throughput', { rotate: deg });
    assert.equal(turned.pieces.length, flat.pieces.length, `${deg}deg must keep every quadrant`);
    for (const p of turned.pieces) {
      assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), 'a turn cannot invent a coordinate');
    }
  }
});

test('a quarter turn swaps the block, a half turn does not', () => {
  const flat = font.renderStrokeText('Axis');
  const quarter = font.renderStrokeText('Axis', { rotate: 90 });
  const half = font.renderStrokeText('Axis', { rotate: 180 });
  assert.deepEqual([quarter.width, quarter.height], [flat.height, flat.width]);
  assert.deepEqual([half.width, half.height], [flat.width, flat.height]);
});

test('four quarter turns come back to where they started', () => {
  // Rotating the same block four times must be the identity, or the turn is
  // losing something each time.
  const once = font.renderStrokeText('Rr', { rotate: 90 });
  const twice = font.renderStrokeText('Rr', { rotate: 180 });
  const thrice = font.renderStrokeText('Rr', { rotate: 270 });
  const flat = font.renderStrokeText('Rr');
  for (const r of [once, twice, thrice]) assert.equal(r.pieces.length, flat.pieces.length);
  // And a turn actually moves the ink, rather than quietly doing nothing.
  const key = (r) => r.pieces.map((p) => `${p.x},${p.y}`).sort().join('|');
  assert.notEqual(key(once), key(flat));
  assert.notEqual(key(twice), key(flat));
});

test('any angle but a quarter turn is refused', () => {
  for (const bad of [45, 1, -90, 360, 'ninety']) {
    assert.throws(() => font.renderStrokeText('x', { rotate: bad }), /quarter turns/);
  }
});

test('a rotated block still starts where it was placed', () => {
  const r = font.renderStrokeText('Axis', { at: { x: 20, y: 12 }, rotate: 90 });
  const minX = Math.min(...r.pieces.map((p) => p.x));
  const minY = Math.min(...r.pieces.map((p) => p.y));
  assert.ok(minX >= 20 && minY >= 12, `the turn must not push ink behind the origin: ${minX},${minY}`);
});

// --- looking at one glyph ----------------------------------------------------

test('inspecting a glyph reports where its drawing came from', () => {
  assert.equal(font.inspectGlyph('a').source, 'drawn');
  assert.equal(font.inspectGlyph('Α').source, 'alias of "A"');
  assert.equal(font.inspectGlyph('ä').source, 'composed: "a" + diaeresis');
  assert.equal(font.inspectGlyph('字'), null, 'a glyph the face lacks inspects to nothing');
});

test('the fingerprint is what tells an edit from a no-op', () => {
  // This is the whole reason the tool exists: a different stroke list can
  // rasterise to identical quadrants, and reading the source will not say so.
  assert.equal(font.inspectGlyph('Α').fingerprint, font.inspectGlyph('A').fingerprint,
    'an alias has the ink of what it aliases');
  assert.notEqual(font.inspectGlyph('a').fingerprint, font.inspectGlyph('o').fingerprint);
  assert.match(font.inspectGlyph('a').fingerprint, /^[0-9a-f]{8}$/);
});

test('the picture shows the glyph against its own metrics', () => {
  const p = font.inspectGlyph('g').picture;
  const lines = p.split('\n');
  assert.equal(lines.length, font.METRICS.accentCeiling + font.METRICS.descent + 1);
  assert.match(p, /<- baseline/);
  assert.match(p, /<- x-height/);
  assert.match(p, /<- cap/);
  // A descender must actually show below the baseline.
  const below = lines.slice(lines.findIndex((l) => l.includes('baseline')) + 1);
  assert.ok(below.some((l) => l.includes('#')), 'g descends, and the picture should show it');
});

// --- inked labels ------------------------------------------------------------

test('a stroke label centres itself in the room the symbol leaves', () => {
  const doc = createDocument({ name: 'inked', cols: 120, rows: 60 });
  OPERATIONS.place_box(doc, { id: 'step', at: 'C4.tl', span: { w: 20, h: 8 }, label: '' });
  const r = OPERATIONS.stroke_label(doc, { id: 'lbl', target: 'step', text: 'Build' });
  const box = findElement(doc, 'step').element.rect;
  const ink = findElement(doc, 'lbl').element;
  assert.equal(ink.kind, 'path', 'the label is ink, not a text run');
  assert.equal(ink.labels, 'step');
  // Centred to within a quadrant. The right edge is INCLUSIVE: a box at x with
  // width w covers x..x+w-1, and measuring to x+w instead is an off-by-one that
  // makes correct centring look wrong by exactly one quadrant.
  const inkMinX = Math.min(...ink.pieces.map((p) => p.x));
  const inkMaxX = Math.max(...ink.pieces.map((p) => p.x));
  const left = inkMinX - box.x;
  const right = (box.x + box.w - 1) - inkMaxX;
  assert.ok(Math.abs(left - right) <= 1, `margins should agree: left ${left}, right ${right}`);
  assert.ok(r.width <= r.area.w && r.height <= r.area.h);
});

test('a label that does not fit is refused with the numbers to fix it', () => {
  const doc = createDocument({ name: 'inked', cols: 60, rows: 30 });
  OPERATIONS.place_box(doc, { id: 'tiny', at: 'C4.tl', span: { w: 4, h: 2 }, label: '' });
  assert.throws(
    () => OPERATIONS.stroke_label(doc, { id: 'no', target: 'tiny', text: 'Far too long for this' }),
    /does not fit inside "tiny".*Widen/s,
  );
  assert.equal(findElement(doc, 'no'), null, 'and nothing is left behind');
});

test('a symbol gets less room than its bounding box', () => {
  // A diamond inks a quarter of its box, and an inked label has to live inside
  // the symbol rather than the rectangle around it.
  const doc = createDocument({ name: 'inked', cols: 160, rows: 80 });
  OPERATIONS.place_box(doc, { id: 'plain', at: 'C4.tl', span: { w: 30, h: 14 }, label: '' });
  OPERATIONS.place_box(doc, { id: 'gate', at: 'C24.tl', span: { w: 30, h: 14 }, label: '', shape: 'decision' });
  const flat = OPERATIONS.stroke_label(doc, { id: 'a1', target: 'plain', text: 'Ok' });
  const gate = OPERATIONS.stroke_label(doc, { id: 'a2', target: 'gate', text: 'Ok' });
  assert.ok(gate.area.w < flat.area.w, 'the diamond leaves less width for the same box');
});

test('a label refuses anything but a box', () => {
  const doc = createDocument({ name: 'inked', cols: 60, rows: 30 });
  OPERATIONS.pen(doc, { id: 'run', role: 'artwork', program: 'pen C6.q1\nright 4 line' });
  assert.throws(
    () => OPERATIONS.stroke_label(doc, { id: 'x', target: 'run', text: 'no' }),
    /stroke labels go inside boxes/,
  );
});

test('a label does not trip the rule about strokes crossing nodes', () => {
  // An inked label lives inside its box by design. L004 catches a connector
  // ploughing through a node, which is a real defect; a label doing it is the
  // author's stated intent, recorded when they named the target.
  const doc = createDocument({ name: 'inked', cols: 140, rows: 60 });
  OPERATIONS.place_box(doc, { id: 'here', at: 'C4.tl', span: { w: 20, h: 8 }, label: '' });
  OPERATIONS.place_box(doc, { id: 'elsewhere', at: 'AA4.tl', span: { w: 20, h: 8 }, label: '' });
  OPERATIONS.stroke_label(doc, { id: 'mine', target: 'here', text: 'Build' });
  const crossings = validate(doc).open.filter((f) => f.rule === 'L004');
  assert.equal(crossings.length, 0, `a label in its own box is not a crossing: ${JSON.stringify(crossings)}`);

  // But the exemption is for that ONE box. Ink sprawling over a different node
  // is exactly what the rule is for.
  const stray = OPERATIONS.stroke_text(doc, {
    id: 'stray', at: 'AA5.tl', text: 'over the top', color: '#000',
  });
  assert.ok(stray.pieces > 0);
  assert.ok(
    validate(doc).open.some((f) => f.rule === 'L004' && f.actors.includes('elsewhere')),
    'ink over a node it does not label is still a crossing',
  );
});
