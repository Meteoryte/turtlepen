#!/usr/bin/env node
/**
 * TurtleFont specimen — every glyph in the face, drawn as ink.
 *
 * A font is the one artifact that cannot be verified by a passing test. The
 * tests can prove that `Ä` is `A` plus a diaeresis and that nothing lands on a
 * fractional quadrant; they cannot tell you that the `g` looks like a `g`. So
 * this sheet exists to be LOOKED at, which is the standing discipline in this
 * repo and the only way glyph data ever gets fixed.
 *
 *   node examples/turtlefont-specimen.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../src/core/index.js';
import * as font from '../src/core/turtlefont.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');

const GROUPS = [
  ['UPPERCASE', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  ['LOWERCASE', 'abcdefghijklmnopqrstuvwxyz'],
  ['DIGITS', '0123456789'],
  ['PUNCTUATION', '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'],
  ['LATIN-1 SIGNS', '¡¢£¥§©®°±µ¶·«»¿¬×÷¼½¾¦¨´¸ªº¹²³'],
  ['TYPOGRAPHY', '–—‘’‚“”„†‡•…‰‹›€™′″'],
  ['ACCENTED CAPS', 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŠŽĆČ'],
  ['ACCENTED LOWER', 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿšžćč'],
  ['LATIN EXTRA', 'ÆæŒœØøÐðÞþßıŁł'],
  ['CENTRAL EUROPEAN', 'ĀāĒēĪīŌōŪūĂăĞğŻżĖėİĄąĘęĎďĚěŇňŘřŤťŃńŚśŹźĹĺŔŕ'],
  ['GREEK CAPS', 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'],
  ['GREEK LOWER', 'αβγδεζηθικλμνξοπρσςτυφχψω'],
  ['CYRILLIC CAPS', 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'],
  ['CYRILLIC LOWER', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'],
  ['ARROWS', '←→↑↓↔↕↖↗↘↙⇐⇒⇑⇓⇔↵⇄'],
  ['MATHEMATICS', '≤≥≠≈≡∞√∑∏∫∂∇∆∈∉⊂⊃∪∩∀∃∧∨⊕⊗∅∝∠⊥∥∴∵⌀'],
  ['MARKS', '✓✗★☆●○■□▲▼◆'],
];

const doc = core.createDocument({
  name: 'turtlefont specimen', cols: 200, rows: 240, createdAt: '2026-08-24T09:00:00.000Z',
});
core.OPERATIONS.set_background(doc, { color: '#f7f4ec' });

const LEFT = 4;          // quadrants
const ROW_LIMIT = 26;    // glyphs per drawn row, so the sheet stays readable
let y = 4;               // quadrants down the page
let serial = 0;

const write = (text, atX, atY, opts = {}) => core.OPERATIONS.stroke_text(doc, {
  id: `s${serial++}`,
  at: core.address.quadToAddress(atX, atY),
  text,
  ...opts,
});

// Title, at twice the size, which is the only scaling this face allows.
write('TURTLEFONT', LEFT, y, { scale: 2, color: '#1b2733' });
y += font.LINE_HEIGHT * 2 + 2;
write('a stroke face on the quadrant lattice — cap height 6 quadrants, 30px', LEFT, y, { color: '#5b6b7a' });
y += font.LINE_ADVANCE + 4;

for (const [name, chars] of GROUPS) {
  write(name, LEFT, y, { color: '#a4551f' });
  y += font.LINE_ADVANCE;

  const glyphs = [...chars];
  for (let i = 0; i < glyphs.length; i += ROW_LIMIT) {
    write(glyphs.slice(i, i + ROW_LIMIT).join(' '), LEFT + 2, y, { color: '#1b2733' });
    y += font.LINE_ADVANCE;
  }
  y += 3;
}

// Proof that it reads as words, not only as a chart of shapes.
write('SETTING', LEFT, y, { color: '#a4551f' });
y += font.LINE_ADVANCE;
write('The quick brown fox jumps over the lazy dog.', LEFT + 2, y);
y += font.LINE_ADVANCE;
write('Voix ambiguë d’un cœur qui au zéphyr préfère les jattes.', LEFT + 2, y);
y += font.LINE_ADVANCE;
write('Δx ≤ 5μm → tolerance ✓   ∑(a² + b²) ≠ ∞', LEFT + 2, y);
y += font.LINE_ADVANCE + 3;

write('WRAPPED AND CENTRED', LEFT, y, { color: '#a4551f' });
y += font.LINE_ADVANCE;
const wrapped = write(
  'Measurement and rendering are the same call, so a wrapped block reports the '
  + 'exact quadrants it will occupy before anything is placed.',
  LEFT + 2, y, { maxWidth: 150, align: 'center' },
);
y += wrapped.height + 6;

core.OPERATIONS.set_canvas(doc, { cols: 200, rows: Math.ceil(y / 2) + 4 });

const findings = core.validate(doc);
await core.exportSvg(doc, resolve(project, 'diagrams/turtlefont-specimen.svg'), { force: true, margin: 20 });
await core.saveDocument(doc, resolve(project, 'diagrams/turtlefont-specimen.turtlepen.json'), { force: true });

const bar = '═'.repeat(70);
console.log(bar);
console.log(`  ${font.coverage().length} glyphs drawn as ink`);
console.log(`  ${serial} stroke-text elements, sheet ${Math.ceil(y / 2)} cells tall`);
console.log(`  ${core.formatLog(findings).split('\n')[0]}`);
console.log(bar);
console.log('  diagrams/turtlefont-specimen.svg — LOOK at it');
console.log(bar);
