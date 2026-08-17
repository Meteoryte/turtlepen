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
import { dataUri, encodePng } from './helpers/png-fixture.js';

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

function lineArtPng(w = 96, h = 64) {
  const samples = new Uint8Array(w * h * 3).fill(255);
  for (let y = 8; y < h - 8; y++) for (let x = 12; x < w - 12; x++) {
    if (x === 12 || x === w - 13 || y === 8 || y === h - 9 || (x % 12 < 2 && y > 20)) {
      const i = (y * w + x) * 3;
      samples[i] = 0; samples[i + 1] = 0; samples[i + 2] = 0;
    }
  }
  return encodePng(w, h, samples, { colorType: 2 });
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

test('image measurement accepts exactly one positive whole-cell limit', () => {
  const source = { width: 200, height: 100 };
  assert.throws(() => core.image.measure(source, { maxWidthCells: 0 }), /positive whole-cell/);
  assert.throws(() => core.image.measure(source, { maxHeightCells: 2.5 }), /positive whole-cell/);
  assert.throws(
    () => core.image.measure(source, { maxWidthCells: 20, maxHeightCells: 10 }),
    /one scale limit/,
  );
});

test('scale reports distinguish rendered pixels from dither sampling resolution', () => {
  const source = { width: 1536, height: 1024 };
  const embed = core.image.scaleReport(source, { cellsWide: 48, cellsTall: 32, mode: 'embed' });
  assert.deepEqual(embed.renderedPx, { width: 480, height: 320 });
  assert.deepEqual(embed.render.contentPx, { width: 480, height: 320 });
  assert.equal(embed.render.direction, 'downscale');
  assert.equal(embed.render.x.percent, 31.25);
  assert.deepEqual(embed.sampling.target, { width: 480, height: 320, unit: 'pixels' });

  const dither = core.image.scaleReport(source, { cellsWide: 48, cellsTall: 32, mode: 'dither' });
  assert.deepEqual(dither.sampling.target, { width: 96, height: 64, unit: 'quadrants' });
  assert.equal(dither.sampling.x.percent, 6.25);
  assert.deepEqual(dither.sampling.sourcePixelsPerSample, { x: 16, y: 16 });
  assert.match(dither.sampling.procedure, /area-average.*ordered threshold/);

  const simplify = core.image.scaleReport(source, { cellsWide: 48, cellsTall: 32, mode: 'simplify' });
  assert.deepEqual(simplify.sampling.target, { width: 96, height: 64, unit: 'quadrants' });
  assert.equal(simplify.sampling.direction, 'downscale');
  assert.match(simplify.sampling.procedure, /discard low-salience texture.*fragment cleanup/);
});

test('scale reports make contain padding, cover cropping, and upscaling explicit', () => {
  const contain = core.image.scaleReport(
    { width: 200, height: 100 }, { cellsWide: 10, cellsTall: 10, mode: 'embed', fit: 'contain' },
  );
  assert.deepEqual(contain.render.contentPx, { width: 100, height: 50 });
  assert.equal(contain.render.paddingExpected, true);
  assert.equal(contain.render.cropExpected, false);

  const cover = core.image.scaleReport(
    { width: 200, height: 100 }, { cellsWide: 10, cellsTall: 10, mode: 'embed', fit: 'cover' },
  );
  assert.deepEqual(cover.render.contentPx, { width: 200, height: 100 });
  assert.equal(cover.render.cropExpected, true);
  assert.equal(cover.render.paddingExpected, false);

  const upscale = core.image.scaleReport(
    { width: 2, height: 1 }, { cellsWide: 2, cellsTall: 1, mode: 'dither' },
  );
  assert.equal(upscale.sampling.direction, 'upscale');
  assert.match(upscale.sampling.procedure, /repeat the nearest source sample/);
  assert.throws(
    () => core.image.scaleReport({ width: 0, height: 1 }, { cellsWide: 1, cellsTall: 1 }),
    /dimensions.*positive/i,
  );
});

test('a placed image claims its quadrants like anything else', () => {
  const d = core.createDocument({ name: 'pics' });
  const el = core.placeImage(d, 'base', {
    id: 'photo', at: 'C4.tl', span: { w: 10, h: 5 },
    source: `data:image/png;base64,${pngBytes(200, 100).toString('base64')}`,
  });
  assert.equal(el.kind, 'image');
  assert.equal(core.shapes.claimedQuads(el.rect).size, 10 * 2 * 5 * 2);
  assert.equal(el.scale.render.direction, 'downscale');
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
  assert.throws(
    () => core.placeImage(d, 'base', {
      id: 'wrong-detail', at: 'C4.tl', span: { w: 4, h: 2 }, mode: 'embed', detail: 'high',
      source: `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`,
    }),
    /detail applies only.*simplify/,
  );
  assert.throws(
    () => core.placeReference(d, {
      id: 'embedded-reference', at: 'C4.tl', span: '4x2', mode: 'embed',
      source: `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`,
    }),
    /reference mode must be dither or simplify/,
  );
});

test('embedded sources are verified from their bytes, not their declared MIME type', () => {
  const png = pngBytes(20, 10).toString('base64');
  const doc = core.createDocument({ name: 'verified image' });
  assert.throws(
    () => core.placeImage(doc, 'base', {
      id: 'wrong-mime', at: 'C4.tl', span: '4x2', source: `data:image/jpeg;base64,${png}`,
    }),
    /declares image\/jpeg.*bytes are image\/png/,
  );
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>throw 1</script></svg>').toString('base64');
  assert.throws(
    () => core.placeImage(doc, 'base', {
      id: 'svg', at: 'C4.tl', span: '4x2', source: `data:image/svg+xml;base64,${svg}`,
    }),
    /unrecognised image format/,
  );
});

test('dither stores deterministic runs without duplicating the source bitmap', () => {
  const doc = core.createDocument({ name: 'lean dither' });
  const uri = `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`;
  const image = core.placeImage(doc, 'base', {
    id: 'dither', at: 'C4.tl', span: '4x2', source: uri, mode: 'dither',
  });
  assert.equal(image.source, null);
  assert.ok(Array.isArray(image.runs));
  assert.equal(image.scale.sampling.target.unit, 'quadrants');
  assert.equal(image.ditherStats.readability, 'pass');
  assert.doesNotMatch(core.serialize(doc), /data:image/, 'the decoded source is not repeated in the document');
  assert.doesNotThrow(() => core.deserialize(core.serialize(doc)));
});

test('simplify stores an auditable approximation without retaining duplicate source bytes', () => {
  const doc = core.createDocument({ name: 'simplified source' });
  const image = core.placeImage(doc, 'base', {
    id: 'simplified', at: 'C4.tl', span: '24x16', source: dataUri(lineArtPng()), mode: 'simplify', detail: 'auto',
  });
  assert.equal(image.source, null);
  assert.equal(image.detail, 'auto');
  assert.equal(image.processing.strategy, 'threshold-simplify');
  assert.equal(image.processing.nearBinary, true);
  assert.equal(image.ditherStats.readability, 'pass');
  assert.match(core.renderSvg(doc), /class="simplify"/);
  assert.doesNotMatch(core.serialize(doc), /data:image/);
  assert.doesNotThrow(() => core.deserialize(core.serialize(doc)));
});

test('embed resize recomputes scale while rasterized image resize refuses without mutation', () => {
  const source = `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`;
  const embeddedDoc = core.createDocument({ name: 'embed resize' });
  const embedded = core.placeImage(embeddedDoc, 'base', {
    id: 'embed', at: 'C4.tl', span: '4x2', source, mode: 'embed',
  });
  assert.equal(embedded.scale.render.x.ratio, 2);
  core.resizeBox(embeddedDoc, 'embed', { cellsW: 8, cellsH: 4 });
  assert.equal(embedded.scale.render.x.ratio, 4);
  assert.deepEqual(embedded.scale.footprintCells, { width: 8, height: 4 });

  const ditherDoc = core.createDocument({ name: 'dither resize' });
  core.placeImage(ditherDoc, 'base', { id: 'dither', at: 'C4.tl', span: '4x2', source, mode: 'dither' });
  const before = core.serialize(ditherDoc);
  assert.throws(
    () => core.resizeBox(ditherDoc, 'dither', { cellsW: 8, cellsH: 4 }),
    /Remove it and call place_image again/,
  );
  assert.equal(core.serialize(ditherDoc), before, 'a refused resample leaves the document byte-identical');

  const simplifyDoc = core.createDocument({ name: 'simplify resize' });
  core.placeImage(simplifyDoc, 'base', {
    id: 'simplify', at: 'C4.tl', span: '24x16', source: dataUri(lineArtPng()), mode: 'simplify',
  });
  const simplifyBefore = core.serialize(simplifyDoc);
  assert.throws(
    () => core.resizeBox(simplifyDoc, 'simplify', { cellsW: 30, cellsH: 20 }),
    /simplify image.*Remove it and call place_image again/,
  );
  assert.equal(core.serialize(simplifyDoc), simplifyBefore);
});

test('deserialization recomputes image reports rather than trusting saved metrics', () => {
  const source = `data:image/png;base64,${pngBytes(20, 10).toString('base64')}`;
  const doc = core.createDocument({ name: 'report integrity' });
  core.placeImage(doc, 'base', { id: 'embed', at: 'C4.tl', span: '4x2', source });
  core.placeImage(doc, 'base', { id: 'dither', at: 'M4.tl', span: '4x2', source, mode: 'dither' });
  const raw = JSON.parse(core.serialize(doc));
  raw.elements.base.find((element) => element.id === 'embed').scale.render.direction = 'invented';
  const savedDither = raw.elements.base.find((element) => element.id === 'dither');
  savedDither.scale.render.direction = 'invented';
  savedDither.ditherStats.transitionRatio = 1;

  const loaded = core.deserialize(raw);
  assert.equal(core.findElement(loaded, 'embed').element.scale.render.direction, 'upscale');
  assert.equal(core.findElement(loaded, 'dither').element.scale.render.direction, 'upscale');
  assert.equal(core.findElement(loaded, 'dither').element.ditherStats.transitionRatio, 0);
});

test('saved simplify without processing provenance defaults to semantic review', () => {
  const doc = core.createDocument({ name: 'missing simplify provenance' });
  core.placeImage(doc, 'base', {
    id: 'simplified', at: 'C4.tl', span: '24x16', source: dataUri(lineArtPng()), mode: 'simplify',
  });
  const raw = JSON.parse(core.serialize(doc));
  delete raw.elements.base[0].processing;
  const loaded = core.deserialize(raw);
  const image = core.findElement(loaded, 'simplified').element;
  assert.equal(image.processing.strategy, 'unknown-saved-simplification');
  assert.equal(image.processing.nearBinary, false);
  assert.ok(core.validate(loaded).open.some((finding) => finding.rule === 'L023'));
});

test('saved documents refuse linked or unsupported embedded image sources', () => {
  const doc = core.createDocument({ name: 'saved source gate' });
  const raw = JSON.parse(core.serialize(doc));
  raw.elements.base.push({
    id: 'remote', kind: 'image', rect: { x: 2, y: 2, w: 4, h: 4 },
    source: 'https://example.invalid/tracker.png', mode: 'embed', fit: 'contain', opacity: null,
  });
  assert.throws(() => core.deserialize(raw), /base64 data URI/);
});

test('place_image inside a plan resolves a file path exactly as the tool does', async () => {
  // The defect this pins: source resolution lived in the tool handler only, so
  // `place_image` meant one thing as a tool and another inside `plan` — the same
  // split that once bit `place_box` with its two span formats.
  const { createSession, createTools } = await import('../src/mcp/tools.js');
  const { writeFile, mkdtemp, mkdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'turtlepen-img-'));
  const diagramDir = join(dir, 'diagrams');
  await mkdir(diagramDir);
  await writeFile(join(diagramDir, 'pic.png'), pngBytes(40, 20));

  const session = createSession({ cwd: dir });
  const tools = Object.fromEntries(createTools(session).map((t) => [t.name, t]));
  await tools.new_diagram.handler({ name: 'plan-image', path: join(diagramDir, 'd.turtlepen.json') });

  try {
    const out = await tools.plan.handler({
      operations: [{ op: 'place_image', id: 'p', at: 'C4.tl', span: '8x4', source: 'pic.png' }],
      commit: true,
    });
    assert.doesNotMatch(out, /FAILED/, out);
    assert.match(core.renderSvg(session.doc), /data:image\/png;base64,/, 'embedded, not left as a path');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('plan cannot bypass image validation with an inline SVG data URI', async () => {
  const { createSession, createTools } = await import('../src/mcp/tools.js');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'turtlepen-image-gate-'));
  const session = createSession({ cwd: dir });
  const tools = Object.fromEntries(createTools(session).map((tool) => [tool.name, tool]));
  try {
    await tools.new_diagram.handler({ name: 'image gate', path: join(dir, 'image-gate.turtlepen.json') });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
    await assert.rejects(
      tools.plan.handler({
        operations: [{
          op: 'place_image', id: 'svg', at: 'C4.tl', span: '4x2',
          source: `data:image/svg+xml;base64,${svg}`,
        }],
        commit: true,
      }),
      /unrecognised image format/,
    );
    assert.equal(core.elementsOf(session.doc, 'base').length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
