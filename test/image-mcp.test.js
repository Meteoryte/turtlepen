/** Real-wire image workflow and failure recovery. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMcpClient } from '../examples/mcp-client.js';
import { dataUri, encodePng, solidPng } from './helpers/png-fixture.js';

function tracePng(width, height) {
  const pixels = new Uint8Array(width * height * 3).fill(255);
  for (let y = 6; y < height - 6; y++) {
    for (let x = 12; x < width - 12; x++) {
      if (y > 8 && y < height - 9 && x > 14 && x < width - 15) continue;
      const index = (y * width + x) * 3;
      pixels[index] = 0; pixels[index + 1] = 0; pixels[index + 2] = 0;
    }
  }
  return encodePng(width, height, pixels, { colorType: 2 });
}

test('real MCP image workflow rejects unsafe input and recovers through publication', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'turtlepen-image-mcp-'));
  const diagrams = join(dir, 'diagrams');
  await mkdir(diagrams);
  await writeFile(join(diagrams, 'pic.png'), solidPng(80, 40, [96, 128, 160]));
  await writeFile(join(diagrams, 'trace.png'), tracePng(80, 40));
  await writeFile(join(diagrams, 'busy.png'), solidPng(80, 40, [128, 128, 128]));

  const client = createMcpClient({ cwd: dir, createdAt: '2026-08-17T00:00:00.000Z' });
  const call = async (name, args = {}) => {
    const result = await client.call(name, args);
    assert.equal(result.isError, false, `${name}: ${result.error ?? result.text}`);
    return result.text;
  };

  try {
    await client.init();
    await call('new_diagram', {
      name: 'image transport', path: 'diagrams/image.turtlepen.json', cols: 40, rows: 20,
    });

    const measured = JSON.parse(await call('measure_image', { source: 'pic.png', maxWidthCells: 8 }));
    assert.deepEqual(
      { width: measured.width, height: measured.height, cellsWide: measured.cellsWide, cellsTall: measured.cellsTall },
      { width: 80, height: 40, cellsWide: 8, cellsTall: 4 },
      'the local path resolves beside the diagram rather than the server process',
    );
    assert.equal(measured.scale.embed.render.direction, 'exact');
    assert.equal(measured.scale.dither.sampling.direction, 'downscale');
    assert.deepEqual(measured.scale.dither.sampling.target, { width: 16, height: 8, unit: 'quadrants' });
    assert.equal(measured.scale.simplify.sampling.direction, 'downscale');
    assert.match(measured.scale.simplify.sampling.procedure, /discard low-salience texture/);
    assert.deepEqual(measured.scale.simplify.workingCanvas, {
      available: true, requestedSupersample: 'auto', resolvedSupersample: 4,
      width: 64, height: 32, unit: 'quadrants',
      downsampleTo: { width: 16, height: 8, unit: 'quadrants' },
    });

    const hostileSvg = dataUri(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>throw 1</script></svg>'))
      .replace('image/png', 'image/svg+xml');
    const rejected = await client.call('plan', {
      operations: [{ op: 'place_image', id: 'hostile', at: 'C4.tl', span: '8x4', source: hostileSvg }],
      commit: true,
    });
    assert.equal(rejected.isError, true);
    assert.match(rejected.text, /unrecognised image format/);

    const reference = await call('place_reference', { id: 'trace', source: 'trace.png', at: 'C4.tl', span: '8x4' });
    assert.match(reference, /sampling: DOWNSCALE/);
    assert.match(reference, /readability: PASS/);
    const blocked = await client.call('render', { path: 'diagrams/blocked.svg' });
    assert.equal(blocked.isError, true, 'L020 blocks publication while tracing scaffolding remains');
    assert.match(blocked.text, /L020|reference/i);
    await call('remove_page', { id: 'trace' });

    const embeddedReceipt = await call('place_image', {
      id: 'embedded', source: 'pic.png', at: 'C4.tl', span: '8x4', mode: 'embed',
    });
    assert.match(embeddedReceipt, /footprint: matches the measured/);
    assert.match(embeddedReceipt, /render: EXACT to 80x40px/);
    assert.match(embeddedReceipt, /sampling: EXACT to 80x40 pixels/);
    const plan = await call('plan', {
      operations: [{ op: 'place_image', id: 'dithered', source: 'trace.png', at: 'M4.tl', span: '8x4', mode: 'dither' }],
      commit: true,
    });
    assert.match(plan, /committed 1 operation/);

    const simplifiedReceipt = await call('place_image', {
      id: 'simplified', source: 'trace.png', at: 'V4.tl', span: '16x12', mode: 'simplify', detail: 'auto', supersample: 4,
    });
    assert.match(simplifiedReceipt, /simplification: LOW detail.*near-binary threshold/i);
    assert.match(simplifiedReceipt, /4:1 working canvas 128x96 -> 1:1 final lattice.*16 working samples\/output/i);
    assert.match(simplifiedReceipt, /perceptual approximation, not a 1:1 copy/);

    const refusedResize = await client.call('resize', { id: 'dithered', cellsW: 10, cellsH: 5 });
    assert.equal(refusedResize.isError, true);
    assert.match(refusedResize.text, /Remove it and call place_image again/);
    const refusedSimplifyResize = await client.call('resize', { id: 'simplified', cellsW: 18, cellsH: 12 });
    assert.equal(refusedSimplifyResize.isError, true);
    assert.match(refusedSimplifyResize.text, /simplify image.*Remove it and call place_image again/);

    const busy = await call('place_image', {
      id: 'busy', source: 'busy.png', at: 'C12.tl', span: '8x4', mode: 'dither',
    });
    assert.match(busy, /readability: BUSY/);
    const noisyValidation = JSON.parse(await call('validate', { format: 'json' }));
    assert.ok(noisyValidation.open.some((finding) => finding.rule === 'L022'));
    const noisyRender = await client.call('render', { path: 'diagrams/noisy.svg' });
    assert.equal(noisyRender.isError, true);
    assert.match(noisyRender.text, /L022|busy dither/i);
    await call('remove', { id: 'busy' });

    await call('save');
    await call('open_diagram', { path: 'diagrams/image.turtlepen.json' });
    await call('render', { path: 'diagrams/image.svg', showGrid: false });

    const saved = await readFile(join(diagrams, 'image.turtlepen.json'), 'utf8');
    const parsed = JSON.parse(saved);
    const images = parsed.elements.base.filter((element) => element.kind === 'image');
    assert.equal((saved.match(/data:image/g) ?? []).length, 1, 'only embed retains source bytes');
    const dithered = images.find((element) => element.id === 'dithered');
    assert.equal(dithered.source, null);
    assert.equal(dithered.scale.sampling.direction, 'downscale');
    assert.equal(dithered.ditherStats.readability, 'pass');
    const simplified = images.find((element) => element.id === 'simplified');
    assert.equal(simplified.source, null);
    assert.equal(simplified.processing.strategy, 'threshold-simplify');
    assert.equal(simplified.processing.nearBinary, true);
    assert.equal(simplified.ditherStats.readability, 'pass');

    const svg = await readFile(join(diagrams, 'image.svg'), 'utf8');
    assert.equal((svg.match(/<image /g) ?? []).length, 1);
    assert.match(svg, /class="dither"/);
    assert.match(svg, /class="simplify"/);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
