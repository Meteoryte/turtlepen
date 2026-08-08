/**
 * Images.
 *
 * The thesis applies to pictures exactly as it does to text: an image has an
 * intrinsic size, and the classic failure is choosing a box first and letting
 * the renderer fit the image afterwards. So an image is measured BEFORE it is
 * placed, and the aspect-ratio rounding that whole quadrants force is reported
 * rather than absorbed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import * as core from '../src/core/index.js';

/** A real, minimal PNG — built here so the test needs no binary fixture. */
function pngBytes(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
  const raw = Buffer.alloc(h * (1 + w * 3));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

test('image dimensions are read from the header, not guessed', () => {
  const info = core.image.probe(pngBytes(200, 100));
  assert.equal(info.format, 'png');
  assert.equal(info.width, 200);
  assert.equal(info.height, 100);
});

test('a non-image is refused by name rather than placed as a broken element', () => {
  assert.throws(() => core.image.probe(Buffer.from('not an image at all')), /unrecognised|format/i);
});

test('measuring an image gives a whole-cell footprint that preserves aspect', () => {
  // 200x100 is 2:1. At 20 cells wide (200px) the exact height is 100px = 10 cells.
  const m = core.image.measure({ width: 200, height: 100 }, { maxWidthCells: 20 });
  assert.equal(m.cellsWide, 20);
  assert.equal(m.cellsTall, 10);
  assert.equal(m.aspectDriftPct, 0, 'this one divides exactly');
});

test('aspect drift forced by whole cells is reported, never absorbed', () => {
  // 200x99 at 20 cells wide wants 99px tall, which is not a whole cell.
  const m = core.image.measure({ width: 200, height: 99 }, { maxWidthCells: 20 });
  assert.equal(m.cellsTall, 10, 'rounded up to whole cells');
  assert.ok(m.aspectDriftPct > 0, 'and the distortion is quantified');
  assert.ok(m.aspectDriftPct < 5, `${m.aspectDriftPct}% is a small, stated amount`);
});

test('a placed image claims its quadrants like anything else', () => {
  const d = core.createDocument({ name: 'pics' });
  const el = core.placeImage(d, 'base', {
    id: 'photo', at: 'C4.tl', span: { w: 10, h: 5 },
    source: `data:image/png;base64,${pngBytes(200, 100).toString('base64')}`,
  });
  assert.equal(el.kind, 'image');
  assert.equal(core.shapes.claimedQuads(el.rect).size, 10 * 2 * 5 * 2);
});

test('an image overlapping a box is an ordinary collision, not a special case', () => {
  const d = core.createDocument({ name: 'pics' });
  core.placeBox(d, 'base', { id: 'b', at: 'C4.tl', span: { w: 10, h: 5 } });
  core.placeImage(d, 'base', {
    id: 'photo', at: 'C4.tl', span: { w: 10, h: 5 },
    source: `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`,
  });
  const hit = core.validate(d).open.filter((f) => f.rule === 'L001')[0];
  assert.ok(hit, 'an image is a first-class citizen of the lattice');
});

test('an image renders inside its measured footprint, embedded not linked', () => {
  const d = core.createDocument({ name: 'pics' });
  core.placeImage(d, 'base', {
    id: 'photo', at: 'C4.tl', span: { w: 10, h: 5 },
    source: `data:image/png;base64,${pngBytes(200, 100).toString('base64')}`,
  });
  const svg = core.renderSvg(d);
  assert.match(svg, /<image[^>]+data:image\/png;base64,/, 'self-contained — no external fetch at render time');
  assert.match(svg, /width="100"/, '10 cells = 100px');
  assert.match(svg, /height="50"/, '5 cells = 50px');
});

test('an unknown render mode is refused rather than silently embedded', () => {
  const d = core.createDocument({ name: 'pics' });
  assert.throws(
    () => core.placeImage(d, 'base', {
      id: 'p', at: 'C4.tl', span: { w: 4, h: 2 }, mode: 'sepia',
      source: `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`,
    }),
    /sepia|mode/,
  );
});

test('place_image inside a plan resolves a file path exactly as the tool does', async () => {
  // The defect this pins: source resolution lived in the tool handler only, so
  // `place_image` meant one thing as a tool and another inside `plan` — the same
  // split that once bit `place_box` with its two span formats.
  const { createSession, createTools } = await import('../src/mcp/tools.js');
  const { writeFile, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'turtlepen-img-'));
  await writeFile(join(dir, 'pic.png'), pngBytes(40, 20));

  const session = createSession({ cwd: dir });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  await tools.new_diagram.handler({ name: 'plan-image', path: join(dir, 'd.turtlepen.json') });

  const out = await tools.plan.handler({
    operations: [{ op: 'place_image', id: 'p', at: 'C4.tl', span: '8x4', source: 'pic.png' }],
    commit: true,
  });
  assert.doesNotMatch(out, /FAILED/, out);
  assert.match(core.renderSvg(session.doc), /data:image\/png;base64,/, 'embedded, not left as a path');
});
