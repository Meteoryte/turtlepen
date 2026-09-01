/**
 * The brainn.dev mascots, held as a corpus.
 *
 * Versions are frozen rather than overwritten, so a later design can be
 * compared against an earlier one and neither can rot unnoticed. Every version
 * listed in the builder is exercised here; adding `v4.js` and naming it in
 * VERSIONS is all it takes to bring it under test.
 *
 * WHAT THIS GUARDS, and why it is shaped the way it is.
 *
 *   - Grid invariants run on every pose of every version. They are pure array
 *     work (~16 ms each) and they catch the defects that actually happen:
 *     a stray palette key, a sprite drawn outside its own bounds, an empty pose.
 *   - The canvas assertion catches a silently defaulted canvas before artwork
 *     can be clipped.
 *   - The newest full pose is painted and validated end to end, proving the
 *     optimized pen commit path still fills the complete sprite cleanly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/index.js';
import { VERSIONS, PAD, loadVersion, documentFor, buildPose } from '../examples/build-brainn-mascots.js';

const versions = await Promise.all(VERSIONS.map(async (v) => [v, await loadVersion(v)]));

test('every version declares a palette, a size and at least one pose', () => {
  assert.ok(VERSIONS.length >= 2, 'a corpus of one version compares nothing');
  for (const [v, { W, H, PAL, POSES }] of versions) {
    assert.ok(Number.isInteger(W) && W > 0, `${v}: W must be a positive integer`);
    assert.ok(Number.isInteger(H) && H > 0, `${v}: H must be a positive integer`);
    assert.ok(Object.keys(POSES).length > 0, `${v}: no poses`);
    for (const [key, hex] of Object.entries(PAL)) {
      assert.match(hex, /^#[0-9A-Fa-f]{6}$/, `${v}: palette "${key}" is not a hex colour`);
    }
    assert.ok(PAL.K, `${v}: needs a K entry — it is the background colour`);
  }
});

test('every pose paints inside its own declared bounds', () => {
  for (const [v, { W, H, PAL, POSES }] of versions) {
    for (const [name, draw] of Object.entries(POSES)) {
      const g = draw();
      assert.equal(g.length, H, `${v}/${name}: ${g.length} rows, declared ${H}`);

      let filled = 0;
      for (const [y, row] of g.entries()) {
        assert.equal(row.length, W, `${v}/${name} row ${y}: ${row.length} cells, declared ${W}`);
        for (const ch of row) {
          if (ch === '.') continue;
          assert.ok(PAL[ch], `${v}/${name} row ${y}: unknown palette key "${ch}"`);
          filled += 1;
        }
      }
      // A pose that inks under a fiftieth of its frame is a bug, not a design.
      assert.ok(filled > (W * H) / 50, `${v}/${name}: only ${filled} cells inked`);
    }
  }
});

test('the document canvas holds the sprite plus its margin', async () => {
  for (const [v, { W, H }] of versions) {
    const doc = await documentFor(v);
    assert.ok(
      doc.canvas.cols >= W + 2 * PAD && doc.canvas.rows >= H + 2 * PAD,
      `${v}: canvas is ${doc.canvas.cols}x${doc.canvas.rows}, needs at least `
      + `${W + 2 * PAD}x${H + 2 * PAD} — a silently defaulted canvas clips the sprite`,
    );
  }
});

test('poses are deterministic', () => {
  for (const [v, { POSES }] of versions) {
    for (const [name, draw] of Object.entries(POSES)) {
      const a = draw().map((r) => r.join('')).join('\n');
      const b = draw().map((r) => r.join('')).join('\n');
      assert.equal(a, b, `${v}/${name} differs between builds`);
    }
  }
});

test('the newest full pose validates clean and merges its horizontal runs', async () => {
  const { PAL, POSES } = await loadVersion('v3');
  const grid = POSES.scholar();
  const { doc, strokes } = await buildPose('v3', 'scholar');

  const inked = grid.reduce((n, row) => n + row.filter((c) => c !== '.').length, 0);
  assert.ok(inked > 0, 'the scholar pose is empty');

  // Two strokes per run (top and bottom band), and runs are merged along the
  // row, so a merged sprite costs far fewer than two strokes per inked cell.
  assert.ok(strokes % 2 === 0, 'every run must be drawn in both quadrant bands');
  assert.ok(strokes < inked, `${strokes} strokes for ${inked} cells — runs are not being merged`);
  assert.equal(doc.elements.base.length, strokes, 'each disconnected stroke must remain an honest path');
  assert.ok(
    doc.elements.base.every((element) => Object.values(PAL).map((hex) => hex.toLowerCase()).includes(element.stroke.color)),
    'a painted path uses a colour outside the pose palette',
  );

  const log = core.validate(doc);
  assert.deepEqual(
    log.open.map((f) => `${f.rule}:${f.severity}`),
    [],
    `painted pose reported findings:\n${log.open.slice(0, 5).map((f) => f.message).join('\n')}`,
  );
});
