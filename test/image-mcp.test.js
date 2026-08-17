/** Real-wire image workflow and failure recovery. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMcpClient } from '../examples/mcp-client.js';
import { dataUri, solidPng } from './helpers/png-fixture.js';

test('real MCP image workflow rejects unsafe input and recovers through publication', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'turtlepen-image-mcp-'));
  const diagrams = join(dir, 'diagrams');
  await mkdir(diagrams);
  await writeFile(join(diagrams, 'pic.png'), solidPng(80, 40, [96, 128, 160]));

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

    const hostileSvg = dataUri(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>throw 1</script></svg>'))
      .replace('image/png', 'image/svg+xml');
    const rejected = await client.call('plan', {
      operations: [{ op: 'place_image', id: 'hostile', at: 'C4.tl', span: '8x4', source: hostileSvg }],
      commit: true,
    });
    assert.equal(rejected.isError, true);
    assert.match(rejected.text, /unrecognised image format/);

    await call('place_reference', { id: 'trace', source: 'pic.png', at: 'C4.tl', span: '8x4' });
    const blocked = await client.call('render', { path: 'diagrams/blocked.svg' });
    assert.equal(blocked.isError, true, 'L020 blocks publication while tracing scaffolding remains');
    assert.match(blocked.text, /L020|reference/i);
    await call('remove_page', { id: 'trace' });

    await call('place_image', {
      id: 'embedded', source: 'pic.png', at: 'C4.tl', span: '8x4', mode: 'embed',
    });
    const plan = await call('plan', {
      operations: [{ op: 'place_image', id: 'dithered', source: 'pic.png', at: 'M4.tl', span: '8x4', mode: 'dither' }],
      commit: true,
    });
    assert.match(plan, /committed 1 operation/);

    await call('save');
    await call('open_diagram', { path: 'diagrams/image.turtlepen.json' });
    await call('render', { path: 'diagrams/image.svg', showGrid: false });

    const saved = await readFile(join(diagrams, 'image.turtlepen.json'), 'utf8');
    const parsed = JSON.parse(saved);
    const images = parsed.elements.base.filter((element) => element.kind === 'image');
    assert.equal((saved.match(/data:image/g) ?? []).length, 1, 'only embed retains source bytes');
    assert.equal(images.find((element) => element.id === 'dithered').source, null);

    const svg = await readFile(join(diagrams, 'image.svg'), 'utf8');
    assert.equal((svg.match(/<image /g) ?? []).length, 1);
    assert.match(svg, /class="dither"/);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
